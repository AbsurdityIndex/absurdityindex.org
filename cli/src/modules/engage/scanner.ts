import { getLogger } from '../../utils/logger.js';
import type { XReadClient } from '../x-api/client.js';
import type { Config } from '../../config.js';

const log = getLogger();

/**
 * Congressional accounts and political keywords to scan.
 * Queries are rotated across cycles to stay within rate limits.
 */
const SCAN_QUERIES = [
  // Capitol Hill journalists — high-quality legislative coverage
  'from:ChadPergram OR from:mkraju OR from:JakeSherman OR from:PunchbowlNews',
  // Public reaction to Congress — natural language, high engagement
  '"Congress just" OR "Congress voted" OR "Congress passed" OR "Congress approved"',
  // Government spending / waste — the absurdity sweet spot
  '"government waste" OR "tax dollars" OR "government spending" OR "your tax money"',
  // Bill reactions — when real people talk about legislation
  '"this bill" OR "new bill" OR "the bill would" OR "signed into law"',
  // Congressional accountability — core Absurdity Index theme
  '"congressional pay" OR "congressional recess" OR "insider trading" OR "term limits"',
  // Budget drama and shutdowns
  '"government shutdown" OR "debt ceiling" OR "continuing resolution" OR "omnibus bill"',
  // Public frustration — where absurdity commentary resonates
  '"why does Congress" OR "Congress should" OR "do nothing Congress"',
  // Floor votes and official actions
  '"floor vote" OR "passed the House" OR "passed the Senate" OR "vote count"',
  // Congressional leadership accounts
  'from:SpeakerJohnson OR from:SenSchumer OR from:LeaderMcConnell',
  // Committee / oversight — where legislation actually happens
  '"committee hearing" OR "subpoena" OR "oversight hearing" OR "confirmation hearing"',
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
  quotes: number;
  impressions?: number;
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

export interface ScanTrace {
  queries: Array<{ query: string; resultCount: number; error?: string }>;
  rawTotal: number;
  dedupRemoved: number;
  retweetsFiltered: number;
  finalCount: number;
}

export interface ScanResult {
  tweets: ScannedTweet[];
  trace: ScanTrace;
}

/**
 * Execute a scan cycle: run queries, dedupe, normalize results.
 * Returns tweets alongside a structured trace for evidence rendering.
 */
export async function scanForTweets(
  xClient: XReadClient,
  cycleIndex: number,
): Promise<ScanResult> {
  const queries = buildScanQueries(cycleIndex);
  const seen = new Set<string>();
  const results: ScannedTweet[] = [];
  const queryTraces: ScanTrace['queries'] = [];
  let rawTotal = 0;
  let dedupRemoved = 0;
  let retweetsFiltered = 0;

  log.info({ queries: queries.length, cycleIndex }, 'Running scan queries');

  for (const query of queries) {
    try {
      const { tweets, authors } = await xClient.searchTweetsExpanded(query, 10);
      queryTraces.push({ query, resultCount: tweets.length });
      rawTotal += tweets.length;

      for (const tweet of tweets) {
        if (seen.has(tweet.id)) {
          dedupRemoved++;
          continue;
        }
        // Skip retweets — engaging with them is confusing and off-target
        if (tweet.text.startsWith('RT @')) {
          seen.add(tweet.id);
          retweetsFiltered++;
          continue;
        }
        seen.add(tweet.id);

        const metrics = tweet.public_metrics;
        results.push({
          id: tweet.id,
          text: tweet.text,
          authorId: tweet.author_id ?? 'unknown',
          authorUsername: authors.get(tweet.author_id ?? '')?.username ?? 'unknown',
          conversationId: (tweet as any).conversation_id ?? null,
          likes: metrics?.like_count ?? 0,
          retweets: metrics?.retweet_count ?? 0,
          replies: metrics?.reply_count ?? 0,
          quotes: metrics?.quote_count ?? 0,
          impressions: (metrics as any)?.impression_count,
          createdAt: tweet.created_at ?? null,
        });
      }
    } catch (err) {
      queryTraces.push({ query, resultCount: 0, error: err instanceof Error ? err.message : String(err) });
      log.warn({ err, query }, 'Query failed, continuing with next');
    }
  }

  log.info({ total: results.length }, 'Scan complete');

  const trace: ScanTrace = {
    queries: queryTraces,
    rawTotal,
    dedupRemoved,
    retweetsFiltered,
    finalCount: results.length,
  };

  return { tweets: results, trace };
}
