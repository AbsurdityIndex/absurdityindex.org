/**
 * Bill Type Parser
 *
 * Parses bill numbers (e.g., "H.R. 123", "S.J.Res. 45") into structured metadata
 * about the bill type, origin chamber, and legislative path requirements.
 */

export type BillTypeCode =
  | 'hr'
  | 's'
  | 'hres'
  | 'sres'
  | 'hjres'
  | 'sjres'
  | 'hconres'
  | 'sconres';

export type Chamber = 'house' | 'senate';

export interface BillTypeInfo {
  /** Normalized bill type code */
  type: BillTypeCode;
  /** Which chamber the bill originated in */
  originChamber: Chamber;
  /** Whether the bill requires passage by both chambers */
  needsBothChambers: boolean;
  /** Whether the bill goes to the President for signature */
  needsPresident: boolean;
  /** Human-readable name for the bill type */
  displayName: string;
  /** The official prefix (e.g., "H.R.", "S.J.Res.") */
  prefix: string;
  /** Short description of what this type is used for */
  description: string;
}

export interface ChamberProgress {
  /** Current phase for the origin chamber */
  originPhase: 'introduced' | 'committee' | 'floor' | 'passed' | 'none';
  /** Current phase for the receiving chamber (if applicable) */
  receivingPhase: 'received' | 'committee' | 'floor' | 'passed' | 'none';
  /** Presidential action status (if applicable) */
  presidentPhase: 'pending' | 'signed' | 'vetoed' | 'pocket-vetoed' | 'none';
  /** Whether in conference committee */
  inConference: boolean;
  /** Whether the bill has been enrolled (passed both, sent to President) */
  enrolled: boolean;
  /** Whether the legislation failed/died */
  failed: boolean;
  /** Failure reason if applicable */
  failureReason?: string;
}

/**
 * Bill type configuration
 *
 * | Prefix      | Type                 | Origin | Both Chambers? | President? |
 * |-------------|----------------------|--------|----------------|------------|
 * | H.R.        | Bill                 | House  | Yes            | Yes        |
 * | S.          | Bill                 | Senate | Yes            | Yes        |
 * | H.Res.      | Resolution           | House  | No             | No         |
 * | S.Res.      | Resolution           | Senate | No             | No         |
 * | H.J.Res.    | Joint Resolution     | House  | Yes            | Yes        |
 * | S.J.Res.    | Joint Resolution     | Senate | Yes            | Yes        |
 * | H.Con.Res.  | Concurrent Resolution| House  | Yes            | No         |
 * | S.Con.Res.  | Concurrent Resolution| Senate | Yes            | No         |
 */
const BILL_TYPE_CONFIG: Record<BillTypeCode, Omit<BillTypeInfo, 'type'>> = {
  hr: {
    originChamber: 'house',
    needsBothChambers: true,
    needsPresident: true,
    displayName: 'House Bill',
    prefix: 'H.R.',
    description: 'A legislative proposal that, if passed by both chambers and signed by the President, becomes law.',
  },
  s: {
    originChamber: 'senate',
    needsBothChambers: true,
    needsPresident: true,
    displayName: 'Senate Bill',
    prefix: 'S.',
    description: 'A legislative proposal that, if passed by both chambers and signed by the President, becomes law.',
  },
  hres: {
    originChamber: 'house',
    needsBothChambers: false,
    needsPresident: false,
    displayName: 'House Resolution',
    prefix: 'H.Res.',
    description: 'Addresses matters entirely within the House, such as rules or expressing House sentiment.',
  },
  sres: {
    originChamber: 'senate',
    needsBothChambers: false,
    needsPresident: false,
    displayName: 'Senate Resolution',
    prefix: 'S.Res.',
    description: 'Addresses matters entirely within the Senate, such as rules or expressing Senate sentiment.',
  },
  hjres: {
    originChamber: 'house',
    needsBothChambers: true,
    needsPresident: true,
    displayName: 'House Joint Resolution',
    prefix: 'H.J.Res.',
    description: 'Has the force of law if passed. Used for constitutional amendments (which bypass the President) or continuing resolutions.',
  },
  sjres: {
    originChamber: 'senate',
    needsBothChambers: true,
    needsPresident: true,
    displayName: 'Senate Joint Resolution',
    prefix: 'S.J.Res.',
    description: 'Has the force of law if passed. Used for constitutional amendments (which bypass the President) or continuing resolutions.',
  },
  hconres: {
    originChamber: 'house',
    needsBothChambers: true,
    needsPresident: false,
    displayName: 'House Concurrent Resolution',
    prefix: 'H.Con.Res.',
    description: 'Requires passage by both chambers but does not go to the President. Used for budget resolutions and expressing Congressional sentiment.',
  },
  sconres: {
    originChamber: 'senate',
    needsBothChambers: true,
    needsPresident: false,
    displayName: 'Senate Concurrent Resolution',
    prefix: 'S.Con.Res.',
    description: 'Requires passage by both chambers but does not go to the President. Used for budget resolutions and expressing Congressional sentiment.',
  },
};

