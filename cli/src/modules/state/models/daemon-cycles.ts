import type Database from 'better-sqlite3';

export interface DaemonCycle {
  id: number;
  cycle_index: number;
  cycle_type: string;
  phase: string | null;
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
    INSERT INTO daemon_cycles (cycle_index, cycle_type, phase)
    VALUES (@cycle_index, @cycle_type, @phase)
  `);

  const updateStmt = db.prepare(`
    UPDATE daemon_cycles SET
      phase = COALESCE(@phase, phase),
      scanned = COALESCE(@scanned, scanned),
      engaged = COALESCE(@engaged, engaged),
      tracked = COALESCE(@tracked, tracked),
      expired = COALESCE(@expired, expired),
      posted = COALESCE(@posted, posted),
      topic = COALESCE(@topic, topic),
      error = COALESCE(@error, error)
    WHERE id = @id
  `);

  const completeStmt = db.prepare(`
    UPDATE daemon_cycles SET
      scanned = @scanned, engaged = @engaged, tracked = @tracked,
      expired = @expired, posted = @posted, topic = @topic,
      error = @error, phase = @phase, completed_at = datetime('now'), duration_ms = @duration_ms
    WHERE id = @id
  `);

  return {
    start(cycleIndex: number, cycleType: string, phase: string = 'starting'): DaemonCycle {
      const info = insertStmt.run({ cycle_index: cycleIndex, cycle_type: cycleType, phase });
      return db.prepare('SELECT * FROM daemon_cycles WHERE id = ?').get(info.lastInsertRowid) as DaemonCycle;
    },

    update(
      id: number,
      patch: {
        phase?: string;
        scanned?: number;
        engaged?: number;
        tracked?: number;
        expired?: number;
        posted?: number;
        topic?: string;
        error?: string;
      },
    ): void {
      updateStmt.run({
        id,
        phase: patch.phase ?? null,
        scanned: patch.scanned ?? null,
        engaged: patch.engaged ?? null,
        tracked: patch.tracked ?? null,
        expired: patch.expired ?? null,
        posted: patch.posted ?? null,
        topic: patch.topic ?? null,
        error: patch.error ?? null,
      });
    },

    complete(
      id: number,
      stats: { scanned?: number; engaged?: number; tracked?: number; expired?: number; posted?: number; topic?: string; error?: string; phase?: string },
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
        phase: stats.phase ?? (stats.error ? 'error' : 'complete'),
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
