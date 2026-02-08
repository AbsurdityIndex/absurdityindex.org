import { getLogger } from '../../utils/logger.js';
import type { ScannedTweet } from './scanner.js';
import type { LoadedBill } from '../bills/loader.js';
import type { Config } from '../../config.js';
import type { RecommendedAction } from '../state/models/opportunities.js';

const log = getLogger();

/**
 * Tragedy/sensitive keywords that should prevent engagement.
 * Pre-filter before wasting Claude tokens.
 */
const TRAGEDY_KEYWORDS = [
  // Violence & crisis
  'shooting', 'massacre', 'killed', 'died', 'death toll', 'victims',
  'terrorist', 'terrorism', 'attack on', 'bomber',
  'hostage', 'stabbing', 'gunman',
  // Natural disasters
  'tornado', 'hurricane', 'earthquake', 'wildfire', 'flood', 'tsunami',
  // Death & mourning
  'RIP', 'rest in peace', 'thoughts and prayers', 'condolences',
  'suicide', 'overdose', 'passed away', 'mourning', 'funeral',
  // Health & medical — never dunk on someone's health crisis
  'premature baby', 'preemie', 'NICU', 'miscarriage', 'stillborn',
  'cancer', 'diagnosis', 'terminal', 'hospice', 'life support',
  'heart attack', 'stroke', 'seizure', 'hospitalized',
  'child abuse', 'abuse victim', 'domestic violence',
  // Children & vulnerable people
  'missing child', 'amber alert', 'child died', 'baby died',
  'foster care', 'orphan', 'homeless child',
  // War & conflict
  'war crime', 'genocide', 'refugee', 'ethnic cleansing', 'airstrike',
  'civilian casualties', 'displacement',
];

/**
 * Congressional / political keywords that boost relevance.
 */
const RELEVANCE_KEYWORDS = [
  'bill', 'vote', 'passed', 'congress', 'senate', 'house',
  'legislation', 'amendment', 'committee', 'hearing', 'markup',
  'spending', 'budget', 'appropriations', 'earmark', 'pork',
  'taxpayer', 'bipartisan', 'filibuster', 'cloture',
  'floor vote', 'roll call', 'cosponsor', 'introduced',
];

/**
 * Known congressional account usernames for relevance boosting.
 */
const CONGRESSIONAL_ACCOUNTS = new Set([
  'housefloor', 'senatefloor', 'speakerjohnson', 'senschumer',
  'leadermcconnell', 'whitehouse', 'potus', 'uscongress',
  'housegop', 'housedems', 'senategop', 'senatedems',
  'caborepublicans', 'clikirgop', 'usgao', 'caborepublicans',
  'haborepublicans',
]);

export interface ScoreReasons {
  viral: string[];
  relevance: string[];
  timing: string[];
  engageability: string[];
  action: string;
}

export interface OpportunityScore {
  total: number;
  viral: number;
  relevance: number;
  timing: number;
  engageability: number;
  recommendedAction: RecommendedAction;
  matchedBillSlug: string | null;
  matchedKeywords: string[];
  skipReason: string | null;
  reasons: ScoreReasons;
}

/**
 * Score a tweet as an engagement opportunity (0-100).
 */
