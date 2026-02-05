import fs from 'node:fs';
import type { Config } from '../../config.js';

interface SessionStatus {
  house: { status: string; nextScheduledSession: string };
  senate: { status: string; nextScheduledSession: string };
}

/**
 * Score the current timing for posting.
 * Score 0-100 (higher = better time to post).
 */
export function scoreTiming(config: Config): number {
  let score = 50; // Base
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday

  // Peak hours bonus (9am-9pm ET)
  if (hour >= config.peakHoursStart && hour <= config.peakHoursEnd) {
    score += 20;
    // Mid-morning and lunch peak
    if (hour >= 10 && hour <= 13) score += 10;
    // Evening engagement window
    if (hour >= 18 && hour <= 21) score += 10;
  } else {
    score -= 20;
  }

  // Weekday bonus (congressional business days)
  if (day >= 1 && day <= 5) {
    score += 10;
    // Tuesday-Thursday are the busiest legislative days
    if (day >= 2 && day <= 4) score += 10;
  }

  // Check if Congress is in session (from session-status.json)
  try {
    const raw = fs.readFileSync(config.sessionStatusPath, 'utf-8');
    const status: SessionStatus = JSON.parse(raw);
    const inSession = status.house.status === 'in_session' || status.senate.status === 'in_session';
    if (inSession) score += 15;
  } catch {
    // No session data, don't adjust
  }

  return Math.max(0, Math.min(100, score));
}
