import type Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { XReadClient, XWriteClient } from '../x-api/client.js';
import type { ClaudeClient } from '../claude/client.js';
import type { Config } from '../../config.js';
import type { LoadedBill } from '../bills/loader.js';
import { fetchTweetContext } from '../x-api/tweet-context.js';
import { cleanContent, billUrl } from '../../utils/format.js';
import { runHotPotDetector } from '../safety/hot-pot-detector.js';
import { createPostModel } from '../state/models/posts.js';
import { createOpportunityModel } from '../state/models/opportunities.js';
import { createAnalyticsModel } from '../state/models/analytics.js';
import { createTrendModel } from '../state/models/trends.js';
import { createXInboxModel } from '../state/models/x-inbox.js';
import { fetchXTrends } from '../trending/x-trends.js';
import { fetchCongressActions } from '../trending/congress-watch.js';
import { fetchRssFeeds } from '../trending/rss-feeds.js';
import { aggregateTrends } from '../trending/aggregator.js';
import { scoreTrend } from '../scoring/composite-scorer.js';
import { readLimiter, tweetLimiter } from '../x-api/rate-limiter.js';
import { fetchAnthropicCosts, type AnthropicCostData } from '../claude/admin-api.js';
import type { DashboardDaemonManager } from './daemon-manager.js';
import type { WatchOptions } from '../engage/watch-daemon.js';
import type { PromptType, PromptContext } from '../claude/prompts/index.js';

export interface ApiDeps {
  db: Database.Database;
  config?: Config;
  daemon?: DashboardDaemonManager;
}

export interface FullApiDeps {
  db: Database.Database;
  writeDb?: Database.Database;
  xReader?: XReadClient;
  xWriter?: XWriteClient;
  claude?: ClaudeClient;
  config?: Config;
  bills: LoadedBill[];
  dryRun: boolean;
  daemon?: DashboardDaemonManager;
}

// Admin API cost data — refreshed asynchronously, read synchronously by getOverview
let adminCosts: AnthropicCostData | null = null;

export function handleApi(deps: ApiDeps, pathname: string, url: URL, _req: IncomingMessage, res: ServerResponse): void {
  const { db, config } = deps;

  try {
    switch (pathname) {
      case '/api/overview':
        json(res, getOverview(db));
        break;
      case '/api/cycles':
        json(res, getCycles(db, intParam(url, 'limit', 50)));
        break;
      case '/api/posts':
        json(res, getPosts(db, intParam(url, 'limit', 50)));
        break;
      case '/api/opportunities':
        json(res, getOpportunities(db, intParam(url, 'limit', 100), url.searchParams.get('status') ?? 'all'));
        break;
      case '/api/feed': {
        const limit = intParam(url, 'limit', 100);
        const kind = (url.searchParams.get('kind') ?? 'all') as any;
        const status = (url.searchParams.get('status') ?? 'all') as any;
        const includeDiscarded = (url.searchParams.get('includeDiscarded') ?? '0') === '1';
        json(res, getFeed(db, { limit, kind, status, includeDiscarded }));
        break;
      }
      case '/api/hot-users':
        json(res, getHotUsers(db, intParam(url, 'limit', 20)));
        break;
      case '/api/trends':
        json(res, getTrends(db, intParam(url, 'limit', 20)));
        break;
      case '/api/safety':
        json(res, getSafety(db, intParam(url, 'limit', 50)));
        break;
      case '/api/costs':
        json(res, getCosts(db, intParam(url, 'days', 7)));
        break;
      case '/api/daemon-status':
        json(res, deps.daemon ? deps.daemon.status() : { running: false, startedAt: null, stoppedAt: null, lastError: null, options: null });
        break;
      case '/api/cycle-detail': {
        const cycleId = intParam(url, 'id', 0);
        if (!cycleId) {
          json(res, { error: 'id is required' }, 400);
          break;
        }
        json(res, getCycleDetail(db, cycleId));
        break;
      }
      case '/api/daily-stats':
        json(res, getDailyStats(db, intParam(url, 'days', 7)));
        break;
      case '/api/author-stats': {
        const authorId = url.searchParams.get('authorId') ?? '';
        if (!authorId) {
          json(res, { error: 'authorId is required' }, 400);
          break;
        }
        json(res, getAuthorStats(db, authorId, config));
        break;
      }
      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}

export function handleSSE(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  let lastPostCount = 0;
  let lastOppCount = 0;
  let lastCycleCount = 0;
  let lastFeedCount = 0;

  // Initialize counts
  try {
    lastPostCount = safeCount(deps.db, 'posts');
    lastOppCount = safeCount(deps.db, 'opportunities');
    lastCycleCount = safeCount(deps.db, 'daemon_cycles');
    lastFeedCount = safeCount(deps.db, 'x_inbox_items');
  } catch {
    // Tables may not exist yet
  }

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial overview
  try {
    send('overview', getOverview(deps.db));
  } catch {
    // Ignore if tables don't exist yet
  }

  const interval = setInterval(() => {
    try {
      const overview = getOverview(deps.db);
      send('overview', overview);

      const postCount = safeCount(deps.db, 'posts');
      if (postCount > lastPostCount) {
        send('new-post', { count: postCount - lastPostCount });
        lastPostCount = postCount;
      }

      const oppCount = safeCount(deps.db, 'opportunities');
      if (oppCount > lastOppCount) {
        send('new-opportunity', { count: oppCount - lastOppCount });
        lastOppCount = oppCount;
      }

      const feedCount = safeCount(deps.db, 'x_inbox_items');
      if (feedCount > lastFeedCount) {
        send('new-feed', { count: feedCount - lastFeedCount });
        lastFeedCount = feedCount;
      }

      const cycleCount = safeCount(deps.db, 'daemon_cycles');
      if (cycleCount > lastCycleCount) {
        send('new-cycle', { count: cycleCount - lastCycleCount });
        lastCycleCount = cycleCount;
      }
    } catch {
      // DB might be temporarily locked
    }
  }, 5000);

  // Refresh Admin API costs periodically (has its own 5-min cache)
  const adminKey = deps.config?.anthropicAdminApiKey;
  let adminCostTimer: ReturnType<typeof setInterval> | null = null;
  if (adminKey) {
    const refreshAdminCosts = () => {
      fetchAnthropicCosts(adminKey).then(c => { if (c) adminCosts = c; }).catch(() => {});
    };
    refreshAdminCosts(); // Initial fetch
    adminCostTimer = setInterval(refreshAdminCosts, 60000);
  }

  // Heartbeat every 15s
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  res.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
    if (adminCostTimer) clearInterval(adminCostTimer);
  });
}

// ── POST API handler ─────────────────────────────────

