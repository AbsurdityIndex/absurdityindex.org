/**
 * VoteChain POC — Cast Ballot
 *
 * The core EWP cast flow: validate manifest, challenge, eligibility proof,
 * nullifier uniqueness, ballot envelope, then write to BB, anchor on VCL,
 * and return a cast receipt.
 */

import { POC_EWP_VERSION } from './types.js';
import type {
  PocCastRequest,
  PocCastResponse,
  PocCastRecordedResponse,
  PocCastReceipt,
  PocEncryptedBallot,
  PocChallengeResponse,
  PocEwpErrorResponse,
  PocStateV2,
  LedgerAck,
} from './types.js';
import {
  sha256B64u,
  utf8,
  canonicalJson,
  bytesToB64u,
  b64uToBytes,
  randomBytes,
  nowIso,
} from './encoding.js';
import { signB64u } from './crypto/ecdsa.js';
import { verifyManifest } from './manifest.js';
import { bbLeafHash, issueBbSth } from './bulletin-board.js';
import { buildEwpError, hasUsedNullifier, recordBbSthPublished, recordEwpBallotCast } from './vcl.js';
import { ensureInitialized, saveState } from './state.js';
import { ensureCredential, computeNullifier, buildEligibilityProof, verifyEligibilityProof } from './credential.js';
import { recordFraudFlag } from './fraud.js';
import { replicateViaProxy } from './vcl-client.js';
import type { ProxyReplicationResult } from './vcl-client.js';

// ── Receipt helpers ─────────────────────────────────────────────────────────

async function receiptSigPayload(receipt: Omit<PocCastReceipt, 'sig'>): Promise<Uint8Array> {
  return utf8(canonicalJson(receipt));
}

