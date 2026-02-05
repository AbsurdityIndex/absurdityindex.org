import type Database from 'better-sqlite3';

export type OpportunityStatus = 'tracked' | 'engaged' | 'skipped' | 'expired';
export type RecommendedAction = 'reply' | 'quote' | 'track' | 'skip';

export interface Opportunity {
  id: number;
  tweet_id: string;
  author_id: string;
  author_username: string | null;
  text: string;
  conversation_id: string | null;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  score: number;
  viral_score: number;
  relevance_score: number;
  timing_score: number;
  engageability_score: number;
  recommended_action: RecommendedAction;
  matched_bill_slug: string | null;
  matched_keywords: string | null;
  status: OpportunityStatus;
  engaged_post_id: number | null;
  first_seen: string;
  last_evaluated: string;
  tweet_created_at: string | null;
}

export interface UpsertOpportunityInput {
  tweet_id: string;
  author_id: string;
  author_username?: string;
  text: string;
  conversation_id?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  impressions?: number;
  score?: number;
  viral_score?: number;
  relevance_score?: number;
  timing_score?: number;
  engageability_score?: number;
  recommended_action?: RecommendedAction;
  matched_bill_slug?: string;
  matched_keywords?: string;
  tweet_created_at?: string;
}

export function createOpportunityModel(db: Database.Database) {
  const upsertStmt = db.prepare(`
    INSERT INTO opportunities (
      tweet_id, author_id, author_username, text, conversation_id,
      likes, retweets, replies, impressions,
      score, viral_score, relevance_score, timing_score, engageability_score,
      recommended_action, matched_bill_slug, matched_keywords, tweet_created_at
    ) VALUES (
      @tweet_id, @author_id, @author_username, @text, @conversation_id,
      @likes, @retweets, @replies, @impressions,
      @score, @viral_score, @relevance_score, @timing_score, @engageability_score,
      @recommended_action, @matched_bill_slug, @matched_keywords, @tweet_created_at
    )
    ON CONFLICT(tweet_id) DO UPDATE SET
      likes = @likes,
      retweets = @retweets,
      replies = @replies,
      impressions = @impressions,
      score = @score,
      viral_score = @viral_score,
      relevance_score = @relevance_score,
      timing_score = @timing_score,
      engageability_score = @engageability_score,
      recommended_action = @recommended_action,
      matched_bill_slug = @matched_bill_slug,
      matched_keywords = @matched_keywords,
      last_evaluated = datetime('now')
  `);

  return {
    upsert(input: UpsertOpportunityInput): Opportunity {
      upsertStmt.run({
        tweet_id: input.tweet_id,
        author_id: input.author_id,
        author_username: input.author_username ?? null,
        text: input.text,
        conversation_id: input.conversation_id ?? null,
        likes: input.likes ?? 0,
        retweets: input.retweets ?? 0,
        replies: input.replies ?? 0,
        impressions: input.impressions ?? 0,
        score: input.score ?? 0,
        viral_score: input.viral_score ?? 0,
        relevance_score: input.relevance_score ?? 0,
        timing_score: input.timing_score ?? 0,
        engageability_score: input.engageability_score ?? 0,
        recommended_action: input.recommended_action ?? 'skip',
        matched_bill_slug: input.matched_bill_slug ?? null,
        matched_keywords: input.matched_keywords ?? null,
        tweet_created_at: input.tweet_created_at ?? null,
      });
      return db.prepare('SELECT * FROM opportunities WHERE tweet_id = ?').get(input.tweet_id) as Opportunity;
    },

    getByTweetId(tweetId: string): Opportunity | undefined {
      return db.prepare('SELECT * FROM opportunities WHERE tweet_id = ?').get(tweetId) as Opportunity | undefined;
    },

    getTracked(limit = 50): Opportunity[] {
      return db.prepare(
        "SELECT * FROM opportunities WHERE status = 'tracked' ORDER BY score DESC LIMIT ?"
      ).all(limit) as Opportunity[];
    },

    getByStatus(status: OpportunityStatus, limit = 50): Opportunity[] {
      return db.prepare(
        'SELECT * FROM opportunities WHERE status = ? ORDER BY score DESC LIMIT ?'
      ).all(status, limit) as Opportunity[];
    },

    markEngaged(tweetId: string, postId: number): void {
      db.prepare(
        "UPDATE opportunities SET status = 'engaged', engaged_post_id = ? WHERE tweet_id = ?"
      ).run(postId, tweetId);
    },

    markSkipped(tweetId: string): void {
      db.prepare("UPDATE opportunities SET status = 'skipped' WHERE tweet_id = ?").run(tweetId);
    },

    updateMetrics(tweetId: string, metrics: { likes: number; retweets: number; replies: number; impressions: number }): void {
      db.prepare(`
        UPDATE opportunities SET
          likes = ?, retweets = ?, replies = ?, impressions = ?,
          last_evaluated = datetime('now')
        WHERE tweet_id = ?
      `).run(metrics.likes, metrics.retweets, metrics.replies, metrics.impressions, tweetId);
    },

    updateScore(tweetId: string, scores: {
      score: number;
      viral_score: number;
      relevance_score: number;
      timing_score: number;
      engageability_score: number;
      recommended_action: RecommendedAction;
    }): void {
      db.prepare(`
        UPDATE opportunities SET
          score = ?, viral_score = ?, relevance_score = ?,
          timing_score = ?, engageability_score = ?,
          recommended_action = ?, last_evaluated = datetime('now')
        WHERE tweet_id = ?
      `).run(
        scores.score, scores.viral_score, scores.relevance_score,
        scores.timing_score, scores.engageability_score,
        scores.recommended_action, tweetId
      );
    },

    expireOld(maxAgeHours = 24): number {
      const info = db.prepare(
        "UPDATE opportunities SET status = 'expired' WHERE status = 'tracked' AND first_seen < datetime('now', ?)"
      ).run(`-${maxAgeHours} hours`);
      return info.changes;
    },

    countEngagedToday(): number {
      const row = db.prepare(
        "SELECT COUNT(*) as count FROM opportunities WHERE status = 'engaged' AND last_evaluated >= date('now')"
      ).get() as { count: number };
      return row.count;
    },

    getRecentEngaged(limit = 10): Opportunity[] {
      return db.prepare(
        "SELECT * FROM opportunities WHERE status = 'engaged' ORDER BY last_evaluated DESC LIMIT ?"
      ).all(limit) as Opportunity[];
    },

    getStats(): { tracked: number; engaged_today: number; expired: number; skipped: number } {
      const tracked = (db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status = 'tracked'").get() as { c: number }).c;
      const engaged_today = (db.prepare(
        "SELECT COUNT(*) as c FROM opportunities WHERE status = 'engaged' AND last_evaluated >= date('now')"
      ).get() as { c: number }).c;
      const expired = (db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status = 'expired'").get() as { c: number }).c;
      const skipped = (db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status = 'skipped'").get() as { c: number }).c;
      return { tracked, engaged_today, expired, skipped };
    },
  };
}
