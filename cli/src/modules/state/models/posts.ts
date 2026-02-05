import type Database from 'better-sqlite3';

export type PostStatus = 'draft' | 'queued' | 'review' | 'posted' | 'rejected' | 'failed';
export type SafetyVerdict = 'SAFE' | 'REVIEW' | 'REJECT';
export type PromptType = 'bill-roast' | 'trend-jack' | 'quote-dunk' | 'cspan-after-dark' | 'pork-barrel-report' | 'floor-speech' | 'reply-dunk' | 'engagement-evaluate';

export interface Post {
  id: number;
  tweet_id: string | null;
  content: string;
  prompt_type: PromptType;
  bill_slug: string | null;
  trend_topic: string | null;
  safety_score: number;
  safety_verdict: SafetyVerdict;
  engagement_score: number;
  status: PostStatus;
  parent_tweet_id: string | null;
  created_at: string;
  posted_at: string | null;
  error: string | null;
}

export interface CreatePostInput {
  content: string;
  prompt_type: PromptType;
  bill_slug?: string;
  trend_topic?: string;
  safety_score: number;
  safety_verdict: SafetyVerdict;
  engagement_score?: number;
  status?: PostStatus;
  parent_tweet_id?: string;
}

export function createPostModel(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO posts (content, prompt_type, bill_slug, trend_topic, safety_score, safety_verdict, engagement_score, status, parent_tweet_id)
    VALUES (@content, @prompt_type, @bill_slug, @trend_topic, @safety_score, @safety_verdict, @engagement_score, @status, @parent_tweet_id)
  `);

  const updateStatus = db.prepare('UPDATE posts SET status = ?, error = ? WHERE id = ?');
  const updateTweetId = db.prepare('UPDATE posts SET tweet_id = ?, posted_at = datetime(\'now\'), status = \'posted\' WHERE id = ?');

  return {
    create(input: CreatePostInput): Post {
      const info = insert.run({
        content: input.content,
        prompt_type: input.prompt_type,
        bill_slug: input.bill_slug ?? null,
        trend_topic: input.trend_topic ?? null,
        safety_score: input.safety_score,
        safety_verdict: input.safety_verdict,
        engagement_score: input.engagement_score ?? 0,
        status: input.status ?? 'draft',
        parent_tweet_id: input.parent_tweet_id ?? null,
      });
      return db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid) as Post;
    },

    getById(id: number): Post | undefined {
      return db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;
    },

    getByStatus(status: PostStatus, limit = 50): Post[] {
      return db.prepare('SELECT * FROM posts WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit) as Post[];
    },

    markPosted(id: number, tweetId: string): void {
      updateTweetId.run(tweetId, id);
    },

    markFailed(id: number, error: string): void {
      updateStatus.run('failed', error, id);
    },

    updateStatus(id: number, status: PostStatus): void {
      updateStatus.run(status, null, id);
    },

    countToday(): number {
      const row = db.prepare(
        "SELECT COUNT(*) as count FROM posts WHERE status = 'posted' AND posted_at >= date('now')"
      ).get() as { count: number };
      return row.count;
    },

    getRecent(limit = 20): Post[] {
      return db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT ?').all(limit) as Post[];
    },
  };
}
