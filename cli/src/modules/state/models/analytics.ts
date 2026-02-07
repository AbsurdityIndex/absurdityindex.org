import type Database from 'better-sqlite3';

export interface AnalyticsSnapshot {
  id: number;
  post_id: number;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  impressions: number;
  checked_at: string;
}

export interface PostWithAnalytics {
  id: number;
  content: string;
  prompt_type: string;
  tweet_id: string;
  posted_at: string;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  impressions: number;
}

export function createAnalyticsModel(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO analytics (post_id, likes, retweets, replies, quotes, impressions)
    VALUES (@post_id, @likes, @retweets, @replies, @quotes, @impressions)
  `);

  return {
    record(postId: number, stats: { likes: number; retweets: number; replies: number; quotes: number; impressions?: number }): void {
      insert.run({
        post_id: postId,
        likes: stats.likes,
        retweets: stats.retweets,
        replies: stats.replies,
        quotes: stats.quotes,
        impressions: stats.impressions ?? 0,
      });
    },

    getLatestForPost(postId: number): AnalyticsSnapshot | undefined {
      return db.prepare(
        'SELECT * FROM analytics WHERE post_id = ? ORDER BY checked_at DESC LIMIT 1'
      ).get(postId) as AnalyticsSnapshot | undefined;
    },

    getTopPosts(limit = 10): PostWithAnalytics[] {
      return db.prepare(`
        SELECT p.id, p.content, p.prompt_type, p.tweet_id, p.posted_at,
               a.likes, a.retweets, a.replies, a.quotes, a.impressions
        FROM posts p
        JOIN analytics a ON a.post_id = p.id
        WHERE p.status = 'posted'
        GROUP BY p.id
        HAVING a.checked_at = MAX(a.checked_at)
        ORDER BY (a.likes + a.retweets * 2 + a.replies * 3 + a.quotes * 2) DESC
        LIMIT ?
      `).all(limit) as PostWithAnalytics[];
    },

    getSummary(): { totalPosts: number; totalLikes: number; totalRetweets: number; totalReplies: number; totalQuotes: number; totalImpressions: number; avgEngagement: number } {
      const row = db.prepare(`
        SELECT
          COUNT(DISTINCT p.id) as totalPosts,
          COALESCE(SUM(a.likes), 0) as totalLikes,
          COALESCE(SUM(a.retweets), 0) as totalRetweets,
          COALESCE(SUM(a.replies), 0) as totalReplies,
          COALESCE(SUM(a.quotes), 0) as totalQuotes,
          COALESCE(SUM(a.impressions), 0) as totalImpressions,
          COALESCE(AVG(a.likes + a.retweets * 2 + a.replies * 3 + a.quotes * 2), 0) as avgEngagement
        FROM posts p
        LEFT JOIN (
          SELECT post_id, likes, retweets, replies, quotes, impressions,
                 ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY checked_at DESC) as rn
          FROM analytics
        ) a ON a.post_id = p.id AND a.rn = 1
        WHERE p.status = 'posted'
      `).get() as any;
      return row;
    },
  };
}
