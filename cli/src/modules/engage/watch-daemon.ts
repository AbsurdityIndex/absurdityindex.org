import chalk from 'chalk';
import { getLogger } from '../../utils/logger.js';
import { scanForTweets, type ScannedTweet } from './scanner.js';
import { scoreOpportunity } from './opportunity-scorer.js';
import { executeEngagement, evaluateWithClaude } from './engagement-generator.js';
import { createOpportunityModel, type RecommendedAction } from '../state/models/opportunities.js';
import { createEngagementCooldownModel } from '../state/models/engagement-cooldowns.js';
import { createPostModel } from '../state/models/posts.js';
import { createDaemonCycleModel } from '../state/models/daemon-cycles.js';
import { loadBills, type LoadedBill } from '../bills/loader.js';
import { fetchXTrends } from '../trending/x-trends.js';
import { fetchCongressActions } from '../trending/congress-watch.js';
import { aggregateTrends } from '../trending/aggregator.js';
import { matchTrendToBills } from '../bills/matcher.js';
import { scoreTrend } from '../scoring/composite-scorer.js';
import { runHotPotDetector } from '../safety/hot-pot-detector.js';
import { cleanContent, billUrl } from '../../utils/format.js';
import type { PromptContext } from '../claude/prompts/index.js';
import type { XReadClient, XWriteClient } from '../x-api/client.js';
import type { ClaudeClient } from '../claude/client.js';
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

type CycleUpdate = (patch: {
  phase?: string;
  scanned?: number;
  engaged?: number;
  tracked?: number;
  expired?: number;
  posted?: number;
  topic?: string;
  error?: string;
}) => void;

interface WatchDeps {
  db: Database.Database;
  xClient: XReadClient;
  xWriter?: XWriteClient;
  claude: ClaudeClient;
  config: Config;
}

/**
 * Run a single watch cycle: scan → score → engage/track → re-evaluate → cleanup.
 */
