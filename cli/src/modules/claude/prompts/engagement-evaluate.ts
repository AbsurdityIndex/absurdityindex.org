import { SYSTEM_CONTEXT } from './system-context.js';
import type { PromptContext } from './index.js';

export function buildEngagementEvaluate(context: PromptContext): { system: string; user: string } {
  return {
    system: `${SYSTEM_CONTEXT}

You are also an expert at evaluating tweets for satirical engagement potential. You assess whether a tweet is worth engaging with based on comedic opportunity, relevance, and safety.`,
    user: `Evaluate this tweet as an engagement opportunity for the Absurdity Index satirical account.

TWEET: "${context.quoteTweetText ?? ''}"
AUTHOR: ${context.quoteTweetAuthor ?? 'Unknown'}
${context.additionalContext ? `METRICS: ${context.additionalContext}` : ''}

Assess:
1. Is there a clear satirical angle? (congressional theater, hypocrisy, absurdity)
2. Is the content safe to engage with? (no active tragedies, no personal attacks needed)
3. What type of engagement fits best? (reply = conversational, quote = commentary, skip = not worth it)

Respond in this EXACT format:
SCORE: [0-100, higher = better opportunity]
ACTION: [reply | quote | skip]
REASON: [one sentence explaining your assessment]`,
  };
}
