import { getLogger } from '../../utils/logger.js';

const log = getLogger();

// Keywords that indicate active crisis events
const CRISIS_KEYWORDS = [
  'mass shooting',
  'school shooting',
  'active shooter',
  'terror attack',
  'terrorist attack',
  'bombing',
  'earthquake',
  'hurricane',
  'tornado',
  'wildfire',
  'tsunami',
  'flood',
  'plane crash',
  'train derailment',
  'bridge collapse',
  'building collapse',
];

export interface TragedyRadarResult {
  score: number; // 0-30
  activeCrises: string[];
}

/**
 * Check if content references or could be associated with active crises.
 * In production, this would also check RSS feeds and X trending for active events.
 * For now, it checks the content itself against crisis keywords.
 */
export async function checkTragedyRadar(
  content: string,
  recentTrends: string[] = [],
): Promise<TragedyRadarResult> {
  const activeCrises: string[] = [];
  let score = 0;
  const lower = content.toLowerCase();

  // Check if content references crisis terms
  for (const keyword of CRISIS_KEYWORDS) {
    if (lower.includes(keyword)) {
      activeCrises.push(`Content references: "${keyword}"`);
      score += 15;
    }
  }

  // Check if any recent trends suggest active crises
  for (const trend of recentTrends) {
    const trendLower = trend.toLowerCase();
    for (const keyword of CRISIS_KEYWORDS) {
      if (trendLower.includes(keyword)) {
        activeCrises.push(`Active trend: "${trend}"`);
        score += 10;
        break;
      }
    }
  }

  score = Math.min(score, 30);

  if (activeCrises.length > 0) {
    log.warn({ activeCrises, score }, 'Tragedy radar triggered');
  }

  return { score, activeCrises };
}
