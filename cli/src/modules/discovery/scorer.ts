import Anthropic from '@anthropic-ai/sdk';
import { getLogger } from '../../utils/logger.js';

const SCORER_MODEL = 'claude-haiku-4-5-20251001';

export interface ScoringResult {
  score: number;
  category: string;
  explanation: string;
  angle: string;
  inputTokens: number;
  outputTokens: number;
}

const SCORING_PROMPT = `You are an absurdity detector for AbsurdityIndex.org — a satirical site covering real congressional legislation.

Score this bill 1-10 on how absurd, wasteful, or satirically noteworthy it is.

SCORING:
1-3: Normal legislation. Boring and functional.
4-5: Mildly eyebrow-raising. Minor waste or questionable priorities.
6-7: Genuinely absurd. Clear waste, process abuse, or tone-deafness worth calling out.
8-9: Peak absurdity. Makes people ask "Congress did WHAT?"
10: Once-a-decade. Bridge to Nowhere, Pizza as Vegetable level.

IMPORTANT: "Boring" bills can score HIGH for META-ABSURDITY:
- Congress naming its 47th post office this session = absurd PRIORITIES
- Commemorative resolutions while infrastructure crumbles = absurd OPTICS
- $2T appropriations bill with 48 hours to read = absurd PROCESS
Score the SYSTEM, not just the bill text.

CATEGORIES (pick one):
extreme-waste | omnibus-abuse | industry-capture | political-theater |
acronym-bill | process-absurdity | geographic-pork | scale-mismatch |
zombie-legislation | midnight-rider | tone-deaf | misplaced-priorities | other

Respond in this exact format (no extra text before or after):
SCORE: [1-10]
CATEGORY: [from list above]
EXPLANATION: [2-3 sentences]
ANGLE: [One punchy sentence — the satirical hook]`;

export class AbsurdityScorer {
  private client: Anthropic;
  private log = getLogger();

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async score(bill: {
    title: string;
    billNumber: string;
    congress: number;
    sponsor: string;
    sponsorParty: string;
    sponsorState: string;
    policyArea: string;
    subjects: string[];
    latestAction: string;
    latestActionDate: string;
    cosponsorCount: number;
    summaryText: string;
  }): Promise<ScoringResult> {
    const userPrompt = `BILL:
Title: ${bill.title}
Number: ${bill.billNumber} (${bill.congress}th Congress)
Sponsor: ${bill.sponsor} (${bill.sponsorParty}-${bill.sponsorState})
Policy Area: ${bill.policyArea || 'Not specified'}
Subjects: ${bill.subjects.length > 0 ? bill.subjects.join(', ') : 'None listed'}
Latest Action: ${bill.latestAction} (${bill.latestActionDate})
Cosponsors: ${bill.cosponsorCount}
Summary: ${bill.summaryText || 'Not available'}`;

    this.log.debug({ title: bill.title }, 'Scoring bill');

    const response = await this.client.messages.create({
      model: SCORER_MODEL,
      max_tokens: 512,
      system: SCORING_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock?.text ?? '';

    return {
      ...parseScoreResponse(text),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

function parseScoreResponse(text: string): Omit<ScoringResult, 'inputTokens' | 'outputTokens'> {
  const scoreMatch = text.match(/SCORE:\s*(\d+)/);
  const categoryMatch = text.match(/CATEGORY:\s*(\S+)/);
  const explanationMatch = text.match(/EXPLANATION:\s*([\s\S]*?)(?=\nANGLE:)/);
  const angleMatch = text.match(/ANGLE:\s*([\s\S]*)/);

  return {
    score: scoreMatch?.[1] ? Math.min(10, Math.max(1, parseInt(scoreMatch[1], 10))) : 1,
    category: categoryMatch?.[1]?.trim() || 'other',
    explanation: explanationMatch?.[1]?.trim() || '',
    angle: angleMatch?.[1]?.trim() || '',
  };
}
