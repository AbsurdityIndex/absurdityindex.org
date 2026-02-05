import chalk from 'chalk';
import { getLogger } from '../../utils/logger.js';
import { scanForTweets, type ScannedTweet } from './scanner.js';
import { scoreOpportunity } from './opportunity-scorer.js';
import { executeEngagement, evaluateWithClaude } from './engagement-generator.js';
import { createOpportunityModel, type RecommendedAction } from '../state/models/opportunities.js';
import { createEngagementCooldownModel } from '../state/models/engagement-cooldowns.js';
import { createPostModel } from '../state/models/posts.js';
import { loadBills, type LoadedBill } from '../bills/loader.js';
import type { XReadClient } from '../x-api/client.js';
import type { ClaudeClient } from '../claude/client.js';
import type { BrowserPoster } from '../x-api/browser-poster.js';
import type { Config } from '../../config.js';
import type Database from 'better-sqlite3';

const log = getLogger();

export interface WatchOptions {
  interval: number;
  maxEngagementsPerDay: number;
  minOpportunityScore: number;
  trackThreshold: number;
  dryRun: boolean;
}

interface WatchDeps {
  db: Database.Database;
  xClient: XReadClient;
  claude: ClaudeClient;
  poster: BrowserPoster;
  config: Config;
}

/**
 * Run a single watch cycle: scan → score → engage/track → re-evaluate → cleanup.
 */
export async function runWatchCycle(
  deps: WatchDeps,
  options: WatchOptions,
  cycleIndex: number,
): Promise<{ scanned: number; engaged: number; tracked: number; expired: number }> {
  const { db, xClient, claude, poster, config } = deps;
  const opportunities = createOpportunityModel(db);
  const cooldowns = createEngagementCooldownModel(db);
  const posts = createPostModel(db);
  const bills = loadBills(config.billsDir);

  const stats = { scanned: 0, engaged: 0, tracked: 0, expired: 0 };

  // Phase 1: Scan for tweets
  const tweets = await scanForTweets(xClient, cycleIndex);
  stats.scanned = tweets.length;

  // Phase 2: Filter already-seen tweets and score new ones
  const newTweets: Array<{ tweet: ScannedTweet; score: ReturnType<typeof scoreOpportunity> }> = [];

  for (const tweet of tweets) {
    const existing = opportunities.getByTweetId(tweet.id);
    if (existing && existing.status !== 'tracked') continue; // Already engaged/skipped/expired

    const score = scoreOpportunity(tweet, bills, config);

    if (score.skipReason) {
      log.debug({ tweetId: tweet.id, reason: score.skipReason }, 'Skipped (pre-filter)');
      continue;
    }

    if (existing) {
      // Update metrics for already-tracked tweet
      opportunities.updateMetrics(tweet.id, {
        likes: tweet.likes,
        retweets: tweet.retweets,
        replies: tweet.replies,
        impressions: tweet.impressions,
      });
      opportunities.updateScore(tweet.id, {
        score: score.total,
        viral_score: score.viral,
        relevance_score: score.relevance,
        timing_score: score.timing,
        engageability_score: score.engageability,
        recommended_action: score.recommendedAction,
      });
    } else {
      newTweets.push({ tweet, score });
    }
  }

  // Phase 3: Upsert new opportunities and decide actions
  const engageCandidates: Array<{ tweet: ScannedTweet; action: RecommendedAction; billSlug: string | null }> = [];

  for (const { tweet, score } of newTweets) {
    const opp = opportunities.upsert({
      tweet_id: tweet.id,
      author_id: tweet.authorId,
      author_username: tweet.authorUsername,
      text: tweet.text,
      conversation_id: tweet.conversationId ?? undefined,
      likes: tweet.likes,
      retweets: tweet.retweets,
      replies: tweet.replies,
      impressions: tweet.impressions,
      score: score.total,
      viral_score: score.viral,
      relevance_score: score.relevance,
      timing_score: score.timing,
      engageability_score: score.engageability,
      recommended_action: score.recommendedAction,
      matched_bill_slug: score.matchedBillSlug ?? undefined,
      matched_keywords: score.matchedKeywords.length > 0 ? score.matchedKeywords.join(',') : undefined,
      tweet_created_at: tweet.createdAt ?? undefined,
    });

    if (score.recommendedAction === 'reply' || score.recommendedAction === 'quote') {
      engageCandidates.push({
        tweet,
        action: score.recommendedAction,
        billSlug: score.matchedBillSlug,
      });
    } else if (score.recommendedAction === 'track') {
      stats.tracked++;
    }
  }

  // Phase 4: Execute engagements (respect daily cap and cooldowns)
  const engagedToday = opportunities.countEngagedToday();
  let remainingBudget = options.maxEngagementsPerDay - engagedToday;

  if (remainingBudget <= 0) {
    log.info({ engagedToday }, 'Daily engagement cap reached');
  }

  // Sort candidates by score descending
  engageCandidates.sort((a, b) => {
    const aOpp = opportunities.getByTweetId(a.tweet.id);
    const bOpp = opportunities.getByTweetId(b.tweet.id);
    return (bOpp?.score ?? 0) - (aOpp?.score ?? 0);
  });

  for (const candidate of engageCandidates) {
    if (remainingBudget <= 0) break;

    // Check author cooldown
    if (!cooldowns.canEngage(candidate.tweet.authorId, config.engageAuthorCooldownHours)) {
      log.info({ author: candidate.tweet.authorUsername }, 'Author on cooldown');
      continue;
    }

    const opp = opportunities.getByTweetId(candidate.tweet.id);
    if (!opp) continue;

    const result = await executeEngagement({
      opportunity: opp,
      bills,
      claude,
      poster,
      config,
      dryRun: options.dryRun,
    });

    if (result.success && result.content) {
      // Record the engagement
      const post = posts.create({
        content: result.content,
        prompt_type: result.action === 'quote' ? 'quote-dunk' : 'reply-dunk',
        bill_slug: opp.matched_bill_slug ?? undefined,
        safety_score: result.safetyResult?.score ?? 0,
        safety_verdict: result.safetyResult?.verdict ?? 'SAFE',
        status: options.dryRun ? 'draft' : 'posted',
        parent_tweet_id: opp.tweet_id,
      });

      opportunities.markEngaged(opp.tweet_id, post.id);
      cooldowns.record(candidate.tweet.authorId);
      remainingBudget--;
      stats.engaged++;

      log.info({
        action: result.action,
        author: candidate.tweet.authorUsername,
        score: opp.score,
      }, 'Engagement executed');
    } else if (result.skipReason) {
      opportunities.markSkipped(opp.tweet_id);
      log.info({ reason: result.skipReason }, 'Engagement skipped');
    }
  }

  // Phase 5: Re-evaluate tracked tweets (metrics may have grown)
  await reEvaluateTracked(deps, options, bills);

  // Phase 6: Expire old tracked tweets
  stats.expired = opportunities.expireOld(24);
  if (stats.expired > 0) {
    log.info({ expired: stats.expired }, 'Expired stale opportunities');
  }

  // Cleanup expired cooldowns
  cooldowns.clearExpired(48);

  return stats;
}