/**
 * Patterns for matching bill type prefixes
 * Order matters - more specific patterns first
 */
const BILL_TYPE_PATTERNS: Array<{ pattern: RegExp; type: BillTypeCode }> = [
  // Joint Resolutions (must come before simple resolutions)
  { pattern: /^H\.?\s*J\.?\s*Res\.?\s*/i, type: 'hjres' },
  { pattern: /^S\.?\s*J\.?\s*Res\.?\s*/i, type: 'sjres' },
  // Concurrent Resolutions (must come before simple resolutions)
  { pattern: /^H\.?\s*Con\.?\s*Res\.?\s*/i, type: 'hconres' },
  { pattern: /^S\.?\s*Con\.?\s*Res\.?\s*/i, type: 'sconres' },
  // Simple Resolutions
  { pattern: /^H\.?\s*Res\.?\s*/i, type: 'hres' },
  { pattern: /^S\.?\s*Res\.?\s*/i, type: 'sres' },
  // Bills (must come last - H.R. and S. are simplest patterns)
  { pattern: /^H\.?\s*R\.?\s*/i, type: 'hr' },
  { pattern: /^S\.?\s*/i, type: 's' },
];

/**
 * Parse a bill number string to extract type information
 *
 * @param billNumber - The bill number string (e.g., "H.R. 123", "S.J.Res. 45")
 * @returns BillTypeInfo or null if the format is unrecognized
 *
 * @example
 * parseBillType("H.R. 2617") // => { type: 'hr', originChamber: 'house', ... }
 * parseBillType("S.J.Res. 1") // => { type: 'sjres', originChamber: 'senate', ... }
 */
export function parseBillType(billNumber: string): BillTypeInfo | null {
  if (!billNumber || typeof billNumber !== 'string') {
    return null;
  }

  const trimmed = billNumber.trim();

  for (const { pattern, type } of BILL_TYPE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        type,
        ...BILL_TYPE_CONFIG[type],
      };
    }
  }

  return null;
}

/**
 * Extract just the bill number (digits) from a bill number string
 *
 * @param billNumber - The full bill number (e.g., "H.R. 2617")
 * @returns The numeric portion or null
 */
