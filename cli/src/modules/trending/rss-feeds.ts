import Parser from 'rss-parser';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../../utils/logger.js';

const log = getLogger();
const parser = new Parser();

interface FeedSource {
  name: string;
  url: string;
  category: string;
  priority: string;
}

export interface NormalizedTrend {
  topic: string;
  source: 'rss';
  volume: number;
  metadata: {
    feedName: string;
    url: string;
    pubDate?: string;
  };
}

function loadFeedSources(dataDir: string): FeedSource[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'feed-sources.json'), 'utf-8'));
    return raw.feeds ?? [];
  } catch {
    log.warn('Failed to load feed sources');
    return [];
  }
}

/**
 * Fetch and normalize headlines from RSS feeds.
 */
export async function fetchRssFeeds(dataDir: string): Promise<NormalizedTrend[]> {
  const sources = loadFeedSources(dataDir);
  const trends: NormalizedTrend[] = [];
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.url);
      const recentItems = (feed.items ?? []).filter(item => {
        const pubDate = item.pubDate ? new Date(item.pubDate) : null;
        return !pubDate || pubDate > cutoff;
      });

      for (const item of recentItems.slice(0, 5)) {
        trends.push({
          topic: item.title ?? 'Untitled',
          source: 'rss',
          volume: source.priority === 'high' ? 200 : source.priority === 'medium' ? 100 : 50,
          metadata: {
            feedName: source.name,
            url: item.link ?? '',
            pubDate: item.pubDate,
          },
        });
      }
    } catch (err) {
      log.debug({ feed: source.name, err }, 'RSS feed fetch failed');
    }
  }

  return trends;
}
