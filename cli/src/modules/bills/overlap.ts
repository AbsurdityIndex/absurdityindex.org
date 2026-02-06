import type Database from 'better-sqlite3';
import type { LoadedBill } from './loader.js';
import type { ClaudeClient, SafetyAnalysisResult } from '../claude/client.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger();

// ---------- Types ----------

export interface OverlapCandidate {
  bill: LoadedBill;
  score: number;
  signals: string[];
}

export interface OverlapAnalysis {
  candidateSlug: string;
  candidateBillNumber: string;
  similarityPct: number;
  relationship: string;
  sharedProvisions: string;
}

export interface OverlapResult {
  candidates: OverlapCandidate[];
  analyses: OverlapAnalysis[];
  /** Pre-formatted context string ready to inject into prompts */
  overlapContext: string;
  /** Token usage from Tier 2 Claude calls (for cost tracking) */
  apiCalls: SafetyAnalysisResult[];
}

// ---------- Tier 1: Fast heuristic scoring ----------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with',
  'is', 'at', 'by', 'from', 'as', 'act', 'bill', 'be', 'this', 'that',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

/**
 * Tier 1: Score all bills against a target using fast heuristics (no API).
 * Returns candidates with score >= 25, capped at 5.
 */
export function findOverlapCandidates(target: LoadedBill, allBills: LoadedBill[]): OverlapCandidate[] {
  const targetTitleTokens = tokenize(target.title);
  const targetTags = new Set(target.tags);
  const relatedSlugs = new Set(
    (target.relatedBills ?? []).map(rb => {
      // Try to match related bill number to a slug in allBills
      const match = allBills.find(b => b.billNumber === rb.billNumber);
      return match?.slug;
    }).filter(Boolean) as string[],
  );

  const candidates: OverlapCandidate[] = [];

  for (const bill of allBills) {
    if (bill.slug === target.slug) continue;

    let score = 0;
    const signals: string[] = [];

    // Signal: In relatedBills array (+30)
    if (relatedSlugs.has(bill.slug)) {
      score += 30;
      signals.push('relatedBills');
    }

    // Signal: Same sponsor (+20)
    if (bill.sponsor && target.sponsor && bill.sponsor === target.sponsor) {
      score += 20;
      signals.push('same sponsor');
    }

    // Signal: Title keyword overlap (Jaccard * 25)
    const billTitleTokens = tokenize(bill.title);
    const titleJaccard = jaccard(targetTitleTokens, billTitleTokens);
    const titlePoints = Math.round(titleJaccard * 25);
    if (titlePoints > 0) {
      score += titlePoints;
      signals.push(`title overlap (${Math.round(titleJaccard * 100)}%)`);
    }

    // Signal: Shared tags (Jaccard * 30)
    const billTags = new Set(bill.tags);
    const tagJaccard = jaccard(targetTags, billTags);
    const tagPoints = Math.round(tagJaccard * 30);
    if (tagPoints > 0) {
      score += tagPoints;
      signals.push(`shared tags (${Math.round(tagJaccard * 100)}%)`);
    }

    // Signal: Same category + same party (+10)
    if (
      bill.category && target.category &&
      bill.category === target.category &&
      bill.sponsorParty && target.sponsorParty &&
      bill.sponsorParty === target.sponsorParty
    ) {
      score += 10;
      signals.push('same category+party');
    }

    if (score >= 25) {
      candidates.push({ bill, score, signals });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ---------- Tier 2: Claude confirmation ----------

/**
 * Tier 2: Use Claude Sonnet to analyze overlap between target and candidates.
 * Results are cached in the overlap_cache table.
 */
export async function analyzeOverlap(
  target: LoadedBill,
  candidates: OverlapCandidate[],
  claude: ClaudeClient,
  db?: Database.Database,
): Promise<{ analyses: OverlapAnalysis[]; apiCalls: SafetyAnalysisResult[] }> {
  if (candidates.length === 0) return { analyses: [], apiCalls: [] };

  const analyses: OverlapAnalysis[] = [];
  const apiCalls: SafetyAnalysisResult[] = [];

  // Check cache first
  const cached = new Map<string, OverlapAnalysis>();
  if (db) {
    const rows = db.prepare(
      `SELECT * FROM overlap_cache WHERE target_slug = ? AND analyzed_at >= datetime('now', '-7 days')`
    ).all(target.slug) as Array<{
      target_slug: string;
      candidate_slug: string;
      similarity_pct: number;
      relationship: string;
      shared_provisions: string;
    }>;
    for (const row of rows) {
      const candidate = candidates.find(c => c.bill.slug === row.candidate_slug);
      if (candidate) {
        cached.set(row.candidate_slug, {
          candidateSlug: row.candidate_slug,
          candidateBillNumber: candidate.bill.billNumber,
          similarityPct: row.similarity_pct,
          relationship: row.relationship,
          sharedProvisions: row.shared_provisions,
        });
      }
    }
  }

  // Analyze uncached candidates
  const uncached = candidates.filter(c => !cached.has(c.bill.slug));
  if (uncached.length > 0) {
    const candidateList = uncached.map((c, i) =>
      `${i + 1}. ${c.bill.billNumber} — "${c.bill.title}"\n   Sponsor: ${c.bill.sponsor}\n   Summary: ${c.bill.summary}`
    ).join('\n\n');

    const result = await claude.analyzeSafety(
      `TARGET BILL: ${target.billNumber} — "${target.title}"\nSponsor: ${target.sponsor}\nSummary: ${target.summary}`,
      `Compare this bill to the following candidates for legislative overlap.

CANDIDATES:
${candidateList}

For each candidate, respond in this exact format (one block per candidate):
CANDIDATE: [number]
SIMILARITY: [0-100]
RELATIONSHIP: [Reintroduction | Companion | Same policy area | Loosely related]
PROVISIONS: [One sentence describing shared provisions]

Only include candidates with similarity >= 20.`,
    );
    apiCalls.push(result);

    // Parse response
    const blocks = result.text.split(/CANDIDATE:\s*/);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const numMatch = block.match(/^(\d+)/);
      const simMatch = block.match(/SIMILARITY:\s*(\d+)/);
      const relMatch = block.match(/RELATIONSHIP:\s*(.+)/);
      const provMatch = block.match(/PROVISIONS:\s*(.+)/);

      if (numMatch && simMatch) {
        const idx = parseInt(numMatch[1]!, 10) - 1;
        const candidate = uncached[idx];
        if (candidate) {
          const analysis: OverlapAnalysis = {
            candidateSlug: candidate.bill.slug,
            candidateBillNumber: candidate.bill.billNumber,
            similarityPct: Math.min(parseInt(simMatch[1]!, 10), 100),
            relationship: relMatch?.[1]?.trim() ?? 'Unknown',
            sharedProvisions: provMatch?.[1]?.trim() ?? '',
          };
          analyses.push(analysis);

          // Cache result
          if (db) {
            db.prepare(`
              INSERT OR REPLACE INTO overlap_cache (target_slug, candidate_slug, similarity_pct, relationship, shared_provisions)
              VALUES (?, ?, ?, ?, ?)
            `).run(target.slug, candidate.bill.slug, analysis.similarityPct, analysis.relationship, analysis.sharedProvisions);
          }
        }
      }
    }
  }

  // Merge cached + fresh
  for (const [, analysis] of cached) {
    analyses.push(analysis);
  }

  // Sort by similarity descending
  analyses.sort((a, b) => b.similarityPct - a.similarityPct);

  return { analyses, apiCalls };
}

// ---------- Build overlap context string ----------

/**
 * Format overlap results into a context string for prompt injection.
 */
export function buildOverlapContext(analyses: OverlapAnalysis[]): string {
  if (analyses.length === 0) return '';

  const lines = analyses
    .filter(a => a.similarityPct >= 30)
    .map(a => `- ${a.similarityPct}% similar to ${a.candidateBillNumber} (${a.relationship}): ${a.sharedProvisions}`);

  if (lines.length === 0) return '';

  return `LEGISLATIVE OVERLAP: This bill overlaps with existing legislation:\n${lines.join('\n')}\nUse this to highlight Congress reintroducing the same policies under new names.`;
}
