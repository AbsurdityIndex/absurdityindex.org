import { getLogger } from '../../utils/logger.js';
import type { Config } from '../../config.js';

export interface GifResult {
  id: string;
  title: string;
  imageUrl: string;
  previewUrl: string;
  sourceUrl: string;
}

/**
 * Client for the Giphy API — searches reaction GIFs.
 * Free tier with 100 req/hr limit (more than enough for our use).
 */
export class GiphyClient {
  private log = getLogger();
  private apiKey: string;

  constructor(config: Config) {
    this.apiKey = config.giphyApiKey;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: string, limit = 5): Promise<GifResult[]> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      q: query,
      limit: String(limit),
      rating: 'pg',
      lang: 'en',
    });

    const res = await fetch(`https://api.giphy.com/v1/gifs/search?${params}`);
    const json = (await res.json()) as {
      data: Array<{
        id: string;
        title: string;
        url: string;
        images: {
          original: { url: string };
          fixed_height: { url: string };
        };
      }>;
      meta: { status: number; msg: string };
    };

    if (json.meta.status !== 200) {
      throw new Error(`Giphy search failed: ${json.meta.msg}`);
    }

    const results = json.data.map((g) => ({
      id: g.id,
      title: g.title,
      imageUrl: g.images.original.url,
      previewUrl: g.images.fixed_height.url,
      sourceUrl: g.url,
    }));

    this.log.debug({ query, count: results.length }, 'Giphy search results');
    return results;
  }
}
