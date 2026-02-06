export interface PrefilterResult {
  score: number;
  signals: string[];
  passed: boolean;
}

// ─── Spending keywords ─────────────────────────────────────────────────────
const SPENDING_PATTERNS = [
  /\$\d+\s*(billion|trillion|B|T)/i,
  /\bappropriat/i,
  /\bspending\b/i,
  /\bfunding\b/i,
  /\balloc(at|ation)/i,
];

// ─── Omnibus / CR keywords ─────────────────────────────────────────────────
const OMNIBUS_PATTERNS = [
  /\bomnibus\b/i,
  /\bcontinuing\s+resolution/i,
  /\bconsolidated\b/i,
  /\bminibus\b/i,
  /\bpackage\b/i,
];

// ─── Zombie bill patterns (keep showing up congress after congress) ────────
const ZOMBIE_PATTERNS = [
  /\bfair\s+tax/i,
  /\bterm\s+limits/i,
  /\bbalanced\s+budget/i,
  /\baudit\s+the\s+fed/i,
  /\babolish\s+(the\s+)?(irs|atf|epa|doe|ed)\b/i,
  /\bnational\s+right\s+to\s+work/i,
  /\bgold\s+standard/i,
  /\bflat\s+tax/i,
  /\brepeal\b.*\baffordable\s+care/i,
];

// ─── Process keywords ──────────────────────────────────────────────────────
const PROCESS_PATTERNS = [
  /\bwaiver\b/i,
  /\bexempt(ion)?\b/i,
  /\bemergency\s+(supplemental|spending|declaration)/i,
  /\bsuspension\s+of\s+the\s+rules/i,
];

// ─── Pork-prone policy areas ───────────────────────────────────────────────
const PORK_POLICY_AREAS = new Set([
  'Transportation and Public Works',
  'Armed Forces and National Security',
  'Agriculture and Food',
  'Water Resources Development',
  'Energy',
  'Public Lands and Natural Resources',
]);

// ─── Meta-absurdity: post office / commemorative ───────────────────────────
const POST_OFFICE_PATTERNS = [
  /\bdesignat(e|ing)\b.*\bpost(al)?\s+(office|facility|building)/i,
  /\bnam(e|ing)\b.*\bpost(al)?\s+(office|facility|building)/i,
  /\bpost\s+office\b.*\bdesignat/i,
];

const COMMEMORATIVE_PATTERNS = [
  /\bnational\b.*\b(day|week|month|year)\b/i,
  /\brecogniz(e|ing)\b.*\b(week|month|day|year|importance)\b/i,
  /\bawareness\b.*\b(day|week|month)\b/i,
  /\bcelebrat(e|ing)\b.*\b(day|week|month|anniversary)\b/i,
  /\bhonor(ing)?\b.*\b(day|week|month|legacy)\b/i,
];

const CEREMONIAL_PATTERNS = [
  /\brecogniz(e|ing)\s+the\b/i,
  /\bcongratulat(e|ing)\b/i,
  /\bcommemorat(e|ing)\b/i,
  /\bcommend(ing)?\b/i,
  /\bexpressing\s+(the\s+)?sense\s+of/i,
];

// ─── Truly boring (zero-signal) ────────────────────────────────────────────
const BORING_PATTERNS = [
  /\btechnical\s+correct(ion|ing)/i,
  /\bclerical\s+(amendment|correction)/i,
  /\bconforming\s+(amendment|change)/i,
];

/**
 * Detect "interesting" acronyms — 4+ consecutive capital letters in the title
 * that aren't standard abbreviations.
 */
const STANDARD_ABBREVS = new Set([
  'USA', 'THE', 'FOR', 'AND', 'ACT', 'SEC', 'IRS', 'EPA', 'FDA',
  'DOD', 'DOE', 'DOJ', 'HHS', 'DHS', 'HUD', 'USDA',
]);

function hasInterestingAcronym(title: string): boolean {
  const matches = title.match(/\b[A-Z]{4,}\b/g) || [];
  return matches.some(m => !STANDARD_ABBREVS.has(m));
}

/**
 * Detect late-night action (AM timestamps in action text).
 * Congress voting at 1:30 AM is a process-absurdity signal.
 */
function hasLateNightAction(actionText: string): boolean {
  // Look for time patterns like "1:30 AM", "2:15 a.m."
  return /\b([1-5]|12):\d{2}\s*(a\.?m\.?|AM)\b/i.test(actionText);
}

/**
 * Score a bill using heuristic signals.
 * This is a PRIORITY RANKER, not a reject filter.
 * Higher score = more likely to be interesting for satire.
 */
export function prefilterBill(
  title: string,
  policyArea: string,
  latestActionText: string,
  cosponsorCount: number,
  threshold: number,
): PrefilterResult {
  let score = 0;
  const signals: string[] = [];

  // Check for truly boring bills first (still scored, just low)
  for (const pat of BORING_PATTERNS) {
    if (pat.test(title)) {
      return { score: 0, signals: ['technical-correction'], passed: false };
    }
  }

  // Spending keywords (+15)
  for (const pat of SPENDING_PATTERNS) {
    if (pat.test(title) || pat.test(latestActionText)) {
      score += 15;
      signals.push('spending');
      break;
    }
  }

  // Omnibus / CR (+15)
  for (const pat of OMNIBUS_PATTERNS) {
    if (pat.test(title)) {
      score += 15;
      signals.push('omnibus');
      break;
    }
  }

  // Interesting acronyms (+10)
  if (hasInterestingAcronym(title)) {
    score += 10;
    signals.push('acronym');
  }

  // Zombie bills (+10)
  for (const pat of ZOMBIE_PATTERNS) {
    if (pat.test(title)) {
      score += 10;
      signals.push('zombie');
      break;
    }
  }

  // Process keywords (+5)
  for (const pat of PROCESS_PATTERNS) {
    if (pat.test(title) || pat.test(latestActionText)) {
      score += 5;
      signals.push('process');
      break;
    }
  }

  // Pork-prone policy areas (+10)
  if (PORK_POLICY_AREAS.has(policyArea)) {
    score += 10;
    signals.push('pork-area');
  }

  // Late-night action (+15)
  if (hasLateNightAction(latestActionText)) {
    score += 15;
    signals.push('late-night');
  }

  // High cosponsor count — everyone piling on (+10)
  if (cosponsorCount > 200) {
    score += 10;
    signals.push('cosponsor-pile');
  }

  // Zero cosponsors on a bill with a big title (+5)
  if (cosponsorCount === 0 && title.length > 80) {
    score += 5;
    signals.push('solo-big-bill');
  }

  // ─── Meta-absurdity signals ────────────────────────────────────────────

  // Post office / building naming (+8)
  for (const pat of POST_OFFICE_PATTERNS) {
    if (pat.test(title)) {
      score += 8;
      signals.push('post-office');
      break;
    }
  }

  // Commemorative days/weeks/months (+8)
  for (const pat of COMMEMORATIVE_PATTERNS) {
    if (pat.test(title)) {
      score += 8;
      signals.push('commemorative');
      break;
    }
  }

  // Ceremonial resolutions (+5)
  for (const pat of CEREMONIAL_PATTERNS) {
    if (pat.test(title)) {
      score += 5;
      signals.push('ceremonial');
      break;
    }
  }

  // If nothing matched, give a baseline score of 1 (not zero — that's reserved for boring)
  if (score === 0 && signals.length === 0) {
    score = 1;
    signals.push('baseline');
  }

  return {
    score,
    signals,
    passed: score >= threshold,
  };
}