export function scoreOpportunity(
  tweet: ScannedTweet,
  bills: LoadedBill[],
  config: Config,
): OpportunityScore {
  const textLower = tweet.text.toLowerCase();

  // Pre-filter: tragedy check
  for (const keyword of TRAGEDY_KEYWORDS) {
    if (textLower.includes(keyword.toLowerCase())) {
      return {
        total: 0,
        viral: 0,
        relevance: 0,
        timing: 0,
        engageability: 0,
        recommendedAction: 'skip',
        matchedBillSlug: null,
        matchedKeywords: [],
        skipReason: `Tragedy keyword detected: "${keyword}"`,
        reasons: {
          viral: [], relevance: [], timing: [], engageability: [],
          action: `tragedy keyword: "${keyword}"`,
        },
      };
    }
  }

  const viralResult = scoreViral(tweet);
  const relevanceResult = scoreRelevance(tweet, bills);
  const timingResult = scoreTiming(tweet, config);
  const engageabilityResult = scoreEngageability(tweet);

  const viral = viralResult.score;
  const relevance = relevanceResult.score;
  const timing = timingResult.score;
  const engageability = engageabilityResult.score;
  const { matchedBillSlug, matchedKeywords } = relevanceResult;

  const total = viral + relevance + timing + engageability;

  let recommendedAction: RecommendedAction;
  let actionReason: string;
  if (total >= config.engageMinScore) {
    recommendedAction = matchedBillSlug ? 'quote' : 'reply';
    actionReason = `${total} >= ${config.engageMinScore} engage threshold` + (matchedBillSlug ? ` (bill match: ${recommendedAction})` : '');
  } else if (total >= config.engageTrackThreshold) {
    recommendedAction = 'track';
    actionReason = `${total} >= ${config.engageTrackThreshold} track threshold, < ${config.engageMinScore} engage`;
  } else {
    recommendedAction = 'skip';
    actionReason = `${total} < ${config.engageTrackThreshold} track threshold`;
  }

  log.debug(
    { tweetId: tweet.id, total, viral, relevance, timing, engageability, action: recommendedAction },
    'Scored opportunity'
  );

  return {
    total,
    viral,
    relevance,
    timing,
    engageability,
    recommendedAction,
    matchedBillSlug,
    matchedKeywords,
    skipReason: null,
    reasons: {
      viral: viralResult.reasons,
      relevance: relevanceResult.reasons,
      timing: timingResult.reasons,
      engageability: engageabilityResult.reasons,
      action: actionReason,
    },
  };
}

/**
 * Viral Potential (0-30): How much traction does this tweet have?
 */
function scoreViral(tweet: ScannedTweet): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Likes thresholds
  if (tweet.likes >= 1000) { score += 10; reasons.push(`${tweet.likes} likes (1k+)`); }
  else if (tweet.likes >= 100) { score += 6; reasons.push(`${tweet.likes} likes (100+)`); }
  else if (tweet.likes >= 20) { score += 3; reasons.push(`${tweet.likes} likes (20+)`); }

  // Retweets thresholds
  if (tweet.retweets >= 500) { score += 10; reasons.push(`${tweet.retweets} RTs (500+)`); }
  else if (tweet.retweets >= 50) { score += 6; reasons.push(`${tweet.retweets} RTs (50+)`); }
  else if (tweet.retweets >= 10) { score += 3; reasons.push(`${tweet.retweets} RTs (10+)`); }

  // Replies (high reply count = controversial = engagement magnet)
  if (tweet.replies >= 200) { score += 10; reasons.push(`${tweet.replies} replies (200+)`); }
  else if (tweet.replies >= 50) { score += 6; reasons.push(`${tweet.replies} replies (50+)`); }
  else if (tweet.replies >= 10) { score += 3; reasons.push(`${tweet.replies} replies (10+)`); }

  if (reasons.length === 0) reasons.push('low traction');

  return { score: Math.min(score, 30), reasons };
}

/**
 * Relevance Fit (0-30): How well does this tweet fit our satirical niche?
 */
