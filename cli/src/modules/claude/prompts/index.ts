import { buildBillRoast } from './bill-roast.js';
import { buildTrendJack } from './trend-jack.js';
import { buildQuoteDunk } from './quote-dunk.js';
import { buildCspanAfterDark } from './cspan-after-dark.js';
import { buildPorkBarrelReport } from './pork-barrel-report.js';
import { buildFloorSpeech } from './floor-speech.js';
import { buildReplyDunk } from './reply-dunk.js';
import { buildEngagementEvaluate } from './engagement-evaluate.js';

export type PromptType =
  | 'bill-roast'
  | 'trend-jack'
  | 'quote-dunk'
  | 'cspan-after-dark'
  | 'pork-barrel-report'
  | 'floor-speech'
  | 'reply-dunk'
  | 'engagement-evaluate';

export interface BillContext {
  billNumber: string;
  title: string;
  sponsor: string;
  status: string;
  summary: string;
  totalPork?: number;
  porkPerCapita?: number;
  absurdityIndex?: number;
  theGist?: string;
  billType: 'sensible' | 'absurd' | 'real';
  slug: string;
}

export interface PromptContext {
  bill?: BillContext;
  topic?: string;
  trendTopic?: string;
  quoteTweetText?: string;
  quoteTweetAuthor?: string;
  additionalContext?: string;
  siteUrl?: string;
  /** Proof links for factual claims — every claim must be backed by a URL */
  sourceLinks?: string[];
  /** Pre-formatted legislative overlap context injected by overlap detection */
  overlapContext?: string;
}

type PromptBuilder = (context: PromptContext) => { system: string; user: string };

const PROMPT_REGISTRY: Record<PromptType, PromptBuilder> = {
  'bill-roast': buildBillRoast,
  'trend-jack': buildTrendJack,
  'quote-dunk': buildQuoteDunk,
  'cspan-after-dark': buildCspanAfterDark,
  'pork-barrel-report': buildPorkBarrelReport,
  'floor-speech': buildFloorSpeech,
  'reply-dunk': buildReplyDunk,
  'engagement-evaluate': buildEngagementEvaluate,
};

export function getPrompt(type: PromptType, context: PromptContext): { system: string; user: string } {
  const builder = PROMPT_REGISTRY[type];
  if (!builder) throw new Error(`Unknown prompt type: ${type}`);
  return builder(context);
}

export const ALL_PROMPT_TYPES: PromptType[] = Object.keys(PROMPT_REGISTRY) as PromptType[];
