import chalk from 'chalk';
import { getLogger } from '../../utils/logger.js';
import { scanForTweets, type ScannedTweet, type ScanTrace } from './scanner.js';
import { scoreOpportunity } from './opportunity-scorer.js';
import { executeEngagement, evaluateWithClaude } from './engagement-generator.js';
import { createOpportunityModel, type RecommendedAction } from '../state/models/opportunities.js';
import { createEngagementCooldownModel } from '../state/models/engagement-cooldowns.js';
import { createPostModel } from '../state/models/posts.js';
import { createDaemonCycleModel } from '../state/models/daemon-cycles.js';
import { createXInboxModel } from '../state/models/x-inbox.js';
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
 * Sync inbox: fetch mentions of our account from X and upsert into x_inbox_items.
 * Runs every cycle (engagement and original) so notifications arrive regardless of UI.
 */
async function syncInbox(
  deps: WatchDeps,
): Promise<{ synced: number; query: string } | null> {
  const username = deps.config.xUsername?.replace(/^@/, '').trim();
  if (!username) return null;

  const query = `@${username} -from:${username} -is:retweet`;

  // Find sinceId to avoid re-fetching old mentions
  let sinceId: string | undefined;
  try {
    const row = deps.db.prepare(
      'SELECT MAX(CAST(tweet_id AS INTEGER)) as max_id FROM x_inbox_items',
    ).get() as { max_id: number | null } | undefined;
    sinceId = row?.max_id ? String(row.max_id) : undefined;
  } catch {
    // table may not exist yet
  }

  const { tweets, authors, refTweets } = await deps.xClient.searchTweetsExpanded(query, 50, { sinceId });
  const inbox = createXInboxModel(deps.db);
  let synced = 0;

  for (const t of tweets) {
    const m = t.public_metrics;
    const author = authors.get(t.author_id ?? '');

    const refs = (t as any).referenced_tweets as Array<{ type: string; id: string }> | undefined;
    let kind: 'mention' | 'reply' | 'quote' = 'mention';
    let inReplyToUsername: string | undefined;
    let quotedTweetUsername: string | undefined;

    if (refs) {
      const quotedRef = refs.find((r: any) => r.type === 'quoted');
      const repliedRef = refs.find((r: any) => r.type === 'replied_to');

      if (quotedRef) {
        kind = 'quote';
        const qt = refTweets.get(quotedRef.id);
        if (qt?.author_id) quotedTweetUsername = authors.get(qt.author_id)?.username;
      } else if (repliedRef) {
        kind = 'reply';
        const rt = refTweets.get(repliedRef.id);
        if (rt?.author_id) inReplyToUsername = authors.get(rt.author_id)?.username;
      }
    }

    inbox.upsert({
      kind,
      tweet_id: t.id,
      author_id: t.author_id ?? 'unknown',
      author_username: author?.username,
      text: t.text,
      conversation_id: (t as any).conversation_id ?? undefined,
      created_at: t.created_at ?? undefined,
      in_reply_to_tweet_id: refs?.find((r: any) => r.type === 'replied_to')?.id,
      quoted_tweet_id: refs?.find((r: any) => r.type === 'quoted')?.id,
      likes: m?.like_count ?? 0,
      retweets: m?.retweet_count ?? 0,
      replies: m?.reply_count ?? 0,
      quotes: m?.quote_count ?? 0,
      author_name: author?.name,
      author_verified: author?.verified,
      author_verified_type: author?.verifiedType,
      author_followers: author?.followerCount,
      in_reply_to_username: inReplyToUsername,
      quoted_tweet_username: quotedTweetUsername,
    });
    synced++;
  }

  if (synced > 0) {
    log.info({ synced, query }, 'Inbox synced');
  }

  return { synced, query };
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
  trace: Record<string, unknown> = {},
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
  const { tweets, trace: scanTrace } = await scanForTweets(xClient, cycleIndex);
  stats.scanned = tweets.length;
  trace.scan = scanTrace;
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

  // Build score trace from all scored tweets
  const scoreTraceEntries: Array<Record<string, unknown>> = [];
  const scoreSummary = { engage: 0, track: 0, skip: 0, tragedy: 0 };
  for (const { tweet, score } of newTweets) {
    const action = score.recommendedAction === 'quote' || score.recommendedAction === 'reply' ? 'engage' : score.recommendedAction;
    scoreTraceEntries.push({
      tweetId: tweet.id,
      author: tweet.authorUsername,
      textPreview: tweet.text.slice(0, 100),
      total: score.total,
      viral: score.viral,
      relevance: score.relevance,
      timing: score.timing,
      engageability: score.engageability,
      action,
      matchedBill: score.matchedBillSlug ?? undefined,
      matchedKeywords: score.matchedKeywords.length > 0 ? score.matchedKeywords : undefined,
      skipReason: score.skipReason ?? undefined,
      reasons: score.reasons ?? undefined,
    });
    if (action === 'engage') scoreSummary.engage++;
    else if (action === 'track') scoreSummary.track++;
    else scoreSummary.skip++;
  }
  trace.score = { tweets: scoreTraceEntries, summary: scoreSummary };

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

  trace.budget = {
    engagedToday,
    maxPerDay: options.maxEngagementsPerDay,
    remaining: Math.max(0, remainingBudget),
    capReached: remainingBudget <= 0,
  };

  if (remainingBudget <= 0) {
    log.info({ engagedToday }, 'Daily engagement cap reached');
  }

  // Sort candidates by score descending
  engageCandidates.sort((a, b) => {
    const aOpp = opportunities.getByTweetId(a.tweet.id);
    const bOpp = opportunities.getByTweetId(b.tweet.id);
    return (bOpp?.score ?? 0) - (aOpp?.score ?? 0);
  });

  const pipelineTrace: Array<Record<string, unknown>> = [];
  for (const candidate of engageCandidates) {
    if (remainingBudget <= 0) break;

    const pEntry: Record<string, unknown> = {
      tweetId: candidate.tweet.id,
      author: candidate.tweet.authorUsername,
      steps: {} as Record<string, unknown>,
    };
    const pSteps = pEntry.steps as Record<string, unknown>;

    // Check author cooldown
    const canEngage = cooldowns.canEngage(candidate.tweet.authorId, config.engageAuthorCooldownHours);
    if (!canEngage) {
      pSteps.cooldown = { passed: false, reason: 'Author on cooldown' };
      pEntry.outcome = 'skipped';
      pEntry.skipReason = 'Author on cooldown';
      pipelineTrace.push(pEntry);
      log.info({ author: candidate.tweet.authorUsername }, 'Author on cooldown');
      continue;
    }
    pSteps.cooldown = { passed: true };

    const opp = opportunities.getByTweetId(candidate.tweet.id);
    if (!opp) continue;
    pEntry.score = opp.score;

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

      pSteps.safety = result.safetyResult ? { score: result.safetyResult.score, verdict: result.safetyResult.verdict } : undefined;
      pSteps.post = { success: true, tweetId: result.tweetId, dryRun: options.dryRun };
      pEntry.outcome = 'posted';

      log.info({
        action: result.action,
        author: candidate.tweet.authorUsername,
        score: opp.score,
      }, 'Engagement executed');
    } else if (result.skipReason) {
      opportunities.markSkipped(opp.tweet_id);
      pEntry.outcome = 'skipped';
      pEntry.skipReason = result.skipReason;
      if (result.safetyResult) {
        pSteps.safety = { score: result.safetyResult.score, verdict: result.safetyResult.verdict };
      }
      log.info({ reason: result.skipReason }, 'Engagement skipped');
    } else {
      pEntry.outcome = 'failed';
    }
    pipelineTrace.push(pEntry);
  }
  trace.pipeline = pipelineTrace;

  // Phase 5: Re-evaluate tracked tweets (metrics may have grown)
  updateCycle?.({ phase: 'reevaluate' });
  const reEvalTrace = await reEvaluateTracked(deps, options, bills);
  trace.reevaluate = reEvalTrace;

  // Phase 6: Expire old tracked tweets
  updateCycle?.({ phase: 'expire' });
  stats.expired = opportunities.expireOld(24);
  trace.expire = { count: stats.expired };
  updateCycle?.({ expired: stats.expired });
  if (stats.expired > 0) {
    log.info({ expired: stats.expired }, 'Expired stale opportunities');
  }

  // Cleanup expired cooldowns
  updateCycle?.({ phase: 'cleanup' });
  cooldowns.clearExpired(48);
  trace.cleanup = { ran: true };

  return stats;
}

