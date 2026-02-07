import chalk from 'chalk';
import { XWriteClient, type TweetResult } from '../x-api/write-client.js';
import { BrowserPoster } from '../x-api/browser-poster.js';
import { getLogger } from '../../utils/logger.js';
import type { Config } from '../../config.js';

const log = getLogger();

export interface PostWithReplyResult {
  success: boolean;
  tweetId?: string;
  tweetUrl?: string;
  replyTweetId?: string;
  method: string;
}

export interface PostWithReplyOptions {
  content: string;
  config: Config;
  mediaPath?: string;
  siteUrl?: string;
  sourceLinks?: string[];
  billSlug?: string;
}

/**
 * Build CTA reply text based on context.
 */
function buildReplyText(opts: { siteUrl?: string; sourceLinks?: string[]; billSlug?: string }): string | null {
  const parts: string[] = [];

  if (opts.billSlug && opts.siteUrl) {
    parts.push(`Read the full breakdown:\n${opts.siteUrl}`);
  } else if (opts.siteUrl) {
    parts.push(`More at ${opts.siteUrl}`);
  }

  if (opts.sourceLinks?.length) {
    if (parts.length > 0) parts.push('');
    parts.push('Sources:');
    for (const link of opts.sourceLinks) {
      parts.push(link);
    }
  }

  if (parts.length === 0) return null;
  return parts.join('\n');
}

/**
 * Post a tweet with optional media, then reply with CTA + source links.
 *
 * Flow:
 * 1. Post main tweet via API (fallback to browser)
 * 2. If API returned a tweetId and we have links, reply with CTA
 * 3. Reply failure is non-fatal — main tweet success is what matters
 */
export async function postWithReply(opts: PostWithReplyOptions): Promise<PostWithReplyResult> {
  const { content, config, mediaPath, siteUrl, sourceLinks, billSlug } = opts;

  // Try API first
  let mainResult: TweetResult | null = null;
  let method = 'api';

  if (config.xApiKey && config.xAccessToken) {
    try {
      const api = new XWriteClient(config);
      mainResult = await api.postTweet(content, mediaPath ? { mediaPath } : undefined);
      if (!mainResult.success) {
        log.warn({ error: mainResult.error }, 'API post failed — falling back to browser');
        mainResult = null;
      }
    } catch {
      log.warn('API client unavailable — falling back to browser');
    }
  }

  // Browser fallback (no reply possible — no tweet ID returned)
  if (!mainResult) {
    method = 'browser';
    const poster = new BrowserPoster(config);
    try {
      const browserResult = await poster.postTweet(content, mediaPath ? { mediaPath } : undefined);
      return {
        success: browserResult.success,
        method: 'browser',
      };
    } finally {
      await poster.close();
    }
  }

  if (!mainResult.success) {
    return { success: false, method };
  }

  // Main tweet posted — now try the CTA reply
  const result: PostWithReplyResult = {
    success: true,
    tweetId: mainResult.tweetId,
    tweetUrl: mainResult.tweetUrl,
    method,
  };

  const replyText = buildReplyText({ siteUrl, sourceLinks, billSlug });

  if (replyText && mainResult.tweetId) {
    try {
      const api = new XWriteClient(config);
      const replyResult = await api.replyToTweet(replyText, mainResult.tweetId);
      if (replyResult.success) {
        result.replyTweetId = replyResult.tweetId;
        log.info({ replyTweetId: replyResult.tweetId }, 'CTA reply posted');
      } else {
        log.warn({ error: replyResult.error }, 'CTA reply failed — main tweet still posted');
      }
    } catch (err) {
      log.warn({ err }, 'CTA reply error — main tweet still posted');
    }
  }

  return result;
}
