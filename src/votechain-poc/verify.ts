/* eslint-disable no-undef */
/**
 * VoteChain POC — Receipt Verification
 *
 * Verifies a cast receipt against the local BB and VCL state:
 * manifest anchor, receipt signature, STH, leaf inclusion, and VCL anchor.
 */

import type {
  PocCastReceipt,
  VerifyStatus,
} from './types.js';
import { verifyB64u } from './crypto/ecdsa.js';
import { computeInclusionProof, verifyInclusionProof, verifyBbSth } from './bulletin-board.js';
import type { PocInclusionProof } from './bulletin-board.js';
import { getAnchorEventForLeaf, vclVerifyEvent } from './vcl.js';
import { ensureInitialized } from './state.js';
import { utf8, canonicalJson } from './encoding.js';

export interface ReceiptVerificationResult {
  status: VerifyStatus;
  checks: Array<{ name: string; status: VerifyStatus; details?: string }>;
  inclusion_proof?: PocInclusionProof;
}

async function verifyReceiptSig(receipt: PocCastReceipt, ewgKey: { jwk_public: JsonWebKey }): Promise<boolean> {
  const { sig, ...unsigned } = receipt;
  return verifyB64u(ewgKey.jwk_public, utf8(canonicalJson(unsigned)), sig);
}

export async function verifyReceipt(receipt: PocCastReceipt): Promise<ReceiptVerificationResult> {
  const state = await ensureInitialized();
  const checks: Array<{ name: string; status: VerifyStatus; details?: string }> = [];

  // Manifest anchored?
  const manifestEvent = state.vcl.events.find(
    (e) =>
      e.type === 'election_manifest_published' && e.payload.manifest_id === receipt.manifest_id,
  );
  checks.push({
    name: 'manifest_anchored',
    status: manifestEvent ? 'ok' : 'fail',
    details: manifestEvent
      ? `tx_id=${manifestEvent.tx_id}`
      : 'No election_manifest_published event found.',
  });

  // Receipt signature
  const receiptSigOk = await verifyReceiptSig(receipt, state.keys.ewg);
  checks.push({
    name: 'receipt_signature',
    status: receiptSigOk ? 'ok' : 'fail',
    details: receiptSigOk ? `kid=${receipt.kid}` : 'Receipt signature invalid.',
  });

  // BB STH signature
  const sthOk = await verifyBbSth(receipt.bb_sth, state.keys.bb);
  checks.push({
    name: 'bb_sth_signature',
    status: sthOk ? 'ok' : 'fail',
    details: sthOk ? `kid=${receipt.bb_sth.kid}` : 'STH signature invalid.',
  });

  // Leaf exists?
  const leaf = state.bb.leaves.find((l) => l.leaf_hash === receipt.bb_leaf_hash);
  checks.push({
    name: 'bb_leaf_exists',
    status: leaf ? 'ok' : 'fail',
    details: leaf
      ? 'Leaf present in local bulletin board.'
      : 'Leaf not found in local bulletin board.',
  });

  // Inclusion proof
  let inclusionProof: PocInclusionProof | undefined;
  if (leaf) {
    const leafHashes = state.bb.leaves.map((l) => l.leaf_hash);
    const idx = leafHashes.indexOf(receipt.bb_leaf_hash);
    const computed = await computeInclusionProof(leafHashes, idx);
    inclusionProof = computed ?? undefined;
    const proofOk = inclusionProof ? await verifyInclusionProof(inclusionProof) : false;
    const rootMatches = inclusionProof
      ? inclusionProof.root_hash === receipt.bb_sth.root_hash
      : false;
    checks.push({
      name: 'bb_inclusion_proof',
      status: proofOk && rootMatches ? 'ok' : 'fail',
      details:
        proofOk && rootMatches
          ? `leaf_index=${idx} tree_size=${leafHashes.length}`
          : 'Inclusion proof failed or root hash mismatch.',
    });
  } else {
    checks.push({
      name: 'bb_inclusion_proof',
      status: 'fail',
      details: 'Cannot compute inclusion proof without the leaf.',
    });
  }

  // VoteChain anchor event
  const anchorEvent = getAnchorEventForLeaf(state, receipt.bb_leaf_hash);
  const anchorOk = !!anchorEvent && anchorEvent.tx_id === receipt.votechain_anchor.tx_id;
  checks.push({
    name: 'votechain_anchor',
    status: anchorOk ? 'ok' : 'fail',
    details: anchorOk
      ? `tx_id=${receipt.votechain_anchor.tx_id}`
      : 'No matching ewp_ballot_cast event found.',
  });

  // Anchor event signature
  if (anchorEvent) {
    const vclSigOk = await vclVerifyEvent(anchorEvent, state.keys.vcl);
    checks.push({
      name: 'votechain_anchor_signature',
      status: vclSigOk ? 'ok' : 'fail',
      details: vclSigOk ? `kid=${anchorEvent.kid}` : 'VCL event signature invalid.',
    });
  } else {
    checks.push({
      name: 'votechain_anchor_signature',
      status: 'fail',
      details: 'No anchor event available to verify signature.',
    });
  }

  const status = checks.every((c) => c.status === 'ok') ? 'ok' : 'fail';
  return { status, checks, inclusion_proof: inclusionProof };
}