export async function runWatchCycle(
  deps: WatchDeps,
  options: WatchOptions,
  cycleIndex: number,
  engageAction: 'quote' | 'reply' = 'quote',
  updateCycle?: CycleUpdate,
): Promise<{ scanned: number; engaged: number; tracked: number; expired: number }> {
  const { db, xClient, xWriter, claude, config } = deps;
  // Override config thresholds with watch options so the scorer respects CLI flags
  const effectiveConfig = {
    ...config,
    engageMinScore: options.minOpportunityScore,
    engageTrackThreshold: options.trackThreshold,
  };
  const opportunities = createOpportunityModel(db);
  const cooldowns = createEngagementCooldownModel(db);
  const posts = createPostModel(db);
  const bills = loadBills(config.billsDir);

  const stats = { scanned: 0, engaged: 0, tracked: 0, expired: 0 };

  // Phase 1: Scan for tweets
  updateCycle?.({ phase: 'scan' });
  const tweets = await scanForTweets(xClient, cycleIndex);
  stats.scanned = tweets.length;
  updateCycle?.({ phase: 'score', scanned: stats.scanned });

  // Phase 2: Filter already-seen tweets and score new ones
  const newTweets: Array<{ tweet: ScannedTweet; score: ReturnType<typeof scoreOpportunity> }> = [];

  for (const tweet of tweets) {
    const existing = opportunities.getByTweetId(tweet.id);
    if (existing && existing.status !== 'tracked') continue; // Already engaged/skipped/expired

    const score = scoreOpportunity(tweet, bills, effectiveConfig);

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
        quotes: tweet.quotes,
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
  updateCycle?.({ phase: 'upsert' });
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
      quotes: tweet.quotes,
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
  updateCycle?.({ phase: 'engage', tracked: stats.tracked });
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
      xReader: xClient,
      xWriter,
      config,
      dryRun: options.dryRun,
      preferredAction: engageAction,
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
      updateCycle?.({ engaged: stats.engaged });

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
  updateCycle?.({ phase: 'reevaluate' });
  await reEvaluateTracked(deps, options, bills);

  // Phase 6: Expire old tracked tweets
  updateCycle?.({ phase: 'expire' });
  stats.expired = opportunities.expireOld(24);
  updateCycle?.({ expired: stats.expired });
  if (stats.expired > 0) {
    log.info({ expired: stats.expired }, 'Expired stale opportunities');
  }

  // Cleanup expired cooldowns
  updateCycle?.({ phase: 'cleanup' });
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
  const effectiveConfig = {
    ...config,
    engageMinScore: options.minOpportunityScore,
    engageTrackThreshold: options.trackThreshold,
  };
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
      quotes: metrics?.quotes ?? opp.quotes,
      impressions: metrics?.impressions ?? (opp as any).impressions,
      createdAt: opp.tweet_created_at,
    };

    const score = scoreOpportunity(tweet, bills, effectiveConfig);
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
 * Generate and post an original standalone tweet based on trending topics.
 * Runs every Nth cycle to mix original content with engagement.
 */
async function runOriginalPostCycle(
  deps: WatchDeps,
  dryRun = false,
): Promise<{ posted: boolean; topic: string | null }> {
  const { db, xClient, xWriter, claude, config } = deps;
  const posts = createPostModel(db);
  const bills = loadBills(config.billsDir);

  log.info('Original post cycle starting — scanning trends');

  // Fetch trends from X and Congress.gov
  const [xTrends, congressTrends] = await Promise.all([
    fetchXTrends(xClient),
    fetchCongressActions(config),
  ]);
  const aggregated = aggregateTrends(xTrends, congressTrends, []);

  // Score and filter
  const scored = aggregated
    .map(t => ({ ...t, score: scoreTrend(t, config) }))
    .filter(t => t.score >= 40)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // Fall back to high-absurdity bills
    const highAbsurdity = bills
      .filter(b => (b.absurdityIndex ?? 0) >= 6)
      .sort(() => Math.random() - 0.5);

    if (highAbsurdity.length === 0) {
      log.info('No trends or eligible bills for original post');
      return { posted: false, topic: null };
    }

    const bill = highAbsurdity[0]!;
    return generateOriginalPost(deps, bill.title, {
      bill,
      siteUrl: billUrl(bill.slug, config.siteUrl),
    }, dryRun);
  }

  const topTrend = scored[0]!;
  log.info({ topic: topTrend.topic, score: topTrend.score }, 'Top trend for original post');

  // Match to bills
  const billMatches = matchTrendToBills(topTrend, bills);
  const matchedBill = billMatches[0]?.bill;

  const context: PromptContext = {
    trendTopic: topTrend.topic,
    bill: matchedBill,
    siteUrl: matchedBill ? billUrl(matchedBill.slug, config.siteUrl) : undefined,
  };

  return generateOriginalPost(deps, topTrend.topic, context, dryRun);
}

async function generateOriginalPost(
  deps: WatchDeps,
  topic: string,
  context: PromptContext,
  dryRun = false,
): Promise<{ posted: boolean; topic: string | null }> {
  const { db, xWriter, claude, config } = deps;
  const posts = createPostModel(db);

  // Let Claude pick the best prompt type
  const promptType = await claude.pickBestPromptType(context);
  log.info({ promptType, topic }, 'Prompt type selected for original post');

  // Generate content
  const result = await claude.generate(promptType, context);
  const content = cleanContent(result.content);

  if (content === 'SKIP' || content === 'skip') {
    log.info({ topic }, 'Claude says SKIP for original post');
    return { posted: false, topic };
  }

  // Safety check
  const safety = await runHotPotDetector({ content, claude, config });

  if (safety.verdict === 'REJECT') {
    log.warn({ score: safety.score, reasons: safety.reasons }, 'Original post REJECTED by safety');
    posts.create({
      content,
      prompt_type: promptType,
      trend_topic: topic,
      safety_score: safety.score,
      safety_verdict: 'REJECT',
      status: 'rejected',
    });
    return { posted: false, topic };
  }

  if (safety.verdict === 'REVIEW') {
    log.warn({ score: safety.score }, 'Original post needs REVIEW');
    posts.create({
      content,
      prompt_type: promptType,
      trend_topic: topic,
      safety_score: safety.score,
      safety_verdict: 'REVIEW',
      status: 'review',
    });
    return { posted: false, topic };
  }

  // Post via API
  const post = posts.create({
    content,
    prompt_type: promptType,
    trend_topic: topic,
    bill_slug: context.bill?.slug,
    safety_score: safety.score,
    safety_verdict: 'SAFE',
    status: 'queued',
  });

  if (dryRun) {
    log.info({ content: content.slice(0, 80) }, '[DRY RUN] Would post original tweet');
    return { posted: true, topic };
  }

  if (!xWriter) {
    log.error({ topic }, 'X writer not configured — cannot post original tweet');
    posts.markFailed(post.id, 'X writer not configured');
    return { posted: false, topic };
  }

  const postResult = await xWriter.tweet(content);
  if (postResult.success && postResult.tweetId) {
    posts.markPosted(post.id, postResult.tweetId);
    log.info({ topic, tweetUrl: postResult.tweetUrl }, 'Original post published');
    return { posted: true, topic };
  }

  log.error({ topic }, 'Failed to post original tweet');
  posts.markFailed(post.id, 'API posting failed');
  return { posted: false, topic };
}

