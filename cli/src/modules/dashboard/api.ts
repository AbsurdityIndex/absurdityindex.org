import type Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ApiDeps {
  db: Database.Database;
}

export function handleApi(deps: ApiDeps, pathname: string, url: URL, _req: IncomingMessage, res: ServerResponse): void {
  const { db } = deps;

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
    lastPostCount = countRows(deps.db, 'posts');
    lastOppCount = countRows(deps.db, 'opportunities');
    lastCycleCount = countRows(deps.db, 'daemon_cycles');
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

      const postCount = countRows(deps.db, 'posts');
      if (postCount > lastPostCount) {
        const newPosts = deps.db.prepare(
          'SELECT * FROM posts ORDER BY created_at DESC LIMIT ?'
        ).all(postCount - lastPostCount);
        send('new-post', newPosts);
        lastPostCount = postCount;
      }

      const oppCount = countRows(deps.db, 'opportunities');
      if (oppCount > lastOppCount) {
        send('new-opportunity', { count: oppCount - lastOppCount });
        lastOppCount = oppCount;
      }

      const cycleCount = countRows(deps.db, 'daemon_cycles');
      if (cycleCount > lastCycleCount) {
        const newCycles = deps.db.prepare(
          'SELECT * FROM daemon_cycles ORDER BY started_at DESC LIMIT ?'
        ).all(cycleCount - lastCycleCount);
        send('new-cycle', newCycles);
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

// ── Helpers ──────────────────────────────────────────

function json(res: ServerResponse, data: unknown): void {
  res.writeHead(200, {
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

function countRows(db: Database.Database, table: string): number {
  // Only allow known table names to prevent injection
  const allowed = ['posts', 'opportunities', 'daemon_cycles', 'safety_log', 'generations'];
  if (!allowed.includes(table)) return 0;
  const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
  return row.c;
}

// ── Data fetchers ────────────────────────────────────

function getOverview(db: Database.Database) {
  const postsToday = (db.prepare(
    "SELECT COUNT(*) as c FROM posts WHERE status = 'posted' AND posted_at >= date('now')"
  ).get() as { c: number }).c;

  const engagementsToday = (db.prepare(
    "SELECT COUNT(*) as c FROM opportunities WHERE status = 'engaged' AND last_evaluated >= date('now')"
  ).get() as { c: number }).c;

  const safetyStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN verdict = 'REJECT' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN verdict = 'REVIEW' THEN 1 ELSE 0 END) as review
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
      SUM(CASE WHEN status = 'tracked' THEN 1 ELSE 0 END) as tracked,
      SUM(CASE WHEN status = 'engaged' THEN 1 ELSE 0 END) as engaged,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
    FROM opportunities
  `).get() as { tracked: number; engaged: number; expired: number; skipped: number };

  return {
    postsToday,
    engagementsToday,
    safetyRejectRate: safetyStats.total > 0 ? safetyStats.rejected / safetyStats.total : 0,
    safetyTotal: safetyStats.total,
    safetyRejected: safetyStats.rejected,
    safetyReview: safetyStats.review ?? 0,
    costTodayCents: costToday,
    costWeekCents: costWeek,
    opportunities: oppStats,
  };
}

function getCycles(db: Database.Database, limit: number) {
  return db.prepare(
    'SELECT * FROM daemon_cycles ORDER BY started_at DESC LIMIT ?'
  ).all(limit);
}

function getPosts(db: Database.Database, limit: number) {
  // Join with safety_log for layer details where available
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
