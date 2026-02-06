import { SYSTEM_CONTEXT } from './system-context.js';
import type { PromptContext } from './index.js';

export function buildBillRoast(context: PromptContext): { system: string; user: string } {
  const bill = context.bill;
  if (!bill) throw new Error('bill-roast requires a bill in context');

  return {
    system: SYSTEM_CONTEXT,
    user: `Write a single satirical tweet (under 280 characters) roasting this bill.

BILL: ${bill.billNumber} — "${bill.title}"
SPONSOR: ${bill.sponsor}
STATUS: ${bill.status}
SUMMARY: ${bill.summary}
${bill.totalPork ? `PORK: $${bill.totalPork.toLocaleString()} in pork spending` : ''}
${bill.absurdityIndex ? `ABSURDITY INDEX: ${bill.absurdityIndex}/10` : ''}
${bill.theGist ? `THE GIST: ${bill.theGist}` : ''}
${context.siteUrl ? `LINK: ${context.siteUrl}` : ''}
${context.sourceLinks?.length ? `SOURCE LINKS (include these as proof):\n${context.sourceLinks.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : ''}
${context.overlapContext ? `\n${context.overlapContext}` : ''}

Style: "Congress actually proposed a bill to [absurd thing]..." or similar opener.
The tweet should make someone stop scrolling, laugh, and click the link.
Include the link at the end if provided.
EVERY factual claim MUST be backed by a source link. No unsourced claims.

Respond with ONLY the tweet text, nothing else.`,
  };
}