/**
 * Re-evaluate tracked opportunities that may have gained traction.
 * Returns trace data for evidence rendering.
 */
async function reEvaluateTracked(
  deps: WatchDeps,
  options: WatchOptions,
  bills: LoadedBill[],
): Promise<{ count: number; tweets: Array<Record<string, unknown>> }> {
  const { db, xClient, claude, config } = deps;
  const effectiveConfig = {
    ...config,
    engageMinScore: options.minOpportunityScore,
    engageTrackThreshold: options.trackThreshold,
  };
  const opportunities = createOpportunityModel(db);
  const tracked = opportunities.getTracked(20);
  const reEvalTweets: Array<Record<string, unknown>> = [];

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

    const oldScore = opp.score;
    const score = scoreOpportunity(tweet, bills, effectiveConfig);
    opportunities.updateScore(opp.tweet_id, {
      score: score.total,
      viral_score: score.viral,
      relevance_score: score.relevance,
      timing_score: score.timing,
      engageability_score: score.engageability,
      recommended_action: score.recommendedAction,
    });

    let claudeEval = false;

    // For ambiguous scores (40-60), use Claude to evaluate
    if (score.total >= 40 && score.total <= 60) {
      const updated = opportunities.getByTweetId(opp.tweet_id);
      if (updated) {
        const evaluation = await evaluateWithClaude(updated, claude);
        claudeEval = true;
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

        reEvalTweets.push({
          tweetId: opp.tweet_id,
          author: opp.author_username ?? 'unknown',
          oldScore,
          newScore: evaluation.score,
          action: evaluation.action,
          claudeEval: true,
        });
        continue;
      }
    }

    reEvalTweets.push({
      tweetId: opp.tweet_id,
      author: opp.author_username ?? 'unknown',
      oldScore,
      newScore: score.total,
      action: score.recommendedAction,
      claudeEval,
    });
  }

  return { count: tracked.length, tweets: reEvalTweets };
}

