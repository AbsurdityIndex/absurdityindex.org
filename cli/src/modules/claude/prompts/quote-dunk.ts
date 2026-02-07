import { SYSTEM_CONTEXT } from './system-context.js';
import { formatTweetContext } from '../../x-api/tweet-context.js';
import type { PromptContext } from './index.js';

export function buildQuoteDunk(context: PromptContext): { system: string; user: string } {
  const parts: string[] = [];

  parts.push('Write a satirical quote-tweet response (under 280 characters) to this congressional post.');
  parts.push('');

  // Use rich tweet context if available, fall back to raw text
  if (context.tweetContext) {
    parts.push('## Full Tweet Context');
    parts.push(formatTweetContext(context.tweetContext));
  } else {
    parts.push(`ORIGINAL TWEET: "${context.quoteTweetText ?? ''}"`);
    parts.push(`AUTHOR: ${context.quoteTweetAuthor ?? 'Congressional account'}`);
  }

  if (context.additionalContext) parts.push(`CONTEXT: ${context.additionalContext}`);

  // Inject research grounding if available
  if (context.researchResult) {
    parts.push('');
    parts.push('## Research (use ONLY these facts)');
    parts.push(`Summary: ${context.researchResult.summary}`);
    parts.push(`Suggested angle: ${context.researchResult.angle}`);
    parts.push('');
    parts.push('Verified facts you MAY use:');
    for (const fact of context.researchResult.verifiableFacts) {
      parts.push(`  - ${fact}`);
    }
    parts.push('');
    parts.push('Claims you MUST NOT make:');
    for (const claim of context.researchResult.avoidClaims) {
      parts.push(`  - ${claim}`);
    }
  }

  parts.push('');
  parts.push('Rules:');
  parts.push('- Mock the THEATER and PROCESS, not the person');
  parts.push('- Call out the gap between rhetoric and action');
  parts.push('- Use irony — their own words against the system');
  parts.push('- If the original tweet is about something genuinely serious/tragic, respond with "SKIP"');
  parts.push('- Do NOT include any URLs in your tweet — links are added in a follow-up reply automatically');
  if (context.researchResult) {
    parts.push('- You have been provided with researched facts. Use ONLY these facts. Do NOT introduce any factual claims beyond what the research provides.');
  }
  parts.push('- Every factual claim must be grounded in verifiable information. Do NOT make unsourced claims.');
  parts.push('');
  parts.push('Respond with ONLY the quote-tweet text (or "SKIP"), nothing else.');

  return {
    system: SYSTEM_CONTEXT,
    user: parts.join('\n'),
  };
}