export async function handlePostApi(deps: FullApiDeps, pathname: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    switch (pathname) {
      case '/api/tweet-context':
        await handleTweetContext(deps, req, res);
        break;
      case '/api/opportunity-status':
        await handleOpportunityStatus(deps, req, res);
        break;
      case '/api/opportunity-star':
        await handleOpportunityStar(deps, req, res);
        break;
      case '/api/opportunity-refresh-metrics':
        await handleOpportunityRefreshMetrics(deps, req, res);
        break;
      case '/api/feed-refresh':
        await handleFeedRefresh(deps, req, res);
        break;
      case '/api/feed-archive-all':
        await handleFeedArchiveAll(deps, req, res);
        break;
      case '/api/feed-item-star':
        await handleFeedItemStar(deps, req, res);
        break;
      case '/api/feed-item-status':
        await handleFeedItemStatus(deps, req, res);
        break;
      case '/api/post-engagement':
        await handlePostEngagement(deps, req, res);
        break;
      case '/api/post-compose':
        await handlePostCompose(deps, req, res);
        break;
      case '/api/post-delete':
        await handlePostDelete(deps, req, res);
        break;
      case '/api/post-draft':
        await handlePostDraft(deps, req, res);
        break;
      case '/api/posts-refresh-metrics':
        await handlePostsRefreshMetrics(deps, req, res);
        break;
      case '/api/trends-refresh':
        await handleTrendsRefresh(deps, req, res);
        break;
      case '/api/daemon-start':
        await handleDaemonStart(deps, req, res);
        break;
      case '/api/daemon-stop':
        await handleDaemonStop(deps, req, res);
        break;
      default:
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    }
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}

// ── POST /api/tweet-context ──────────────────────────

async function handleTweetContext(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.xReader) {
    json(res, { error: 'X API reader not configured' }, 503);
    return;
  }

  const body = await parseBody<{ tweetId: string }>(req);
  if (!body.tweetId) {
    json(res, { error: 'tweetId is required' }, 400);
    return;
  }

  const context = await fetchTweetContext(deps.xReader, body.tweetId);
  if (!context) {
    json(res, { error: 'Tweet not found or unavailable' }, 404);
    return;
  }

  json(res, context);
}

// ── GET /api/generate-draft (SSE) ───────────────────

