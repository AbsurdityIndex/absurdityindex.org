import { SYSTEM_CONTEXT } from './system-context.js';
import type { PromptContext } from './index.js';

export function buildReplyDunk(context: PromptContext): { system: string; user: string } {
  return {
    system: SYSTEM_CONTEXT,
    user: `Write a satirical REPLY to this congressional tweet (under 280 characters). This is a direct conversational reply, not a quote-tweet.

ORIGINAL TWEET: "${context.quoteTweetText ?? ''}"
AUTHOR: ${context.quoteTweetAuthor ?? 'Congressional account'}
${context.additionalContext ? `CONTEXT: ${context.additionalContext}` : ''}
${context.siteUrl ? `LINK: ${context.siteUrl}` : ''}
${context.sourceLinks?.length ? `SOURCE LINKS (include these as proof):\n${context.sourceLinks.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : ''}

Rules:
- This is a REPLY — be conversational and direct, as if talking to the author
- Mock the THEATER and PROCESS, not the person
- Use irony — their own words against the system
- Keep it light and witty, not preachy
- Don't start with "Hey" or address them by name
- If the original tweet is about something genuinely serious/tragic, respond with "SKIP"
- If the tweet is about a personal matter (health, family, grief), respond with "SKIP"
- EVERY factual claim MUST be backed by a source link. If source links are provided above, include them. If making a claim without a source, do NOT make the claim.

Respond with ONLY the reply text (or "SKIP"), nothing else.`,
  };
}
