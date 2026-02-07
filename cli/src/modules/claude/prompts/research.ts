import type { TweetContext } from '../../x-api/tweet-context.js';
import { formatTweetContext } from '../../x-api/tweet-context.js';
import type { BillContext } from './index.js';

export interface ResearchResult {
  /** What the conversation is actually about (1-2 sentences) */
  summary: string;
  /** The satirical angle to take */
  angle: string;
  /** Verifiable facts relevant to this conversation (only things we can prove) */
  verifiableFacts: string[];
  /** Claims we should NOT make (things we can't verify) */
  avoidClaims: string[];
  /** Whether this tweet should be engaged with at all */
  shouldEngage: boolean;
  /** If shouldEngage is false, why */
  skipReason?: string;
}

export const RESEARCH_SYSTEM = `You are a research analyst for a satirical political commentary account (@AbsurdityIndex). Your job is to analyze tweets and provide factual grounding for content creation.

Your core responsibility: distinguish between VERIFIABLE FACTS and UNVERIFIABLE CLAIMS.

A verifiable fact is something that can be confirmed via public records:
- Voting records on congress.gov
- Bill text and status
- Public financial disclosures
- Official statements and press releases
- CBO scores and budget analyses

An unverifiable claim is anything that requires assumption, mind-reading, or private information:
- Someone's motivations or intentions
- Backroom deals or private conversations
- Causal relationships between donations and votes (correlation ≠ causation)
- What will happen in the future

Respond with valid JSON only. No markdown fences, no explanation.`;

export function buildResearchPrompt(tweetContext: TweetContext, bill?: BillContext): string {
  const parts: string[] = [];

  parts.push('Analyze this tweet conversation and provide factual grounding for satirical content creation.');
  parts.push('');
  parts.push('## Tweet Context');
  parts.push(formatTweetContext(tweetContext));

  if (bill) {
    parts.push('');
    parts.push('## Related Bill');
    parts.push(`${bill.billNumber}: ${bill.title}`);
    parts.push(`Sponsor: ${bill.sponsor}`);
    parts.push(`Status: ${bill.status}`);
    parts.push(`Summary: ${bill.summary}`);
    if (bill.absurdityIndex != null) parts.push(`Absurdity Index: ${bill.absurdityIndex}/100`);
    if (bill.theGist) parts.push(`The Gist: ${bill.theGist}`);
  }

  parts.push('');
  parts.push('## Instructions');
  parts.push('Respond with a JSON object matching this schema:');
  parts.push(`{
  "summary": "What this conversation is actually about (1-2 sentences)",
  "angle": "The satirical angle — focus on theater/process, not personal attacks",
  "verifiableFacts": ["Only facts that can be confirmed via public records"],
  "avoidClaims": ["Claims that cannot be verified — do NOT use these"],
  "shouldEngage": true/false,
  "skipReason": "If shouldEngage is false, explain why"
}`);
  parts.push('');
  parts.push('Rules for shouldEngage=false:');
  parts.push('- Personal tragedies, health crises, deaths, illness');
  parts.push('- Active shootings, terrorist attacks, natural disasters');
  parts.push('- Grief, mourning, memorials');
  parts.push('- Domestic violence, sexual assault, abuse');
  parts.push('- The tweet is too vague to satirize meaningfully');

  return parts.join('\n');
}
