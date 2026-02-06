import { TwitterApi } from 'twitter-api-v2';
import { getLogger } from '../../utils/logger.js';
import type { Config } from '../../config.js';

export interface TweetResult {
  success: boolean;
  tweetId?: string;
  tweetUrl?: string;
  error?: string;
}

export interface PostOptions {
  mediaPath?: string;
}

/**
 * X API write client using OAuth 1.0a user-context authentication.
 * Handles posting tweets, replies, and quote tweets via the API directly.
 */
export class XWriteClient {
  private client: TwitterApi;
  private log = getLogger();

  constructor(config: Config) {
    if (!config.xApiKey || !config.xApiSecret || !config.xAccessToken || !config.xAccessSecret) {
      throw new Error(
        'X API OAuth 1.0a credentials required. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET in .env'
      );
    }

    this.client = new TwitterApi({
      appKey: config.xApiKey,
      appSecret: config.xApiSecret,
      accessToken: config.xAccessToken,
      accessSecret: config.xAccessSecret,
    });
  }

  private async uploadMedia(filePath: string): Promise<string> {
    const mediaId = await this.client.v1.uploadMedia(filePath);
    this.log.info({ mediaId, filePath }, 'Media uploaded');
    return mediaId;
  }

  async postTweet(text: string, opts?: PostOptions): Promise<TweetResult> {
    try {
      let mediaPayload: { media: { media_ids: [string] } } | undefined;
      if (opts?.mediaPath) {
        const mediaId = await this.uploadMedia(opts.mediaPath);
        mediaPayload = { media: { media_ids: [mediaId] } };
      }

      const result = await this.client.v2.tweet(text, mediaPayload);
      const tweetId = result.data.id;
      this.log.info({ tweetId, hasMedia: !!mediaPayload }, 'Tweet posted via API');
      return {
        success: true,
        tweetId,
        tweetUrl: `https://x.com/i/status/${tweetId}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error({ err }, 'Failed to post tweet via API');
      return { success: false, error: msg };
    }
  }

  async replyToTweet(text: string, replyToId: string, opts?: PostOptions): Promise<TweetResult> {
    try {
      let mediaPayload: { media: { media_ids: [string] } } | undefined;
      if (opts?.mediaPath) {
        const mediaId = await this.uploadMedia(opts.mediaPath);
        mediaPayload = { media: { media_ids: [mediaId] } };
      }

      const result = await this.client.v2.reply(text, replyToId, mediaPayload);
      const tweetId = result.data.id;
      this.log.info({ tweetId, replyToId }, 'Reply posted via API');
      return {
        success: true,
        tweetId,
        tweetUrl: `https://x.com/i/status/${tweetId}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error({ err, replyToId }, 'Failed to post reply via API');
      return { success: false, error: msg };
    }
  }

  async quoteTweet(text: string, quotedTweetId: string, opts?: PostOptions): Promise<TweetResult> {
    try {
      let mediaPayload: { media: { media_ids: [string] } } | undefined;
      if (opts?.mediaPath) {
        const mediaId = await this.uploadMedia(opts.mediaPath);
        mediaPayload = { media: { media_ids: [mediaId] } };
      }

      const result = await this.client.v2.tweet(text, {
        quote_tweet_id: quotedTweetId,
        ...mediaPayload,
      });
      const tweetId = result.data.id;
      this.log.info({ tweetId, quotedTweetId }, 'Quote tweet posted via API');
      return {
        success: true,
        tweetId,
        tweetUrl: `https://x.com/i/status/${tweetId}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error({ err, quotedTweetId }, 'Failed to post quote tweet via API');
      return { success: false, error: msg };
    }
  }

  async postThread(tweets: string[], opts?: PostOptions): Promise<TweetResult> {
    if (tweets.length === 0) return { success: false, error: 'Empty thread' };

    try {
      // Upload media for first tweet if provided
      let firstTweetPayload: { media: { media_ids: [string] } } | undefined;
      if (opts?.mediaPath) {
        const mediaId = await this.uploadMedia(opts.mediaPath);
        firstTweetPayload = { media: { media_ids: [mediaId] } };
      }

      // Post first tweet
      const first = await this.client.v2.tweet(tweets[0]!, firstTweetPayload);
      let lastId = first.data.id;
      this.log.info({ tweetId: lastId, hasMedia: !!firstTweetPayload }, 'Thread tweet 1 posted');

      // Post subsequent tweets as replies
      for (let i = 1; i < tweets.length; i++) {
        const reply = await this.client.v2.reply(tweets[i]!, lastId);
        lastId = reply.data.id;
        this.log.info({ tweetId: lastId, index: i + 1 }, `Thread tweet ${i + 1} posted`);
      }

      return {
        success: true,
        tweetId: first.data.id,
        tweetUrl: `https://x.com/i/status/${first.data.id}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error({ err }, 'Failed to post thread via API');
      return { success: false, error: msg };
    }
  }

  async deleteTweet(tweetId: string): Promise<boolean> {
    try {
      await this.client.v2.deleteTweet(tweetId);
      this.log.info({ tweetId }, 'Tweet deleted via API');
      return true;
    } catch (err) {
      this.log.error({ err, tweetId }, 'Failed to delete tweet');
      return false;
    }
  }
}