export function extractBillNumber(billNumber: string): number | null {
  const match = billNumber.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Get all bill type definitions
 * Useful for glossary/education components
 */
export function getAllBillTypes(): BillTypeInfo[] {
  return (Object.keys(BILL_TYPE_CONFIG) as BillTypeCode[]).map((type) => ({
    type,
    ...BILL_TYPE_CONFIG[type],
  }));
}

/**
 * Action keywords for detecting chamber progress
 */
const ACTION_KEYWORDS = {
  // Introduction
  introduced: ['introduced', 'introduced in'],
  // Committee phase
  committee: ['referred to', 'committee', 'subcommittee', 'markup', 'hearing'],
  reported: ['reported', 'ordered reported', 'reported favorably'],
  // Floor actions
  passedHouse: ['passed house', 'passed/agreed to in house', 'agreed to in house'],
  passedSenate: ['passed senate', 'passed/agreed to in senate', 'agreed to in senate'],
  // Cross-chamber
  receivedSenate: ['received in the senate', 'received in senate'],
  receivedHouse: ['received in the house', 'received in house'],
  // Conference
  conference: ['conference', 'conferees', 'conference report'],
  // Enrollment
  enrolled: ['enrolled', 'presented to president', 'cleared for white house'],
  // Presidential action
  signed: ['signed by president', 'became public law', 'signed into law'],
  vetoed: ['vetoed', 'pocket vetoed'],
  // Failure
  failed: ['failed', 'rejected', 'died', 'laid on table', 'indefinitely postponed'],
};

/**
 * Analyze chamber progress from action history
 *
 * @param actions - Array of legislative actions with date and text
 * @param billType - The bill type info from parseBillType
 * @returns Chamber progress analysis
 */
export function analyzeChamberProgress(
  actions: Array<{ date: Date; text: string; chamber?: 'house' | 'senate' | 'both' }>,
  billType: BillTypeInfo
): ChamberProgress {
  const progress: ChamberProgress = {
    originPhase: 'none',
    receivingPhase: 'none',
    presidentPhase: 'none',
    inConference: false,
    enrolled: false,
    failed: false,
  };

  if (!actions || actions.length === 0) {
    return progress;
  }

  // Helper to check if any action matches keywords
  const hasKeyword = (keywords: string[]): boolean => {
    return actions.some((action) => {
      const text = action.text.toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    });
  };

  // Check for failure first
  if (hasKeyword(ACTION_KEYWORDS.failed)) {
    progress.failed = true;
    // Try to determine failure reason from last action
    const lastAction = actions[actions.length - 1];
    if (lastAction) {
      progress.failureReason = lastAction.text;
    }
  }

  // Check presidential status
  if (hasKeyword(ACTION_KEYWORDS.signed)) {
    progress.presidentPhase = 'signed';
    progress.enrolled = true;
  } else if (hasKeyword(ACTION_KEYWORDS.vetoed)) {
    progress.presidentPhase = actions.some((a) => a.text.toLowerCase().includes('pocket'))
      ? 'pocket-vetoed'
      : 'vetoed';
    progress.enrolled = true;
  } else if (hasKeyword(ACTION_KEYWORDS.enrolled) && billType.needsPresident) {
    progress.presidentPhase = 'pending';
    progress.enrolled = true;
  }

  // Check conference
  if (hasKeyword(ACTION_KEYWORDS.conference)) {
    progress.inConference = true;
  }

  // Determine origin chamber progress
  const isHouseOrigin = billType.originChamber === 'house';
  const originPassedKeywords = isHouseOrigin ? ACTION_KEYWORDS.passedHouse : ACTION_KEYWORDS.passedSenate;

  if (hasKeyword(originPassedKeywords)) {
    progress.originPhase = 'passed';
  } else if (hasKeyword(ACTION_KEYWORDS.reported)) {
    progress.originPhase = 'floor';
  } else if (hasKeyword(ACTION_KEYWORDS.committee)) {
    progress.originPhase = 'committee';
  } else if (hasKeyword(ACTION_KEYWORDS.introduced)) {
    progress.originPhase = 'introduced';
  }

  // Determine receiving chamber progress (for bicameral bills)
  if (billType.needsBothChambers) {
    const receivedKeywords = isHouseOrigin ? ACTION_KEYWORDS.receivedSenate : ACTION_KEYWORDS.receivedHouse;
    const receivingPassedKeywords = isHouseOrigin ? ACTION_KEYWORDS.passedSenate : ACTION_KEYWORDS.passedHouse;

    if (hasKeyword(receivingPassedKeywords)) {
      progress.receivingPhase = 'passed';
    } else if (hasKeyword(receivedKeywords)) {
      // Check for committee/floor in receiving chamber
      // This is a simplification - real analysis would need chamber-aware action parsing
      progress.receivingPhase = 'received';
    }
  }

  return progress;
}

/**
 * Get the receiving chamber for a bill type
 */
export function getReceivingChamber(billType: BillTypeInfo): Chamber | null {
  if (!billType.needsBothChambers) {
    return null;
  }
  return billType.originChamber === 'house' ? 'senate' : 'house';
}

/**
 * Format a chamber name for display
 */
export function formatChamberName(chamber: Chamber): string {
  return chamber === 'house' ? 'House' : 'Senate';
}

/**
 * Check if a bill type is a simple resolution (single chamber, no President)
 */
export function isSimpleResolution(billType: BillTypeInfo): boolean {
  return !billType.needsBothChambers && !billType.needsPresident;
}

/**
 * Check if a bill type is a concurrent resolution (both chambers, no President)
 */
export function isConcurrentResolution(billType: BillTypeInfo): boolean {
  return billType.needsBothChambers && !billType.needsPresident;
}

/**
 * Check if a bill type requires presidential action
 */
export function requiresPresidentialAction(billType: BillTypeInfo): boolean {
  return billType.needsPresident;
}
