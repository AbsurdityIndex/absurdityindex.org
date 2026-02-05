import { getLogger } from '../../utils/logger.js';
import type Database from 'better-sqlite3';
import type { Post } from '../state/models/posts.js';

const log = getLogger();

export interface QueuedPost {
  post: Post;
  priority: number;
  scheduledFor?: Date;
}

/**
 * Priority post queue backed by the posts table.
 * Posts with status 'queued' are in the queue.
 */
export function createQueue(db: Database.Database) {
  return {
    enqueue(postId: number, priority = 50): void {
      db.prepare("UPDATE posts SET status = 'queued' WHERE id = ?").run(postId);
      log.info({ postId, priority }, 'Post enqueued');
    },

    dequeue(): Post | null {
      // Get highest-priority queued post (oldest first for same priority)
      const post = db.prepare(
        "SELECT * FROM posts WHERE status = 'queued' ORDER BY engagement_score DESC, created_at ASC LIMIT 1"
      ).get() as Post | undefined;

      if (post) {
        log.debug({ postId: post.id }, 'Dequeued post');
      }

      return post ?? null;
    },

    peek(limit = 5): Post[] {
      return db.prepare(
        "SELECT * FROM posts WHERE status = 'queued' ORDER BY engagement_score DESC, created_at ASC LIMIT ?"
      ).all(limit) as Post[];
    },

    size(): number {
      const row = db.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'queued'").get() as { count: number };
      return row.count;
    },

    clear(): number {
      const info = db.prepare("UPDATE posts SET status = 'draft' WHERE status = 'queued'").run();
      return info.changes;
    },
  };
}
