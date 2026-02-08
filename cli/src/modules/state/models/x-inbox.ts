import type Database from 'better-sqlite3';

export type XInboxKind = 'mention' | 'reply' | 'quote';
export type XInboxStatus = 'new' | 'archived' | 'replied' | 'discarded';

export interface XInboxItem {
  id: number;
  kind: XInboxKind;
  tweet_id: string;
  author_id: string;
  author_username: string | null;
  text: string;
  conversation_id: string | null;
  created_at: string | null;
  in_reply_to_tweet_id: string | null;
  quoted_tweet_id: string | null;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  author_name: string | null;
  author_verified: number;
  author_verified_type: string | null;
  author_followers: number;
  in_reply_to_username: string | null;
  quoted_tweet_username: string | null;
  status: XInboxStatus;
  starred: number;
  discarded: number;
  first_seen: string;
  last_seen: string;
}

export interface UpsertXInboxItemInput {
  kind: XInboxKind;
  tweet_id: string;
  author_id: string;
  author_username?: string;
  text: string;
  conversation_id?: string;
  created_at?: string;
  in_reply_to_tweet_id?: string;
  quoted_tweet_id?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  quotes?: number;
  author_name?: string;
  author_verified?: boolean;
  author_verified_type?: string;
  author_followers?: number;
  in_reply_to_username?: string;
  quoted_tweet_username?: string;
}

export function createXInboxModel(db: Database.Database) {
  const upsertStmt = db.prepare(`
    INSERT INTO x_inbox_items (
      kind, tweet_id, author_id, author_username, text,
      conversation_id, created_at, in_reply_to_tweet_id, quoted_tweet_id,
      likes, retweets, replies, quotes,
      author_name, author_verified, author_verified_type, author_followers,
      in_reply_to_username, quoted_tweet_username
    ) VALUES (
      @kind, @tweet_id, @author_id, @author_username, @text,
      @conversation_id, @created_at, @in_reply_to_tweet_id, @quoted_tweet_id,
      @likes, @retweets, @replies, @quotes,
      @author_name, @author_verified, @author_verified_type, @author_followers,
      @in_reply_to_username, @quoted_tweet_username
    )
    ON CONFLICT(tweet_id) DO UPDATE SET
      kind = @kind,
      author_id = @author_id,
      author_username = COALESCE(@author_username, author_username),
      text = @text,
      conversation_id = COALESCE(@conversation_id, conversation_id),
      created_at = COALESCE(@created_at, created_at),
      in_reply_to_tweet_id = COALESCE(@in_reply_to_tweet_id, in_reply_to_tweet_id),
      quoted_tweet_id = COALESCE(@quoted_tweet_id, quoted_tweet_id),
      likes = @likes,
      retweets = @retweets,
      replies = @replies,
      quotes = @quotes,
      author_name = COALESCE(@author_name, author_name),
      author_verified = CASE WHEN @author_verified > 0 THEN @author_verified ELSE author_verified END,
      author_verified_type = COALESCE(@author_verified_type, author_verified_type),
      author_followers = CASE WHEN @author_followers > 0 THEN @author_followers ELSE author_followers END,
      in_reply_to_username = COALESCE(@in_reply_to_username, in_reply_to_username),
      quoted_tweet_username = COALESCE(@quoted_tweet_username, quoted_tweet_username),
      last_seen = datetime('now')
  `);

  return {
    upsert(input: UpsertXInboxItemInput): XInboxItem {
      upsertStmt.run({
        kind: input.kind,
        tweet_id: input.tweet_id,
        author_id: input.author_id,
        author_username: input.author_username ?? null,
        text: input.text,
        conversation_id: input.conversation_id ?? null,
        created_at: input.created_at ?? null,
        in_reply_to_tweet_id: input.in_reply_to_tweet_id ?? null,
        quoted_tweet_id: input.quoted_tweet_id ?? null,
        likes: input.likes ?? 0,
        retweets: input.retweets ?? 0,
        replies: input.replies ?? 0,
        quotes: input.quotes ?? 0,
        author_name: input.author_name ?? null,
        author_verified: input.author_verified ? 1 : 0,
        author_verified_type: input.author_verified_type ?? null,
        author_followers: input.author_followers ?? 0,
        in_reply_to_username: input.in_reply_to_username ?? null,
        quoted_tweet_username: input.quoted_tweet_username ?? null,
      });
      return db.prepare('SELECT * FROM x_inbox_items WHERE tweet_id = ?').get(input.tweet_id) as XInboxItem;
    },

    list(opts: { kind?: XInboxKind | 'all'; status?: XInboxStatus | 'all'; limit?: number; includeDiscarded?: boolean } = {}): XInboxItem[] {
      const kind = opts.kind ?? 'all';
      const status = opts.status ?? 'all';
      const limit = Math.max(1, Math.min(500, Number(opts.limit ?? 100) || 100));
      const includeDiscarded = !!opts.includeDiscarded;

      const where: string[] = [];
      const params: any[] = [];

      if (!includeDiscarded) {
        where.push('discarded = 0');
      }
      if (kind !== 'all') {
        where.push('kind = ?');
        params.push(kind);
      }
      if (status !== 'all') {
        where.push('status = ?');
        params.push(status);
      }

      const sql =
        'SELECT * FROM x_inbox_items' +
        (where.length ? (' WHERE ' + where.join(' AND ')) : '') +
        ' ORDER BY last_seen DESC LIMIT ?';

      return db.prepare(sql).all(...params, limit) as XInboxItem[];
    },

    setStarred(tweetId: string, starred: boolean): number {
      const info = db.prepare('UPDATE x_inbox_items SET starred = ? WHERE tweet_id = ?').run(starred ? 1 : 0, tweetId);
      return info.changes;
    },

    setDiscarded(tweetId: string, discarded: boolean): number {
      const info = db.prepare('UPDATE x_inbox_items SET discarded = ?, status = ? WHERE tweet_id = ?')
        .run(discarded ? 1 : 0, discarded ? 'discarded' : 'new', tweetId);
      return info.changes;
    },

    setStatus(tweetId: string, status: XInboxStatus): number {
      const info = db.prepare('UPDATE x_inbox_items SET status = ? WHERE tweet_id = ?').run(status, tweetId);
      return info.changes;
    },

    countNew(): number {
      const row = db.prepare("SELECT COUNT(*) as c FROM x_inbox_items WHERE discarded = 0 AND status = 'new'").get() as { c: number };
      return row.c;
    },
  };
}

