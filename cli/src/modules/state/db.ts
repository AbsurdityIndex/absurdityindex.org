import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../../utils/logger.js';

let db: Database.Database;

const MIGRATIONS = [
  // Migration 001: Core tables
  `
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT UNIQUE,
    content TEXT NOT NULL,
    prompt_type TEXT NOT NULL,
    bill_slug TEXT,
    trend_topic TEXT,
    safety_score INTEGER NOT NULL DEFAULT 0,
    safety_verdict TEXT NOT NULL DEFAULT 'SAFE',
    engagement_score REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    parent_tweet_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    posted_at TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS trends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    source TEXT NOT NULL,
    volume INTEGER DEFAULT 0,
    relevance_score REAL DEFAULT 0,
    used INTEGER DEFAULT 0,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(topic, source)
  );

  CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    likes INTEGER DEFAULT 0,
    retweets INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cooldowns (
    topic TEXT PRIMARY KEY,
    last_used TEXT NOT NULL DEFAULT (datetime('now')),
    use_count INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS safety_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    score INTEGER NOT NULL,
    verdict TEXT NOT NULL,
    layers TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
  CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at);
  CREATE INDEX IF NOT EXISTS idx_trends_topic ON trends(topic);
  CREATE INDEX IF NOT EXISTS idx_cooldowns_last_used ON cooldowns(last_used);
  `,
  // Migration 002: Engagement scanner tables
  `
  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT UNIQUE NOT NULL,
    author_id TEXT NOT NULL,
    author_username TEXT,
    text TEXT NOT NULL,
    conversation_id TEXT,
    likes INTEGER DEFAULT 0,
    retweets INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    viral_score INTEGER DEFAULT 0,
    relevance_score INTEGER DEFAULT 0,
    timing_score INTEGER DEFAULT 0,
    engageability_score INTEGER DEFAULT 0,
    recommended_action TEXT DEFAULT 'skip',
    matched_bill_slug TEXT,
    matched_keywords TEXT,
    status TEXT NOT NULL DEFAULT 'tracked',
    engaged_post_id INTEGER REFERENCES posts(id),
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_evaluated TEXT NOT NULL DEFAULT (datetime('now')),
    tweet_created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS engagement_cooldowns (
    author_id TEXT PRIMARY KEY,
    last_engaged TEXT NOT NULL DEFAULT (datetime('now')),
    engage_count INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
  CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(score DESC);
  CREATE INDEX IF NOT EXISTS idx_opportunities_tweet_id ON opportunities(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_engagement_cooldowns_last ON engagement_cooldowns(last_engaged);
  `,
  // Migration 003: Cost tracking, overlap cache, batch API
  `
  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER REFERENCES posts(id),
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_cents REAL NOT NULL DEFAULT 0,
    batch_id TEXT,
    bill_slug TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gen_post ON generations(post_id);
  CREATE INDEX IF NOT EXISTS idx_gen_date ON generations(created_at);

  CREATE TABLE IF NOT EXISTS overlap_cache (
    target_slug TEXT NOT NULL,
    candidate_slug TEXT NOT NULL,
    similarity_pct INTEGER NOT NULL,
    relationship TEXT NOT NULL,
    shared_provisions TEXT,
    analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (target_slug, candidate_slug)
  );

  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    request_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    requests_json TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );
  `,
  // Migration 004: Discovery pipeline
  `
  CREATE TABLE IF NOT EXISTS discovered_bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    congress INTEGER NOT NULL,
    bill_type TEXT NOT NULL,
    bill_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    sponsor TEXT,
    sponsor_party TEXT,
    sponsor_state TEXT,
    policy_area TEXT,
    subjects_json TEXT,
    latest_action_text TEXT,
    latest_action_date TEXT,
    cosponsor_count INTEGER DEFAULT 0,
    summary_text TEXT,

    prefilter_score INTEGER NOT NULL DEFAULT 0,
    prefilter_signals TEXT,
    prefilter_passed INTEGER NOT NULL DEFAULT 0,

    ai_score INTEGER,
    ai_explanation TEXT,
    ai_category TEXT,
    ai_angle TEXT,
    ai_scored_at TEXT,

    status TEXT NOT NULL DEFAULT 'discovered',
    ingested_slug TEXT,
    congress_gov_url TEXT,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(congress, bill_type, bill_number)
  );
  CREATE INDEX IF NOT EXISTS idx_disc_status ON discovered_bills(status);
  CREATE INDEX IF NOT EXISTS idx_disc_score ON discovered_bills(ai_score DESC);
  `,
  // Migration 005: Archetype column for bill classification
  `
  ALTER TABLE discovered_bills ADD COLUMN archetype TEXT;
  `,
  // Migration 006: Meme metadata on posts
  `
  ALTER TABLE posts ADD COLUMN media_url TEXT;
  ALTER TABLE posts ADD COLUMN media_type TEXT;
  ALTER TABLE posts ADD COLUMN meme_strategy TEXT;
  ALTER TABLE posts ADD COLUMN meme_template TEXT;
  `,
  // Migration 007: Daemon cycle tracking for dashboard
  `
  CREATE TABLE IF NOT EXISTS daemon_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_index INTEGER NOT NULL,
    cycle_type TEXT NOT NULL,
    scanned INTEGER DEFAULT 0,
    engaged INTEGER DEFAULT 0,
    tracked INTEGER DEFAULT 0,
    expired INTEGER DEFAULT 0,
    posted INTEGER DEFAULT 0,
    topic TEXT,
    error TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    duration_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_cycles_started ON daemon_cycles(started_at);
  `,
  // Migration 008: Reply tweet tracking for post-with-reply flow
  `
  ALTER TABLE posts ADD COLUMN reply_tweet_id TEXT;
  `,
  // Migration 009: Starred opportunities (inbox triage)
  `
  ALTER TABLE opportunities ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
  `,
  // Migration 010: Quote counts for post analytics snapshots
  `
  ALTER TABLE analytics ADD COLUMN quotes INTEGER DEFAULT 0;
  `,
  // Migration 011: Quote counts for opportunity metrics
  `
  ALTER TABLE opportunities ADD COLUMN quotes INTEGER DEFAULT 0;
  `,
  // Migration 012: Explicit post type for feed management (tweet/reply/quote)
  `
  ALTER TABLE posts ADD COLUMN x_post_type TEXT;
  UPDATE posts
  SET x_post_type = CASE
    WHEN prompt_type LIKE '%quote%' THEN 'quote'
    WHEN prompt_type LIKE '%reply%' THEN 'reply'
    WHEN parent_tweet_id IS NOT NULL THEN 'reply'
    ELSE 'tweet'
  END
  WHERE x_post_type IS NULL;
  `,
  // Migration 013: X inbox items (mentions/replies/quotes to manage feed without X.com)
  `
  CREATE TABLE IF NOT EXISTS x_inbox_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    tweet_id TEXT UNIQUE NOT NULL,
    author_id TEXT NOT NULL,
    author_username TEXT,
    text TEXT NOT NULL,
    conversation_id TEXT,
    created_at TEXT,
    in_reply_to_tweet_id TEXT,
    quoted_tweet_id TEXT,
    likes INTEGER DEFAULT 0,
    retweets INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    quotes INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    starred INTEGER NOT NULL DEFAULT 0,
    discarded INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_x_inbox_kind ON x_inbox_items(kind);
  CREATE INDEX IF NOT EXISTS idx_x_inbox_status ON x_inbox_items(status);
  CREATE INDEX IF NOT EXISTS idx_x_inbox_starred ON x_inbox_items(starred);
  CREATE INDEX IF NOT EXISTS idx_x_inbox_last_seen ON x_inbox_items(last_seen);
  `,
  // Migration 014: Track daemon cycle phase for explainable "what is it doing" UI
  `
  ALTER TABLE daemon_cycles ADD COLUMN phase TEXT;
  `,
];

export function getDb(dbPath: string): Database.Database {
  if (db) return db;

  const log = getLogger();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM _migrations').all().map((r: any) => r.id as number)
  );

  for (let i = 0; i < MIGRATIONS.length; i++) {
    if (!applied.has(i)) {
      log.info(`Running migration ${i}`);
      db.exec(MIGRATIONS[i]!);
      db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(i);
    }
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
