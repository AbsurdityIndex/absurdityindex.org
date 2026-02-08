/**
 * VoteChain POC — VoteChain Ledger (VCL) Operations
 *
 * VCL event signing/verification, EWP error construction,
 * and VCL-anchoring helpers for BB STH and ballot-cast events.
 */

import type {
  Hex0x,
  PocVclEvent,
  PocSignedTreeHead,
  PocCastRequest,
  PocEwpErrorResponse,
  EwpErrorCode,
  StoredKeyPair,
  PocStateV2,
} from './types.js';
import { sha256Hex0x, utf8, canonicalJson, nowIso } from './encoding.js';
import { signB64u, verifyB64u } from './crypto/ecdsa.js';

export async function vclTxId(payload: Record<string, unknown>): Promise<Hex0x> {
  return sha256Hex0x(utf8(canonicalJson(payload)));
}

export async function vclSignEvent(
  eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'>,
  vclKey: StoredKeyPair,
): Promise<{ tx_id: Hex0x; sig: string }> {
  const txPayload = {
    type: eventUnsigned.type,
    recorded_at: eventUnsigned.recorded_at,
    payload: eventUnsigned.payload,
    kid: eventUnsigned.kid,
  };
  const tx_id = await vclTxId(txPayload);
  const sig = await signB64u(vclKey.jwk_private, utf8(canonicalJson({ tx_id, ...txPayload })));
  return { tx_id, sig };
}

export async function vclVerifyEvent(event: PocVclEvent, vclKey: StoredKeyPair): Promise<boolean> {
  const { sig, ...unsigned } = event;
  const txPayload = {
    type: unsigned.type,
    recorded_at: unsigned.recorded_at,
    payload: unsigned.payload,
    kid: unsigned.kid,
  };
  const expectedTxId = await vclTxId(txPayload);
  if (expectedTxId !== unsigned.tx_id) return false;
  return verifyB64u(vclKey.jwk_public, utf8(canonicalJson(unsigned)), sig);
}

export function buildEwpError(
  code: EwpErrorCode,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>,
): PocEwpErrorResponse {
  return {
    error: {
      code,
      message,
      retryable,
      ...(details ? { details } : {}),
    },
  };
}

// ── VCL helpers that query state ────────────────────────────────────────────

export function hasUsedNullifier(state: PocStateV2, nullifier: Hex0x): boolean {
  return state.vcl.events.some(
    (evt) => evt.type === 'ewp_ballot_cast' && evt.payload.nullifier === nullifier,
  );
}

export function getAnchorEventForLeaf(state: PocStateV2, bb_leaf_hash: string): PocVclEvent | null {
  const match = state.vcl.events.find(
    (evt) => evt.type === 'ewp_ballot_cast' && evt.payload.bb_leaf_hash === bb_leaf_hash,
  );
  return match ?? null;
}

// ── VCL anchoring helpers ───────────────────────────────────────────────────

export async function recordBbSthPublished(state: PocStateV2, sth: PocSignedTreeHead): Promise<void> {
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'bb_sth_published',
    recorded_at: nowIso(),
    payload: {
      election_id: state.election.election_id,
      bb_root_hash: sth.root_hash,
      tree_size: sth.tree_size,
      kid: sth.kid,
      sth_sig: sth.sig,
    },
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });
}

export async function recordEwpBallotCast(
  state: PocStateV2,
  request: PocCastRequest,
  bb_leaf_hash: string,
  bb_root_hash: string,
): Promise<{ tx_id: Hex0x }> {
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'ewp_ballot_cast',
    recorded_at: nowIso(),
    payload: {
      election_id: request.election_id,
      jurisdiction_id: request.jurisdiction_id,
      deployment_mode: 'mode_3',
      nullifier: request.nullifier,
      ballot_hash: request.encrypted_ballot.ballot_hash,
      bb_leaf_hash,
      bb_root_hash,
      gateway_id: 'ewg_poc_1',
    },
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });
  return { tx_id: signed.tx_id };
}
