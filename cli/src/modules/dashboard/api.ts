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
import type { PromptType, PromptContext } from '../claude/prompts/index.js';

export interface ApiDeps {
  db: Database.Database;
  config?: Config;
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
}

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
      case '/api/safety':
        json(res, getSafety(db, intParam(url, 'limit', 50)));
        break;
      case '/api/costs':
        json(res, getCosts(db, intParam(url, 'days', 7)));
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

  // Initialize counts
  try {
    lastPostCount = safeCount(deps.db, 'posts');
    lastOppCount = safeCount(deps.db, 'opportunities');
    lastCycleCount = safeCount(deps.db, 'daemon_cycles');
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

      const cycleCount = safeCount(deps.db, 'daemon_cycles');
      if (cycleCount > lastCycleCount) {
        send('new-cycle', { count: cycleCount - lastCycleCount });
        lastCycleCount = cycleCount;
      }
    } catch {
      // DB might be temporarily locked
    }
  }, 5000);

  // Heartbeat every 15s
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  res.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
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
      case '/api/opportunity-refresh-metrics':
        await handleOpportunityRefreshMetrics(deps, req, res);
        break;
      case '/api/post-engagement':
        await handlePostEngagement(deps, req, res);
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

  return {
    postsToday,
    postsTotal,
    engagementsToday,
    safetyRejectRate: safetyStats.total > 0 ? safetyStats.rejected / safetyStats.total : 0,
    safetyTotal: safetyStats.total,
    safetyRejected: safetyStats.rejected,
    safetyReview: safetyStats.review,
    costTodayCents: costToday,
    costWeekCents: costWeek,
    opportunities: oppStats,
    counts: {
      cycles: cycleCount,
      opportunities: oppStats.total,
      posts: postsTotal,
      safety: safetyStats.total,
      generations: safeCount(db, 'generations'),
    },
  };
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

function getPosts(db: Database.Database, limit: number) {
  return db.prepare(`
    SELECT p.*,
      sl.layers as safety_layers,
      a.likes as analytics_likes,
      a.retweets as analytics_retweets,
      a.replies as analytics_replies,
      a.impressions as analytics_impressions
    FROM posts p
    LEFT JOIN safety_log sl ON sl.content = p.content
    LEFT JOIN (
      SELECT post_id, likes, retweets, replies, impressions
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
    batchSavings: {
      batchCostCents,
      standardCostCents: batchCostCents * 2,
      savedCents: batchCostCents,
      batchCalls: batchRows.length,
    },
    recent: rows.slice(0, 20),
  };
}
