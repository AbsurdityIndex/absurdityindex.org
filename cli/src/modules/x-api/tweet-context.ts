import type { TweetV2, UserV2 } from 'twitter-api-v2';
import type { XReadClient } from './client.js';

export interface TweetAuthor {
  id: string;
  username: string;
  name: string;
  verified?: boolean;
  followerCount?: number;
}

export interface TweetData {
  id: string;
  text: string;
  author: TweetAuthor;
  createdAt?: string;
  metrics?: { likes: number; retweets: number; replies: number };
}

export interface TweetContext {
  /** The tweet we're responding to */
  tweet: TweetData;
  /** If the tweet is a quote tweet, the original quoted tweet */
  quotedTweet?: TweetData;
  /** If the tweet is a reply, the tweet it's replying to */
  repliedToTweet?: TweetData;
  /** Detected conversation type */
  type: 'original' | 'quote_tweet' | 'reply';
}

/**
 * Extract a tweet ID from a tweet URL or return the ID as-is.
 * Supports: https://x.com/user/status/123, https://twitter.com/user/status/123
 */
export function extractTweetId(urlOrId: string): string {
  const match = urlOrId.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match?.[1] ?? urlOrId;
}

function buildAuthor(user: UserV2): TweetAuthor {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    verified: user.verified ?? ('verified_type' in user && user.verified_type !== 'none'),
    followerCount: user.public_metrics?.followers_count,
  };
}

function buildTweetData(tweet: TweetV2, author: TweetAuthor): TweetData {
  const data: TweetData = {
    id: tweet.id,
    text: tweet.text,
    author,
  };
  if (tweet.created_at) data.createdAt = tweet.created_at;
  if (tweet.public_metrics) {
    data.metrics = {
      likes: tweet.public_metrics.like_count,
      retweets: tweet.public_metrics.retweet_count,
      replies: tweet.public_metrics.reply_count,
    };
  }
  return data;
}

/**
 * Fetch a tweet and unpack its full context: quoted tweets, reply parents, and authors.
 * Uses the existing XReadClient.singleTweet() which already requests referenced_tweets expansion.
 */
export async function fetchTweetContext(client: XReadClient, tweetIdOrUrl: string): Promise<TweetContext | null> {
  const tweetId = extractTweetId(tweetIdOrUrl);
  const result = await client.singleTweet(tweetId);

  if (!result?.data) return null;

  const { data, includes } = result;
  const users = includes?.users ?? [];
  const expandedTweets = includes?.tweets ?? [];

  // Build a lookup map: user ID → UserV2
  const userMap = new Map<string, UserV2>();
  for (const user of users) {
    userMap.set(user.id, user);
  }

  // Build a lookup map: tweet ID → TweetV2
  const tweetMap = new Map<string, TweetV2>();
  for (const tweet of expandedTweets) {
    tweetMap.set(tweet.id, tweet);
  }

  // Resolve the primary tweet's author
  const primaryUser = userMap.get(data.author_id ?? '');
  const primaryAuthor: TweetAuthor = primaryUser
    ? buildAuthor(primaryUser)
    : { id: data.author_id ?? 'unknown', username: 'unknown', name: 'Unknown' };

  const primaryTweet = buildTweetData(data, primaryAuthor);

  // Check referenced tweets for quoted/replied-to
  const refs = data.referenced_tweets ?? [];
  const quotedRef = refs.find(r => r.type === 'quoted');
  const repliedRef = refs.find(r => r.type === 'replied_to');

  let quotedTweet: TweetData | undefined;
  let repliedToTweet: TweetData | undefined;

  if (quotedRef) {
    const qt = tweetMap.get(quotedRef.id);
    if (qt) {
      const qtUser = userMap.get(qt.author_id ?? '');
      const qtAuthor: TweetAuthor = qtUser
        ? buildAuthor(qtUser)
        : { id: qt.author_id ?? 'unknown', username: 'unknown', name: 'Unknown' };
      quotedTweet = buildTweetData(qt, qtAuthor);
    }
  }

  if (repliedRef) {
    const rt = tweetMap.get(repliedRef.id);
    if (rt) {
      const rtUser = userMap.get(rt.author_id ?? '');
      const rtAuthor: TweetAuthor = rtUser
        ? buildAuthor(rtUser)
        : { id: rt.author_id ?? 'unknown', username: 'unknown', name: 'Unknown' };
      repliedToTweet = buildTweetData(rt, rtAuthor);
    }
  }

  // Determine conversation type
  let type: TweetContext['type'] = 'original';
  if (quotedRef) type = 'quote_tweet';
  else if (repliedRef) type = 'reply';

  return {
    tweet: primaryTweet,
    quotedTweet,
    repliedToTweet,
    type,
  };
}

/**
 * Format a TweetContext into a human-readable string for prompt injection.
 */
export function formatTweetContext(ctx: TweetContext): string {
  const lines: string[] = [];

  lines.push(`TWEET by @${ctx.tweet.author.username} (${ctx.tweet.author.name}):`);
  lines.push(`"${ctx.tweet.text}"`);
  if (ctx.tweet.metrics) {
    lines.push(`Engagement: ${ctx.tweet.metrics.likes} likes, ${ctx.tweet.metrics.retweets} RTs, ${ctx.tweet.metrics.replies} replies`);
  }

  if (ctx.quotedTweet) {
    lines.push('');
    lines.push(`QUOTED TWEET by @${ctx.quotedTweet.author.username} (${ctx.quotedTweet.author.name}):`);
    lines.push(`"${ctx.quotedTweet.text}"`);
  }

  if (ctx.repliedToTweet) {
    lines.push('');
    lines.push(`REPLYING TO @${ctx.repliedToTweet.author.username} (${ctx.repliedToTweet.author.name}):`);
    lines.push(`"${ctx.repliedToTweet.text}"`);
  }

  lines.push('');
  lines.push(`Conversation type: ${ctx.type}`);

  return lines.join('\n');
}
