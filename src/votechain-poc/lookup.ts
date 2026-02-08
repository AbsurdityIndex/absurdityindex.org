/**
 * VoteChain POC — Ballot Lookup
 *
 * Look up a ballot by its hash on the bulletin board and verify
 * its inclusion proof, VCL anchor, and STH signature.
 */

import type { PocSignedTreeHead, VerifyStatus } from './types.js';
import { computeInclusionProof, verifyInclusionProof, verifyBbSth } from './bulletin-board.js';
import type { PocInclusionProof } from './bulletin-board.js';
import { vclVerifyEvent } from './vcl.js';
import { ensureInitialized } from './state.js';

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

export async function lookupBallotByHash(ballotHash: string): Promise<BallotLookupResult> {
  const state = await ensureInitialized();
  const checks: Array<{ name: string; status: VerifyStatus; details?: string }> = [];

  // Find the leaf containing this ballot hash
  const leafIndex = state.bb.leaves.findIndex(
    (l) =>
      (l.payload as Record<string, unknown> | undefined)?.encrypted_ballot
        ? ((l.payload as Record<string, Record<string, unknown>>).encrypted_ballot?.ballot_hash === ballotHash)
        : false,
  );

  if (leafIndex === -1) {
    checks.push({
      name: 'ballot_on_bulletin_board',
      status: 'fail',
      details: 'No ballot with this hash found on the bulletin board.',
    });
    return { found: false, ballot_hash: ballotHash, checks };
  }

  const leaf = state.bb.leaves[leafIndex];
  const receivedAt = (leaf.payload as Record<string, unknown> | undefined)?.received_at as string | undefined;

  checks.push({
    name: 'ballot_on_bulletin_board',
    status: 'ok',
    details: `Found at leaf index ${leafIndex} (leaf_hash: ${leaf.leaf_hash.slice(0, 16)}...)`,
  });

  // Compute inclusion proof
  const leafHashes = state.bb.leaves.map((l) => l.leaf_hash);
  const proof = await computeInclusionProof(leafHashes, leafIndex);
  const proofOk = proof ? await verifyInclusionProof(proof) : false;

  checks.push({
    name: 'merkle_inclusion_proof',
    status: proofOk ? 'ok' : 'fail',
    details: proofOk
      ? `Verified at leaf_index=${leafIndex}, tree_size=${leafHashes.length}`
      : 'Inclusion proof verification failed.',
  });

  // Check for VCL anchor event
  const anchorEvent = state.vcl.events.find(
    (evt) => evt.type === 'ewp_ballot_cast' && evt.payload.ballot_hash === ballotHash,
  );

  checks.push({
    name: 'votechain_anchor',
    status: anchorEvent ? 'ok' : 'fail',
    details: anchorEvent
      ? `Anchored: tx_id=${anchorEvent.tx_id.slice(0, 16)}...`
      : 'No matching ewp_ballot_cast event found on the ledger.',
  });

  // Verify anchor event signature
  if (anchorEvent) {
    const sigOk = await vclVerifyEvent(anchorEvent, state.keys.vcl);
    checks.push({
      name: 'anchor_signature',
      status: sigOk ? 'ok' : 'fail',
      details: sigOk ? `Signature valid (kid=${anchorEvent.kid})` : 'VCL event signature invalid.',
    });
  }

  // Latest STH
  const latestSth = state.bb.sth_history.at(-1);
  if (latestSth) {
    const sthOk = await verifyBbSth(latestSth, state.keys.bb);
    checks.push({
      name: 'latest_sth_signature',
      status: sthOk ? 'ok' : 'fail',
      details: sthOk
        ? `STH tree_size=${latestSth.tree_size}, signed by ${latestSth.kid}`
        : 'Latest STH signature invalid.',
    });
  }

  return {
    found: true,
    ballot_hash: ballotHash,
    leaf_hash: leaf.leaf_hash,
    leaf_index: leafIndex,
    received_at: receivedAt,
    inclusion_proof: proof ?? undefined,
    anchor_event: anchorEvent
      ? {
          tx_id: anchorEvent.tx_id,
          recorded_at: anchorEvent.recorded_at,
          nullifier: anchorEvent.payload.nullifier as string | undefined,
        }
      : undefined,
    latest_sth: latestSth,
    checks,
  };
}
