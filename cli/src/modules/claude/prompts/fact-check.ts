import type { TweetContext } from '../../x-api/tweet-context.js';
import { formatTweetContext } from '../../x-api/tweet-context.js';
import type { ResearchResult } from './research.js';

export interface FactCheckIssue {
  claim: string;
  problem: 'unsourced' | 'unverifiable' | 'misleading' | 'fabricated';
  suggestion: string;
}

export interface FactCheckResult {
  /** Overall verdict */
  verdict: 'PASS' | 'FLAG' | 'REJECT';
  /** Specific issues found */
  issues: FactCheckIssue[];
  /** Clean version with issues removed (if verdict is FLAG) */
  cleanedContent?: string;
}

export const FACT_CHECK_SYSTEM = `You are a fact-checker for a satirical political commentary account (@AbsurdityIndex). Your job is to catch unsourced claims, loose associations, and factual inaccuracies BEFORE content is posted.

You have been given:
1. The generated content (what would be posted)
2. The original tweet context (what we're responding to)
3. The research output (verified facts and avoid-list from the research step)

Your job:
- Check every factual claim in the generated content against the research output
- Flag any claim NOT supported by the verified facts list
- Flag loose associations (connecting unrelated facts to imply causation)
- Flag any claim from the "avoidClaims" list that slipped through

Verdicts:
- PASS: No factual issues found
- FLAG: Minor issues that can be fixed — provide a cleanedContent version
- REJECT: Fundamental issues — the content premise relies on unverified claims

Respond with valid JSON only. No markdown fences, no explanation.`;

export function buildFactCheckPrompt(
  content: string,
  tweetContext: TweetContext,
  research: ResearchResult,
): string {
  const parts: string[] = [];

  parts.push('Fact-check this generated content before it gets posted.');
  parts.push('');
  parts.push('## Generated Content');
  parts.push(`"${content}"`);
  parts.push('');
  parts.push('## Original Tweet Context');
  parts.push(formatTweetContext(tweetContext));
  parts.push('');
  parts.push('## Research Output');
  parts.push(`Summary: ${research.summary}`);
  parts.push(`Angle: ${research.angle}`);
  parts.push('');
  parts.push('Verified facts (ONLY these can be used):');
  for (const fact of research.verifiableFacts) {
    parts.push(`  - ${fact}`);
  }
  parts.push('');
  parts.push('Claims to AVOID (these must NOT appear):');
  for (const claim of research.avoidClaims) {
    parts.push(`  - ${claim}`);
  }
  parts.push('');
  parts.push('## Instructions');
  parts.push('Respond with a JSON object matching this schema:');
  parts.push(`{
  "verdict": "PASS" | "FLAG" | "REJECT",
  "issues": [
    {
      "claim": "The specific claim in the content",
      "problem": "unsourced" | "unverifiable" | "misleading" | "fabricated",
      "suggestion": "How to fix or what to remove"
    }
  ],
  "cleanedContent": "If verdict is FLAG, a cleaned version with issues removed. Omit if PASS or REJECT."
}`);

  return parts.join('\n');
}
