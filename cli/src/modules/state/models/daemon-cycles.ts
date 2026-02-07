import type Database from 'better-sqlite3';

export interface DaemonCycle {
  id: number;
  cycle_index: number;
  cycle_type: string;
  scanned: number;
  engaged: number;
  tracked: number;
  expired: number;
  posted: number;
  topic: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export function createDaemonCycleModel(db: Database.Database) {
  const insertStmt = db.prepare(`
    INSERT INTO daemon_cycles (cycle_index, cycle_type)
    VALUES (@cycle_index, @cycle_type)
  `);

  const completeStmt = db.prepare(`
    UPDATE daemon_cycles SET
      scanned = @scanned, engaged = @engaged, tracked = @tracked,
      expired = @expired, posted = @posted, topic = @topic,
      error = @error, completed_at = datetime('now'), duration_ms = @duration_ms
    WHERE id = @id
  `);

  return {
    start(cycleIndex: number, cycleType: string): DaemonCycle {
      const info = insertStmt.run({ cycle_index: cycleIndex, cycle_type: cycleType });
      return db.prepare('SELECT * FROM daemon_cycles WHERE id = ?').get(info.lastInsertRowid) as DaemonCycle;
    },

    complete(
      id: number,
      stats: { scanned?: number; engaged?: number; tracked?: number; expired?: number; posted?: number; topic?: string; error?: string },
      durationMs: number,
    ): void {
      completeStmt.run({
        id,
        scanned: stats.scanned ?? 0,
        engaged: stats.engaged ?? 0,
        tracked: stats.tracked ?? 0,
        expired: stats.expired ?? 0,
        posted: stats.posted ?? 0,
        topic: stats.topic ?? null,
        error: stats.error ?? null,
        duration_ms: durationMs,
      });
    },

    getRecent(limit = 50): DaemonCycle[] {
      return db.prepare(
        'SELECT * FROM daemon_cycles ORDER BY started_at DESC LIMIT ?'
      ).all(limit) as DaemonCycle[];
    },
  };
}
