/**
 * VoteChain POC — Barrel (Public API)
 *
 * Re-exports every symbol that was previously exported from the monolithic
 * `poc.ts`.  Consumer pages should import from this barrel:
 *
 *   import { getPocState, castBallot, ... } from '../../../votechain-poc';
 */

// ── Constants ───────────────────────────────────────────────────────────────
export { POC_EWP_VERSION, POC_EWP_MEDIA_TYPE } from './types.js';

// ── Encoding utilities (used by some consumer pages) ────────────────────────
export { bytesToB64u } from './encoding.js';

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  Hex0x,
  EwpErrorCode,
  CastStatus,
  VerifyStatus,
  PocSignedTreeHead,
  PocCastReceipt,
  PocCastRecordedResponse,
  PocCastPendingResponse,
  PocCastResponse,
  PocEwpErrorResponse,
  PocElectionManifest,
  PocContest,
  PocBallotPlaintext,
  PocEncryptedBallot,
  PocEligibilityProof,
  PocCastRequest,
  PocChallengeResponse,
  PocCredential,
  PocSpoilReceipt,
  PocBallotRandomnessReveal,
  PocSpoilResponse,
  PocTrusteeShareRecord,
  PocFraudFlagAction,
  PocFraudFlagStatus,
  PocFraudCaseActionRecord,
  PocFraudCase,
  PocTally,
} from './types.js';

// ── Bulletin Board types ────────────────────────────────────────────────────
export type { PocInclusionProof } from './bulletin-board.js';
export { verifyInclusionProof } from './bulletin-board.js';

// ── State management ────────────────────────────────────────────────────────
export { resetPocState, getPocState, getManifest, getTrusteeShares, getCredential } from './state.js';

// ── Credential & challenge ──────────────────────────────────────────────────
export { ensureCredential, computeNullifier, issueChallenge } from './credential.js';

// ── Ballot operations ───────────────────────────────────────────────────────
export { encryptBallotForReview, spoilBallot, verifySpoiledBallot } from './ballot.js';

// ── Cast ────────────────────────────────────────────────────────────────────
export { hasAlreadyVoted, buildCastRequest, castBallot } from './cast.js';

// ── Verify ──────────────────────────────────────────────────────────────────
export type { ReceiptVerificationResult } from './verify.js';
export { verifyReceipt } from './verify.js';

// ── Fraud ───────────────────────────────────────────────────────────────────
export { reviewFraudFlag } from './fraud.js';

// ── Tally ───────────────────────────────────────────────────────────────────
export { publishTally } from './tally.js';

// ── Lookup ──────────────────────────────────────────────────────────────────
export type { BallotLookupResult } from './lookup.js';
export { lookupBallotByHash } from './lookup.js';

// ── Dashboard ───────────────────────────────────────────────────────────────
export type { DashboardSnapshot } from './dashboard.js';
export { getDashboardSnapshot } from './dashboard.js';

// ── Trust Portal ────────────────────────────────────────────────────────────
export {
  verifyManifestSignature,
  verifyAllSthSignatures,
  verifyAllVclEventSignatures,
  verifyBulletinBoardIntegrity,
  getPublicKeys,
  verifyTally,
} from './trust-portal.js';
