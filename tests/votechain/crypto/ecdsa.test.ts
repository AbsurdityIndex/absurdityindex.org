import { describe, it, expect } from 'vitest';
import {
  generateEcdsaKeyPair,
  exportKeyPair,
  importPublicKey,
  importPrivateKey,
  signB64u,
  verifyB64u,
} from '../../../src/votechain-poc/crypto/ecdsa.js';
import { utf8 } from '../../../src/votechain-poc/encoding.js';

describe('crypto/ecdsa', () => {
  describe('generateEcdsaKeyPair', () => {
    it('generates a P-256 key pair', async () => {
      const kp = await generateEcdsaKeyPair();
      expect(kp.publicKey).toBeDefined();
      expect(kp.privateKey).toBeDefined();
      expect(kp.publicKey.algorithm).toMatchObject({ name: 'ECDSA' });
    });
  });

  describe('exportKeyPair', () => {
    it('exports with correct kid and alg', async () => {
      const kp = await generateEcdsaKeyPair();
      const stored = await exportKeyPair(kp, 'test-kid-1');

      expect(stored.kid).toBe('test-kid-1');
      expect(stored.alg).toBe('ECDSA_P-256_SHA256');
      expect(stored.jwk_public).toBeDefined();
      expect(stored.jwk_private).toBeDefined();
      expect(stored.jwk_public.kty).toBe('EC');
      expect(stored.jwk_public.crv).toBe('P-256');
    });

    it('public JWK does not contain private key material', async () => {
      const kp = await generateEcdsaKeyPair();
      const stored = await exportKeyPair(kp, 'test-kid');

      expect(stored.jwk_public.d).toBeUndefined();
      expect(stored.jwk_private.d).toBeDefined();
    });
  });

  describe('importPublicKey / importPrivateKey', () => {
    it('round-trips through export/import', async () => {
      const kp = await generateEcdsaKeyPair();
      const stored = await exportKeyPair(kp, 'test-kid');

      const importedPublic = await importPublicKey(stored.jwk_public);
      const importedPrivate = await importPrivateKey(stored.jwk_private);

      expect(importedPublic.type).toBe('public');
      expect(importedPrivate.type).toBe('private');
    });
  });

  describe('signB64u / verifyB64u', () => {
    it('sign then verify succeeds', async () => {
      const kp = await generateEcdsaKeyPair();
      const stored = await exportKeyPair(kp, 'test-kid');

      const message = utf8('hello world');
      const sig = await signB64u(stored.jwk_private, message);

      const valid = await verifyB64u(stored.jwk_public, message, sig);
      expect(valid).toBe(true);
    });

    it('signature is base64url encoded', async () => {
      const kp = await generateEcdsaKeyPair();
      const stored = await exportKeyPair(kp, 'test-kid');

      const sig = await signB64u(stored.jwk_private, utf8('test'));
      expect(sig).not.toMatch(/[+/=]/);
      expect(typeof sig).toBe('string');
    });

    it('rejects tampered message', async () => {
      const kp = await generateEcdsaKeyPair();
      const stored = await exportKeyPair(kp, 'test-kid');

      const sig = await signB64u(stored.jwk_private, utf8('original'));
      const valid = await verifyB64u(stored.jwk_public, utf8('tampered'), sig);
      expect(valid).toBe(false);
    });

    it('rejects wrong public key', async () => {
      const kp1 = await generateEcdsaKeyPair();
      const stored1 = await exportKeyPair(kp1, 'kid-1');
      const kp2 = await generateEcdsaKeyPair();
      const stored2 = await exportKeyPair(kp2, 'kid-2');

      const message = utf8('message');
      const sig = await signB64u(stored1.jwk_private, message);
      const valid = await verifyB64u(stored2.jwk_public, message, sig);
      expect(valid).toBe(false);
    });

    it('produces different signatures for different messages', async () => {
      const kp = await generateEcdsaKeyPair();
      const stored = await exportKeyPair(kp, 'test-kid');

      const sig1 = await signB64u(stored.jwk_private, utf8('message1'));
      const sig2 = await signB64u(stored.jwk_private, utf8('message2'));
      expect(sig1).not.toBe(sig2);
    });

    it('ECDSA signatures are non-deterministic (different each time)', async () => {
      const kp = await generateEcdsaKeyPair();
      const stored = await exportKeyPair(kp, 'test-kid');
      const message = utf8('same message');

      const sig1 = await signB64u(stored.jwk_private, message);
      const sig2 = await signB64u(stored.jwk_private, message);

      // Both should verify
      expect(await verifyB64u(stored.jwk_public, message, sig1)).toBe(true);
      expect(await verifyB64u(stored.jwk_public, message, sig2)).toBe(true);

      // But are typically different (ECDSA with random k)
      // Note: this could theoretically fail but probability is ~2^-256
      expect(sig1).not.toBe(sig2);
    });
  });
});
