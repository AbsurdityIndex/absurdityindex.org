import { getLogger } from '../../utils/logger.js';
import type { NormalizedTrend as XTrend } from './x-trends.js';
import type { NormalizedTrend as CongressTrend } from './congress-watch.js';
import type { NormalizedTrend as RssTrend } from './rss-feeds.js';

const log = getLogger();

export interface AggregatedTrend {
  topic: string;
  sources: string[];
  totalVolume: number;
  congressRelevance: number; // 0-1, how related to Congress
}

type AnyTrend = XTrend | CongressTrend | RssTrend;

/**
 * Merge and deduplicate trends from all sources.
 * Trends appearing in multiple sources get boosted.
 */
export function aggregateTrends(
  xTrends: XTrend[],
  congressTrends: CongressTrend[],
  rssTrends: RssTrend[],
): AggregatedTrend[] {
  const all: AnyTrend[] = [...xTrends, ...congressTrends, ...rssTrends];
  const merged = new Map<string, AggregatedTrend>();

  for (const trend of all) {
    // Normalize topic for dedup (lowercase, strip hashtag)
    const key = trend.topic.toLowerCase().replace(/^#/, '').trim();

    const existing = merged.get(key);
    if (existing) {
      existing.sources.push(trend.source);
      existing.totalVolume += trend.volume;
      // Cross-source bonus
      existing.totalVolume *= 1.5;
    } else {
      merged.set(key, {
        topic: trend.topic,
        sources: [trend.source],
        totalVolume: trend.volume,
        congressRelevance: trend.source === 'congress-watch' ? 1.0 : 0.5,
      });
    }
  }

  // Sort by volume (cross-source boosted)
  const sorted = [...merged.values()].sort((a, b) => b.totalVolume - a.totalVolume);

  log.info(
    { total: sorted.length, fromX: xTrends.length, fromCongress: congressTrends.length, fromRss: rssTrends.length },
    'Trends aggregated'
  );

  return sorted;
}