export function handleGenerateSSE(deps: FullApiDeps, url: URL, _req: IncomingMessage, res: ServerResponse): void {
  const tweetId = url.searchParams.get('tweetId');
  const action = (url.searchParams.get('action') ?? 'quote') as 'quote' | 'reply';
  const hintRaw = url.searchParams.get('hint');
  const hint = hintRaw ? hintRaw.slice(0, 800) : null;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  if (!tweetId) {
    send('error', { message: 'tweetId query parameter is required' });
    res.end();
    return;
  }

  if (!deps.claude) {
    send('error', { message: 'Claude client not configured' });
    res.end();
    return;
  }

  // Run pipeline asynchronously
  runGeneratePipeline(deps, tweetId, action, hint, send)
    .catch(err => {
      send('error', { message: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      res.end();
    });
}

async function runGeneratePipeline(
  deps: FullApiDeps,
  tweetId: string,
  action: 'quote' | 'reply',
  hint: string | null,
  send: (event: string, data: unknown) => void,
): Promise<void> {
  const { claude, xReader, config, bills } = deps;
  if (!claude) throw new Error('Claude not configured');

  const steps = ['fetch', 'research', 'generate', 'fact-check', 'safety'] as const;

  const emitStep = (step: string, status: 'running' | 'complete' | 'failed' | 'skipped', detail?: string) => {
    send('step', { step, status, detail });
  };

  // [0] FETCH
  emitStep('fetch', 'running');
  let tweetContext = null;
  try {
    if (xReader) {
      tweetContext = await fetchTweetContext(xReader, tweetId);
    }
  } catch {
    // Fallback to cached text from DB
  }

  // If no live fetch, build minimal context from DB
  if (!tweetContext) {
    const opp = deps.db.prepare('SELECT * FROM opportunities WHERE tweet_id = ?').get(tweetId) as Record<string, unknown> | undefined;
    if (opp) {
      tweetContext = {
        tweet: {
          id: tweetId,
          text: opp.text as string,
          author: {
            id: (opp.author_id as string) ?? 'unknown',
            username: (opp.author_username as string) ?? 'unknown',
            name: (opp.author_username as string) ?? 'Unknown',
          },
        },
        type: 'original' as const,
      };
      emitStep('fetch', 'complete', 'Using cached data from DB');
    } else {
      emitStep('fetch', 'failed', 'Tweet not found');
      send('error', { message: 'Tweet not found in API or DB' });
      return;
    }
  } else {
    emitStep('fetch', 'complete', `@${tweetContext.tweet.author.username}`);
  }

  // [1] RESEARCH
  emitStep('research', 'running');
  let researchResult;
  try {
    // Find matching bill context
    let billContext;
    const opp = deps.db.prepare('SELECT matched_bill_slug FROM opportunities WHERE tweet_id = ?').get(tweetId) as { matched_bill_slug: string | null } | undefined;
    if (opp?.matched_bill_slug) {
      billContext = bills.find(b => b.slug === opp.matched_bill_slug);
    }

    const research = await claude.research(tweetContext, billContext);
    researchResult = research.result;

    if (!researchResult.shouldEngage) {
      emitStep('research', 'failed', researchResult.skipReason ?? 'Not suitable');
      send('result', {
        content: null,
        action,
        skipReason: `Research: ${researchResult.skipReason ?? 'Not suitable for engagement'}`,
      });
      return;
    }
    emitStep('research', 'complete', `${researchResult.verifiableFacts.length} facts verified`);
  } catch (err) {
    emitStep('research', 'skipped', 'Research unavailable, proceeding without');
  }

  // [2] GENERATE
  emitStep('generate', 'running');
  const promptType: PromptType = action === 'quote' ? 'quote-dunk' : 'reply-dunk';
  const promptContext: PromptContext = {
    quoteTweetText: tweetContext.tweet.text,
    quoteTweetAuthor: tweetContext.tweet.author.username,
    tweetContext,
    researchResult,
    additionalContext: hint ?? undefined,
  };

  // Add bill context if matched
  const oppRow = deps.db.prepare('SELECT matched_bill_slug FROM opportunities WHERE tweet_id = ?').get(tweetId) as { matched_bill_slug: string | null } | undefined;
  if (oppRow?.matched_bill_slug) {
    const bill = bills.find(b => b.slug === oppRow.matched_bill_slug);
    if (bill && config) {
      promptContext.bill = bill;
      promptContext.siteUrl = billUrl(bill.slug, config.siteUrl);
    }
  }

  const genResult = await claude.generate(promptType, promptContext);
  let content = cleanContent(genResult.content);

  if (content === 'SKIP' || content === 'skip') {
    emitStep('generate', 'failed', 'Claude says SKIP');
    send('result', { content: null, action, skipReason: 'Claude returned SKIP' });
    return;
  }
  emitStep('generate', 'complete', `${content.length} chars`);

  // [3] FACT-CHECK
  let factCheckVerdict = 'PASS';
  let factCheckIssues: Array<{ claim: string; problem: string; suggestion: string }> = [];
  if (tweetContext && researchResult) {
    emitStep('fact-check', 'running');
    try {
      const fc = await claude.factCheck(content, tweetContext, researchResult);
      factCheckVerdict = fc.result.verdict;
      factCheckIssues = fc.result.issues;

      if (fc.result.verdict === 'REJECT') {
        emitStep('fact-check', 'failed', `Rejected: ${fc.result.issues.map(i => i.claim).join('; ')}`);
        send('result', {
          content,
          action,
          factCheckVerdict: 'REJECT',
          factCheckIssues: fc.result.issues,
          skipReason: 'Fact-check rejected',
        });
        return;
      }

      if (fc.result.verdict === 'FLAG' && fc.result.cleanedContent) {
        content = fc.result.cleanedContent;
        emitStep('fact-check', 'complete', `Flagged ${fc.result.issues.length} issues — using cleaned version`);
      } else {
        emitStep('fact-check', 'complete', 'Passed');
      }
    } catch {
      emitStep('fact-check', 'skipped', 'Fact-check unavailable');
    }
  } else {
    emitStep('fact-check', 'skipped', 'No research to check against');
  }

  // [4] SAFETY
  emitStep('safety', 'running');
  let safetyResult = null;
  if (config) {
    safetyResult = await runHotPotDetector({ content, claude, config });
    if (safetyResult.verdict === 'REJECT') {
      emitStep('safety', 'failed', safetyResult.reasons.join(', '));
    } else {
      emitStep('safety', 'complete', `Score: ${safetyResult.score} — ${safetyResult.verdict}`);
    }
  } else {
    emitStep('safety', 'skipped', 'Config not available');
  }

  send('result', {
    content,
    action,
    safetyResult,
    factCheckVerdict,
    factCheckIssues,
    researchSummary: researchResult?.summary ?? null,
  });
}

// ── POST /api/post-engagement ────────────────────────

async function handlePostEngagement(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { writeDb, xWriter, claude, config } = deps;

  const body = await parseBody<{ tweetId: string; content: string; action: 'quote' | 'reply' }>(req);
  if (!body.tweetId || !body.content || !body.action) {
    json(res, { error: 'tweetId, content, and action are required' }, 400);
    return;
  }

  let safetyScore = 0;
  let safetyVerdict: 'SAFE' | 'REVIEW' | 'REJECT' = 'SAFE';

  // Re-run safety check on final content (user may have edited)
  if (claude && config) {
    const safety = await runHotPotDetector({ content: body.content, claude, config });
    safetyScore = safety.score;
    safetyVerdict = safety.verdict;
    if (safety.verdict === 'REJECT') {
      json(res, {
        success: false,
        safetyRejected: true,
        safetyReason: safety.reasons.join(', '),
        safetyScore: safety.score,
      });
      return;
    }
  }

  // Dry-run mode: don't actually post
  if (deps.dryRun) {
    // Optionally record the draft locally so users can review it later.
    if (writeDb) {
      const posts = createPostModel(writeDb);
      posts.create({
        content: body.content,
        prompt_type: body.action === 'quote' ? 'quote-dunk' : 'reply-dunk',
        safety_score: safetyScore,
        safety_verdict: safetyVerdict,
        status: 'draft',
        parent_tweet_id: body.tweetId,
      });
    }
    json(res, {
      success: true,
      dryRun: true,
      tweetUrl: null,
      message: 'Dry run — content not posted',
    });
    return;
  }

  if (!writeDb || !xWriter) {
    json(res, { error: 'Write capabilities not configured' }, 503);
    return;
  }

  // Post via X API
  const postResult = body.action === 'quote'
    ? await xWriter.quote(body.content, body.tweetId)
    : await xWriter.reply(body.content, body.tweetId);

  if (!postResult.success) {
    json(res, { success: false, error: 'Failed to post to X' });
    return;
  }

  // Record in DB
  const posts = createPostModel(writeDb);
  const promptType = body.action === 'quote' ? 'quote-dunk' : 'reply-dunk';
  const post = posts.create({
    content: body.content,
    prompt_type: promptType,
    safety_score: safetyScore,
    safety_verdict: safetyVerdict,
    status: 'posted',
    parent_tweet_id: body.tweetId,
  });

  // Update post with tweet ID
  if (postResult.tweetId) {
    writeDb.prepare('UPDATE posts SET tweet_id = ?, posted_at = datetime(?) WHERE id = ?')
      .run(postResult.tweetId, new Date().toISOString(), post.id);
  }

  // Mark opportunity as engaged
  const opportunities = createOpportunityModel(writeDb);
  opportunities.markEngaged(body.tweetId, post.id);

  // Record author cooldown stats (best-effort; non-fatal if table doesn't exist yet)
  try {
    const row = writeDb.prepare('SELECT author_id FROM opportunities WHERE tweet_id = ?').get(body.tweetId) as { author_id: string } | undefined;
    if (row?.author_id) {
      writeDb.prepare(`
        INSERT INTO engagement_cooldowns (author_id, last_engaged, engage_count)
        VALUES (?, datetime('now'), 1)
        ON CONFLICT(author_id) DO UPDATE SET
          last_engaged = datetime('now'),
          engage_count = engage_count + 1
      `).run(row.author_id);
    }
  } catch {
    // Non-fatal
  }

  json(res, {
    success: true,
    tweetUrl: postResult.tweetUrl,
    tweetId: postResult.tweetId,
  });
}

// ── POST /api/opportunity-status ─────────────────────

async function handleOpportunityStatus(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }

  const body = await parseBody<{ tweetId: string; status: 'tracked' | 'skipped' }>(req);
  if (!body.tweetId || !body.status) {
    json(res, { error: 'tweetId and status are required' }, 400);
    return;
  }

  if (body.status !== 'tracked' && body.status !== 'skipped') {
    json(res, { error: 'Invalid status' }, 400);
    return;
  }

  const info = deps.writeDb.prepare(
    'UPDATE opportunities SET status = ?, last_evaluated = datetime(\'now\') WHERE tweet_id = ?'
  ).run(body.status, body.tweetId);

  if (info.changes === 0) {
    json(res, { error: 'Opportunity not found' }, 404);
    return;
  }

  const updated = deps.writeDb.prepare('SELECT * FROM opportunities WHERE tweet_id = ?').get(body.tweetId);
  json(res, { success: true, opportunity: updated });
}

// ── POST /api/opportunity-star ───────────────────────

async function handleOpportunityStar(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }

  const body = await parseBody<{ tweetId: string; starred: boolean }>(req);
  if (!body.tweetId || typeof body.starred !== 'boolean') {
    json(res, { error: 'tweetId and starred are required' }, 400);
    return;
  }

  try {
    const info = deps.writeDb.prepare(
      'UPDATE opportunities SET starred = ? WHERE tweet_id = ?'
    ).run(body.starred ? 1 : 0, body.tweetId);

    if (info.changes === 0) {
      json(res, { error: 'Opportunity not found' }, 404);
      return;
    }

    const updated = deps.writeDb.prepare('SELECT * FROM opportunities WHERE tweet_id = ?').get(body.tweetId);
    json(res, { success: true, opportunity: updated });
  } catch (err) {
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

// ── POST /api/opportunity-refresh-metrics ────────────

async function handleOpportunityRefreshMetrics(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.xReader) {
    json(res, { error: 'X API reader not configured' }, 503);
    return;
  }
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }

  const body = await parseBody<{ tweetId: string }>(req);
  if (!body.tweetId) {
    json(res, { error: 'tweetId is required' }, 400);
    return;
  }

  const metrics = await deps.xReader.getTweetMetrics(body.tweetId);
  if (!metrics) {
    json(res, { error: 'Metrics unavailable' }, 404);
    return;
  }

  const opportunities = createOpportunityModel(deps.writeDb);
  opportunities.updateMetrics(body.tweetId, metrics);

  json(res, { success: true, metrics });
}