/**
 * Start the watch daemon — runs scan cycles on an interval.
 */
export function startWatchDaemon(
  deps: WatchDeps,
  options: WatchOptions,
): { stop: () => void } {
  let cycleIndex = 0;
  try {
    const row = deps.db.prepare('SELECT MAX(cycle_index) as m FROM daemon_cycles').get() as { m: number | null } | undefined;
    if (row && typeof row.m === 'number' && Number.isFinite(row.m)) {
      cycleIndex = row.m + 1;
    }
  } catch {
    // ignore (table may not exist yet)
  }
  let running = false;
  let stopped = false;

  const runCycle = async () => {
    if (running || stopped) return;
    running = true;

    const cycleNum = cycleIndex++;
    log.info({ cycle: cycleNum, interval: options.interval }, 'Watch cycle starting');

    // 10-cycle repeating pattern: 50% quote, 30% original, 20% reply
    const CYCLE_PATTERN: Array<'original' | 'quote' | 'reply'> = [
      'quote', 'original', 'quote', 'quote', 'original',
      'quote', 'reply', 'original', 'quote', 'reply',
    ];
    const cycleType = CYCLE_PATTERN[cycleNum % CYCLE_PATTERN.length]!;

    const cycles = createDaemonCycleModel(deps.db);
    const cycle = cycles.start(cycleNum, cycleType, cycleType === 'original' ? 'compose' : 'scan');
    const startMs = Date.now();
    const safeUpdate: CycleUpdate = (patch) => {
      try { cycles.update(cycle.id, patch); } catch {}
    };

    try {
      if (cycleType === 'original') {
        const result = await runOriginalPostCycle(deps, options.dryRun);
        cycles.complete(cycle.id, {
          posted: result.posted ? 1 : 0,
          topic: result.topic ?? undefined,
        }, Date.now() - startMs);
        console.log(
          chalk.dim(`[Cycle ${cycleNum}]`) +
          chalk.magenta(' ORIGINAL POST') +
          (result.posted
            ? chalk.green(` ✓ Posted about: ${result.topic}`)
            : chalk.dim(` — No post (topic: ${result.topic ?? 'none'})`))
        );
      } else {
        const stats = await runWatchCycle(deps, options, cycleNum, cycleType, safeUpdate);
        cycles.complete(cycle.id, stats, Date.now() - startMs);
        console.log(
          chalk.dim(`[Cycle ${cycleNum}]`) +
          chalk.blue(` [${cycleType.toUpperCase()}]`) +
          ` Scanned: ${chalk.cyan(String(stats.scanned))}` +
          ` | Engaged: ${chalk.green(String(stats.engaged))}` +
          ` | Tracked: ${chalk.yellow(String(stats.tracked))}` +
          ` | Expired: ${chalk.dim(String(stats.expired))}`
        );
      }
    } catch (err) {
      cycles.complete(cycle.id, {
        error: err instanceof Error ? err.message : String(err),
      }, Date.now() - startMs);
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
