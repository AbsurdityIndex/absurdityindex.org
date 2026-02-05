import { SYSTEM_CONTEXT } from './system-context.js';
import type { PromptContext } from './index.js';

export function buildQuoteDunk(context: PromptContext): { system: string; user: string } {
  return {
    system: SYSTEM_CONTEXT,
    user: `Write a satirical quote-tweet response (under 280 characters) to this congressional post.

ORIGINAL TWEET: "${context.quoteTweetText ?? ''}"
AUTHOR: ${context.quoteTweetAuthor ?? 'Congressional account'}
${context.additionalContext ? `CONTEXT: ${context.additionalContext}` : ''}
${context.siteUrl ? `LINK: ${context.siteUrl}` : ''}

Rules:
- Mock the THEATER and PROCESS, not the person
- Call out the gap between rhetoric and action
- Use irony — their own words against the system
- If the original tweet is about something genuinely serious/tragic, respond with "SKIP"

Respond with ONLY the quote-tweet text (or "SKIP"), nothing else.`,
  };
}