// ── POST /api/feed-refresh ───────────────────────────

async function handleFeedRefresh(deps: FullApiDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.xReader) {
    json(res, { error: 'X API reader not configured' }, 503);
    return;
  }
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }
  const usernameRaw = deps.config?.xUsername ?? '';
  const username = usernameRaw.replace(/^@/, '').trim();
  if (!username) {
    json(res, { error: 'X_USERNAME is required to refresh your feed' }, 400);
    return;
  }

  // Basic feed: mentions of your account (excluding your own tweets).
  const query = `@${username} -from:${username} -is:retweet`;
  const sinceId = (() => {
    try {
      if (!tableExists(deps.writeDb!, 'x_inbox_items')) return undefined;
      const row = deps.writeDb!.prepare('SELECT MAX(CAST(tweet_id AS INTEGER)) as max_id FROM x_inbox_items').get() as { max_id: number | null };
      return row?.max_id ? String(row.max_id) : undefined;
    } catch {
      return undefined;
    }
  })();

  const { tweets, authors, refTweets } = await deps.xReader.searchTweetsExpanded(query, 50, { sinceId });

  const inbox = createXInboxModel(deps.writeDb);
  let upserted = 0;
  for (const t of tweets) {
    const m = t.public_metrics;
    const author = authors.get(t.author_id ?? '');

    // Classify kind from referenced_tweets
    const refs = (t as any).referenced_tweets as Array<{ type: string; id: string }> | undefined;
    let kind: 'mention' | 'reply' | 'quote' = 'mention';
    let inReplyToUsername: string | undefined;
    let quotedTweetUsername: string | undefined;

    if (refs) {
      const quotedRef = refs.find(r => r.type === 'quoted');
      const repliedRef = refs.find(r => r.type === 'replied_to');

      if (quotedRef) {
        kind = 'quote';
        const qt = refTweets.get(quotedRef.id);
        if (qt?.author_id) {
          quotedTweetUsername = authors.get(qt.author_id)?.username;
        }
      } else if (repliedRef) {
        kind = 'reply';
        const rt = refTweets.get(repliedRef.id);
        if (rt?.author_id) {
          inReplyToUsername = authors.get(rt.author_id)?.username;
        }
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
      in_reply_to_tweet_id: refs?.find(r => r.type === 'replied_to')?.id,
      quoted_tweet_id: refs?.find(r => r.type === 'quoted')?.id,
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
    upserted++;
  }

  json(res, { success: true, query, sinceId, scanned: tweets.length, upserted });
}

// ── POST /api/feed-archive-all ───────────────────────

async function handleFeedArchiveAll(deps: FullApiDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }
  if (!tableExists(deps.writeDb, 'x_inbox_items')) {
    json(res, { success: true, changed: 0 });
    return;
  }

  const info = deps.writeDb.prepare(
    "UPDATE x_inbox_items SET status = 'archived' WHERE discarded = 0 AND status = 'new'"
  ).run();

  json(res, { success: true, changed: info.changes });
}

// ── POST /api/feed-item-star ─────────────────────────

async function handleFeedItemStar(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }
  const body = await parseBody<{ tweetId: string; starred: boolean }>(req);
  if (!body.tweetId) {
    json(res, { error: 'tweetId is required' }, 400);
    return;
  }

  const inbox = createXInboxModel(deps.writeDb);
  const changes = inbox.setStarred(body.tweetId, !!body.starred);
  if (changes === 0) {
    json(res, { error: 'Feed item not found' }, 404);
    return;
  }
  const updated = deps.writeDb.prepare('SELECT * FROM x_inbox_items WHERE tweet_id = ?').get(body.tweetId);
  json(res, { success: true, item: updated });
}

// ── POST /api/feed-item-status ───────────────────────

async function handleFeedItemStatus(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }
  const body = await parseBody<{ tweetId: string; status?: string; discarded?: boolean }>(req);
  if (!body.tweetId) {
    json(res, { error: 'tweetId is required' }, 400);
    return;
  }

  const inbox = createXInboxModel(deps.writeDb);
  let changes = 0;

  if (typeof body.discarded === 'boolean') {
    changes = inbox.setDiscarded(body.tweetId, body.discarded);
  } else if (body.status) {
    const allowed = new Set(['new', 'archived', 'replied', 'discarded']);
    if (!allowed.has(body.status)) {
      json(res, { error: 'Invalid status' }, 400);
      return;
    }
    changes = inbox.setStatus(body.tweetId, body.status as any);
  } else {
    json(res, { error: 'status or discarded is required' }, 400);
    return;
  }

  if (changes === 0) {
    json(res, { error: 'Feed item not found' }, 404);
    return;
  }
  const updated = deps.writeDb.prepare('SELECT * FROM x_inbox_items WHERE tweet_id = ?').get(body.tweetId);
  json(res, { success: true, item: updated });
}

