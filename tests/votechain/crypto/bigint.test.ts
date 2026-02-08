import { describe, it, expect } from 'vitest';
import {
  SECP256K1_ORDER,
  bytesToBigIntBE,
  bigIntToBytesBE,
  mod,
  modInv,
} from '../../../src/votechain-poc/crypto/bigint.js';

describe('crypto/bigint', () => {
  describe('SECP256K1_ORDER', () => {
    it('is the correct curve order', () => {
      // secp256k1 order n = FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
      expect(SECP256K1_ORDER).toBe(
        BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141'),
      );
    });

    it('is a 256-bit number', () => {
      expect(SECP256K1_ORDER.toString(16).length).toBeLessThanOrEqual(64);
      expect(SECP256K1_ORDER > 2n ** 255n).toBe(true);
    });
  });

  describe('bytesToBigIntBE', () => {
    it('converts empty bytes to 0', () => {
      expect(bytesToBigIntBE(new Uint8Array([]))).toBe(0n);
    });

    it('converts single byte', () => {
      expect(bytesToBigIntBE(new Uint8Array([0xff]))).toBe(255n);
    });

    it('converts multi-byte big-endian', () => {
      // 0x0102 = 258
      expect(bytesToBigIntBE(new Uint8Array([0x01, 0x02]))).toBe(258n);
    });

    it('converts 32-byte scalar', () => {
      const bytes = new Uint8Array(32);
      bytes[31] = 1; // lowest byte = 1
      expect(bytesToBigIntBE(bytes)).toBe(1n);
    });

    it('handles leading zeros', () => {
      expect(bytesToBigIntBE(new Uint8Array([0, 0, 0, 0x0a]))).toBe(10n);
    });

    it('round-trips with bigIntToBytesBE', () => {
      const value = 12345678901234567890n;
      const bytes = bigIntToBytesBE(value, 32);
      expect(bytesToBigIntBE(bytes)).toBe(value);
    });
  });

  describe('bigIntToBytesBE', () => {
    it('converts 0 to zero bytes', () => {
      const result = bigIntToBytesBE(0n, 4);
      expect(result).toEqual(new Uint8Array([0, 0, 0, 0]));
    });

    it('converts small number to padded bytes', () => {
      const result = bigIntToBytesBE(258n, 4);
      expect(result).toEqual(new Uint8Array([0, 0, 1, 2]));
    });

    it('converts to exact length', () => {
      const result = bigIntToBytesBE(255n, 1);
      expect(result).toEqual(new Uint8Array([0xff]));
    });

    it('throws on negative input', () => {
      expect(() => bigIntToBytesBE(-1n, 4)).toThrow('negative');
    });

    it('produces correct 32-byte output for large values', () => {
      const result = bigIntToBytesBE(SECP256K1_ORDER - 1n, 32);
      expect(result.length).toBe(32);
      expect(bytesToBigIntBE(result)).toBe(SECP256K1_ORDER - 1n);
    });
  });

  describe('mod', () => {
    it('reduces positive values', () => {
      expect(mod(10n, 3n)).toBe(1n);
    });

    it('handles zero', () => {
      expect(mod(0n, 7n)).toBe(0n);
    });

    it('handles negative values (returns positive)', () => {
      // -1 mod 5 should be 4, not -1
      expect(mod(-1n, 5n)).toBe(4n);
      expect(mod(-7n, 5n)).toBe(3n);
    });

    it('handles values larger than modulus', () => {
      expect(mod(SECP256K1_ORDER + 5n, SECP256K1_ORDER)).toBe(5n);
    });

    it('is identity for values less than modulus', () => {
      expect(mod(42n, SECP256K1_ORDER)).toBe(42n);
    });
  });

  describe('modInv', () => {
    it('computes multiplicative inverse', () => {
      // 3 * modInv(3, 7) ≡ 1 (mod 7)
      const inv = modInv(3n, 7n);
      expect(mod(3n * inv, 7n)).toBe(1n);
    });

    it('works for secp256k1 order', () => {
      const a = 42n;
      const inv = modInv(a, SECP256K1_ORDER);
      expect(mod(a * inv, SECP256K1_ORDER)).toBe(1n);
    });

    it('handles large values', () => {
      const a = SECP256K1_ORDER - 1n;
      const inv = modInv(a, SECP256K1_ORDER);
      expect(mod(a * inv, SECP256K1_ORDER)).toBe(1n);
    });

    it('throws for non-invertible input', () => {
      // 0 has no inverse
      expect(() => modInv(0n, 7n)).toThrow('not invertible');
    });

    it('inverse of 1 is 1', () => {
      expect(modInv(1n, SECP256K1_ORDER)).toBe(1n);
    });
  });
});
