import { describe, it, expect } from 'vitest';
import {
  bbLeafHash,
  computeMerkleRootFromLeafHashes,
  computeInclusionProof,
  verifyInclusionProof,
  issueBbSth,
  verifyBbSth,
} from '../../src/votechain-poc/bulletin-board.js';
import { generateEcdsaKeyPair, exportKeyPair } from '../../src/votechain-poc/crypto/ecdsa.js';
import { bytesToB64u } from '../../src/votechain-poc/encoding.js';
import type { PocStateV2, StoredKeyPair } from '../../src/votechain-poc/types.js';

describe('bulletin-board', () => {
  describe('bbLeafHash', () => {
    it('returns a base64url string', async () => {
      const hash = await bbLeafHash({ foo: 'bar' });
      expect(typeof hash).toBe('string');
      expect(hash).not.toMatch(/[+/=]/);
    });

    it('is deterministic', async () => {
      const h1 = await bbLeafHash({ a: 1, b: 2 });
      const h2 = await bbLeafHash({ a: 1, b: 2 });
      expect(h1).toBe(h2);
    });

    it('is order-independent due to canonical JSON', async () => {
      const h1 = await bbLeafHash({ b: 2, a: 1 });
      const h2 = await bbLeafHash({ a: 1, b: 2 });
      expect(h1).toBe(h2);
    });

    it('different payloads produce different hashes', async () => {
      const h1 = await bbLeafHash({ data: 'A' });
      const h2 = await bbLeafHash({ data: 'B' });
      expect(h1).not.toBe(h2);
    });
  });

  describe('computeMerkleRootFromLeafHashes', () => {
    it('handles empty tree', async () => {
      const root = await computeMerkleRootFromLeafHashes([]);
      expect(root.length).toBe(32); // SHA-256 of empty marker
    });

    it('single leaf: root is derived from the leaf', async () => {
      const leaf = await bbLeafHash({ x: 1 });
      const root = await computeMerkleRootFromLeafHashes([leaf]);
      expect(root.length).toBe(32);
    });

    it('is deterministic', async () => {
      const leaves = [
        await bbLeafHash({ x: 1 }),
        await bbLeafHash({ x: 2 }),
        await bbLeafHash({ x: 3 }),
      ];
      const r1 = await computeMerkleRootFromLeafHashes(leaves);
      const r2 = await computeMerkleRootFromLeafHashes(leaves);
      expect(r1).toEqual(r2);
    });

    it('different leaf sets produce different roots', async () => {
      const leaves1 = [await bbLeafHash({ x: 1 })];
      const leaves2 = [await bbLeafHash({ x: 2 })];
      const r1 = await computeMerkleRootFromLeafHashes(leaves1);
      const r2 = await computeMerkleRootFromLeafHashes(leaves2);
      expect(bytesToB64u(r1)).not.toBe(bytesToB64u(r2));
    });

    it('handles power-of-two number of leaves', async () => {
      const leaves = await Promise.all(
        [1, 2, 3, 4].map((i) => bbLeafHash({ i })),
      );
      const root = await computeMerkleRootFromLeafHashes(leaves);
      expect(root.length).toBe(32);
    });

    it('handles non-power-of-two leaves (odd count)', async () => {
      const leaves = await Promise.all(
        [1, 2, 3].map((i) => bbLeafHash({ i })),
      );
      const root = await computeMerkleRootFromLeafHashes(leaves);
      expect(root.length).toBe(32);
    });
  });

  describe('inclusion proof', () => {
    it('computes and verifies proof for first leaf', async () => {
      const leaves = await Promise.all(
        [1, 2, 3, 4].map((i) => bbLeafHash({ i })),
      );
      const proof = await computeInclusionProof(leaves, 0);
      expect(proof).not.toBeNull();
      expect(proof!.leaf_index).toBe(0);
      expect(proof!.tree_size).toBe(4);

      const valid = await verifyInclusionProof(proof!);
      expect(valid).toBe(true);
    });

    it('computes and verifies proof for last leaf', async () => {
      const leaves = await Promise.all(
        [1, 2, 3, 4].map((i) => bbLeafHash({ i })),
      );
      const proof = await computeInclusionProof(leaves, 3);
      expect(proof).not.toBeNull();

      const valid = await verifyInclusionProof(proof!);
      expect(valid).toBe(true);
    });

    it('verifies proof for middle leaf', async () => {
      const leaves = await Promise.all(
        [1, 2, 3, 4, 5].map((i) => bbLeafHash({ i })),
      );
      const proof = await computeInclusionProof(leaves, 2);
      expect(proof).not.toBeNull();

      const valid = await verifyInclusionProof(proof!);
      expect(valid).toBe(true);
    });

    it('root_hash matches computeMerkleRootFromLeafHashes', async () => {
      const leaves = await Promise.all(
        [1, 2, 3].map((i) => bbLeafHash({ i })),
      );
      const proof = await computeInclusionProof(leaves, 1);
      const root = await computeMerkleRootFromLeafHashes(leaves);

      expect(proof!.root_hash).toBe(bytesToB64u(root));
    });

    it('returns null for out-of-bounds index', async () => {
      const leaves = [await bbLeafHash({ x: 1 })];
      expect(await computeInclusionProof(leaves, -1)).toBeNull();
      expect(await computeInclusionProof(leaves, 1)).toBeNull();
    });

    it('single leaf has empty path', async () => {
      const leaves = [await bbLeafHash({ x: 1 })];
      const proof = await computeInclusionProof(leaves, 0);
      expect(proof!.path.length).toBe(0);
      const valid = await verifyInclusionProof(proof!);
      expect(valid).toBe(true);
    });

    it('tampered leaf_hash fails verification', async () => {
      const leaves = await Promise.all(
        [1, 2, 3, 4].map((i) => bbLeafHash({ i })),
      );
      const proof = await computeInclusionProof(leaves, 1);
      // Tamper with the leaf hash
      proof!.leaf_hash = await bbLeafHash({ i: 999 });

      const valid = await verifyInclusionProof(proof!);
      expect(valid).toBe(false);
    });
  });

  describe('issueBbSth / verifyBbSth', () => {
    async function makeMinimalState(): Promise<{ state: PocStateV2; bbKey: StoredKeyPair }> {
      const bbKp = await generateEcdsaKeyPair();
      const bbKey: StoredKeyPair = await exportKeyPair(bbKp, 'bb-kid');

      const leaves = [
        { leaf_hash: await bbLeafHash({ x: 1 }), payload: { x: 1 } },
        { leaf_hash: await bbLeafHash({ x: 2 }), payload: { x: 2 } },
      ];

      const state = {
        bb: { leaves, sth_history: [] as PocStateV2['bb']['sth_history'] },
        keys: { bb: bbKey },
      } as unknown as PocStateV2;

      return { state, bbKey };
    }

    it('issues a signed tree head', async () => {
      const { state } = await makeMinimalState();
      const sth = await issueBbSth(state);

      expect(sth.tree_size).toBe(2);
      expect(typeof sth.root_hash).toBe('string');
      expect(typeof sth.timestamp).toBe('string');
      expect(sth.kid).toBe('bb-kid');
      expect(typeof sth.sig).toBe('string');
    });

    it('STH is appended to sth_history', async () => {
      const { state } = await makeMinimalState();
      expect(state.bb.sth_history.length).toBe(0);
      await issueBbSth(state);
      expect(state.bb.sth_history.length).toBe(1);
    });

    it('verifyBbSth succeeds for valid STH', async () => {
      const { state, bbKey } = await makeMinimalState();
      const sth = await issueBbSth(state);

      const valid = await verifyBbSth(sth, bbKey);
      expect(valid).toBe(true);
    });

    it('verifyBbSth fails with wrong key', async () => {
      const { state } = await makeMinimalState();
      const sth = await issueBbSth(state);

      const otherKp = await generateEcdsaKeyPair();
      const otherKey = await exportKeyPair(otherKp, 'other-kid');

      const valid = await verifyBbSth(sth, otherKey);
      expect(valid).toBe(false);
    });

    it('verifyBbSth fails if STH is tampered', async () => {
      const { state, bbKey } = await makeMinimalState();
      const sth = await issueBbSth(state);

      const tampered = { ...sth, tree_size: 999 };
      const valid = await verifyBbSth(tampered, bbKey);
      expect(valid).toBe(false);
    });
  });
});
