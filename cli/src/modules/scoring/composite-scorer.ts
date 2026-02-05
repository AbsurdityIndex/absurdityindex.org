import { scoreEngagement } from './engagement-scorer.js';
import { scoreRelevance } from './relevance-scorer.js';
import { scoreTiming } from './timing-scorer.js';
import type { Config } from '../../config.js';
import type { AggregatedTrend } from '../trending/aggregator.js';

export interface CompositeScore {
  total: number;
  engagement: number;
  relevance: number;
  timing: number;
}

/**
 * Compute a composite score for a trend/content pair.
 * Weights: relevance (40%) > engagement (35%) > timing (25%)
 */
export function scoreComposite(
  content: string,
  trend: AggregatedTrend,
  config: Config,
): CompositeScore {
  const engagement = scoreEngagement(content);
  const relevance = scoreRelevance(trend.topic, trend.sources);
  const timing = scoreTiming(config);

  const total = Math.round(
    relevance * 0.4 +
    engagement * 0.35 +
    timing * 0.25
  );

  return { total, engagement, relevance, timing };
}

/**
 * Score a trend (without content yet) to prioritize which to generate for.
 */
export function scoreTrend(trend: AggregatedTrend, config: Config): number {
  const relevance = scoreRelevance(trend.topic, trend.sources);
  const timing = scoreTiming(config);
  // Volume gives a small boost
  const volumeBoost = Math.min(trend.totalVolume / 10000, 20);

  return Math.round(relevance * 0.5 + timing * 0.3 + volumeBoost * 0.2);
}