/**
 * Generate and post an original standalone tweet based on trending topics.
 * Runs every Nth cycle to mix original content with engagement.
 */
async function runOriginalPostCycle(
  deps: WatchDeps,
  dryRun = false,
): Promise<{ posted: boolean; topic: string | null; trace: Record<string, unknown> }> {
  const { xClient, claude, config } = deps;
  const bills = loadBills(config.billsDir);
  const trace: Record<string, unknown> = {};

  log.info('Original post cycle starting — scanning trends');

  // Fetch trends from X and Congress.gov
  const [xTrends, congressTrends] = await Promise.all([
    fetchXTrends(xClient),
    fetchCongressActions(config),
  ]);

  trace.trends = {
    xTrends: xTrends.slice(0, 10).map(t => ({ topic: t.topic, volume: t.volume ?? 0 })),
    congressActions: congressTrends.slice(0, 10).map(t => ({ topic: t.topic, source: t.source ?? '' })),
    xCount: xTrends.length,
    congressCount: congressTrends.length,
  };

  const aggregated = aggregateTrends(xTrends, congressTrends, []);

  // Score and filter
  const allScored = aggregated.map(t => ({ ...t, score: scoreTrend(t, config) }));
  const scored = allScored
    .filter(t => t.score >= 40)
    .sort((a, b) => b.score - a.score);

  trace.aggregate = {
    beforeDedup: xTrends.length + congressTrends.length,
    afterDedup: aggregated.length,
    crossSourceCount: aggregated.filter(t => t.sources && t.sources.length > 1).length,
  };

  trace.scoreTrends = {
    scored: allScored.slice(0, 15).map(t => ({ topic: t.topic, score: t.score, passed: t.score >= 40 })),
    passedCount: scored.length,
    topTopic: scored[0]?.topic,
    topScore: scored[0]?.score,
  };

  if (scored.length === 0) {
    log.info('No trends scored high enough for original post — skipping cycle');
    return { posted: false, topic: null, trace };
  }

  const topTrend = scored[0]!;
  log.info({ topic: topTrend.topic, score: topTrend.score }, 'Top trend for original post');

  // Match to bills
  const billMatches = matchTrendToBills(topTrend, bills);
  const matchedBill = billMatches[0]?.bill;

  trace.matchBills = {
    topTrend: topTrend.topic,
    matchedSlug: matchedBill?.slug ?? null,
    matchedTitle: matchedBill?.title,
  };

  const context: PromptContext = {
    trendTopic: topTrend.topic,
    bill: matchedBill,
    siteUrl: matchedBill ? billUrl(matchedBill.slug, config.siteUrl) : undefined,
  };

  const result = await generateOriginalPost(deps, topTrend.topic, context, dryRun, trace);
  return { ...result, trace };
}