// ── POST /api/post-compose ───────────────────────────

async function handlePostCompose(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { writeDb, xWriter, claude, config } = deps;

  const body = await parseBody<{ mode: 'tweet' | 'reply' | 'quote'; content: string; targetTweetId?: string }>(req);
  const mode = body.mode;
  const content = (body.content ?? '').trim();
  const target = (body.targetTweetId ?? '').trim();

  if (mode !== 'tweet' && mode !== 'reply' && mode !== 'quote') {
    json(res, { error: 'mode must be tweet, reply, or quote' }, 400);
    return;
  }
  if (!content) {
    json(res, { error: 'content is required' }, 400);
    return;
  }
  if ((mode === 'reply' || mode === 'quote') && !target) {
    json(res, { error: 'targetTweetId is required for reply/quote' }, 400);
    return;
  }
  if (!writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }

  // Safety check (optional but recommended)
  let safetyScore = 0;
  let safetyVerdict: 'SAFE' | 'REVIEW' | 'REJECT' = 'SAFE';
  if (claude && config) {
    const safety = await runHotPotDetector({ content, claude, config });
    safetyScore = safety.score;
    safetyVerdict = safety.verdict;
    if (safety.verdict === 'REJECT') {
      json(res, {
        success: false,
        safetyRejected: true,
        safetyReason: safety.reasons.join(', '),
        safetyScore: safety.score,
      });
      return;
    }
  }

  const posts = createPostModel(writeDb);

  // Dry run: record locally only.
  if (deps.dryRun) {
    const post = posts.create({
      content,
      prompt_type: 'manual',
      x_post_type: mode,
      safety_score: safetyScore,
      safety_verdict: safetyVerdict,
      status: 'draft',
      parent_tweet_id: (mode === 'tweet') ? undefined : target,
    });
    json(res, { success: true, dryRun: true, postId: post.id, tweetUrl: null, tweetId: null });
    return;
  }

  if (!xWriter) {
    json(res, { error: 'X writer not configured' }, 503);
    return;
  }

  const post = posts.create({
    content,
    prompt_type: 'manual',
    x_post_type: mode,
    safety_score: safetyScore,
    safety_verdict: safetyVerdict,
    status: 'queued',
    parent_tweet_id: (mode === 'tweet') ? undefined : target,
  });

  const result = mode === 'tweet'
    ? await xWriter.tweet(content)
    : mode === 'quote'
      ? await xWriter.quote(content, target)
      : await xWriter.reply(content, target);

  if (!result.success) {
    posts.markFailed(post.id, 'X posting failed');
    json(res, { success: false, error: 'Failed to post to X' });
    return;
  }

  if (result.tweetId) {
    writeDb.prepare('UPDATE posts SET tweet_id = ?, posted_at = datetime(?) WHERE id = ?')
      .run(result.tweetId, new Date().toISOString(), post.id);
    writeDb.prepare('UPDATE posts SET status = ? WHERE id = ?').run('posted', post.id);
  } else {
    // Shouldn't happen, but keep DB consistent.
    writeDb.prepare('UPDATE posts SET status = ? WHERE id = ?').run('posted', post.id);
  }

  json(res, { success: true, dryRun: false, postId: post.id, tweetUrl: result.tweetUrl ?? null, tweetId: result.tweetId ?? null });
}

// ── POST /api/post-delete ────────────────────────────

async function handlePostDelete(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }

  const body = await parseBody<{ id: number }>(req);
  if (!body.id) {
    json(res, { error: 'id is required' }, 400);
    return;
  }

  const posts = createPostModel(deps.writeDb);
  const existing = posts.getById(body.id);
  if (!existing) {
    json(res, { error: 'Post not found' }, 404);
    return;
  }

  if (existing.status === 'posted') {
    json(res, { error: 'Cannot delete a posted tweet — delete it on X directly' }, 400);
    return;
  }

  posts.delete(body.id);
  json(res, { success: true });
}

// ── POST /api/post-draft ────────────────────────────

async function handlePostDraft(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { writeDb, xWriter, claude, config } = deps;

  if (!writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }

  const body = await parseBody<{ id: number }>(req);
  if (!body.id) {
    json(res, { error: 'id is required' }, 400);
    return;
  }

  const posts = createPostModel(writeDb);
  const post = posts.getById(body.id);
  if (!post) {
    json(res, { error: 'Post not found' }, 404);
    return;
  }

  if (post.status !== 'draft' && post.status !== 'queued') {
    json(res, { error: 'Post is not a draft (status: ' + post.status + ')' }, 400);
    return;
  }

  // Re-run safety check
  if (claude && config) {
    const safety = await runHotPotDetector({ content: post.content, claude, config });
    if (safety.verdict === 'REJECT') {
      posts.updateStatus(post.id, 'rejected');
      json(res, {
        success: false,
        safetyRejected: true,
        safetyReason: safety.reasons.join(', '),
        safetyScore: safety.score,
      });
      return;
    }
  }

  if (!xWriter) {
    json(res, { error: 'X writer not configured' }, 503);
    return;
  }

  // Post to X based on type
  const postType = post.x_post_type ?? 'tweet';
  let result;
  if (postType === 'reply' && post.parent_tweet_id) {
    result = await xWriter.reply(post.content, post.parent_tweet_id);
  } else if (postType === 'quote' && post.parent_tweet_id) {
    result = await xWriter.quote(post.content, post.parent_tweet_id);
  } else {
    result = await xWriter.tweet(post.content);
  }

  if (!result.success) {
    posts.markFailed(post.id, 'X posting failed');
    json(res, { success: false, error: 'Failed to post to X' });
    return;
  }

  // Update post record
  if (result.tweetId) {
    posts.markPosted(post.id, result.tweetId);
  } else {
    posts.updateStatus(post.id, 'posted');
  }

  // Mark opportunity as engaged if this was an engagement post
  if (post.parent_tweet_id && (postType === 'reply' || postType === 'quote')) {
    try {
      const opportunities = createOpportunityModel(writeDb);
      opportunities.markEngaged(post.parent_tweet_id, post.id);
    } catch {
      // Non-fatal — opportunity may not exist
    }
  }

  json(res, {
    success: true,
    tweetUrl: result.tweetUrl ?? null,
    tweetId: result.tweetId ?? null,
  });
}

// ── POST /api/posts-refresh-metrics ──────────────────

