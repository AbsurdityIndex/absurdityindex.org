const TWEET_MAX_LENGTH = 280;
const THREAD_MAX_LENGTH = 280;
const URL_DISPLAY_LENGTH = 23; // X counts all URLs as 23 chars

export interface FormatOptions {
  url?: string;
  hashtags?: string[];
  thread?: boolean;
}

/**
 * Calculate the effective length of a tweet (X counts URLs as 23 chars).
 */
export function tweetLength(text: string): number {
  // Replace URLs with 23-char placeholders for counting
  const urlPattern = /https?:\/\/\S+/g;
  let effective = text;
  const urls = text.match(urlPattern);
  if (urls) {
    for (const url of urls) {
      effective = effective.replace(url, 'x'.repeat(URL_DISPLAY_LENGTH));
    }
  }
  return effective.length;
}

/**
 * Format a single tweet with optional URL and hashtags.
 * Truncates content to fit within 280 chars.
 */
export function formatTweet(content: string, options: FormatOptions = {}): string {
  const { url, hashtags = [] } = options;

  // Build the suffix (URL + hashtags)
  const parts: string[] = [];
  if (url) parts.push(url);
  if (hashtags.length > 0) parts.push(hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' '));
  const suffix = parts.length > 0 ? '\n\n' + parts.join('\n') : '';

  // Calculate available space for content
  const suffixLength = tweetLength(suffix);
  const maxContentLength = TWEET_MAX_LENGTH - suffixLength;

  // Truncate content if needed
  let truncated = content;
  if (tweetLength(truncated) > maxContentLength) {
    truncated = truncated.slice(0, maxContentLength - 1) + '…';
  }

  return truncated + suffix;
}

/**
 * Split content into a thread of tweets.
 */
export function formatThread(content: string, options: FormatOptions = {}): string[] {
  const { url, hashtags = [] } = options;
  const sentences = content.split(/(?<=[.!?])\s+/);
  const tweets: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const test = current ? `${current} ${sentence}` : sentence;
    if (tweetLength(test) > THREAD_MAX_LENGTH - 10) { // Reserve space for numbering
      if (current) tweets.push(current);
      current = sentence;
    } else {
      current = test;
    }
  }
  if (current) tweets.push(current);

  // Add numbering if more than 1 tweet
  if (tweets.length > 1) {
    const total = tweets.length;
    return tweets.map((tweet, i) => {
      const num = `${i + 1}/${total}`;
      // Add URL and hashtags to last tweet
      if (i === total - 1) {
        const suffix = [url, hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')].filter(Boolean).join('\n');
        return `${tweet}\n\n${suffix}\n\n${num}`;
      }
      return `${tweet}\n\n${num}`;
    });
  }

  // Single tweet - add URL and hashtags
  if (tweets.length === 1) {
    return [formatTweet(tweets[0]!, options)];
  }

  return tweets;
}

/**
 * Clean up content for posting - normalize whitespace, remove markdown artifacts.
 */
export function cleanContent(text: string): string {
  return text
    .replace(/\*\*/g, '')       // Remove bold markdown
    .replace(/\*/g, '')         // Remove italic markdown
    .replace(/#{1,6}\s/g, '')   // Remove heading markers
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim();
}

/**
 * Generate a bill URL from a slug.
 */
export function billUrl(slug: string, siteUrl: string): string {
  return `${siteUrl}/bills/${slug}/`;
}
