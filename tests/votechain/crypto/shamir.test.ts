import { describe, it, expect } from 'vitest';
import { shamirSplit, shamirCombine } from '../../../src/votechain-poc/crypto/shamir.js';
import { SECP256K1_ORDER, mod, bytesToBigIntBE } from '../../../src/votechain-poc/crypto/bigint.js';

describe('crypto/shamir', () => {
  describe('shamirSplit', () => {
    it('produces the correct number of shares', () => {
      const shares = shamirSplit(42n, 2, 3);
      expect(shares.length).toBe(3);
    });

    it('shares have sequential x-coordinates starting at 1', () => {
      const shares = shamirSplit(100n, 2, 5);
      expect(shares.map((s) => Number(s.x))).toEqual([1, 2, 3, 4, 5]);
    });

    it('throws if threshold < 2', () => {
      expect(() => shamirSplit(42n, 1, 3)).toThrow('threshold must be >= 2');
    });

    it('throws if n < t', () => {
      expect(() => shamirSplit(42n, 3, 2)).toThrow('n must be >= t');
    });

    it('shares are within the field', () => {
      const shares = shamirSplit(42n, 2, 3);
      for (const s of shares) {
        expect(s.y >= 0n).toBe(true);
        expect(s.y < SECP256K1_ORDER).toBe(true);
      }
    });
  });

  describe('shamirCombine', () => {
    it('reconstructs secret from t shares (2-of-3)', () => {
      const secret = 123456789n;
      const shares = shamirSplit(secret, 2, 3);

      // Any 2 out of 3 should reconstruct the secret
      expect(shamirCombine([shares[0], shares[1]])).toBe(secret);
      expect(shamirCombine([shares[0], shares[2]])).toBe(secret);
      expect(shamirCombine([shares[1], shares[2]])).toBe(secret);
    });

    it('reconstructs secret from t shares (3-of-5)', () => {
      const secret = SECP256K1_ORDER - 1n; // large secret
      const shares = shamirSplit(secret, 3, 5);

      expect(shamirCombine([shares[0], shares[1], shares[2]])).toBe(secret);
      expect(shamirCombine([shares[2], shares[3], shares[4]])).toBe(secret);
      expect(shamirCombine([shares[0], shares[2], shares[4]])).toBe(secret);
    });

    it('works with all shares', () => {
      const secret = 42n;
      const shares = shamirSplit(secret, 2, 3);
      expect(shamirCombine(shares)).toBe(secret);
    });

    it('reconstructs zero secret', () => {
      const secret = 0n;
      const shares = shamirSplit(secret, 2, 3);
      expect(shamirCombine([shares[0], shares[1]])).toBe(0n);
    });

    it('reconstructs secret = 1', () => {
      const secret = 1n;
      const shares = shamirSplit(secret, 2, 3);
      expect(shamirCombine([shares[0], shares[1]])).toBe(1n);
    });

    it('fails with insufficient shares (reconstruction is incorrect)', () => {
      const secret = 999n;
      const shares = shamirSplit(secret, 3, 5);
      // Only 2 shares when threshold is 3 — result should NOT equal secret
      const badReconstruction = shamirCombine([shares[0], shares[1]]);
      expect(badReconstruction).not.toBe(secret);
    });

    it('throws on empty shares array', () => {
      expect(() => shamirCombine([])).toThrow('no shares');
    });

    it('handles secret that needs mod reduction', () => {
      // Secret larger than field order should get reduced
      const secret = SECP256K1_ORDER + 5n;
      const shares = shamirSplit(secret, 2, 3);
      // shamirSplit reduces the secret mod q, so we expect mod(secret, q)
      expect(shamirCombine([shares[0], shares[1]])).toBe(mod(secret, SECP256K1_ORDER));
    });
  });

  describe('round-trip with realistic parameters', () => {
    it('handles POC-style 2-of-3 threshold for election secret', () => {
      // Simulate what state.ts does: random 32-byte election secret
      const skBytes = new Uint8Array(32);
      crypto.getRandomValues(skBytes);
      const secret = bytesToBigIntBE(skBytes);
      const reducedSecret = mod(secret, SECP256K1_ORDER);

      const shares = shamirSplit(reducedSecret, 2, 3);
      expect(shares.length).toBe(3);

      const recovered = shamirCombine([shares[0], shares[2]]);
      expect(recovered).toBe(reducedSecret);
    });
  });
});