async function handlePostsRefreshMetrics(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }
  if (!deps.xReader) {
    json(res, { error: 'X API reader not configured' }, 503);
    return;
  }

  const body = await parseBody<{ limit?: number }>(req).catch(() => ({} as any));
  const limit = Math.max(1, Math.min(200, Number(body.limit ?? 50) || 50));

  const posts = createPostModel(deps.writeDb);
  const analytics = createAnalyticsModel(deps.writeDb);

  const posted = posts.getByStatus('posted', limit).filter(p => !!p.tweet_id);
  let updated = 0;

  for (const p of posted) {
    if (!p.tweet_id) continue;
    const metrics = await deps.xReader.getTweetMetrics(p.tweet_id);
    if (metrics) {
      analytics.record(p.id, metrics);
      updated++;
    }
  }

  json(res, { success: true, scanned: posted.length, updated });
}

// ── POST /api/trends-refresh ─────────────────────────

async function handleTrendsRefresh(deps: FullApiDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.writeDb) {
    json(res, { error: 'Write DB not configured' }, 503);
    return;
  }
  if (!deps.xReader) {
    json(res, { error: 'X API reader not configured' }, 503);
    return;
  }
  if (!deps.config) {
    json(res, { error: 'Config not available' }, 503);
    return;
  }

  const [xTrends, congressTrends, rssTrends] = await Promise.all([
    fetchXTrends(deps.xReader),
    fetchCongressActions(deps.config),
    fetchRssFeeds(deps.config.dataDir),
  ]);
  const aggregated = aggregateTrends(xTrends, congressTrends, rssTrends);
  const scored = aggregated.map(t => ({ ...t, score: scoreTrend(t, deps.config!) }));
  scored.sort((a, b) => b.score - a.score);

  const trendModel = createTrendModel(deps.writeDb);
  for (const t of scored.slice(0, 50)) {
    trendModel.upsert(t.topic, t.sources.join(','), t.totalVolume, t.score);
  }

  json(res, { success: true, trends: scored.slice(0, 20) });
}

// ── POST /api/daemon-start ───────────────────────────

async function handleDaemonStart(deps: FullApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.daemon) {
    json(res, { error: 'Daemon manager not available' }, 503);
    return;
  }
  const body = await parseBody<Partial<WatchOptions>>(req).catch(() => ({} as any));
  const result = deps.daemon.start(body);
  if (!result.ok) {
    json(res, { success: false, error: result.error, status: result.status }, 400);
    return;
  }
  json(res, { success: true, status: result.status });
}

// ── POST /api/daemon-stop ────────────────────────────

async function handleDaemonStop(deps: FullApiDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps.daemon) {
    json(res, { error: 'Daemon manager not available' }, 503);
    return;
  }
  const result = deps.daemon.stop();
  if (!result.ok) {
    json(res, { success: false, error: result.error, status: result.status }, 400);
    return;
  }
  json(res, { success: true, status: result.status });
}

// ── parseBody helper ─────────────────────────────────

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(raw) as T);
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// ── Helpers ──────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function intParam(url: URL, name: string, fallback: number): number {
  const val = url.searchParams.get(name);
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare(
    "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name) as { c: number };
  return row.c > 0;
}

function safeCount(db: Database.Database, table: string): number {
  if (!tableExists(db, table)) return 0;
  const row = db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get() as { c: number };
  return row.c;
}

// ── Data fetchers ────────────────────────────────────

function getOverview(db: Database.Database) {
  const postsToday = (db.prepare(
    "SELECT COUNT(*) as c FROM posts WHERE status = 'posted' AND posted_at >= date('now')"
  ).get() as { c: number }).c;

  const postsTotal = (db.prepare(
    "SELECT COUNT(*) as c FROM posts"
  ).get() as { c: number }).c;

  const engagementsToday = (db.prepare(
    "SELECT COUNT(*) as c FROM opportunities WHERE status = 'engaged' AND last_evaluated >= date('now')"
  ).get() as { c: number }).c;

  const safetyStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN verdict = 'REJECT' THEN 1 ELSE 0 END), 0) as rejected,
      COALESCE(SUM(CASE WHEN verdict = 'REVIEW' THEN 1 ELSE 0 END), 0) as review
    FROM safety_log WHERE created_at >= date('now', '-7 days')
  `).get() as { total: number; rejected: number; review: number };

  const costToday = (db.prepare(
    "SELECT COALESCE(SUM(cost_cents), 0) as c FROM generations WHERE created_at >= date('now')"
  ).get() as { c: number }).c;

  const costWeek = (db.prepare(
    "SELECT COALESCE(SUM(cost_cents), 0) as c FROM generations WHERE created_at >= date('now', '-7 days')"
  ).get() as { c: number }).c;

  const oppStats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'tracked' THEN 1 ELSE 0 END), 0) as tracked,
      COALESCE(SUM(CASE WHEN status = 'engaged' THEN 1 ELSE 0 END), 0) as engaged,
      COALESCE(SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END), 0) as expired,
      COALESCE(SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END), 0) as skipped,
      COUNT(*) as total
    FROM opportunities
  `).get() as { tracked: number; engaged: number; expired: number; skipped: number; total: number };

  const cycleCount = safeCount(db, 'daemon_cycles');
  const feedNew = tableExists(db, 'x_inbox_items')
    ? (db.prepare("SELECT COUNT(*) as c FROM x_inbox_items WHERE discarded = 0 AND status = 'new'").get() as { c: number }).c
    : 0;

  // Trend arrows: compare today vs yesterday
  const postsYesterday = (db.prepare(
    "SELECT COUNT(*) as c FROM posts WHERE status = 'posted' AND posted_at >= date('now', '-1 day') AND posted_at < date('now')"
  ).get() as { c: number }).c;

  const engagementsYesterday = (db.prepare(
    "SELECT COUNT(*) as c FROM opportunities WHERE status = 'engaged' AND last_evaluated >= date('now', '-1 day') AND last_evaluated < date('now')"
  ).get() as { c: number }).c;

  // 7-day average cost for comparison
  const costAvg7d = costWeek / 7;

  const trendDir = (current: number, previous: number): 'up' | 'down' | 'flat' => {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'flat';
  };

  // Last posted time for zero-state context
  let lastPostedAgo: string | null = null;
  if (postsToday === 0) {
    const lastPost = db.prepare(
      "SELECT posted_at FROM posts WHERE status = 'posted' ORDER BY posted_at DESC LIMIT 1"
    ).get() as { posted_at: string } | undefined;
    if (lastPost?.posted_at) {
      const ms = Date.now() - new Date(lastPost.posted_at + (lastPost.posted_at.includes('Z') ? '' : 'Z')).getTime();
      const h = Math.floor(ms / 3600000);
      lastPostedAgo = h > 0 ? h + 'h ago' : '<1h ago';
    }
  }

  return {
    postsToday,
    postsTotal,
    engagementsToday,
    lastPostedAgo,
    safetyRejectRate: safetyStats.total > 0 ? safetyStats.rejected / safetyStats.total : 0,
    safetyTotal: safetyStats.total,
    safetyRejected: safetyStats.rejected,
    safetyReview: safetyStats.review,
    costTodayCents: costToday,
    costWeekCents: costWeek,
    trends: {
      posts: { direction: trendDir(postsToday, postsYesterday), delta: postsToday - postsYesterday },
      engagements: { direction: trendDir(engagementsToday, engagementsYesterday), delta: engagementsToday - engagementsYesterday },
      cost: { direction: trendDir(costToday, costAvg7d), delta: Math.round(costToday - costAvg7d) },
    },
    opportunities: oppStats,
    credits: {
      xReads: { available: readLimiter.available, max: 100, window: '15m' },
      xTweets: { available: tweetLimiter.available, max: 50, window: '24h' },
      claudeSpendTodayCents: adminCosts?.todayCents ?? costToday,
      claudeSpendWeekCents: adminCosts?.weekCents ?? costWeek,
      claudeSpendMonthCents: adminCosts?.monthCents ?? null,
      claudeSource: adminCosts ? 'admin-api' : 'local',
    },
    counts: {
      cycles: cycleCount,
      opportunities: oppStats.total,
      feed: feedNew,
      posts: postsTotal,
      safety: safetyStats.total,
      generations: safeCount(db, 'generations'),
      trends: safeCount(db, 'trends'),
    },
  };
}

