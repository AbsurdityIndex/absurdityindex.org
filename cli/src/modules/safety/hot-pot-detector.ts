import { getLogger } from '../../utils/logger.js';
import { checkBlocklist } from './blocklist.js';
import { checkContentFilter } from './content-filter.js';
import { checkPartisanLean } from './partisan-lean.js';
import { checkTragedyRadar } from './tragedy-radar.js';
import type { ClaudeClient } from '../claude/client.js';
import type { Config } from '../../config.js';

const log = getLogger();

export type SafetyVerdict = 'SAFE' | 'REVIEW' | 'REJECT';

export interface SafetyResult {
  score: number;
  verdict: SafetyVerdict;
  layers: {
    blocklist: number;
    tragedyRadar: number;
    partisanLean: number;
    toxicity: number;
    contentQuality: number;
  };
  reasons: string[];
  partisanLean?: number;
}

interface HotPotOptions {
  content: string;
  claude: ClaudeClient;
  config: Config;
  recentTrends?: string[];
}

/**
 * The Hot Pot Detector: 5-layer safety scoring system.
 *
 * Score 0-100 (lower = safer):
 * - SAFE (< autoPostThreshold): Auto-post in YOLO mode
 * - REVIEW (autoPostThreshold - reviewThreshold): Queue for human review
 * - REJECT (> reviewThreshold or blocklisted): Discard
 */
export async function runHotPotDetector(options: HotPotOptions): Promise<SafetyResult> {
  const { content, claude, config, recentTrends = [] } = options;
  const reasons: string[] = [];
  const layers = {
    blocklist: 0,
    tragedyRadar: 0,
    partisanLean: 0,
    toxicity: 0,
    contentQuality: 0,
  };

  // Layer 1: Blocklist (INSTANT REJECT)
  const blockResult = checkBlocklist(content, config.dataDir);
  if (blockResult.blocked) {
    log.warn({ reason: blockResult.reason, term: blockResult.matchedTerm }, 'Blocklist rejection');
    return {
      score: 100,
      verdict: 'REJECT',
      layers: { ...layers, blocklist: 100 },
      reasons: [`Blocklist: ${blockResult.reason} (${blockResult.matchedTerm})`],
    };
  }

  // Layer 2: Tragedy Radar (0-30 points)
  const tragedyResult = await checkTragedyRadar(content, recentTrends);
  layers.tragedyRadar = tragedyResult.score;
  if (tragedyResult.activeCrises.length > 0) {
    reasons.push(...tragedyResult.activeCrises.map(c => `Tragedy: ${c}`));
  }

  // Layer 3: Partisan Lean (0-25 points, Claude-powered)
  const partisanResult = await checkPartisanLean(content, claude);
  layers.partisanLean = partisanResult.score;
  if (partisanResult.score > 10) {
    reasons.push(`Partisan lean: ${partisanResult.lean > 0 ? 'right' : 'left'} (${partisanResult.explanation})`);
  }

  // Layer 4: Toxicity Check (0-25 points, Claude-powered)
  try {
    const toxResult = await claude.analyzeSafety(content, `Rate this satirical tweet's toxicity on a scale of 0-25.

Consider:
- Personal attacks (0-10): Does it attack a person rather than a system?
- Threats or intimidation (0-10): Does it contain threatening language?
- Punching down (0-5): Does it mock vulnerable groups rather than powerful ones?

Respond in this exact format:
SCORE: [number 0-25]
REASON: [one sentence if score > 5, "Clean" if score <= 5]`);

    const scoreMatch = toxResult.text.match(/SCORE:\s*(\d+)/);
    const reasonMatch = toxResult.text.match(/REASON:\s*(.+)/);
    layers.toxicity = scoreMatch ? Math.min(parseInt(scoreMatch[1]!, 10), 25) : 0;
    if (layers.toxicity > 5) {
      reasons.push(`Toxicity: ${reasonMatch?.[1] ?? 'Elevated'}`);
    }
  } catch {
    log.warn('Toxicity check failed');
  }

  // Layer 5: Content Quality (0-20 points, rule-based)
  const filterResult = checkContentFilter(content);
  layers.contentQuality = filterResult.score;
  if (filterResult.issues.length > 0) {
    reasons.push(...filterResult.issues.map(i => `Quality: ${i}`));
  }

  // Calculate total score
  const score = Object.values(layers).reduce((a, b) => a + b, 0);

  // Determine verdict
  let verdict: SafetyVerdict;
  if (score > config.safetyReviewThreshold) {
    verdict = 'REJECT';
  } else if (score >= config.safetyAutoPostThreshold) {
    verdict = 'REVIEW';
  } else {
    verdict = 'SAFE';
  }

  log.info({ score, verdict, layers }, 'Hot Pot Detector result');

  return {
    score,
    verdict,
    layers,
    reasons,
    partisanLean: partisanResult.lean,
  };
}
