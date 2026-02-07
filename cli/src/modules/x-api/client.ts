import { TwitterApi, type TweetV2, type TweetV2SingleResult } from 'twitter-api-v2';
import { getLogger } from '../../utils/logger.js';
import { readLimiter } from './rate-limiter.js';
import type { Config } from '../../config.js';

export interface TrendingTopic {
  name: string;
  volume: number;
}

/**
 * Read-only X API client using bearer token authentication.
 * All write operations are handled by BrowserPoster instead.
 */
export class XReadClient {
  private client: TwitterApi;
  private log = getLogger();

  constructor(config: Config) {
    this.client = new TwitterApi(config.xBearerToken);
  }

  async getTrending(woeid = 23424977): Promise<TrendingTopic[]> {
    await readLimiter.acquire();
    try {
      const trends = await this.client.v1.trendsByPlace(woeid);
      return (trends[0]?.trends ?? []).map(t => ({
        name: t.name,
        volume: t.tweet_volume ?? 0,
      }));
    } catch (err) {
      this.log.warn({ err }, 'Failed to fetch trends');
      return [];
    }
  }

  async searchTweets(query: string, maxResults = 10): Promise<TweetV2[]> {
    await readLimiter.acquire();
    try {
      const result = await this.client.v2.search(query, {
        max_results: maxResults,
        'tweet.fields': ['public_metrics', 'created_at', 'author_id'],
      });
      return result.data?.data ?? [];
    } catch (err) {
      this.log.warn({ err }, 'Failed to search tweets');
      return [];
    }
  }

  /**
   * Search tweets with expanded author info and conversation context.
   * Returns tweets plus a lookup map of author_id → username.
   */
  async searchTweetsExpanded(query: string, maxResults = 10): Promise<{
    tweets: TweetV2[];
    authors: Map<string, string>;
  }> {
    await readLimiter.acquire();
    try {
      const result = await this.client.v2.search(query, {
        max_results: maxResults,
        'tweet.fields': ['public_metrics', 'created_at', 'author_id', 'conversation_id'],
        expansions: ['author_id'],
        'user.fields': ['username'],
      });

      const authors = new Map<string, string>();
      for (const user of result.includes?.users ?? []) {
        authors.set(user.id, user.username);
      }

      return {
        tweets: result.data?.data ?? [],
        authors,
      };
    } catch (err) {
      this.log.warn({ err }, 'Failed to search tweets (expanded)');
      return { tweets: [], authors: new Map() };
    }
  }

  async singleTweet(tweetId: string): Promise<TweetV2SingleResult | null> {
    await readLimiter.acquire();
    try {
      const res = await this.client.v2.singleTweet(tweetId, {
        'tweet.fields': ['public_metrics', 'created_at', 'author_id', 'text', 'conversation_id', 'referenced_tweets'],
        expansions: ['author_id', 'referenced_tweets.id', 'referenced_tweets.id.author_id'],
        'user.fields': ['username', 'name', 'public_metrics', 'verified', 'verified_type'],
      });
      return res ?? null;
    } catch (err) {
      this.log.warn({ err, tweetId }, 'Failed to fetch single tweet');
      return null;
    }
  }

  async getTweetMetrics(tweetId: string): Promise<{ likes: number; retweets: number; replies: number; quotes: number; impressions?: number } | null> {
    await readLimiter.acquire();
    try {
      const tweet = await this.client.v2.singleTweet(tweetId, {
        'tweet.fields': ['public_metrics'],
      });
      const m = tweet.data.public_metrics;
      return m ? {
        likes: m.like_count,
        retweets: m.retweet_count,
        replies: m.reply_count,
        quotes: m.quote_count ?? 0,
        impressions: (m as any).impression_count,
      } : null;
    } catch (err) {
      this.log.warn({ err, tweetId }, 'Failed to get tweet metrics');
      return null;
    }
  }
}

export interface PostResult {
  success: boolean;
  tweetId?: string;
  tweetUrl?: string;
}

/**
 * Write-capable X API client using OAuth 1.0a (user context).
 * Used for posting tweets, replies, and quote tweets via the API.
 */
export class XWriteClient {
  private client: TwitterApi;
  private log = getLogger();

  constructor(config: Config) {
    this.client = new TwitterApi({
      appKey: config.xApiKey,
      appSecret: config.xApiSecret,
      accessToken: config.xAccessToken,
      accessSecret: config.xAccessSecret,
    });
  }

  async reply(text: string, toTweetId: string): Promise<PostResult> {
    try {
      const result = await this.client.v2.reply(text, toTweetId);
      const tweetId = result.data.id;
      return {
        success: true,
        tweetId,
        tweetUrl: `https://x.com/i/status/${tweetId}`,
      };
    } catch (err) {
      this.log.error({ err, toTweetId }, 'Failed to post reply via API');
      return { success: false };
    }
  }

  async quote(text: string, quotedTweetId: string): Promise<PostResult> {
    try {
      const result = await this.client.v2.quote(text, quotedTweetId);
      const tweetId = result.data.id;
      return {
        success: true,
        tweetId,
        tweetUrl: `https://x.com/i/status/${tweetId}`,
      };
    } catch (err) {
      this.log.error({ err, quotedTweetId }, 'Failed to post quote tweet via API');
      return { success: false };
    }
  }

  async tweet(text: string): Promise<PostResult> {
    try {
      const result = await this.client.v2.tweet(text);
      const tweetId = result.data.id;
      return {
        success: true,
        tweetId,
        tweetUrl: `https://x.com/i/status/${tweetId}`,
      };
    } catch (err) {
      this.log.error({ err }, 'Failed to post tweet via API');
      return { success: false };
    }
  }
}
