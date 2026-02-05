import type Database from 'better-sqlite3';

export function createEngagementCooldownModel(db: Database.Database) {
  return {
    canEngage(authorId: string, cooldownHours = 12): boolean {
      const row = db.prepare(
        "SELECT 1 FROM engagement_cooldowns WHERE author_id = ? AND last_engaged > datetime('now', ?)"
      ).get(authorId, `-${cooldownHours} hours`) as { 1: number } | undefined;
      return !row;
    },

    record(authorId: string): void {
      db.prepare(`
        INSERT INTO engagement_cooldowns (author_id, last_engaged, engage_count)
        VALUES (?, datetime('now'), 1)
        ON CONFLICT(author_id) DO UPDATE SET
          last_engaged = datetime('now'),
          engage_count = engage_count + 1
      `).run(authorId);
    },

    getEngageCount(authorId: string): number {
      const row = db.prepare(
        'SELECT engage_count FROM engagement_cooldowns WHERE author_id = ?'
      ).get(authorId) as { engage_count: number } | undefined;
      return row?.engage_count ?? 0;
    },

    clearExpired(cooldownHours = 48): number {
      const info = db.prepare(
        "DELETE FROM engagement_cooldowns WHERE last_engaged < datetime('now', ?)"
      ).run(`-${cooldownHours} hours`);
      return info.changes;
    },
  };
}
