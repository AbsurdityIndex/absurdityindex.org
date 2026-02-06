/**
 * Anthropic model pricing — hardcoded rates per million tokens.
 * Batch API is 50% off standard pricing.
 */

interface ModelPricing {
  inputPerMTok: number;   // $ per 1M input tokens
  outputPerMTok: number;  // $ per 1M output tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6':              { inputPerMTok: 15,  outputPerMTok: 75  },
  'claude-sonnet-4-5-20250929':   { inputPerMTok: 3,   outputPerMTok: 15  },
  'claude-haiku-4-5-20251001':    { inputPerMTok: 0.80, outputPerMTok: 4  },
};

const BATCH_DISCOUNT = 0.5;

/**
 * Calculate the cost in cents for a given API call.
 */
export function calculateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
  isBatch = false,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  const totalDollars = (inputCost + outputCost) * (isBatch ? BATCH_DISCOUNT : 1);

  return totalDollars * 100; // convert to cents
}

/**
 * Get the display name for a model.
 */
export function modelDisplayName(model: string): string {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model;
}