async function generateOriginalPost(
  deps: WatchDeps,
  topic: string,
  context: PromptContext,
  dryRun = false,
  trace: Record<string, unknown> = {},
): Promise<{ posted: boolean; topic: string | null }> {
  const { db, xWriter, claude, config } = deps;
  const posts = createPostModel(db);

  // Let Claude pick the best prompt type
  let promptType = await claude.pickBestPromptType(context);
  let guardTriggered = false;

  // Guard: bill-roast requires a bill — fall back to trend-jack if no bill matched
  if (promptType === 'bill-roast' && !context.bill) {
    log.info({ original: promptType }, 'No bill in context — falling back to trend-jack');
    guardTriggered = true;
    promptType = 'trend-jack';
  }

  trace.pickPrompt = {
    selectedType: promptType,
    guardTriggered,
    fallbackUsed: guardTriggered ? 'trend-jack' : undefined,
  };

  log.info({ promptType, topic }, 'Prompt type selected for original post');

  // Generate content
  const result = await claude.generate(promptType, context);
  const content = cleanContent(result.content);
  const skipped = content === 'SKIP' || content === 'skip';

  trace.generate = {
    promptType,
    contentPreview: skipped ? undefined : content.slice(0, 100),
    contentLength: skipped ? undefined : content.length,
    skipped,
  };

  if (skipped) {
    log.info({ topic }, 'Claude says SKIP for original post');
    return { posted: false, topic };
  }

  // Safety check
  const safety = await runHotPotDetector({ content, claude, config });

  trace.safety = {
    score: safety.score,
    verdict: safety.verdict,
  };

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
    trace.post = { success: true, dryRun: true };
    return { posted: true, topic };
  }

  if (!xWriter) {
    log.error({ topic }, 'X writer not configured — cannot post original tweet');
    posts.markFailed(post.id, 'X writer not configured');
    trace.post = { success: false, dryRun: false };
    return { posted: false, topic };
  }

  const postResult = await xWriter.tweet(content);
  if (postResult.success && postResult.tweetId) {
    posts.markPosted(post.id, postResult.tweetId);
    log.info({ topic, tweetUrl: postResult.tweetUrl }, 'Original post published');
    trace.post = { success: true, tweetId: postResult.tweetId, dryRun: false };
    return { posted: true, topic };
  }

  log.error({ topic }, 'Failed to post original tweet');
  posts.markFailed(post.id, 'API posting failed');
  trace.post = { success: false, dryRun: false };
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
        try { cycles.updateTrace(cycle.id, result.trace); } catch {}
        console.log(
          chalk.dim(`[Cycle ${cycleNum}]`) +
          chalk.magenta(' ORIGINAL POST') +
          (result.posted
            ? chalk.green(` OK Posted about: ${result.topic}`)
            : chalk.dim(` — No post (topic: ${result.topic ?? 'none'})`))
        );
      } else {
        const trace: Record<string, unknown> = {};
        const stats = await runWatchCycle(deps, options, cycleNum, cycleType, safeUpdate, trace);
        cycles.complete(cycle.id, stats, Date.now() - startMs);
        try { cycles.updateTrace(cycle.id, trace); } catch {}
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
    }

    // Inbox sync — runs every cycle regardless of type or errors above
    try {
      const inboxResult = await syncInbox(deps);
      if (inboxResult && inboxResult.synced > 0) {
        console.log(chalk.dim(`[Cycle ${cycleNum}]`) + chalk.cyan(` Inbox: +${inboxResult.synced} mentions`));
        try { cycles.updateTrace(cycle.id, { inbox: inboxResult }); } catch {}
      }
    } catch (err) {
      log.warn({ err }, 'Inbox sync failed (non-fatal)');
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
