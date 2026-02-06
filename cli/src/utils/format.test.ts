import { describe, expect, it } from 'vitest';
import { billUrl, cleanContent, formatTweet, tweetLength } from './format.js';

describe('tweetLength', () => {
  it('counts URLs as 23 characters', () => {
    const text = 'Check this out https://example.com/some/really/long/path';
    expect(tweetLength(text)).toBe('Check this out '.length + 23);
  });
});

describe('formatTweet', () => {
  it('keeps formatted output within tweet limit', () => {
    const content = 'A'.repeat(500);
    const result = formatTweet(content, { url: 'https://absurdityindex.org/bills/real-hr-25/' });

    expect(result).toContain('https://absurdityindex.org/bills/real-hr-25/');
    expect(tweetLength(result)).toBeLessThanOrEqual(280);
  });
});

describe('cleanContent', () => {
  it('removes basic markdown artifacts', () => {
    const cleaned = cleanContent('## Heading\n\n**Bold** *Italic*');
    expect(cleaned).toBe('Heading\n\nBold Italic');
  });
});

describe('billUrl', () => {
  it('builds a bill permalink from slug and site URL', () => {
    expect(billUrl('real-hr-25', 'https://absurdityindex.org')).toBe(
      'https://absurdityindex.org/bills/real-hr-25/'
    );
  });
});
