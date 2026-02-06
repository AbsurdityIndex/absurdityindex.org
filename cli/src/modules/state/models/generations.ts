import type Database from 'better-sqlite3';
import { calculateCostCents } from '../../../utils/pricing.js';

export interface GenerationRecord {
  id: number;
  post_id: number | null;
  purpose: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  batch_id: string | null;
  bill_slug: string | null;
  created_at: string;
}

export interface RecordGenerationInput {
  postId?: number;
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  isBatch?: boolean;
  batchId?: string;
  billSlug?: string;
}

export interface CostSummary {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { costCents: number; calls: number }>;
  byPurpose: Record<string, { costCents: number; calls: number }>;
  totalCalls: number;
}

export interface BatchSavings {
  batchCostCents: number;
  standardCostCents: number;
  savedCents: number;
  batchCalls: number;
}

export function createGenerationModel(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO generations (post_id, purpose, model, input_tokens, output_tokens, cost_cents, batch_id, bill_slug)
    VALUES (@post_id, @purpose, @model, @input_tokens, @output_tokens, @cost_cents, @batch_id, @bill_slug)
  `);

  return {
    record(input: RecordGenerationInput): GenerationRecord {
      const costCents = calculateCostCents(
        input.model,
        input.inputTokens,
        input.outputTokens,
        input.isBatch ?? false,
      );
      const info = insert.run({
        post_id: input.postId ?? null,
        purpose: input.purpose,
        model: input.model,
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
        cost_cents: costCents,
        batch_id: input.batchId ?? null,
        bill_slug: input.billSlug ?? null,
      });
      return db.prepare('SELECT * FROM generations WHERE id = ?').get(info.lastInsertRowid) as GenerationRecord;
    },

    getCostSummary(days = 7): CostSummary {
      const rows = db.prepare(
        `SELECT * FROM generations WHERE created_at >= datetime('now', '-' || ? || ' days')`
      ).all(days) as GenerationRecord[];

      const byModel: Record<string, { costCents: number; calls: number }> = {};
      const byPurpose: Record<string, { costCents: number; calls: number }> = {};
      let totalCostCents = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      for (const row of rows) {
        totalCostCents += row.cost_cents;
        totalInputTokens += row.input_tokens;
        totalOutputTokens += row.output_tokens;

        if (!byModel[row.model]) byModel[row.model] = { costCents: 0, calls: 0 };
        byModel[row.model]!.costCents += row.cost_cents;
        byModel[row.model]!.calls += 1;

        if (!byPurpose[row.purpose]) byPurpose[row.purpose] = { costCents: 0, calls: 0 };
        byPurpose[row.purpose]!.costCents += row.cost_cents;
        byPurpose[row.purpose]!.calls += 1;
      }

      return {
        totalCostCents,
        totalInputTokens,
        totalOutputTokens,
        byModel,
        byPurpose,
        totalCalls: rows.length,
      };
    },

    getByBillSlug(slug: string): GenerationRecord[] {
      return db.prepare(
        'SELECT * FROM generations WHERE bill_slug = ? ORDER BY created_at DESC'
      ).all(slug) as GenerationRecord[];
    },

    getBatchSavings(days = 30): BatchSavings {
      const batchRows = db.prepare(
        `SELECT * FROM generations WHERE batch_id IS NOT NULL AND created_at >= datetime('now', '-' || ? || ' days')`
      ).all(days) as GenerationRecord[];

      let batchCostCents = 0;
      let standardCostCents = 0;

      for (const row of batchRows) {
        batchCostCents += row.cost_cents;
        // What it would have cost at standard pricing (batch cost is 50% off, so standard = 2x)
        standardCostCents += row.cost_cents * 2;
      }

      return {
        batchCostCents,
        standardCostCents,
        savedCents: standardCostCents - batchCostCents,
        batchCalls: batchRows.length,
      };
    },
  };
}
