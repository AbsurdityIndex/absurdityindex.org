import type { XReadClient, TrendingTopic } from '../x-api/client.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger();

export interface NormalizedTrend {
  topic: string;
  source: 'x-trends';
  volume: number;
  raw: TrendingTopic;
}

/**
 * Fetch and normalize trending topics from X.
 * Filters for politics/government-adjacent trends.
 */
export async function fetchXTrends(xClient: XReadClient): Promise<NormalizedTrend[]> {
  const rawTrends = await xClient.getTrending();

  // Political/government keywords to boost relevance
  const politicalKeywords = [
    'congress', 'senate', 'house', 'bill', 'vote', 'law', 'legislation',
    'speaker', 'president', 'bipartisan', 'shutdown', 'budget', 'spending',
    'impeach', 'filibuster', 'lobby', 'earmark', 'pork', 'deficit',
    'democrat', 'republican', 'gop', 'scotus', 'supreme court',
    'amendment', 'committee', 'hearing', 'subpoena', 'oversight',
  ];

  return rawTrends
    .filter(t => t.volume > 0)
    .map(t => ({
      topic: t.name,
      source: 'x-trends' as const,
      volume: t.volume,
      raw: t,
    }))
    .sort((a, b) => {
      // Boost political topics
      const aPolit = politicalKeywords.some(k => a.topic.toLowerCase().includes(k)) ? 1000000 : 0;
      const bPolit = politicalKeywords.some(k => b.topic.toLowerCase().includes(k)) ? 1000000 : 0;
      return (b.volume + bPolit) - (a.volume + aPolit);
    });
}
