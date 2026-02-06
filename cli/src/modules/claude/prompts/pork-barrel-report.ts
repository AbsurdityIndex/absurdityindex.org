import { SYSTEM_CONTEXT } from './system-context.js';
import type { PromptContext } from './index.js';

export function buildPorkBarrelReport(context: PromptContext): { system: string; user: string } {
  const bill = context.bill;

  return {
    system: SYSTEM_CONTEXT,
    user: `Write a satirical "pork barrel report" tweet (under 280 characters) highlighting wasteful or absurd government spending.

${bill ? `BILL: ${bill.billNumber} — "${bill.title}"` : ''}
${bill?.totalPork ? `TOTAL PORK: $${bill.totalPork.toLocaleString()}` : ''}
${bill?.porkPerCapita ? `PORK PER CAPITA: $${bill.porkPerCapita.toFixed(2)}` : ''}
${context.additionalContext ? `SPENDING DETAIL: ${context.additionalContext}` : ''}
${context.siteUrl ? `LINK: ${context.siteUrl}` : ''}
${context.sourceLinks?.length ? `SOURCE LINKS (include these as proof):\n${context.sourceLinks.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : ''}
${context.overlapContext ? `\n${context.overlapContext}` : ''}

Format: "🐷 PORK REPORT:" opener
Style: "Your tax dollars at work" — deadpan itemization of how money is being spent.
Always end with #PorkReport

The humor comes from the REAL numbers and REAL spending items being inherently absurd. Don't exaggerate the numbers — the truth is funny enough.
EVERY factual claim and spending figure MUST be backed by a source link. No unsourced numbers.

Respond with ONLY the tweet text, nothing else.`,
  };
}
