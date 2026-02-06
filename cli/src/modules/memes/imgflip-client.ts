import { getLogger } from '../../utils/logger.js';
import type { Config } from '../../config.js';

export interface ImgflipTemplate {
  id: string;
  name: string;
  boxCount: number;
}

export interface CaptionResult {
  url: string;
  pageUrl: string;
}

/**
 * Client for the Imgflip API — generates memes from 100+ templates.
 * Free tier, no rate limits in practice. Auth is username/password in POST body.
 */
export class ImgflipClient {
  private log = getLogger();
  private username: string;
  private password: string;
  private templateCache: ImgflipTemplate[] | null = null;

  constructor(config: Config) {
    this.username = config.imgflipUsername;
    this.password = config.imgflipPassword;
  }

  get isConfigured(): boolean {
    return Boolean(this.username && this.password);
  }

  async getTemplates(): Promise<ImgflipTemplate[]> {
    if (this.templateCache) return this.templateCache;

    const res = await fetch('https://api.imgflip.com/get_memes');
    const json = (await res.json()) as {
      success: boolean;
      data?: { memes: Array<{ id: string; name: string; box_count: number }> };
      error_message?: string;
    };

    if (!json.success || !json.data) {
      throw new Error(`Imgflip get_memes failed: ${json.error_message ?? 'unknown error'}`);
    }

    this.templateCache = json.data.memes.map((m) => ({
      id: m.id,
      name: m.name,
      boxCount: m.box_count,
    }));

    this.log.debug({ count: this.templateCache.length }, 'Imgflip templates loaded');
    return this.templateCache;
  }

  /**
   * Get the top N templates (by Imgflip popularity) for Claude to pick from.
   */
  async getTopTemplates(n = 50): Promise<Array<{ id: string; name: string }>> {
    const all = await this.getTemplates();
    return all.slice(0, n).map((t) => ({ id: t.id, name: t.name }));
  }

  async captionImage(templateId: string, captions: string[]): Promise<CaptionResult> {
    const params = new URLSearchParams({
      template_id: templateId,
      username: this.username,
      password: this.password,
    });

    // Imgflip expects text0, text1, ... for captions
    for (let i = 0; i < captions.length; i++) {
      params.set(`boxes[${i}][text]`, captions[i]!);
    }

    const res = await fetch('https://api.imgflip.com/caption_image', {
      method: 'POST',
      body: params,
    });

    const json = (await res.json()) as {
      success: boolean;
      data?: { url: string; page_url: string };
      error_message?: string;
    };

    if (!json.success || !json.data) {
      throw new Error(`Imgflip caption failed: ${json.error_message ?? 'unknown error'}`);
    }

    this.log.info({ templateId, url: json.data.url }, 'Meme generated via Imgflip');
    return { url: json.data.url, pageUrl: json.data.page_url };
  }
}
