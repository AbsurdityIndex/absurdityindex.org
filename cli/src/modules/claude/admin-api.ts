/**
 * Anthropic Admin API client for fetching real usage/cost data.
 * Requires an Admin API key (sk-ant-admin...) from Console → Settings → Admin Keys.
 */

import { getLogger } from '../../utils/logger.js';

const log = getLogger();

export interface AnthropicCostData {
  todayCents: number;
  weekCents: number;
  monthCents: number;
  fetchedAt: number;
}

let cached: AnthropicCostData | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch cost data from the Anthropic Admin API.
 * Caches results for 5 minutes to avoid excessive polling.
 */
export async function fetchAnthropicCosts(adminKey: string): Promise<AnthropicCostData | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);
    const endAt = new Date(todayStart);
    endAt.setDate(endAt.getDate() + 1);

    const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
    url.searchParams.set('starting_at', monthStart.toISOString());
    url.searchParams.set('ending_at', endAt.toISOString());
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '31');

    const resp = await fetch(url.toString(), {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': adminKey,
      },
    });

    if (!resp.ok) {
      log.warn({ status: resp.status }, 'Admin API cost fetch failed');
      return cached; // Return stale cache if available
    }

    const data = await resp.json() as {
      data: Array<{
        bucket_start_time: string;
        cost_usd: string;
      }>;
    };

    const todayStr = todayStart.toISOString().slice(0, 10);
    const weekStr = weekStart.toISOString().slice(0, 10);

    let todayCents = 0;
    let weekCents = 0;
    let monthCents = 0;

    for (const bucket of data.data) {
      const bucketDate = bucket.bucket_start_time.slice(0, 10);
      const cents = Math.round(parseFloat(bucket.cost_usd) * 100);
      monthCents += cents;
      if (bucketDate >= weekStr) weekCents += cents;
      if (bucketDate === todayStr) todayCents += cents;
    }

    cached = { todayCents, weekCents, monthCents, fetchedAt: Date.now() };
    return cached;
  } catch (err) {
    log.warn({ err }, 'Admin API cost fetch error');
    return cached; // Return stale cache if available
  }
}
