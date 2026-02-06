import { SYSTEM_CONTEXT } from './system-context.js';
import type { PromptContext } from './index.js';

export function buildFloorSpeech(context: PromptContext): { system: string; user: string } {
  return {
    system: SYSTEM_CONTEXT,
    user: `Write a mock congressional floor speech as a thread (3-5 tweets, each under 280 characters).

TOPIC: ${context.topic ?? context.trendTopic ?? 'General congressional absurdity'}
${context.bill ? `BILL: ${context.bill.billNumber} — "${context.bill.title}"` : ''}
${context.additionalContext ? `CONTEXT: ${context.additionalContext}` : ''}
${context.siteUrl ? `LINK: ${context.siteUrl}` : ''}
${context.sourceLinks?.length ? `SOURCE LINKS (include these as proof):\n${context.sourceLinks.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : ''}
${context.overlapContext ? `\n${context.overlapContext}` : ''}

Format: Write as if a fictional senator/representative is giving an impassioned floor speech. Each tweet should be numbered (1/N).

Style:
- Start with "Mr./Madam Speaker/President, I rise today to..."
- Build from reasonable-sounding to absurd
- Use the cadence and rhetoric of real floor speeches
- The humor comes from applying grand oratory to trivial or absurd legislative content
- End with a callback to absurdityindex.org
- Any factual claims referenced in the speech MUST be backed by source links in the final tweet of the thread

Respond with each tweet on its own line, separated by "---". Number them 1/N format.`,
  };
}
