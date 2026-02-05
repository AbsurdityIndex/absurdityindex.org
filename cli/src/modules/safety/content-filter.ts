import { getLogger } from '../../utils/logger.js';

const log = getLogger();

// PII patterns
const PII_PATTERNS = [
  { name: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'phone', pattern: /\b\d{3}[-.)]\s?\d{3}[-.)]\s?\d{4}\b/ },
  { name: 'email', pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/ },
  { name: 'address', pattern: /\b\d{1,5}\s\w+\s(st|street|ave|avenue|blvd|boulevard|dr|drive|ln|lane|rd|road|ct|court)\b/i },
];

// Profanity (mild - catches broadcast-unsafe words)
const PROFANITY_PATTERNS = [
  /\bf+u+c+k/i,
  /\bs+h+i+t\b/i,
  /\ba+s+s+h+o+l+e/i,
  /\bb+i+t+c+h/i,
  /\bd+a+m+n+\b/i,
  /\bh+e+l+l+\b/i,
];

// Threat-adjacent language
const THREAT_PATTERNS = [
  /\b(gonna|going to|will|should)\s+(kill|hurt|attack|destroy)\b/i,
  /\b(deserve[s]?\s+to\s+die)\b/i,
  /\b(burn\s+it\s+down)\b/i,
];

export interface ContentFilterResult {
  score: number; // 0-20
  issues: string[];
}

export function checkContentFilter(content: string): ContentFilterResult {
  const issues: string[] = [];
  let score = 0;

  // PII check (high severity)
  for (const { name, pattern } of PII_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(`PII detected: ${name}`);
      score += 10;
    }
  }

  // Profanity check
  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(content)) {
      issues.push('Profanity detected');
      score += 5;
      break; // Only count once
    }
  }

  // Threat language check
  for (const pattern of THREAT_PATTERNS) {
    if (pattern.test(content)) {
      issues.push('Threat-adjacent language detected');
      score += 10;
      break;
    }
  }

  // Unverified claims check (phrases that suggest unverified info)
  const unverifiedPatterns = [
    /\bsources say\b/i,
    /\bI've heard\b/i,
    /\ballegedly\b/i,
    /\brumor has it\b/i,
  ];
  for (const pattern of unverifiedPatterns) {
    if (pattern.test(content)) {
      issues.push('Unverified claim language');
      score += 3;
      break;
    }
  }

  // Cap at 20
  score = Math.min(score, 20);

  if (issues.length > 0) {
    log.debug({ issues, score }, 'Content filter issues');
  }

  return { score, issues };
}