/**
 * Re-evaluate tracked opportunities that may have gained traction.
 */
async function reEvaluateTracked(
  deps: WatchDeps,
  options: WatchOptions,
  bills: LoadedBill[],
): Promise<void> {
  const { db, xClient, claude, config } = deps;
  const opportunities = createOpportunityModel(db);
  const tracked = opportunities.getTracked(20);

  for (const opp of tracked) {
    // Refresh metrics from X API
    const metrics = await xClient.getTweetMetrics(opp.tweet_id);
    if (metrics) {
      opportunities.updateMetrics(opp.tweet_id, metrics);
    }

    // Re-score with updated metrics
    const tweet: ScannedTweet = {
      id: opp.tweet_id,
      text: opp.text,
      authorId: opp.author_id,
      authorUsername: opp.author_username ?? 'unknown',
      conversationId: opp.conversation_id,
      likes: metrics?.likes ?? opp.likes,
      retweets: metrics?.retweets ?? opp.retweets,
      replies: metrics?.replies ?? opp.replies,
      impressions: metrics?.impressions ?? opp.impressions,
      createdAt: opp.tweet_created_at,
    };

    const score = scoreOpportunity(tweet, bills, config);
    opportunities.updateScore(opp.tweet_id, {
      score: score.total,
      viral_score: score.viral,
      relevance_score: score.relevance,
      timing_score: score.timing,
      engageability_score: score.engageability,
      recommended_action: score.recommendedAction,
    });

    // For ambiguous scores (40-60), use Claude to evaluate
    if (score.total >= 40 && score.total <= 60) {
      const updated = opportunities.getByTweetId(opp.tweet_id);
      if (updated) {
        const evaluation = await evaluateWithClaude(updated, claude);
        log.info(
          { tweetId: opp.tweet_id, oldScore: score.total, newScore: evaluation.score, reason: evaluation.reason },
          'Claude re-evaluation'
        );
        opportunities.updateScore(opp.tweet_id, {
          score: evaluation.score,
          viral_score: score.viral,
          relevance_score: score.relevance,
          timing_score: score.timing,
          engageability_score: score.engageability,
          recommended_action: evaluation.action as RecommendedAction,
        });
      }
    }
  }
}

/**
 * Start the watch daemon — runs scan cycles on an interval.
 */
export function startWatchDaemon(
  deps: WatchDeps,
  options: WatchOptions,
): { stop: () => void } {
  let cycleIndex = 0;
  let running = false;
  let stopped = false;

  const runCycle = async () => {
    if (running || stopped) return;
    running = true;

    const cycleNum = cycleIndex++;
    log.info({ cycle: cycleNum, interval: options.interval }, 'Watch cycle starting');

    try {
      const stats = await runWatchCycle(deps, options, cycleNum);
      console.log(
        chalk.dim(`[Cycle ${cycleNum}]`) +
        ` Scanned: ${chalk.cyan(String(stats.scanned))}` +
        ` | Engaged: ${chalk.green(String(stats.engaged))}` +
        ` | Tracked: ${chalk.yellow(String(stats.tracked))}` +
        ` | Expired: ${chalk.dim(String(stats.expired))}`
      );
    } catch (err) {
      log.error({ err, cycle: cycleNum }, 'Watch cycle failed');
      console.error(chalk.red(`[Cycle ${cycleNum}] Error: ${err instanceof Error ? err.message : String(err)}`));
    } finally {
      running = false;
    }
  };

  // Run first cycle immediately
  runCycle();

  // Schedule subsequent cycles
  const intervalMs = options.interval * 60 * 1000;
  const timer = setInterval(runCycle, intervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      log.info('Watch daemon stopped');
    },
  };
}
