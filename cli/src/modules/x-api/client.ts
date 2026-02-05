import { TwitterApi, type TweetV2 } from 'twitter-api-v2';
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

  async getTweetMetrics(tweetId: string): Promise<{ likes: number; retweets: number; replies: number; impressions: number } | null> {
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
        impressions: m.impression_count ?? 0,
      } : null;
    } catch (err) {
      this.log.warn({ err, tweetId }, 'Failed to get tweet metrics');
      return null;
    }
  }
}
