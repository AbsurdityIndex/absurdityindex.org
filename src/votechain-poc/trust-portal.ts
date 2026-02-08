/* eslint-disable no-undef */
/**
 * VoteChain POC — Trust Portal & Public Verification
 *
 * Wrap internal crypto operations for the Public Trust Portal,
 * enabling independent verification of every signature and data
 * structure in the system.
 */

import type { PocTally, VerifyStatus } from './types.js';
import {
  sha256B64u,
  utf8,
  canonicalJson,
  bytesToB64u,
} from './encoding.js';
import { verifyB64u } from './crypto/ecdsa.js';
import { verifyManifest } from './manifest.js';
import { computeMerkleRootFromLeafHashes, verifyBbSth } from './bulletin-board.js';
import { vclVerifyEvent } from './vcl.js';
import { ensureInitialized } from './state.js';
import type { ReceiptVerificationResult } from './verify.js';

export async function verifyManifestSignature(): Promise<{
  valid: boolean;
  manifest_id: string;
  kid: string;
}> {
  const state = await ensureInitialized();
  const valid = await verifyManifest(state.manifest, state.keys.manifest);
  return {
    valid,
    manifest_id: state.manifest.manifest_id,
    kid: state.manifest.signing.kid,
  };
}

export async function verifyAllSthSignatures(): Promise<{
  total: number;
  all_valid: boolean;
  results: Array<{ tree_size: number; timestamp: string; valid: boolean }>;
}> {
  const state = await ensureInitialized();
  const results: Array<{ tree_size: number; timestamp: string; valid: boolean }> = [];
  for (const sth of state.bb.sth_history) {
    const valid = await verifyBbSth(sth, state.keys.bb);
    results.push({ tree_size: sth.tree_size, timestamp: sth.timestamp, valid });
  }
  return {
    total: results.length,
    all_valid: results.every((r) => r.valid),
    results,
  };
}

export async function verifyAllVclEventSignatures(): Promise<{
  total: number;
  all_valid: boolean;
  results: Array<{ tx_id: string; type: string; valid: boolean }>;
}> {
  const state = await ensureInitialized();
  const results: Array<{ tx_id: string; type: string; valid: boolean }> = [];
  for (const event of state.vcl.events) {
    const valid = await vclVerifyEvent(event, state.keys.vcl);
    results.push({ tx_id: event.tx_id, type: event.type, valid });
  }
  return {
    total: results.length,
    all_valid: results.every((r) => r.valid),
    results,
  };
}

export async function verifyBulletinBoardIntegrity(): Promise<{
  valid: boolean;
  tree_size: number;
  computed_root: string;
  latest_sth_root: string;
}> {
  const state = await ensureInitialized();
  const leafHashes = state.bb.leaves.map((l) => l.leaf_hash);
  const computedRootBytes = await computeMerkleRootFromLeafHashes(leafHashes);
  const computed_root = bytesToB64u(computedRootBytes);
  const latestSth = state.bb.sth_history.at(-1);
  const latest_sth_root = latestSth?.root_hash ?? '';
  // If there are no STHs and no leaves, the tree is trivially valid (empty state)
  const valid = latestSth ? computed_root === latest_sth_root : leafHashes.length === 0;
  return {
    valid,
    tree_size: leafHashes.length,
    computed_root,
    latest_sth_root,
  };
}

export async function getPublicKeys(): Promise<{
  manifest: { kid: string; alg: string; jwk: JsonWebKey };
  ewg: { kid: string; alg: string; jwk: JsonWebKey };
  bb: { kid: string; alg: string; jwk: JsonWebKey };
  vcl: { kid: string; alg: string; jwk: JsonWebKey };
  issuers: Array<{ index: number; alg: string; pk: string }>;
  issuer_threshold: { t: number; n: number };
}> {
  const state = await ensureInitialized();
  return {
    manifest: { kid: state.keys.manifest.kid, alg: state.keys.manifest.alg, jwk: state.keys.manifest.jwk_public },
    ewg: { kid: state.keys.ewg.kid, alg: state.keys.ewg.alg, jwk: state.keys.ewg.jwk_public },
    bb: { kid: state.keys.bb.kid, alg: state.keys.bb.alg, jwk: state.keys.bb.jwk_public },
    vcl: { kid: state.keys.vcl.kid, alg: state.keys.vcl.alg, jwk: state.keys.vcl.jwk_public },
    issuers: state.issuers.map((iss, i) => ({
      index: i,
      alg: 'blind_schnorr_secp256k1',
      pk: iss.pk,
    })),
    issuer_threshold: state.issuer_threshold,
  };
}

/** Verify that credential issuance count does not exceed voter roll commitment ceiling. */
export async function verifyCredentialIssuanceIntegrity(): Promise<{
  valid: boolean;
  issuance_count: number;
  voter_roll_total: number;
  issuer_count: number;
  issuer_threshold: { t: number; n: number };
  vcl_issuance_events: number;
}> {
  const state = await ensureInitialized();
  const voterRoll = state.manifest.crypto.voter_roll_commitment;
  const vclIssuanceEvents = state.vcl.events.filter((e) => e.type === 'credential_issued').length;

  return {
    valid: state.credential_issuance_count <= voterRoll.total_eligible
      && state.credential_issuance_count === vclIssuanceEvents,
    issuance_count: state.credential_issuance_count,
    voter_roll_total: voterRoll.total_eligible,
    issuer_count: state.issuers.length,
    issuer_threshold: state.issuer_threshold,
    vcl_issuance_events: vclIssuanceEvents,
  };
}

export async function verifyTally(tally: PocTally): Promise<ReceiptVerificationResult> {
  const state = await ensureInitialized();
  const checks: Array<{ name: string; status: VerifyStatus; details?: string }> = [];

  const tallyHash = await sha256B64u(utf8(canonicalJson(tally)));

  const sigOk = await verifyB64u(
    state.keys.ewg.jwk_public,
    utf8(canonicalJson({ ...tally, sig: undefined })),
    tally.sig,
  );
  checks.push({
    name: 'tally_signature',
    status: sigOk ? 'ok' : 'fail',
    details: sigOk ? `kid=${tally.kid}` : 'Tally signature invalid.',
  });

  const anchored = state.vcl.events.some(
    (e) => e.type === 'tally_published' && e.payload.tally_hash === tallyHash,
  );
  checks.push({
    name: 'tally_anchored',
    status: anchored ? 'ok' : 'fail',
    details: anchored ? 'Found tally_published anchor.' : 'No tally_published anchor found.',
  });

  const status = checks.every((c) => c.status === 'ok') ? 'ok' : 'fail';
  return { status, checks };
}
