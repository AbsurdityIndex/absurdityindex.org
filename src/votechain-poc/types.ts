/* eslint-disable no-undef */
/**
 * VoteChain POC — Type definitions & Constants
 *
 * All shared types, interfaces, type aliases, and protocol constants
 * for the VoteChain proof-of-concept.
 */

// ── Protocol Constants ──────────────────────────────────────────────────────

export const POC_EWP_VERSION = '0.1-preview';
export const POC_EWP_MEDIA_TYPE = 'application/votechain.ewp.v1+json';

// ── Type Aliases ────────────────────────────────────────────────────────────

/** 0x-prefixed hexadecimal string */
export type Hex0x = `0x${string}`;

// ── EWP Protocol Types ──────────────────────────────────────────────────────

export type EwpErrorCode =
  | 'EWP_BAD_MANIFEST'
  | 'EWP_CHALLENGE_EXPIRED'
  | 'EWP_IDEMPOTENCY_MISMATCH'
  | 'EWP_PROOF_INVALID'
  | 'EWP_NULLIFIER_USED'
  | 'EWP_BALLOT_INVALID'
  | 'EWP_RATE_LIMITED'
  | 'EWP_GATEWAY_OVERLOADED';

export type CastStatus = 'cast_recorded' | 'cast_pending';

export type VerifyStatus = 'ok' | 'fail';

// ── Signed Tree Head ────────────────────────────────────────────────────────

export interface PocSignedTreeHead {
  tree_size: number;
  root_hash: string;
  timestamp: string; // ISO
  kid: string;
  sig: string;
}

// ── Cast Receipt & Response ─────────────────────────────────────────────────

export interface PocCastReceipt {
  receipt_id: string;
  election_id: string;
  manifest_id: string;
  ballot_hash: string;
  bb_leaf_hash: string;
  bb_sth: PocSignedTreeHead;
  votechain_anchor: {
    tx_id: Hex0x;
    event_type: 'ewp_ballot_cast';
    sth_root_hash: string;
  };
  kid: string;
  sig: string;
}

export interface PocCastRecordedResponse {
  status: 'cast_recorded';
  cast_receipt: PocCastReceipt;
}

export interface PocCastPendingResponse {
  status: 'cast_pending';
  cast_id: string;
  poll_url: string;
}

export type PocCastResponse = PocCastRecordedResponse | PocCastPendingResponse;

