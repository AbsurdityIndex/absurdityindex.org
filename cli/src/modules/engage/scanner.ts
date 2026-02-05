import { getLogger } from '../../utils/logger.js';
import type { XReadClient } from '../x-api/client.js';
import type { Config } from '../../config.js';

const log = getLogger();

/**
 * Congressional accounts and political keywords to scan.
 * Queries are rotated across cycles to stay within rate limits.
 */
const SCAN_QUERIES = [
  // Official floor accounts
  'from:HouseFloor OR from:SenateFloor',
  // Bill passage / vote language
  '"passed the House" OR "passed the Senate" OR "floor vote"',
  // Legislative action
  '"introduced a bill" OR "cosponsored" OR "committee hearing"',
  // Spending / pork keywords
  '"taxpayer dollars" OR "government spending" OR "earmark" OR "pork barrel"',
  // Congressional theater
  '"bipartisan" OR "across the aisle" OR "the American people"',
  // Committee and procedural
  '"markup session" OR "filibuster" OR "cloture vote" OR "unanimous consent"',
  // Budget / appropriations
  '"appropriations bill" OR "continuing resolution" OR "omnibus"',
  // Congressional leadership
  'from:SpeakerJohnson OR from:SenSchumer OR from:LeaderMcConnell',
];

/**
 * Normalized tweet from scan results, ready for scoring.
 */
export interface ScannedTweet {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  conversationId: string | null;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  createdAt: string | null;
}

/**
 * Pick 2-3 queries for this scan cycle based on cycleIndex.
 * Rotates through the full query list over time.
 */
export function buildScanQueries(cycleIndex: number): string[] {
  const queriesPerCycle = 3;
  const startIdx = (cycleIndex * queriesPerCycle) % SCAN_QUERIES.length;
  const selected: string[] = [];

  for (let i = 0; i < queriesPerCycle; i++) {
    selected.push(SCAN_QUERIES[(startIdx + i) % SCAN_QUERIES.length]!);
  }

  return selected;
}

/**
 * Execute a scan cycle: run queries, dedupe, normalize results.
 */
export async function scanForTweets(
  xClient: XReadClient,
  cycleIndex: number,
): Promise<ScannedTweet[]> {
  const queries = buildScanQueries(cycleIndex);
  const seen = new Set<string>();
  const results: ScannedTweet[] = [];

  log.info({ queries: queries.length, cycleIndex }, 'Running scan queries');

  for (const query of queries) {
    try {
      const { tweets, authors } = await xClient.searchTweetsExpanded(query, 10);

      for (const tweet of tweets) {
        if (seen.has(tweet.id)) continue;
        seen.add(tweet.id);

        const metrics = tweet.public_metrics;
        results.push({
          id: tweet.id,
          text: tweet.text,
          authorId: tweet.author_id ?? 'unknown',
          authorUsername: authors.get(tweet.author_id ?? '') ?? 'unknown',
          conversationId: (tweet as any).conversation_id ?? null,
          likes: metrics?.like_count ?? 0,
          retweets: metrics?.retweet_count ?? 0,
          replies: metrics?.reply_count ?? 0,
          impressions: metrics?.impression_count ?? 0,
          createdAt: tweet.created_at ?? null,
        });
      }
    } catch (err) {
      log.warn({ err, query }, 'Query failed, continuing with next');
    }
  }

  log.info({ total: results.length }, 'Scan complete');
  return results;
}
