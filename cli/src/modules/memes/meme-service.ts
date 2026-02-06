import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getLogger } from '../../utils/logger.js';
import type { Config } from '../../config.js';
import type { ClaudeClient } from '../claude/client.js';
import { ImgflipClient } from './imgflip-client.js';
import { GiphyClient } from './giphy-client.js';

export type MemeStrategy = 'imgflip' | 'giphy' | 'none';

export interface MemeDecision {
  strategy: MemeStrategy;
  /** Imgflip: template ID to use */
  templateId?: string;
  /** Imgflip: template name (for logging) */
  templateName?: string;
  /** Imgflip: caption texts (top/bottom) */
  captions?: string[];
  /** Giphy: search query */
  giphyQuery?: string;
  /** Why Claude chose this strategy */
  reasoning?: string;
}

export interface MemeAttachment {
  filePath: string;
  mimeType: string;
  sourceUrl: string;
  strategy: MemeStrategy;
  templateName?: string;
  cleanup: () => void;
}

/**
 * Orchestrates meme generation: asks Claude to pick a strategy,
 * then executes it via Imgflip or Giphy.
 */
export class MemeService {
  private log = getLogger();
  private imgflip: ImgflipClient;
  private giphy: GiphyClient;
  private claude: ClaudeClient;

  constructor(config: Config, claude: ClaudeClient) {
    this.imgflip = new ImgflipClient(config);
    this.giphy = new GiphyClient(config);
    this.claude = claude;
  }

  get isAvailable(): boolean {
    return this.imgflip.isConfigured || this.giphy.isConfigured;
  }

  /**
   * Ask Claude which meme strategy fits the post content best.
   */
  async decideMemeStrategy(
    postContent: string,
    context?: string,
  ): Promise<{ decision: MemeDecision; inputTokens: number; outputTokens: number; model: string }> {
    const availableStrategies: string[] = [];
    let templateList = '';

    if (this.imgflip.isConfigured) {
      availableStrategies.push('imgflip');
      const templates = await this.imgflip.getTopTemplates(50);
      templateList = templates.map((t) => `  ${t.id}: ${t.name}`).join('\n');
    }

    if (this.giphy.isConfigured) {
      availableStrategies.push('giphy');
    }

    if (availableStrategies.length === 0) {
      return {
        decision: { strategy: 'none', reasoning: 'No meme APIs configured' },
        inputTokens: 0,
        outputTokens: 0,
        model: 'none',
      };
    }

    const prompt = `You are picking a meme or reaction GIF to accompany a satirical political post on X (Twitter).

Post text:
"${postContent}"

${context ? `Additional context: ${context}` : ''}

Available strategies: ${availableStrategies.join(', ')}, none

${templateList ? `Available Imgflip meme templates (id: name):\n${templateList}\n` : ''}
Rules:
- Pick "imgflip" if a specific meme template fits the joke well. Provide the template ID and 2 short captions (top/bottom text). Keep captions punchy and under 60 chars each.
- Pick "giphy" if a reaction GIF would work better. Provide a short search query (2-4 words).
- Pick "none" if adding media would dilute the joke or nothing fits.
- Political satire works best with: Drake, Distracted Boyfriend, Change My Mind, Two Buttons, Disaster Girl, This Is Fine, etc.
- The meme should reinforce the post's joke, not repeat it literally.

Respond with JSON:
{
  "strategy": "imgflip" | "giphy" | "none",
  "templateId": "string (imgflip only)",
  "templateName": "string (imgflip only)",
  "captions": ["top text", "bottom text"] (imgflip only),
  "giphyQuery": "string (giphy only)",
  "reasoning": "1 sentence why"
}`;

    const result = await this.claude.structured<MemeDecision>(prompt);

    this.log.info(
      { strategy: result.data.strategy, template: result.data.templateName, reasoning: result.data.reasoning },
      'Meme strategy decided',
    );

    return {
      decision: result.data,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model: result.model,
    };
  }

  /**
   * Execute a meme decision: generate/download the image to a temp file.
   */
  async generateMeme(decision: MemeDecision): Promise<MemeAttachment | null> {
    if (decision.strategy === 'none') return null;

    if (decision.strategy === 'imgflip') {
      return this.generateImgflipMeme(decision);
    }

    if (decision.strategy === 'giphy') {
      return this.fetchGiphyGif(decision);
    }

    return null;
  }

  /**
   * Convenience: decide strategy + generate in one call.
   */
  async createMeme(
    postContent: string,
    context?: string,
  ): Promise<{
    attachment: MemeAttachment | null;
    decision: MemeDecision;
    inputTokens: number;
    outputTokens: number;
    model: string;
  }> {
    const { decision, inputTokens, outputTokens, model } = await this.decideMemeStrategy(postContent, context);
    const attachment = await this.generateMeme(decision);
    return { attachment, decision, inputTokens, outputTokens, model };
  }

  private async generateImgflipMeme(decision: MemeDecision): Promise<MemeAttachment | null> {
    if (!decision.templateId || !decision.captions?.length) {
      this.log.warn('Imgflip decision missing templateId or captions');
      return null;
    }

    const result = await this.imgflip.captionImage(decision.templateId, decision.captions);

    // Download the generated meme to a temp file
    const tmpPath = path.join(os.tmpdir(), `meme-${Date.now()}.jpg`);
    const res = await fetch(result.url);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    this.log.info({ path: tmpPath, url: result.url }, 'Imgflip meme downloaded');

    return {
      filePath: tmpPath,
      mimeType: 'image/jpeg',
      sourceUrl: result.url,
      strategy: 'imgflip',
      templateName: decision.templateName,
      cleanup: () => {
        try { fs.unlinkSync(tmpPath); } catch { /* already cleaned */ }
      },
    };
  }

  private async fetchGiphyGif(decision: MemeDecision): Promise<MemeAttachment | null> {
    if (!decision.giphyQuery) {
      this.log.warn('Giphy decision missing search query');
      return null;
    }

    const results = await this.giphy.search(decision.giphyQuery, 3);
    if (results.length === 0) {
      this.log.warn({ query: decision.giphyQuery }, 'No Giphy results found');
      return null;
    }

    // Pick the first result
    const gif = results[0]!;
    const tmpPath = path.join(os.tmpdir(), `meme-${Date.now()}.gif`);
    const res = await fetch(gif.imageUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    this.log.info({ path: tmpPath, query: decision.giphyQuery, title: gif.title }, 'Giphy GIF downloaded');

    return {
      filePath: tmpPath,
      mimeType: 'image/gif',
      sourceUrl: gif.sourceUrl,
      strategy: 'giphy',
      cleanup: () => {
        try { fs.unlinkSync(tmpPath); } catch { /* already cleaned */ }
      },
    };
  }
}