export interface PocEwpErrorResponse {
  error: {
    code: EwpErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

// ── Election Manifest ───────────────────────────────────────────────────────

export interface PocElectionManifest {
  election_id: string;
  jurisdiction_id: string;
  manifest_id: string;
  not_before: string;
  not_after: string;
  crypto: {
    suite: string;
    pk_election: string;
    // Threshold credential issuance: t-of-n independent registration authorities must sign.
    // Each issuer runs an independent blind Schnorr ceremony — no single issuer can forge credentials.
    pk_issuers: string[]; // Array of secp256k1 compressed public keys (33 bytes each)
    issuer_threshold: { t: number; n: number }; // t-of-n required for valid credential
    // Voter roll commitment: published before credential issuance begins.
    // Monitors compare issuance count against this ceiling.
    voter_roll_commitment: {
      merkle_root: string; // SHA-256 Merkle root of eligible voter entries
      total_eligible: number; // Maximum credentials that may be issued
    };
    trustees: Array<{ id: string; pubkey: string }>;
    threshold: { t: number; n: number };
  };
  endpoints: {
    challenge: string;
    cast: string;
    bb: string;
  };
  signing: {
    alg: string;
    kid: string;
    sig: string;
  };
}

// ── Credential & Challenge ──────────────────────────────────────────────────

export interface PocCredential {
  did: string;
  curve: 'secp256k1';
  // BIP340 x-only public key (32 bytes, base64url)
  pk: string;
  // Private key (32 bytes, base64url). POC only: stored in localStorage.
  sk: string;
  // Threshold blind Schnorr signatures from independent registration authorities.
  // Each issuer independently certified this credential without learning which public key
  // it certified. Requiring t-of-n issuers prevents any single rogue authority from
  // forging credentials en masse. A credential is valid only when ≥ threshold signatures
  // verify against the manifest's pk_issuers list.
  blind_sigs: Array<{
    issuer_index: number; // Index into manifest.crypto.pk_issuers
    R: string; // Unblinded nonce point R' (33 bytes compressed)
    s: string; // Unblinded scalar s' (32 bytes)
  }>;
  created_at: string;
}

export interface PocChallengeResponse {
  challenge_id: string;
  challenge: string;
  expires_at: string;
  kid: string;
  server_sig: string;
}

// ── Eligibility Proof ───────────────────────────────────────────────────────

export interface PocEligibilityProof {
  zk_suite: string;
  vk_id: string;
  public_inputs: {
    election_id: string;
    jurisdiction_id: string;
    nullifier: Hex0x;
    challenge: string;
  };
  // Schnorr-style NIZK proof (Fiat-Shamir) as base64url bytes.
  pi: string;
  // The voter's x-only public key. It is still disclosed in the proof (needed for nullifier
  // derivation and BIP340 proof-of-knowledge verification), but blind Schnorr issuance makes
  // it **unlinkable to registration** — the issuer cannot tell which credential it certified.
  credential_pub: string;
  // Threshold blind Schnorr signatures from independent registration authorities.
  // Each entry corresponds to one issuer's blind Schnorr certification. The verifier
  // checks that at least issuer_threshold.t signatures verify against the manifest's
  // pk_issuers, preventing any single rogue authority from minting valid credentials.
  issuer_blind_sigs: Array<{
    issuer_index: number;
    R: string;
    s: string;
  }>;
}

// ── Encrypted Ballot & Cast Request ─────────────────────────────────────────

export interface PocEncryptedBallot {
  ballot_id: string;
  ciphertext: string;
  ballot_validity_proof: string;
  ballot_hash: string;
  // POC threshold decryption support:
  // - ballot is encrypted with a fresh per-ballot AES key (revealed only on spoil)
  // - that key is wrapped to the election public key via ECIES-style ECDH + AES-GCM
  wrapped_ballot_key: string;
  wrapped_ballot_key_epk: string;
}

export interface PocCastRequest {
  ewp_version: string;
  election_id: string;
  jurisdiction_id: string;
  manifest_id: string;
  challenge_id: string;
  challenge: string;
  nullifier: Hex0x;
  eligibility_proof: PocEligibilityProof;
  encrypted_ballot: PocEncryptedBallot;
}

// ── Ballot Plaintext & Contest ──────────────────────────────────────────────

export interface PocBallotPlaintext {
  election_id: string;
  manifest_id: string;
  ballot_id: string;
  contests: Array<{ contest_id: string; selection: string }>;
  cast_at: string; // ISO
}

export interface PocContest {
  contest_id: string;
  title: string;
  type: 'candidate' | 'referendum';
  options: Array<{ id: string; label: string }>;
}

// ── Spoil ───────────────────────────────────────────────────────────────────

export interface PocSpoilReceipt {
  receipt_id: string;
  election_id: string;
  ballot_hash: string;
  spoiled_at: string;
  kid: string;
  sig: string;
}

export interface PocBallotRandomnessReveal {
  ballot_id: string;
  iv: string;
  ballot_key: string;
  plaintext: PocBallotPlaintext;
}

export interface PocSpoilResponse {
  status: 'ballot_spoiled';
  spoil_receipt: PocSpoilReceipt;
  randomness_reveal: PocBallotRandomnessReveal;
}

export interface PocSpoiledBallotRecord {
  ballot_hash: string;
  encrypted_ballot: PocEncryptedBallot;
  randomness_reveal: PocBallotRandomnessReveal;
  spoil_receipt: PocSpoilReceipt;
  spoiled_at: string;
}

// ── Internal Types (used across modules) ────────────────────────────────────

export interface EncryptionResult {
  encrypted_ballot: PocEncryptedBallot;
  iv: Uint8Array;
  ballot_key: Uint8Array;
  plaintext: PocBallotPlaintext;
}

export interface StoredKeyPair {
  kid: string;
  alg: string;
  jwk_public: JsonWebKey;
  jwk_private: JsonWebKey;
}

export interface PocVclEvent {
  tx_id: Hex0x;
  type:
    | 'election_manifest_published'
    | 'credential_issued' // Logged each time a credential is issued (privacy-preserving: contains only sequence number)
    | 'ewp_ballot_cast'
    | 'bb_sth_published'
    | 'tally_published'
    | 'fraud_flag'
    | 'fraud_flag_action';
  recorded_at: string;
  payload: Record<string, unknown>;
  kid: string;
  sig: string;
}

// ── Fraud ───────────────────────────────────────────────────────────────────

export type PocFraudFlagStatus =
  | 'pending_review'
  | 'triaged'
  | 'investigating'
  | 'escalated'
  | 'resolved_cleared'
  | 'resolved_confirmed_fraud'
  | 'resolved_system_error';

export type PocFraudFlagAction =
  | 'take_case'
  | 'start_investigation'
  | 'escalate'
  | 'resolve_cleared'
  | 'resolve_confirmed_fraud'
  | 'resolve_system_error'
  | 'note';

export interface PocFraudCaseActionRecord {
  tx_id: Hex0x;
  recorded_at: string;
  action: PocFraudFlagAction;
  reviewer_id: string;
  from_status: PocFraudFlagStatus;
  to_status: PocFraudFlagStatus;
  reason_code?: string;
  note?: string;
  assigned_to?: string;
}

export interface PocFraudCase {
  case_id: Hex0x;
  created_at: string;
  updated_at: string;
  status: PocFraudFlagStatus;
  flag_type: string;
  severity?: string;
  evidence_strength?: string;
  election_id?: string;
  jurisdiction_id?: string;
  nullifier?: string;
  assigned_to?: string;
  flag_payload: Record<string, unknown>;
  actions: PocFraudCaseActionRecord[];
}

// ── Bulletin Board ──────────────────────────────────────────────────────────

export interface PocBbLeaf {
  leaf_hash: string;
  payload: Record<string, unknown>;
}

export interface PocInclusionProof {
  leaf_hash: string;
  root_hash: string;
  tree_size: number;
  leaf_index: number;
  path: Array<{ side: 'left' | 'right'; hash: string }>;
}

// ── Internal State ──────────────────────────────────────────────────────────

export interface PocChallengeRecord {
  challenge_id: string;
  challenge: string;
  expires_at: string;
  used: boolean;
  kid: string;
  server_sig: string;
}

export interface PocIdempotencyRecord {
  request_hash: string;
  response: PocCastResponse | PocEwpErrorResponse;
  stored_at: string;
}

export interface PocTally {
  election_id: string;
  manifest_id: string;
  bb_close_root_hash: string;
  computed_at: string;
  totals: Record<string, Record<string, number>>;
  ballot_count: number;
  kid: string;
  sig: string;
}

export interface PocTrusteeShareRecord {
  id: string;
  x: number; // 1..n (Shamir x-coordinate)
  share: string; // scalar bytes (base64url, 32 bytes)
}

// ── Full POC State ──────────────────────────────────────────────────────────

export interface PocStateV2 {
  version: 2;
  election: {
    election_id: string;
    jurisdiction_id: string;
    contests: PocContest[];
  };
  keys: {
    manifest: StoredKeyPair;
    ewg: StoredKeyPair;
    bb: StoredKeyPair;
    vcl: StoredKeyPair;
  };
  manifest: PocElectionManifest;
  trustees: {
    threshold: { t: number; n: number };
    // POC-only: private shares used to reconstruct the election secret at tally time.
    shares: PocTrusteeShareRecord[];
  };
  // Threshold registration authorities for blind Schnorr credential issuance.
  // Each issuer independently certifies credentials — t-of-n must sign for validity.
  issuers: Array<{
    sk: string; // secp256k1 scalar (32 bytes)
    pk: string; // secp256k1 compressed point (33 bytes)
  }>;
  issuer_threshold: { t: number; n: number };
  // Voter roll commitment tracking: how many credentials have been issued vs. the ceiling.
  credential_issuance_count: number;
  credential?: PocCredential;
  challenges: Record<string, PocChallengeRecord>;
  idempotency: Record<string, PocIdempotencyRecord>;
  bb: {
    leaves: PocBbLeaf[];
    sth_history: PocSignedTreeHead[];
  };
  vcl: {
    events: PocVclEvent[];
  };
  spoiled_ballots: PocSpoiledBallotRecord[];
  tally?: PocTally;
}

// ── Result Types ────────────────────────────────────────────────────────────

export interface ReceiptVerificationResult {
  status: VerifyStatus;
  checks: Array<{ name: string; status: VerifyStatus; details?: string }>;
  inclusion_proof?: PocInclusionProof;
}

export interface DashboardSnapshot {
  election: PocStateV2['election'];
  manifest: PocElectionManifest;
  bb: {
    leaf_count: number;
    latest_sth: PocSignedTreeHead | null;
  };
  vcl: {
    event_count: number;
    fraud_flags: number;
    ewp_casts: number;
  };
  metrics: {
    verified: number;
    crypto_conflict: number;
    spoiled: number;
    pending: number;
    provisional: number;
  };
  fraud_cases: PocFraudCase[];
  events: PocVclEvent[];
  leaves: PocBbLeaf[];
  tally?: PocTally;
}

export interface BallotLookupResult {
  found: boolean;
  ballot_hash: string;
  leaf_hash?: string;
  leaf_index?: number;
  received_at?: string;
  inclusion_proof?: PocInclusionProof;
  anchor_event?: {
    tx_id: string;
    recorded_at: string;
    nullifier?: string;
  };
  latest_sth?: PocSignedTreeHead;
  checks: Array<{ name: string; status: VerifyStatus; details?: string }>;
}
