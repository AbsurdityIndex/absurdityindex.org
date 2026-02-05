/**
 * Score how well a topic fits the "congressional satire" niche.
 * Score 0-100 (higher = better fit).
 */

const HIGH_RELEVANCE_KEYWORDS = [
  'bill', 'congress', 'senate', 'house', 'vote', 'legislation',
  'spending', 'budget', 'earmark', 'pork', 'appropriation',
  'committee', 'hearing', 'filibuster', 'amendment', 'rider',
  'lobbyist', 'lobbying', 'campaign finance', 'super pac',
  'government shutdown', 'debt ceiling', 'continuing resolution',
  'omnibus', 'reconciliation', 'cloture',
];

const MEDIUM_RELEVANCE_KEYWORDS = [
  'president', 'white house', 'executive order', 'veto',
  'democrat', 'republican', 'bipartisan', 'partisan',
  'policy', 'regulation', 'agency', 'federal',
  'tax', 'healthcare', 'infrastructure', 'defense',
];

export function scoreRelevance(topic: string, sources: string[]): number {
  let score = 30; // Base
  const lower = topic.toLowerCase();

  // Keyword matching
  for (const keyword of HIGH_RELEVANCE_KEYWORDS) {
    if (lower.includes(keyword)) {
      score += 20;
      break;
    }
  }
  for (const keyword of MEDIUM_RELEVANCE_KEYWORDS) {
    if (lower.includes(keyword)) {
      score += 10;
      break;
    }
  }

  // Source bonus
  if (sources.includes('congress-watch')) score += 25;
  if (sources.includes('rss')) score += 10;
  if (sources.includes('x-trends')) score += 5;

  // Multi-source bonus
  if (sources.length > 1) score += 15;

  return Math.max(0, Math.min(100, score));
}
