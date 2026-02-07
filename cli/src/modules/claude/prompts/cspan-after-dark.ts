import { SYSTEM_CONTEXT } from './system-context.js';
import type { PromptContext } from './index.js';

export function buildCspanAfterDark(context: PromptContext): { system: string; user: string } {
  return {
    system: SYSTEM_CONTEXT,
    user: `Write a satirical "breaking news" alert tweet (under 280 characters) in the style of a late-night C-SPAN broadcast.

TOPIC: ${context.topic ?? context.trendTopic ?? 'General congressional absurdity'}
${context.bill ? `BILL: ${context.bill.billNumber} — "${context.bill.title}"` : ''}
${context.additionalContext ? `CONTEXT: ${context.additionalContext}` : ''}

Format: Start with "BREAKING:" or "C-SPAN AFTER DARK:" or "🔔 CONGRESSIONAL ALERT:"
Style: Deadpan delivery of absurd congressional news, as if a very tired C-SPAN anchor is reporting it at 2 AM.

Examples of the tone (don't copy these exactly):
- "BREAKING: Congress discovers the internet exists, immediately tries to regulate it"
- "C-SPAN AFTER DARK: Senate enters hour 14 of debating the definition of 'infrastructure'"

Respond with ONLY the tweet text, nothing else.`,
  };
}
