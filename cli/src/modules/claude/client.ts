import Anthropic from '@anthropic-ai/sdk';
import { getLogger } from '../../utils/logger.js';
import type { Config } from '../../config.js';
import { getPrompt, type PromptType, type PromptContext } from './prompts/index.js';

export interface GenerationResult {
  content: string;
  promptType: PromptType;
  model: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
}

export interface SafetyAnalysisResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class ClaudeClient {
  private client: Anthropic;
  private log = getLogger();
  private creativeModel = 'claude-opus-4-6';
  private utilityModel = 'claude-sonnet-4-5-20250929';

  constructor(config: Config) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  async generate(promptType: PromptType, context: PromptContext): Promise<GenerationResult> {
    const { system, user } = getPrompt(promptType, context);

    this.log.debug({ promptType, contextKeys: Object.keys(context) }, 'Generating content');

    const response = await this.client.messages.create({
      model: this.creativeModel,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock?.text ?? '';

    this.log.info(
      { promptType, model: this.creativeModel, tokens: response.usage.input_tokens + response.usage.output_tokens },
      'Content generated'
    );

    return {
      content,
      promptType,
      model: this.creativeModel,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  /**
   * Ask Claude (Sonnet) for a structured JSON response.
   * Used for utility tasks like meme strategy decisions.
   */
  async structured<T>(task: string): Promise<{ data: T; inputTokens: number; outputTokens: number; model: string }> {
    const response = await this.client.messages.create({
      model: this.utilityModel,
      max_tokens: 512,
      system: 'Respond with valid JSON only. No markdown fences, no explanation, just the JSON object.',
      messages: [{ role: 'user', content: task }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const raw = (textBlock?.text ?? '').trim()
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    const data = JSON.parse(raw) as T;

    return {
      data,
      model: this.utilityModel,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  async analyzeSafety(content: string, task: string): Promise<SafetyAnalysisResult> {
    const response = await this.client.messages.create({
      model: this.utilityModel,
      max_tokens: 512,
      system: 'You are a content safety analyst. Respond with only the requested analysis format, no preamble.',
      messages: [{ role: 'user', content: `${task}\n\nContent to analyze:\n"${content}"` }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return {
      text: textBlock?.text ?? '',
      model: this.utilityModel,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  async pickBestPromptType(context: PromptContext): Promise<PromptType> {
    const response = await this.client.messages.create({
      model: this.utilityModel,
      max_tokens: 100,
      system: `You select the best satirical prompt type for congressional content. Options:
- bill-roast: For specific bills with absurd provisions
- trend-jack: For trending political topics
- quote-dunk: For quote-tweeting congressional theater
- cspan-after-dark: For "breaking news" style satirical alerts
- pork-barrel-report: For wasteful spending callouts
- floor-speech: For mock congressional speeches (threads)

Respond with ONLY the prompt type name, nothing else. If nothing fits well, respond "SKIP".`,
      messages: [{
        role: 'user',
        content: `Topic: ${context.topic ?? 'N/A'}
Bill: ${context.bill?.title ?? 'N/A'}
Trend: ${context.trendTopic ?? 'N/A'}
Context: ${context.additionalContext ?? 'N/A'}`,
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const type = textBlock?.text?.trim() as PromptType;

    const validTypes: PromptType[] = ['bill-roast', 'trend-jack', 'quote-dunk', 'cspan-after-dark', 'pork-barrel-report', 'floor-speech'];
    return validTypes.includes(type) ? type : 'bill-roast';
  }
}
