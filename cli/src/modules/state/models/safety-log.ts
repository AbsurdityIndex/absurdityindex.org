import type Database from 'better-sqlite3';
import type { SafetyVerdict } from './posts.js';

export interface SafetyLogEntry {
  id: number;
  content: string;
  score: number;
  verdict: SafetyVerdict;
  layers: string; // JSON string of layer scores
  created_at: string;
}

export function createSafetyLogModel(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO safety_log (content, score, verdict, layers)
    VALUES (@content, @score, @verdict, @layers)
  `);

  return {
    log(content: string, score: number, verdict: SafetyVerdict, layers: Record<string, number>): void {
      insert.run({
        content,
        score,
        verdict,
        layers: JSON.stringify(layers),
      });
    },

    getRecent(limit = 20): SafetyLogEntry[] {
      return db.prepare(
        'SELECT * FROM safety_log ORDER BY created_at DESC LIMIT ?'
      ).all(limit) as SafetyLogEntry[];
    },

    getRejectRate(days = 7): { total: number; rejected: number; rate: number } {
      const row = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN verdict = 'REJECT' THEN 1 ELSE 0 END) as rejected
        FROM safety_log
        WHERE created_at > datetime('now', ?)
      `).get(`-${days} days`) as { total: number; rejected: number };
      return {
        total: row.total,
        rejected: row.rejected,
        rate: row.total > 0 ? row.rejected / row.total : 0,
      };
    },
  };
}
