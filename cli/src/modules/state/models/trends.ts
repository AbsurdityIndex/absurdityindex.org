import type Database from 'better-sqlite3';

export interface Trend {
  id: number;
  topic: string;
  source: string;
  volume: number;
  relevance_score: number;
  used: number;
  first_seen: string;
  last_seen: string;
}

export function createTrendModel(db: Database.Database) {
  const upsert = db.prepare(`
    INSERT INTO trends (topic, source, volume, relevance_score)
    VALUES (@topic, @source, @volume, @relevance_score)
    ON CONFLICT(topic, source) DO UPDATE SET
      volume = @volume,
      relevance_score = @relevance_score,
      last_seen = datetime('now')
  `);

  return {
    upsert(topic: string, source: string, volume = 0, relevanceScore = 0): void {
      upsert.run({ topic, source, volume, relevance_score: relevanceScore });
    },

    markUsed(topic: string): void {
      db.prepare("UPDATE trends SET used = 1 WHERE topic = ?").run(topic);
    },

    getUnused(limit = 20): Trend[] {
      return db.prepare(
        'SELECT * FROM trends WHERE used = 0 ORDER BY relevance_score DESC, volume DESC LIMIT ?'
      ).all(limit) as Trend[];
    },

    getRecent(limit = 50): Trend[] {
      return db.prepare('SELECT * FROM trends ORDER BY last_seen DESC LIMIT ?').all(limit) as Trend[];
    },

    search(query: string): Trend[] {
      return db.prepare(
        "SELECT * FROM trends WHERE topic LIKE ? ORDER BY relevance_score DESC LIMIT 20"
      ).all(`%${query}%`) as Trend[];
    },
  };
}