function getDailyStats(db: Database.Database, days: number) {
  const results: { date: string; posts: number; engagements: number; costCents: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const offset = `-${i} days`;

    const posts = (db.prepare(
      "SELECT COUNT(*) as c FROM posts WHERE status = 'posted' AND posted_at >= date('now', ?) AND posted_at < date('now', ?)"
    ).get(offset, i === 0 ? '+1 day' : `-${i - 1} days`) as { c: number }).c;

    const engagements = (db.prepare(
      "SELECT COUNT(*) as c FROM opportunities WHERE status = 'engaged' AND last_evaluated >= date('now', ?) AND last_evaluated < date('now', ?)"
    ).get(offset, i === 0 ? '+1 day' : `-${i - 1} days`) as { c: number }).c;

    const costCents = (db.prepare(
      "SELECT COALESCE(SUM(cost_cents), 0) as c FROM generations WHERE created_at >= date('now', ?) AND created_at < date('now', ?)"
    ).get(offset, i === 0 ? '+1 day' : `-${i - 1} days`) as { c: number }).c;

    const d = new Date();
    d.setDate(d.getDate() - i);
    results.push({
      date: d.toISOString().slice(0, 10),
      posts,
      engagements,
      costCents,
    });
  }

  return results;
}

function getAuthorStats(db: Database.Database, authorId: string, config?: Config) {
  const out: {
    authorId: string;
    byStatus: Record<string, number>;
    total: number;
    lastEngaged: string | null;
    engageCount: number;
    canEngage: boolean | null;
    cooldownHours: number | null;
  } = {
    authorId,
    byStatus: {},
    total: 0,
    lastEngaged: null,
    engageCount: 0,
    canEngage: null,
    cooldownHours: null,
  };

  if (tableExists(db, 'opportunities')) {
    const rows = db.prepare(
      'SELECT status, COUNT(*) as c FROM opportunities WHERE author_id = ? GROUP BY status'
    ).all(authorId) as Array<{ status: string; c: number }>;
    out.byStatus = Object.fromEntries(rows.map(r => [r.status, r.c]));
    out.total = rows.reduce((sum, r) => sum + r.c, 0);
  }

  if (tableExists(db, 'engagement_cooldowns')) {
    const row = db.prepare(
      'SELECT last_engaged, engage_count FROM engagement_cooldowns WHERE author_id = ?'
    ).get(authorId) as { last_engaged: string; engage_count: number } | undefined;
    if (row) {
      out.lastEngaged = row.last_engaged;
      out.engageCount = row.engage_count;
      const cooldownHours = config?.engageAuthorCooldownHours ?? null;
      out.cooldownHours = cooldownHours;
      if (cooldownHours != null) {
        const last = new Date(row.last_engaged + (row.last_engaged.includes('Z') || row.last_engaged.includes('+') ? '' : 'Z')).getTime();
        out.canEngage = (Date.now() - last) > cooldownHours * 60 * 60 * 1000;
      }
    }
  }

  return out;
}

function getCycles(db: Database.Database, limit: number) {
  if (!tableExists(db, 'daemon_cycles')) return [];
  return db.prepare(
    'SELECT * FROM daemon_cycles ORDER BY started_at DESC LIMIT ?'
  ).all(limit);
}

function getCycleDetail(db: Database.Database, cycleId: number) {
  if (!tableExists(db, 'daemon_cycles')) return { error: 'No cycles table' };

  const cycle = db.prepare('SELECT * FROM daemon_cycles WHERE id = ?').get(cycleId) as Record<string, unknown> | undefined;
  if (!cycle) return { error: 'Cycle not found' };

  const startedAt = cycle.started_at as string | null;
  const completedAt = cycle.completed_at as string | null;

  if (!startedAt) {
    return { cycle, posts: [], opportunities: [], generations: [], safetyChecks: [], costSummary: { totalCents: 0, calls: 0, byPurpose: {} } };
  }

  // Use completed_at as upper bound, or datetime('now') if still running
  const endClause = completedAt ? "datetime(?)" : "datetime('now')";
  const endParam = completedAt || undefined;

  const timeParams = endParam ? [startedAt, endParam] : [startedAt];

  const posts = tableExists(db, 'posts')
    ? db.prepare(
        `SELECT id, tweet_id, content, prompt_type, status, safety_score, safety_verdict, created_at, posted_at
         FROM posts WHERE created_at >= datetime(?) AND created_at <= ${endClause}
         ORDER BY created_at DESC`
      ).all(...timeParams)
    : [];

  const newOpportunities = tableExists(db, 'opportunities')
    ? db.prepare(
        `SELECT tweet_id, author_username, text, score, status, recommended_action, matched_bill_slug, first_seen, last_evaluated
         FROM opportunities WHERE first_seen >= datetime(?) AND first_seen <= ${endClause}
         ORDER BY score DESC`
      ).all(...timeParams)
    : [];

  const reevaluatedOpportunities = tableExists(db, 'opportunities')
    ? db.prepare(
        `SELECT tweet_id, author_username, text, score, status, recommended_action, matched_bill_slug, first_seen, last_evaluated
         FROM opportunities WHERE last_evaluated >= datetime(?) AND last_evaluated <= ${endClause}
           AND first_seen < datetime(?)
         ORDER BY score DESC`
      ).all(...(endParam ? [startedAt, endParam, startedAt] : [startedAt, startedAt]))
    : [];

  const generations = tableExists(db, 'generations')
    ? db.prepare(
        `SELECT id, purpose, model, input_tokens, output_tokens, cost_cents, created_at
         FROM generations WHERE created_at >= datetime(?) AND created_at <= ${endClause}
         ORDER BY created_at DESC`
      ).all(...timeParams) as Array<{ id: number; purpose: string; model: string; input_tokens: number; output_tokens: number; cost_cents: number; created_at: string }>
    : [];

  const safetyChecks = tableExists(db, 'safety_log')
    ? db.prepare(
        `SELECT id, score, verdict, created_at
         FROM safety_log WHERE created_at >= datetime(?) AND created_at <= ${endClause}
         ORDER BY created_at DESC`
      ).all(...timeParams)
    : [];

  // Aggregate costs
  let totalCents = 0;
  let calls = 0;
  const byPurpose: Record<string, { costCents: number; calls: number }> = {};
  for (const g of generations) {
    totalCents += g.cost_cents;
    calls++;
    if (!byPurpose[g.purpose]) byPurpose[g.purpose] = { costCents: 0, calls: 0 };
    byPurpose[g.purpose]!.costCents += g.cost_cents;
    byPurpose[g.purpose]!.calls++;
  }

  // Parse trace data if available
  let trace = null;
  try {
    if (cycle.trace_json) {
      trace = JSON.parse(cycle.trace_json as string);
    }
  } catch {
    // Invalid JSON — ignore
  }

  return {
    cycle,
    posts,
    newOpportunities,
    reevaluatedOpportunities,
    generations,
    safetyChecks,
    costSummary: { totalCents, calls, byPurpose },
    trace,
  };
}

