/**
 * Bill Progress Utilities
 *
 * Shared logic for calculating bill progress through the legislative process.
 * Used by BillTimeline, LegislativePathPopover, and any other progress visualization.
 */

import { parseBillType } from './billParser';

/**
 * Legislative path types
 */
export type LegislativePath = 'unicameral' | 'bicameralNoPresident' | 'fullPath';

/**
 * Final outcome for a bill
 */
export type BillOutcome = 'signed' | 'vetoed' | 'adopted' | 'pending' | 'failed';

/**
 * Stage definition for timeline display
 */
export interface StageDefinition {
  id: string;
  label: string;
  keywords: string[];
}

/**
 * Progress state for a bill
 */
export interface BillProgressState {
  /** Which legislative path this bill follows */
  path: LegislativePath;
  /** The stages for this path */
  stages: StageDefinition[];
  /** Current stage index (0-based) */
  currentStageIndex: number;
  /** Final outcome if bill has concluded */
  outcome: BillOutcome;
  /** Whether the bill is at its final stage */
  isFinalStage: boolean;
  /** Whether the final stage has a conclusive outcome (not pending) */
  isFinalWithOutcome: boolean;
}

/**
 * Stage definitions by legislative path
 */
export const STAGE_DEFINITIONS: Record<LegislativePath, StageDefinition[]> = {
  unicameral: [
    { id: 'introduced', label: 'Introduced', keywords: ['introduced'] },
    { id: 'committee', label: 'In Committee', keywords: ['referred', 'committee'] },
    { id: 'reported', label: 'Reported', keywords: ['reported'] },
    { id: 'final', label: 'Adopted', keywords: ['adopted', 'agreed', 'passed'] },
  ],
  bicameralNoPresident: [
    { id: 'introduced', label: 'Introduced', keywords: ['introduced'] },
    { id: 'committee', label: 'In Committee', keywords: ['referred', 'committee'] },
    { id: 'reported', label: 'Reported', keywords: ['reported'] },
    { id: 'floor', label: 'Floor Vote', keywords: ['passed house', 'passed senate', 'vote'] },
    { id: 'final', label: 'Adopted', keywords: ['adopted', 'agreed', 'passed both'] },
  ],
  fullPath: [
    { id: 'introduced', label: 'Introduced', keywords: ['introduced'] },
    { id: 'committee', label: 'In Committee', keywords: ['referred', 'committee'] },
    { id: 'reported', label: 'Reported', keywords: ['reported'] },
    { id: 'floor', label: 'Floor Vote', keywords: ['passed house', 'passed senate', 'vote'] },
    { id: 'enrolled', label: 'Enrolled', keywords: ['enrolled', 'passed both'] },
    { id: 'final', label: 'Signed/Vetoed', keywords: ['signed', 'law', 'vetoed', 'died'] },
  ],
};

/**
 * Determine which legislative path a bill follows based on its type
 */
export function getLegislativePath(billNumber: string): LegislativePath {
  const billType = parseBillType(billNumber);

  if (!billType) {
    return 'fullPath'; // Default to full path for unknown types
  }

  if (!billType.needsBothChambers && !billType.needsPresident) {
    return 'unicameral';
  }

  if (billType.needsBothChambers && !billType.needsPresident) {
    return 'bicameralNoPresident';
  }

  return 'fullPath';
}

/**
 * Get stages for a bill based on its number
 */
export function getStagesForBill(billNumber: string): StageDefinition[] {
  const path = getLegislativePath(billNumber);
  return STAGE_DEFINITIONS[path];
}

/**
 * Calculate the current stage index based on status text
 */
export function getCurrentStageIndex(status: string, path: LegislativePath): number {
  const s = status.toLowerCase();

  if (path === 'unicameral') {
    // Resolution track: Introduced → Committee → Reported → Adopted
    if (s.includes('adopted') || s.includes('agreed') || s.includes('passed')) return 3;
    if (s.includes('reported')) return 2;
    if (s.includes('committee') || s.includes('referred')) return 1;
    return 0;
  }

  if (path === 'bicameralNoPresident') {
    // Concurrent resolution track
    if (s.includes('adopted') || s.includes('agreed') || s.includes('passed both')) return 4;
    if (s.includes('passed house') || s.includes('passed senate')) return 3;
    if (s.includes('reported')) return 2;
    if (s.includes('committee') || s.includes('referred')) return 1;
    return 0;
  }

  // Standard bill track (fullPath)
  if (
    s.includes('signed') ||
    s.includes('law') ||
    s.includes('vetoed') ||
    s.includes('died') ||
    s.includes('enacted')
  )
    return 5;
  if (s.includes('enrolled') || s.includes('passed both')) return 4;
  if (s.includes('passed house') || s.includes('passed senate') || s.includes('passed/agreed'))
    return 3;
  if (s.includes('reported')) return 2;
  if (s.includes('committee') || s.includes('referred')) return 1;
  return 0;
}

