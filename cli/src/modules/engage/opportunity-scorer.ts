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
      };
    }
  }

  const viral = scoreViral(tweet);
  const { score: relevance, matchedBillSlug, matchedKeywords } = scoreRelevance(tweet, bills);
  const timing = scoreTiming(tweet, config);
  const engageability = scoreEngageability(tweet);

  const total = viral + relevance + timing + engageability;

  let recommendedAction: RecommendedAction;
  if (total >= config.engageMinScore) {
    // High score: engage. Quote if we have a bill match, reply otherwise.
    recommendedAction = matchedBillSlug ? 'quote' : 'reply';
  } else if (total >= config.engageTrackThreshold) {
    recommendedAction = 'track';
  } else {
    recommendedAction = 'skip';
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
  };
}

/**
 * Viral Potential (0-30): How much traction does this tweet have?
 */
function scoreViral(tweet: ScannedTweet): number {
  let score = 0;

  // Likes thresholds
  if (tweet.likes >= 1000) score += 10;
  else if (tweet.likes >= 100) score += 6;
  else if (tweet.likes >= 20) score += 3;

  // Retweets thresholds
  if (tweet.retweets >= 500) score += 10;
  else if (tweet.retweets >= 50) score += 6;
  else if (tweet.retweets >= 10) score += 3;

  // Replies (high reply count = controversial = engagement magnet)
  if (tweet.replies >= 200) score += 10;
  else if (tweet.replies >= 50) score += 6;
  else if (tweet.replies >= 10) score += 3;

  return Math.min(score, 30);
}

/**
 * Relevance Fit (0-30): How well does this tweet fit our satirical niche?
 */
function scoreRelevance(
  tweet: ScannedTweet,
  bills: LoadedBill[],
): { score: number; matchedBillSlug: string | null; matchedKeywords: string[] } {
  const textLower = tweet.text.toLowerCase();
  let score = 0;
  const matchedKeywords: string[] = [];
  let matchedBillSlug: string | null = null;

  // Congressional account boost
  if (CONGRESSIONAL_ACCOUNTS.has(tweet.authorUsername.toLowerCase())) {
    score += 10;
    matchedKeywords.push('congressional_account');
  }

  // Keyword matching
  for (const keyword of RELEVANCE_KEYWORDS) {
    if (textLower.includes(keyword.toLowerCase())) {
      score += 3;
      matchedKeywords.push(keyword);
      if (matchedKeywords.length >= 5) break; // Cap keyword contribution
    }
  }

  // Bill matching — check if tweet mentions a bill we cover
  for (const bill of bills) {
    const billLower = bill.title.toLowerCase();
    const titleWords = billLower.split(/\s+/).filter(w => w.length > 4);

    // Check if tweet mentions bill number
    if (bill.billNumber && textLower.includes(bill.billNumber.toLowerCase())) {
      score += 10;
      matchedBillSlug = bill.slug;
      matchedKeywords.push(`bill:${bill.billNumber}`);
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
      break;
    }
  }

  return { score: Math.min(score, 30), matchedBillSlug, matchedKeywords };
}

/**
 * Timing Window (0-20): Is this tweet fresh and in peak hours?
 */
function scoreTiming(tweet: ScannedTweet, config: Config): number {
  let score = 0;

  // Tweet age
  if (tweet.createdAt) {
    const ageMs = Date.now() - new Date(tweet.createdAt).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours < 1) score += 12;
    else if (ageHours < 3) score += 8;
    else if (ageHours < 6) score += 4;
    else if (ageHours < 12) score += 2;
    // Older than 12h gets 0
  } else {
    score += 4; // Unknown age, assume moderate freshness
  }

  // Current hour (peak engagement hours)
  const hour = new Date().getHours();
  if (hour >= config.peakHoursStart && hour <= config.peakHoursEnd) {
    score += 8;
  } else if (hour >= config.peakHoursStart - 1 || hour <= config.peakHoursEnd + 1) {
    score += 4; // Near-peak
  }

  return Math.min(score, 20);
}

/**
 * Engageability (0-20): Can we actually make something funny out of this?
 */
function scoreEngageability(tweet: ScannedTweet): number {
  const textLower = tweet.text.toLowerCase();
  let score = 10; // Base score — most tweets have some potential

  // Boost: contains quotable rhetoric
  const rhetoricPhrases = [
    'the american people', 'bipartisan', 'historic', 'unprecedented',
    'common sense', 'working families', 'kitchen table', 'my colleagues',
  ];
  for (const phrase of rhetoricPhrases) {
    if (textLower.includes(phrase)) {
      score += 3;
      break; // Only count once
    }
  }

  // Boost: self-congratulatory
  if (textLower.includes('proud') || textLower.includes('honored') || textLower.includes('pleased to announce')) {
    score += 3;
  }

  // Boost: contains numbers (spending, votes, days)
  if (/\$[\d,.]+/.test(tweet.text) || /\d+ (billion|million|trillion)/.test(textLower)) {
    score += 4; // Dollar amounts are comedy gold
  }

  // Penalty: too short (not enough material)
  if (tweet.text.length < 40) score -= 5;

  // Penalty: media-only (image/video with little text)
  if (tweet.text.length < 20) score -= 5;

  // Penalty: retweet / share (not original content)
  if (textLower.startsWith('rt @')) score -= 10;

  return Math.max(0, Math.min(score, 20));
}
