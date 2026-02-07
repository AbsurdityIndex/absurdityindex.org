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
}

export function createXInboxModel(db: Database.Database) {
  const upsertStmt = db.prepare(`
    INSERT INTO x_inbox_items (
      kind, tweet_id, author_id, author_username, text,
      conversation_id, created_at, in_reply_to_tweet_id, quoted_tweet_id,
      likes, retweets, replies, quotes
    ) VALUES (
      @kind, @tweet_id, @author_id, @author_username, @text,
      @conversation_id, @created_at, @in_reply_to_tweet_id, @quoted_tweet_id,
      @likes, @retweets, @replies, @quotes
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