/**
 * Determine the final outcome of a bill
 */
export function getBillOutcome(status: string, path: LegislativePath): BillOutcome {
  const s = status.toLowerCase();

  // Check for failure first
  if (s.includes('failed') || s.includes('rejected') || s.includes('died')) {
    return 'failed';
  }

  if (path === 'unicameral' || path === 'bicameralNoPresident') {
    // Resolutions are adopted, not signed
    if (s.includes('adopted') || s.includes('agreed') || s.includes('passed')) {
      return 'adopted';
    }
    return 'pending';
  }

  // Standard bills go to President
  if (s.includes('signed') || s.includes('law') || s.includes('enacted')) {
    return 'signed';
  }
  if (s.includes('vetoed') || s.includes('pocket')) {
    return 'vetoed';
  }

  return 'pending';
}

/**
 * Get complete progress state for a bill
 */
export function getBillProgress(billNumber: string, status: string): BillProgressState {
  const path = getLegislativePath(billNumber);
  const stages = STAGE_DEFINITIONS[path];
  const currentStageIndex = getCurrentStageIndex(status, path);
  const outcome = getBillOutcome(status, path);
  const isFinalStage = currentStageIndex === stages.length - 1;
  const isFinalWithOutcome = isFinalStage && outcome !== 'pending';

  return {
    path,
    stages,
    currentStageIndex,
    outcome,
    isFinalStage,
    isFinalWithOutcome,
  };
}

/**
 * Get the display label for the final stage based on outcome
 */
export function getFinalStageLabel(outcome: BillOutcome, path: LegislativePath): string {
  switch (outcome) {
    case 'signed':
      return 'Signed';
    case 'adopted':
      return 'Adopted';
    case 'vetoed':
      return 'Vetoed';
    case 'failed':
      return 'Failed';
    default:
      return path === 'fullPath' ? 'Signed/Vetoed' : 'Adopted';
  }
}

/**
 * Calculate progress percentage (0-100)
 */
export function getProgressPercentage(currentStageIndex: number, totalStages: number): number {
  if (totalStages <= 1) return 0;
  return Math.min(100, (currentStageIndex / (totalStages - 1)) * 100);
}

/**
 * Check if a stage is completed
 */
export function isStageCompleted(stageIndex: number, currentStageIndex: number): boolean {
  return stageIndex < currentStageIndex;
}

/**
 * Check if a stage is current
 */
export function isStageCurrent(stageIndex: number, currentStageIndex: number): boolean {
  return stageIndex === currentStageIndex;
}

/**
 * Check if a stage is in the future
 */
export function isStageFuture(stageIndex: number, currentStageIndex: number): boolean {
  return stageIndex > currentStageIndex;
}

/**
 * Color configuration for different states
 */
export const PROGRESS_COLORS = {
  completed: {
    fill: '#228B4A',
    stroke: '#1A6B3A',
    text: '#228B4A',
  },
  current: {
    fill: '#C5A572', // gold
    stroke: '#A88B4A',
    text: '#A88B4A',
  },
  future: {
    fill: '#E0D8C8',
    stroke: '#C5CDD8',
    text: '#667788',
  },
  signed: {
    fill: '#228B4A',
    stroke: '#1A6B3A',
    text: '#228B4A',
  },
  adopted: {
    fill: '#228B4A',
    stroke: '#1A6B3A',
    text: '#228B4A',
  },
  vetoed: {
    fill: '#DC2626',
    stroke: '#B91C1C',
    text: '#DC2626',
  },
  failed: {
    fill: '#DC2626',
    stroke: '#B91C1C',
    text: '#DC2626',
  },
} as const;

/**
 * Get colors for a stage based on its state
 */
export function getStageColors(
  stageIndex: number,
  currentStageIndex: number,
  isFinalStage: boolean,
  outcome: BillOutcome,
) {
  if (isStageCompleted(stageIndex, currentStageIndex)) {
    return PROGRESS_COLORS.completed;
  }

  if (isStageCurrent(stageIndex, currentStageIndex)) {
    if (isFinalStage && outcome !== 'pending') {
      return PROGRESS_COLORS[outcome] || PROGRESS_COLORS.completed;
    }
    return PROGRESS_COLORS.current;
  }

  return PROGRESS_COLORS.future;
}
