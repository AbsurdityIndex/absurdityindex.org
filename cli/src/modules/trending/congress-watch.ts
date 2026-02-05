import { getLogger } from '../../utils/logger.js';
import type { Config } from '../../config.js';

const log = getLogger();
const BASE_URL = 'https://api.congress.gov/v3';
const DELAY_MS = 350;

interface CongressAction {
  title: string;
  billNumber: string;
  congress: number;
  actionType: string;
  actionDate: string;
}

export interface NormalizedTrend {
  topic: string;
  source: 'congress-watch';
  volume: number;
  metadata: {
    billNumber: string;
    congress: number;
    actionType: string;
  };
}

async function apiFetch(endpoint: string, apiKey: string): Promise<any> {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${endpoint}${sep}api_key=${apiKey}&format=json&limit=20`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Congress API ${res.status}: ${endpoint}`);
  }
  return res.json();
}

/**
 * Monitor Congress.gov for recent legislative actions.
 * Focuses on floor votes, committee actions, and bill introductions.
 */
export async function fetchCongressActions(config: Config): Promise<NormalizedTrend[]> {
  if (!config.congressApiKey) {
    log.warn('No Congress API key, skipping congress-watch');
    return [];
  }

  const trends: NormalizedTrend[] = [];

  try {
    // Fetch recent actions (last 24h)
    const today = new Date().toISOString().split('T')[0];
    const data = await apiFetch(`/bill?fromDateTime=${today}T00:00:00Z&sort=updateDate+desc`, config.congressApiKey);

    if (data?.bills) {
      for (const bill of data.bills.slice(0, 10)) {
        trends.push({
          topic: `${bill.number}: ${bill.title}`.slice(0, 100),
          source: 'congress-watch',
          volume: 100, // Default volume for congress actions
          metadata: {
            billNumber: bill.number ?? '',
            congress: bill.congress ?? 119,
            actionType: bill.latestAction?.type ?? 'unknown',
          },
        });

        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
  } catch (err) {
    log.warn({ err }, 'Congress watch fetch failed');
  }

  return trends;
}