function getPosts(db: Database.Database, limit: number) {
  return db.prepare(`
    SELECT p.*,
      sl.layers as safety_layers,
      a.likes as analytics_likes,
      a.retweets as analytics_retweets,
      a.replies as analytics_replies,
      a.quotes as analytics_quotes,
      a.impressions as analytics_impressions
    FROM posts p
    LEFT JOIN safety_log sl ON sl.content = p.content
    LEFT JOIN (
      SELECT post_id, likes, retweets, replies, quotes, impressions
      FROM analytics
      WHERE id IN (SELECT MAX(id) FROM analytics GROUP BY post_id)
    ) a ON a.post_id = p.id
    ORDER BY p.created_at DESC LIMIT ?
  `).all(limit);
}

function getOpportunities(db: Database.Database, limit: number, status: string) {
  if (status === 'all') {
    return db.prepare(
      'SELECT * FROM opportunities ORDER BY score DESC, first_seen DESC LIMIT ?'
    ).all(limit);
  }
  return db.prepare(
    'SELECT * FROM opportunities WHERE status = ? ORDER BY score DESC, first_seen DESC LIMIT ?'
  ).all(status, limit);
}

function getFeed(
  db: Database.Database,
  opts: { limit: number; kind: string; status: string; includeDiscarded: boolean },
) {
  if (!tableExists(db, 'x_inbox_items')) return [];
  const inbox = createXInboxModel(db);
  return inbox.list({
    limit: opts.limit,
    kind: opts.kind as any,
    status: opts.status as any,
    includeDiscarded: opts.includeDiscarded,
  });
}

function getHotUsers(db: Database.Database, limit: number) {
  if (!tableExists(db, 'opportunities')) return [];
  const rows = db.prepare(`
    SELECT
      author_id,
      COALESCE(author_username, author_id) as author_username,
      COUNT(*) as opportunities,
      COALESCE(SUM(likes), 0) as likes,
      COALESCE(SUM(retweets), 0) as retweets,
      COALESCE(SUM(replies), 0) as replies,
      COALESCE(SUM(quotes), 0) as quotes,
      COALESCE(MAX(score), 0) as max_score,
      MAX(first_seen) as last_seen
    FROM opportunities
    WHERE first_seen >= datetime('now', '-7 days')
    GROUP BY author_id
    ORDER BY (COALESCE(SUM(likes), 0) + COALESCE(SUM(retweets), 0) * 2 + COALESCE(SUM(replies), 0) * 3 + COALESCE(SUM(quotes), 0) * 2 + COALESCE(MAX(score), 0) * 4) DESC
    LIMIT ?
  `).all(limit * 3) as Array<any>;

  const scored = rows.map(r => {
    const heat =
      (r.replies || 0) * 3 +
      (r.retweets || 0) * 2 +
      (r.quotes || 0) * 2 +
      (r.likes || 0) +
      (r.max_score || 0) * 4;
    return { ...r, heat };
  }).sort((a, b) => b.heat - a.heat);

  return scored.slice(0, limit);
}

function getTrends(db: Database.Database, limit: number) {
  if (!tableExists(db, 'trends')) return [];
  return db.prepare(
    'SELECT * FROM trends ORDER BY relevance_score DESC, volume DESC, last_seen DESC LIMIT ?'
  ).all(limit);
}

function getSafety(db: Database.Database, limit: number) {
  return db.prepare(
    'SELECT * FROM safety_log ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

function getCosts(db: Database.Database, days: number) {
  const rows = db.prepare(
    "SELECT * FROM generations WHERE created_at >= datetime('now', '-' || ? || ' days') ORDER BY created_at DESC"
  ).all(days) as Array<{
    id: number; purpose: string; model: string;
    input_tokens: number; output_tokens: number; cost_cents: number;
    batch_id: string | null; created_at: string;
  }>;

  const byModel: Record<string, { costCents: number; calls: number }> = {};
  const byPurpose: Record<string, { costCents: number; calls: number }> = {};
  let totalCostCents = 0;

  for (const row of rows) {
    totalCostCents += row.cost_cents;
    if (!byModel[row.model]) byModel[row.model] = { costCents: 0, calls: 0 };
    byModel[row.model]!.costCents += row.cost_cents;
    byModel[row.model]!.calls++;
    if (!byPurpose[row.purpose]) byPurpose[row.purpose] = { costCents: 0, calls: 0 };
    byPurpose[row.purpose]!.costCents += row.cost_cents;
    byPurpose[row.purpose]!.calls++;
  }

  const batchRows = rows.filter(r => r.batch_id);
  const batchCostCents = batchRows.reduce((s, r) => s + r.cost_cents, 0);

  return {
    totalCostCents,
    totalCalls: rows.length,
    byModel,
    byPurpose,
    batch: {
      batchCostCents,
      batchCalls: batchRows.length,
    },
    recent: rows.slice(0, 20),
  };
}