async function signReceipt(
  state: PocStateV2,
  receiptUnsigned: Omit<PocCastReceipt, 'sig'>,
): Promise<string> {
  return signB64u(state.keys.ewg.jwk_private, await receiptSigPayload(receiptUnsigned));
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Check if the current credential has already cast a ballot in this election. */
export async function hasAlreadyVoted(): Promise<boolean> {
  const state = await ensureInitialized();
  if (!state.credential) return false;
  const nullifier = await computeNullifier(state.credential.pk, state.election.election_id);
  return hasUsedNullifier(state, nullifier);
}

export async function buildCastRequest(params: {
  encrypted_ballot: PocEncryptedBallot;
  challenge: PocChallengeResponse;
  idempotencyKey?: string;
}): Promise<{ request: PocCastRequest; idempotencyKey: string } | { error: string }> {
  const state = await ensureInitialized();
  const credential = await ensureCredential();

  const nullifier = await computeNullifier(credential.pk, state.election.election_id);

  const eligibility_proof = await buildEligibilityProof(
    credential,
    state.election.election_id,
    state.election.jurisdiction_id,
    nullifier,
    params.challenge.challenge,
  );

  const request: PocCastRequest = {
    ewp_version: POC_EWP_VERSION,
    election_id: state.election.election_id,
    jurisdiction_id: state.election.jurisdiction_id,
    manifest_id: state.manifest.manifest_id,
    challenge_id: params.challenge.challenge_id,
    challenge: params.challenge.challenge,
    nullifier,
    eligibility_proof,
    encrypted_ballot: params.encrypted_ballot,
  };

  return { request, idempotencyKey: params.idempotencyKey ?? crypto.randomUUID() };
}

export async function castBallot(args: {
  request: PocCastRequest;
  idempotencyKey: string;
}): Promise<PocCastResponse | PocEwpErrorResponse> {
  const state = await ensureInitialized();
  const requestHash = await sha256B64u(utf8(canonicalJson(args.request)));

  // ── Idempotency check ──
  const existing = state.idempotency[args.idempotencyKey];
  if (existing) {
    if (existing.request_hash !== requestHash) {
      return buildEwpError('EWP_IDEMPOTENCY_MISMATCH', 'Idempotency-Key reused with different body.', false);
    }
    return existing.response;
  }

  // Helper to store an error and return it
  const storeAndReturn = (err: PocEwpErrorResponse): PocEwpErrorResponse => {
    state.idempotency[args.idempotencyKey] = { request_hash: requestHash, response: err, stored_at: nowIso() };
    saveState(state);
    return err;
  };

  // 1) Validate manifest
  const manifestOk = await verifyManifest(state.manifest, state.keys.manifest);
  if (!manifestOk) {
    return storeAndReturn(buildEwpError('EWP_BAD_MANIFEST', 'Manifest signature invalid.', false));
  }

  if (
    args.request.ewp_version !== POC_EWP_VERSION ||
    args.request.election_id !== state.election.election_id ||
    args.request.jurisdiction_id !== state.election.jurisdiction_id ||
    args.request.manifest_id !== state.manifest.manifest_id
  ) {
    return storeAndReturn(buildEwpError('EWP_BAD_MANIFEST', 'Cast request does not match the active manifest.', false));
  }

  // 2) Validate challenge
  const challenge = state.challenges[args.request.challenge_id];
  if (!challenge || challenge.challenge !== args.request.challenge) {
    return storeAndReturn(buildEwpError('EWP_PROOF_INVALID', 'Challenge not found.', false));
  }
  if (challenge.used) {
    return storeAndReturn(buildEwpError('EWP_PROOF_INVALID', 'Challenge already used.', false));
  }
  const exp = Date.parse(challenge.expires_at);
  if (Number.isFinite(exp) && Date.now() > exp) {
    return storeAndReturn(buildEwpError('EWP_CHALLENGE_EXPIRED', 'Challenge expired.', true));
  }

  // 3) Validate nullifier derivation
  const pi = args.request.eligibility_proof.public_inputs;
  if (
    pi.election_id !== args.request.election_id ||
    pi.jurisdiction_id !== args.request.jurisdiction_id ||
    pi.nullifier !== args.request.nullifier ||
    pi.challenge !== args.request.challenge
  ) {
    return storeAndReturn(buildEwpError('EWP_PROOF_INVALID', 'Eligibility public inputs mismatch.', false));
  }

  const expectedNullifier = await computeNullifier(
    args.request.eligibility_proof.credential_pub,
    state.election.election_id,
  );
  if (expectedNullifier !== args.request.nullifier) {
    return storeAndReturn(buildEwpError('EWP_PROOF_INVALID', 'Nullifier derivation mismatch.', false));
  }

  // 4) Verify eligibility proof
  const proofOk = await verifyEligibilityProof(state, args.request.eligibility_proof);
  if (!proofOk) {
    return storeAndReturn(
      buildEwpError('EWP_PROOF_INVALID', 'Eligibility proof failed verification.', false, {
        vk_id: args.request.eligibility_proof.vk_id,
      }),
    );
  }

  // 5) Nullifier uniqueness
  if (hasUsedNullifier(state, args.request.nullifier)) {
    await recordFraudFlag(state, {
      flag_type: 'duplicate_vote_attempt',
      election_id: args.request.election_id,
      jurisdiction_id: args.request.jurisdiction_id,
      nullifier: args.request.nullifier,
      evidence_strength: 'cryptographic',
      status: 'pending_review',
    });
    return storeAndReturn(buildEwpError('EWP_NULLIFIER_USED', 'Nullifier already used.', false));
  }

  // 6) Ballot envelope integrity
  const packed = (() => {
    try { return b64uToBytes(args.request.encrypted_ballot.ciphertext); }
    catch { return null; }
  })();
  const ballotHashOk = packed ? (await sha256B64u(packed)) === args.request.encrypted_ballot.ballot_hash : false;
  const wrapFieldsOk = Boolean(
    args.request.encrypted_ballot.wrapped_ballot_key &&
      args.request.encrypted_ballot.wrapped_ballot_key_epk,
  );
  if (!ballotHashOk || !wrapFieldsOk) {
    return storeAndReturn(buildEwpError('EWP_BALLOT_INVALID', 'Ballot failed validity checks.', false));
  }

  // Mark challenge as used as part of accepting cast.
  challenge.used = true;

  // 7) Write leaf to BB (append-only)
  const leafPayload = {
    ewp_version: args.request.ewp_version,
    election_id: args.request.election_id,
    manifest_id: args.request.manifest_id,
    encrypted_ballot: args.request.encrypted_ballot,
    received_at: nowIso(),
    gateway_id: 'ewg_poc_1',
  };
  const leaf_hash = await bbLeafHash(leafPayload);
  state.bb.leaves.push({ leaf_hash, payload: leafPayload });

  // 8) Issue STH and anchor it
  const sth = await issueBbSth(state);
  await recordBbSthPublished(state, sth);

  // 9) Anchor cast on VCL
  const anchor = await recordEwpBallotCast(state, args.request, leaf_hash, sth.root_hash);

  // 10) Replicate VCL events to distributed ledger (awaited, not fire-and-forget).
  // Collect ledger acks — the Worker's ECDSA P-256 signature proving the vote was
  // recorded on the distributed ledger. Failures are non-blocking (graceful degradation).
  const ledger_acks: LedgerAck[] = [];
  const recentEvents = state.vcl.events.slice(-2);
  const replicatePromises: Promise<{ evt: typeof recentEvents[0]; result: ProxyReplicationResult }>[] = [];

  for (const evt of recentEvents) {
    if (evt.type === 'bb_sth_published' || evt.type === 'ewp_ballot_cast') {
      replicatePromises.push(
        replicateViaProxy({
          type: evt.type,
          payload: evt.payload,
          tx_id: evt.tx_id,
          recorded_at: evt.recorded_at,
        }).then((result) => ({ evt, result })),
      );
    }
  }

  const replicationResults = await Promise.allSettled(replicatePromises);
  for (const settled of replicationResults) {
    if (settled.status !== 'fulfilled') continue;
    const { evt, result } = settled.value;
    if (result.ok && result.entry && result.ack) {
      ledger_acks.push({
        node_role: 'state',
        entry_index: result.entry.index,
        entry_hash: result.entry.hash,
        ack: result.ack,
      });
      console.info(`[VCL] Replicated ${evt.type} to state node (index=${result.entry.index})`);
    } else {
      console.warn(`[VCL] Replication of ${evt.type} failed: ${result.error ?? 'unknown'}`);
    }
  }

  // 11) Build receipt (includes ledger acks from distributed nodes)
  const receiptUnsigned: Omit<PocCastReceipt, 'sig'> = {
    receipt_id: bytesToB64u(randomBytes(16)),
    election_id: args.request.election_id,
    manifest_id: args.request.manifest_id,
    ballot_hash: args.request.encrypted_ballot.ballot_hash,
    bb_leaf_hash: leaf_hash,
    bb_sth: sth,
    votechain_anchor: {
      tx_id: anchor.tx_id,
      event_type: 'ewp_ballot_cast',
      sth_root_hash: sth.root_hash,
    },
    ...(ledger_acks.length > 0 ? { ledger_acks } : {}),
    kid: state.keys.ewg.kid,
  };
  const sig = await signReceipt(state, receiptUnsigned);
  const receipt: PocCastReceipt = { ...receiptUnsigned, sig };

  const response: PocCastRecordedResponse = { status: 'cast_recorded', cast_receipt: receipt };

  state.idempotency[args.idempotencyKey] = {
    request_hash: requestHash,
    response,
    stored_at: nowIso(),
  };
  saveState(state);

  return response;
}
