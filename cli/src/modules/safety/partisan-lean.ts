import type { ClaudeClient } from '../claude/client.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger();

export interface PartisanLeanResult {
  score: number;     // 0-25 (higher = more partisan)
  lean: number;      // -1.0 (hard left) to +1.0 (hard right), 0 = balanced
  explanation: string;
}

export async function checkPartisanLean(
  content: string,
  claude: ClaudeClient,
): Promise<PartisanLeanResult> {
  try {
    const response = await claude.analyzeSafety(content, `Analyze this satirical tweet for partisan lean.

Rate on a scale from -1.0 (strongly favors left/Democrats) to +1.0 (strongly favors right/Republicans). 0.0 is perfectly balanced.

Consider:
- Does it mock one party more than the other?
- Does it use talking points from one side?
- Would supporters of one party find it significantly more offensive than the other?

Respond in this exact format:
LEAN: [number between -1.0 and 1.0]
EXPLANATION: [one sentence explanation]`);

    const leanMatch = response.match(/LEAN:\s*([-\d.]+)/);
    const explMatch = response.match(/EXPLANATION:\s*(.+)/);

    const lean = leanMatch ? parseFloat(leanMatch[1]!) : 0;
    const explanation = explMatch?.[1] ?? 'Unable to determine';

    // Convert lean to score: |lean| * 25
    const score = Math.round(Math.abs(lean) * 25);

    log.debug({ lean, score }, 'Partisan lean check');

    return { score, lean, explanation };
  } catch (err) {
    log.warn({ err }, 'Partisan lean check failed, defaulting to 0');
    return { score: 0, lean: 0, explanation: 'Check failed' };
  }
}