function scoreRelevance(
  tweet: ScannedTweet,
  bills: LoadedBill[],
): { score: number; matchedBillSlug: string | null; matchedKeywords: string[]; reasons: string[] } {
  const textLower = tweet.text.toLowerCase();
  let score = 0;
  const matchedKeywords: string[] = [];
  const reasons: string[] = [];
  let matchedBillSlug: string | null = null;

  // Congressional account boost
  if (CONGRESSIONAL_ACCOUNTS.has(tweet.authorUsername.toLowerCase())) {
    score += 10;
    matchedKeywords.push('congressional_account');
    reasons.push('congressional account');
  }

  // Keyword matching
  const kwMatched: string[] = [];
  for (const keyword of RELEVANCE_KEYWORDS) {
    if (textLower.includes(keyword.toLowerCase())) {
      score += 3;
      matchedKeywords.push(keyword);
      kwMatched.push(keyword);
      if (matchedKeywords.length >= 5) break; // Cap keyword contribution
    }
  }
  if (kwMatched.length > 0) reasons.push('keywords: ' + kwMatched.join(', '));

  // Bill matching — only match real bills (sensible/absurd are satirical fiction)
  const realBills = bills.filter(b => b.billType === 'real');
  for (const bill of realBills) {
    const billLower = bill.title.toLowerCase();
    const titleWords = billLower.split(/\s+/).filter(w => w.length > 4);

    // Check if tweet mentions bill number
    if (bill.billNumber && textLower.includes(bill.billNumber.toLowerCase())) {
      score += 10;
      matchedBillSlug = bill.slug;
      matchedKeywords.push(`bill:${bill.billNumber}`);
      reasons.push('mentions ' + bill.billNumber);
      break;
    }

    // Check for significant title word overlap
    let titleMatches = 0;
    for (const word of titleWords) {
      if (textLower.includes(word)) titleMatches++;
    }
    if (titleMatches >= 3) {
      score += 8;
      matchedBillSlug = bill.slug;
      matchedKeywords.push(`bill_title:${bill.slug}`);
      reasons.push('matches bill: ' + bill.slug);
      break;
    }
  }

  if (reasons.length === 0) reasons.push('no strong signals');

  return { score: Math.min(score, 30), matchedBillSlug, matchedKeywords, reasons };
}

/**
 * Timing Window (0-20): Is this tweet fresh and in peak hours?
 */
function scoreTiming(tweet: ScannedTweet, config: Config): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Tweet age
  if (tweet.createdAt) {
    const ageMs = Date.now() - new Date(tweet.createdAt).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours < 1) { score += 12; reasons.push('<1h old'); }
    else if (ageHours < 3) { score += 8; reasons.push('<3h old'); }
    else if (ageHours < 6) { score += 4; reasons.push('<6h old'); }
    else if (ageHours < 12) { score += 2; reasons.push('<12h old'); }
    else { reasons.push('>12h old'); }
  } else {
    score += 4;
    reasons.push('age unknown');
  }

  // Current hour (peak engagement hours)
  const hour = new Date().getHours();
  if (hour >= config.peakHoursStart && hour <= config.peakHoursEnd) {
    score += 8;
    reasons.push('peak hours');
  } else if (hour >= config.peakHoursStart - 1 || hour <= config.peakHoursEnd + 1) {
    score += 4;
    reasons.push('near-peak hours');
  } else {
    reasons.push('off-peak');
  }

  return { score: Math.min(score, 20), reasons };
}

/**
 * Engageability (0-20): Can we actually make something funny out of this?
 */
function scoreEngageability(tweet: ScannedTweet): { score: number; reasons: string[] } {
  const textLower = tweet.text.toLowerCase();
  let score = 10; // Base score — most tweets have some potential
  const reasons: string[] = ['base 10'];

  // Boost: contains quotable rhetoric
  const rhetoricPhrases = [
    'the american people', 'bipartisan', 'historic', 'unprecedented',
    'common sense', 'working families', 'kitchen table', 'my colleagues',
  ];
  for (const phrase of rhetoricPhrases) {
    if (textLower.includes(phrase)) {
      score += 3;
      reasons.push('rhetoric: "' + phrase + '"');
      break; // Only count once
    }
  }

  // Boost: self-congratulatory
  if (textLower.includes('proud') || textLower.includes('honored') || textLower.includes('pleased to announce')) {
    score += 3;
    reasons.push('self-congratulatory');
  }

  // Boost: contains numbers (spending, votes, days)
  if (/\$[\d,.]+/.test(tweet.text) || /\d+ (billion|million|trillion)/.test(textLower)) {
    score += 4;
    reasons.push('$ amounts');
  }

  // Penalty: too short (not enough material)
  if (tweet.text.length < 40) { score -= 5; reasons.push('too short (<40 chars)'); }

  // Penalty: media-only (image/video with little text)
  if (tweet.text.length < 20) { score -= 5; reasons.push('media-only (<20 chars)'); }

  // Penalty: retweet / share (not original content)
  if (textLower.startsWith('rt @')) { score -= 10; reasons.push('retweet'); }

  return { score: Math.max(0, Math.min(score, 20)), reasons };
}
