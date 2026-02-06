import type Database from 'better-sqlite3';

export interface BatchRecord {
  id: string;
  request_count: number;
  status: string;
  requests_json: string;
  submitted_at: string;
  completed_at: string | null;
}

export function createBatchModel(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO batches (id, request_count, status, requests_json)
    VALUES (@id, @request_count, @status, @requests_json)
  `);

  return {
    create(id: string, requestCount: number, requestsJson: string): BatchRecord {
      insert.run({
        id,
        request_count: requestCount,
        status: 'submitted',
        requests_json: requestsJson,
      });
      return db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as BatchRecord;
    },

    getById(id: string): BatchRecord | undefined {
      return db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as BatchRecord | undefined;
    },

    markCompleted(id: string): void {
      db.prepare(
        "UPDATE batches SET status = 'completed', completed_at = datetime('now') WHERE id = ?"
      ).run(id);
    },

    markFailed(id: string): void {
      db.prepare("UPDATE batches SET status = 'failed' WHERE id = ?").run(id);
    },

    getRecent(limit = 10): BatchRecord[] {
      return db.prepare(
        'SELECT * FROM batches ORDER BY submitted_at DESC LIMIT ?'
      ).all(limit) as BatchRecord[];
    },
  };
}
