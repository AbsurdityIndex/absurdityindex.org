import type Database from 'better-sqlite3';

export function createCooldownModel(db: Database.Database) {
  return {
    record(topic: string): void {
      db.prepare(`
        INSERT INTO cooldowns (topic, last_used, use_count)
        VALUES (?, datetime('now'), 1)
        ON CONFLICT(topic) DO UPDATE SET
          last_used = datetime('now'),
          use_count = use_count + 1
      `).run(topic);
    },

    isOnCooldown(topic: string, cooldownHours = 24): boolean {
      const row = db.prepare(
        "SELECT 1 FROM cooldowns WHERE topic = ? AND last_used > datetime('now', ?)"
      ).get(topic, `-${cooldownHours} hours`) as { 1: number } | undefined;
      return !!row;
    },

    getUseCount(topic: string): number {
      const row = db.prepare(
        'SELECT use_count FROM cooldowns WHERE topic = ?'
      ).get(topic) as { use_count: number } | undefined;
      return row?.use_count ?? 0;
    },

    clearExpired(cooldownHours = 48): number {
      const info = db.prepare(
        "DELETE FROM cooldowns WHERE last_used < datetime('now', ?)"
      ).run(`-${cooldownHours} hours`);
      return info.changes;
    },
  };
}
