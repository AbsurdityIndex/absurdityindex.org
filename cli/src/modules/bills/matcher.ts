import { getLogger } from '../../utils/logger.js';
import type { LoadedBill } from './loader.js';
import type { AggregatedTrend } from '../trending/aggregator.js';

const log = getLogger();

export interface BillMatch {
  bill: LoadedBill;
  score: number;
  matchedTerms: string[];
}

/**
 * Match a trending topic to bills from the site.
 * Returns bills sorted by match quality.
 */
export function matchTrendToBills(trend: AggregatedTrend, bills: LoadedBill[]): BillMatch[] {
  const matches: BillMatch[] = [];
  const trendWords = trend.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  for (const bill of bills) {
    let score = 0;
    const matchedTerms: string[] = [];

    // Check title match
    const titleLower = bill.title.toLowerCase();
    for (const word of trendWords) {
      if (titleLower.includes(word)) {
        score += 20;
        matchedTerms.push(`title:${word}`);
      }
    }

    // Check tags match
    for (const tag of bill.tags) {
      const tagLower = tag.toLowerCase();
      for (const word of trendWords) {
        if (tagLower.includes(word)) {
          score += 15;
          matchedTerms.push(`tag:${tag}`);
        }
      }
    }

    // Check category match
    for (const word of trendWords) {
      if (bill.category.toLowerCase().includes(word)) {
        score += 10;
        matchedTerms.push(`category:${bill.category}`);
      }
    }

    // Check summary match
    const summaryLower = bill.summary.toLowerCase();
    for (const word of trendWords) {
      if (summaryLower.includes(word)) {
        score += 5;
        matchedTerms.push(`summary:${word}`);
      }
    }

    // Boost bills with higher absurdity (funnier)
    if (bill.absurdityIndex) {
      score += bill.absurdityIndex * 2;
    }

    // Boost featured bills
    if (bill.featured) score += 10;

    // Boost bills with pork data (more material)
    if ((bill.totalPork ?? 0) > 0) score += 10;

    if (score > 0) {
      matches.push({ bill, score, matchedTerms });
    }
  }

  const sorted = matches.sort((a, b) => b.score - a.score);

  if (sorted.length > 0) {
    log.debug(
      { trend: trend.topic, topMatch: sorted[0]!.bill.slug, score: sorted[0]!.score },
      'Bill match found'
    );
  }

  return sorted;
}
