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
