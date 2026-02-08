/**
 * VoteChain POC — Bulletin Board (BB) Operations
 *
 * Merkle tree hashing, leaf hashing, signed tree heads (STH),
 * and inclusion proof computation / verification.
 */

import type { PocSignedTreeHead, PocStateV2, StoredKeyPair } from './types.js';
import {
  sha256,
  sha256B64u,
  utf8,
  concatBytes,
  canonicalJson,
  bytesToB64u,
  b64uToBytes,
  nowIso,
} from './encoding.js';
import { signB64u, verifyB64u } from './crypto/ecdsa.js';

export async function bbLeafHash(payload: Record<string, unknown>): Promise<string> {
  const body = utf8(canonicalJson(payload));
  return sha256B64u(concatBytes(utf8('votechain:bb:leaf:v1:'), body));
}

async function bbNodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256(concatBytes(utf8('votechain:bb:node:v1:'), left, right));
}

export async function computeMerkleRootFromLeafHashes(leafHashesB64u: string[]): Promise<Uint8Array> {
  if (leafHashesB64u.length === 0)
    return new Uint8Array(await sha256(utf8('votechain:bb:empty:v1')));

  let level = leafHashesB64u.map((h) => b64uToBytes(h));

  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(await bbNodeHash(left, right));
    }
    level = next;
  }

  return level[0];
}

export interface PocInclusionProof {
  leaf_hash: string;
  root_hash: string;
  tree_size: number;
  leaf_index: number;
  path: Array<{ side: 'left' | 'right'; hash: string }>;
}

export async function computeInclusionProof(
  leafHashes: string[],
  leafIndex: number,
): Promise<PocInclusionProof | null> {
  if (leafIndex < 0 || leafIndex >= leafHashes.length) return null;

  const path: Array<{ side: 'left' | 'right'; hash: string }> = [];
  let index = leafIndex;
  let level = leafHashes.map((h) => b64uToBytes(h));

  while (level.length > 1) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    const sibling = level[siblingIndex] ?? level[index];
    path.push({ side: isRight ? 'left' : 'right', hash: bytesToB64u(sibling) });

    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(await bbNodeHash(left, right));
    }

    index = Math.floor(index / 2);
    level = next;
  }

  return {
    leaf_hash: leafHashes[leafIndex],
    root_hash: bytesToB64u(level[0]),
    tree_size: leafHashes.length,
    leaf_index: leafIndex,
    path,
  };
}

export async function verifyInclusionProof(proof: PocInclusionProof): Promise<boolean> {
  let acc = b64uToBytes(proof.leaf_hash);
  for (const step of proof.path) {
    const sibling = b64uToBytes(step.hash);
    acc = step.side === 'left' ? await bbNodeHash(sibling, acc) : await bbNodeHash(acc, sibling);
  }
  return bytesToB64u(acc) === proof.root_hash;
}

export async function issueBbSth(state: PocStateV2): Promise<PocSignedTreeHead> {
  const leafHashes = state.bb.leaves.map((l) => l.leaf_hash);
  const rootBytes = await computeMerkleRootFromLeafHashes(leafHashes);
  const sthUnsigned = {
    tree_size: leafHashes.length,
    root_hash: bytesToB64u(rootBytes),
    timestamp: nowIso(),
    kid: state.keys.bb.kid,
  };
  const sig = await signB64u(state.keys.bb.jwk_private, utf8(canonicalJson(sthUnsigned)));
  const sth: PocSignedTreeHead = { ...sthUnsigned, sig };
  state.bb.sth_history.push(sth);
  return sth;
}

export async function verifyBbSth(sth: PocSignedTreeHead, bbKey: StoredKeyPair): Promise<boolean> {
  const { sig, ...unsigned } = sth;
  return verifyB64u(bbKey.jwk_public, utf8(canonicalJson(unsigned)), sig);
}
