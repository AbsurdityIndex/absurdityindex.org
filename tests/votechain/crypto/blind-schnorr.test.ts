import { describe, it, expect } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  verifyBlindSchnorr,
  blindSchnorrIssuance,
} from '../../../src/votechain-poc/crypto/blind-schnorr.js';
import { bytesToB64u, b64uToBytes } from '../../../src/votechain-poc/encoding.js';

describe('crypto/blind-schnorr', () => {
  async function generateIssuerKeys() {
    const sk = secp256k1.utils.randomSecretKey();
    const pk = secp256k1.getPublicKey(sk, true); // compressed 33 bytes
    return { sk, pk };
  }

  function randomVoterPkXOnly(): Uint8Array {
    // Simulate schnorr.getPublicKey (x-only, 32 bytes)
    const sk = secp256k1.utils.randomSecretKey();
    // Use the x-coordinate of the public key (32 bytes)
    const fullPk = secp256k1.getPublicKey(sk, true); // 33 bytes compressed
    return fullPk.slice(1); // strip prefix byte to get x-only 32 bytes
  }

  describe('blindSchnorrIssuance', () => {
    it('produces R (33 bytes) and s (32 bytes)', async () => {
      const issuer = await generateIssuerKeys();
      const voterPk = randomVoterPkXOnly();

      const result = await blindSchnorrIssuance({
        issuer_sk: issuer.sk,
        issuer_pk: issuer.pk,
        voter_pk_xonly: voterPk,
      });

      expect(result.R.length).toBe(33); // compressed point
      expect(result.s.length).toBe(32); // scalar
    });

    it('returns valid blind signature that verifies', async () => {
      const issuer = await generateIssuerKeys();
      const voterPk = randomVoterPkXOnly();

      const sig = await blindSchnorrIssuance({
        issuer_sk: issuer.sk,
        issuer_pk: issuer.pk,
        voter_pk_xonly: voterPk,
      });

      const valid = await verifyBlindSchnorr(issuer.pk, voterPk, sig.R, sig.s);
      expect(valid).toBe(true);
    });

    it('produces different signatures on successive calls (randomized blinding)', async () => {
      const issuer = await generateIssuerKeys();
      const voterPk = randomVoterPkXOnly();

      const sig1 = await blindSchnorrIssuance({
        issuer_sk: issuer.sk,
        issuer_pk: issuer.pk,
        voter_pk_xonly: voterPk,
      });
      const sig2 = await blindSchnorrIssuance({
        issuer_sk: issuer.sk,
        issuer_pk: issuer.pk,
        voter_pk_xonly: voterPk,
      });

      // Same message, same key — but different due to random blinding factors
      expect(bytesToB64u(sig1.R)).not.toBe(bytesToB64u(sig2.R));
    });
  });

  describe('verifyBlindSchnorr', () => {
    it('rejects wrong issuer public key', async () => {
      const issuer = await generateIssuerKeys();
      const wrongIssuer = await generateIssuerKeys();
      const voterPk = randomVoterPkXOnly();

      const sig = await blindSchnorrIssuance({
        issuer_sk: issuer.sk,
        issuer_pk: issuer.pk,
        voter_pk_xonly: voterPk,
      });

      const valid = await verifyBlindSchnorr(wrongIssuer.pk, voterPk, sig.R, sig.s);
      expect(valid).toBe(false);
    });

    it('rejects wrong voter public key', async () => {
      const issuer = await generateIssuerKeys();
      const voterPk = randomVoterPkXOnly();
      const wrongVoterPk = randomVoterPkXOnly();

      const sig = await blindSchnorrIssuance({
        issuer_sk: issuer.sk,
        issuer_pk: issuer.pk,
        voter_pk_xonly: voterPk,
      });

      const valid = await verifyBlindSchnorr(issuer.pk, wrongVoterPk, sig.R, sig.s);
      expect(valid).toBe(false);
    });

    it('rejects tampered s scalar', async () => {
      const issuer = await generateIssuerKeys();
      const voterPk = randomVoterPkXOnly();

      const sig = await blindSchnorrIssuance({
        issuer_sk: issuer.sk,
        issuer_pk: issuer.pk,
        voter_pk_xonly: voterPk,
      });

      // Flip a byte in s
      const tamperedS = new Uint8Array(sig.s);
      tamperedS[0] ^= 0xff;

      const valid = await verifyBlindSchnorr(issuer.pk, voterPk, sig.R, tamperedS);
      expect(valid).toBe(false);
    });

    it('rejects malformed point for R', async () => {
      const issuer = await generateIssuerKeys();
      const voterPk = randomVoterPkXOnly();

      const valid = await verifyBlindSchnorr(
        issuer.pk,
        voterPk,
        new Uint8Array(33), // all-zero point (invalid)
        new Uint8Array(32),
      );
      expect(valid).toBe(false);
    });
  });

  describe('integration with base64url encoding', () => {
    it('signatures round-trip through base64url', async () => {
      const issuer = await generateIssuerKeys();
      const voterPk = randomVoterPkXOnly();

      const sig = await blindSchnorrIssuance({
        issuer_sk: issuer.sk,
        issuer_pk: issuer.pk,
        voter_pk_xonly: voterPk,
      });

      // Encode to base64url (as stored in credential)
      const rB64u = bytesToB64u(sig.R);
      const sB64u = bytesToB64u(sig.s);

      // Decode back and verify
      const valid = await verifyBlindSchnorr(
        issuer.pk,
        voterPk,
        b64uToBytes(rB64u),
        b64uToBytes(sB64u),
      );
      expect(valid).toBe(true);
    });
  });
});
