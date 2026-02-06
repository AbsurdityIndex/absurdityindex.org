import Anthropic from '@anthropic-ai/sdk';
import { getLogger } from '../../utils/logger.js';
import type { Config } from '../../config.js';

const log = getLogger();

export interface BatchRequest {
  customId: string;
  model: string;
  maxTokens: number;
  system: string;
  userMessage: string;
}

export interface BatchResultItem {
  customId: string;
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

export type BatchStatus = 'in_progress' | 'canceling' | 'ended';

export interface BatchProgress {
  batchId: string;
  status: BatchStatus;
  requestCount: number;
  succeeded: number;
  errored: number;
  expired: number;
  canceled: number;
}

export class BatchClient {
  private client: Anthropic;
  private log = getLogger();

  constructor(config: Config) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  /**
   * Submit a batch of requests to the Anthropic Batch API.
   * Returns the batch ID for polling.
   */
  async submit(requests: BatchRequest[]): Promise<string> {
    const batchRequests = requests.map(req => ({
      custom_id: req.customId,
      params: {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user' as const, content: req.userMessage }],
      },
    }));

    this.log.info({ count: requests.length }, 'Submitting batch');

    const batch = await this.client.messages.batches.create({
      requests: batchRequests,
    });

    this.log.info({ batchId: batch.id, count: requests.length }, 'Batch submitted');
    return batch.id;
  }

  /**
   * Poll a batch until it reaches 'ended' status.
   * Calls onProgress with status updates at each interval.
   */
  async poll(
    batchId: string,
    intervalMs = 90_000,
    onProgress?: (progress: BatchProgress) => void,
  ): Promise<BatchProgress> {
    while (true) {
      const batch = await this.client.messages.batches.retrieve(batchId);

      const progress: BatchProgress = {
        batchId: batch.id,
        status: batch.processing_status as BatchStatus,
        requestCount: batch.request_counts.processing +
          batch.request_counts.succeeded +
          batch.request_counts.errored +
          batch.request_counts.expired +
          batch.request_counts.canceled,
        succeeded: batch.request_counts.succeeded,
        errored: batch.request_counts.errored,
        expired: batch.request_counts.expired,
        canceled: batch.request_counts.canceled,
      };

      onProgress?.(progress);

      if (batch.processing_status === 'ended') {
        this.log.info({ batchId, progress }, 'Batch completed');
        return progress;
      }

      this.log.debug({ batchId, status: batch.processing_status }, 'Batch still processing');
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Fetch results from a completed batch.
   * Iterates the JSONL response stream and returns parsed results.
   */
  async fetchResults(batchId: string): Promise<BatchResultItem[]> {
    const results: BatchResultItem[] = [];
    const decoder = await this.client.messages.batches.results(batchId);

    for await (const result of decoder) {
      const item: BatchResultItem = {
        customId: result.custom_id,
        content: '',
        model: '',
        inputTokens: 0,
        outputTokens: 0,
      };

      if (result.result.type === 'succeeded') {
        const message = result.result.message;
        const textBlock = message.content.find((b: any) => b.type === 'text');
        item.content = (textBlock as any)?.text ?? '';
        item.model = message.model;
        item.inputTokens = message.usage.input_tokens;
        item.outputTokens = message.usage.output_tokens;
      } else {
        item.error = result.result.type === 'errored'
          ? (result.result.error as any)?.message ?? 'Unknown error'
          : result.result.type;
      }

      results.push(item);
    }

    this.log.info({ batchId, resultCount: results.length }, 'Batch results fetched');
    return results;
  }
}
