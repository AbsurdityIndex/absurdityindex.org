/**
 * Predict viral potential of content based on heuristics.
 * Score 0-100 (higher = more likely to engage).
 */
export function scoreEngagement(content: string): number {
  let score = 50; // Base

  // Length sweet spot (100-200 chars)
  const len = content.length;
  if (len >= 100 && len <= 200) score += 10;
  else if (len < 50 || len > 270) score -= 10;

  // Question marks increase engagement
  if (content.includes('?')) score += 5;

  // Numbers/statistics catch eyes
  if (/\$[\d,.]+/.test(content)) score += 10;
  if (/\d+%/.test(content)) score += 5;

  // "BREAKING" or alert-style openers
  if (/^(BREAKING|🔔|🐷|C-SPAN)/i.test(content)) score += 10;

  // Hashtags (1-2 is optimal)
  const hashtagCount = (content.match(/#\w+/g) ?? []).length;
  if (hashtagCount === 1 || hashtagCount === 2) score += 5;
  if (hashtagCount > 3) score -= 10;

  // URL presence (drives traffic)
  if (/https?:\/\//.test(content)) score += 5;

  return Math.max(0, Math.min(100, score));
}
