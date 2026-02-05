import { SYSTEM_CONTEXT } from './system-context.js';
import type { PromptContext } from './index.js';

export function buildTrendJack(context: PromptContext): { system: string; user: string } {
  return {
    system: SYSTEM_CONTEXT,
    user: `Write a single satirical tweet (under 280 characters) that attaches to this trending topic with a congressional/legislative angle.

TRENDING TOPIC: ${context.trendTopic ?? 'N/A'}
TREND CONTEXT: ${context.additionalContext ?? 'No additional context'}
${context.bill ? `RELEVANT BILL: ${context.bill.billNumber} — "${context.bill.title}"` : ''}
${context.siteUrl ? `LINK: ${context.siteUrl}` : ''}

Rules:
- Connect the trend to Congress, legislation, or government absurdity
- If you can't find a genuinely funny angle, respond with exactly "SKIP" — don't force it
- Don't just mention the trend; make a sharp observation about how Congress relates to it
- Include the trending topic or its hashtag naturally in the tweet

Respond with ONLY the tweet text (or "SKIP"), nothing else.`,
  };
}
