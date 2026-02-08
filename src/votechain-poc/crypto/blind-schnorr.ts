/**
 * VoteChain POC — Blind Schnorr Signature Primitives
 *
 * Protocol (s = k − c·sk convention):
 *
 *   Setup: Issuer has (sk_I, PK_I = sk_I·G)
 *
 *   1. ISSUER:  k ∈ Z_q,  R = k·G  →  send R to voter
 *   2. VOTER:   α, β ∈ Z_q
 *               R' = R + α·G + β·PK_I
 *               c' = H("votechain:blind_schnorr:v1:" ‖ R' ‖ PK_I ‖ m)
 *               c  = c' − β mod q   →  send c to issuer
 *   3. ISSUER:  s  = k − c·sk_I mod q  →  send s to voter
 *   4. VOTER:   s' = s + α mod q
 *
 *   Signature: (R', s')
 *   Verify(PK_I, m, R', s'):  c' = H(…),  check s'·G + c'·PK_I == R'
 *
 * Message `m` = voter's x-only public key (32 bytes).
 */

import { secp256k1 } from '@noble/curves/secp256k1';

import { sha256, concatBytes, utf8 } from '../encoding.js';
import { SECP256K1_ORDER, bytesToBigIntBE, bigIntToBytesBE, mod } from './bigint.js';

async function blindSchnorrChallenge(
  RPrime: Uint8Array, // compressed point (33 bytes)
  pkIssuer: Uint8Array, // compressed point (33 bytes)
  message: Uint8Array, // voter's x-only pk (32 bytes)
): Promise<bigint> {
  // Domain-separated SHA-256 hash reduced mod q
  const hash = await sha256(
    concatBytes(
      utf8('votechain:blind_schnorr:v1:'),
      RPrime,
      pkIssuer,
      message,
    ),
  );
  return mod(bytesToBigIntBE(hash), SECP256K1_ORDER);
}

export function verifyBlindSchnorr(
  pkIssuerBytes: Uint8Array, // compressed point (33 bytes)
  message: Uint8Array, // voter's x-only pk (32 bytes)
  RBytes: Uint8Array, // compressed point (33 bytes) — unblinded R'
  sBytes: Uint8Array, // scalar (32 bytes) — unblinded s'
): Promise<boolean> {
  // Verify: s'·G + c'·PK_I == R'
  return (async () => {
    try {
      const cPrime = await blindSchnorrChallenge(RBytes, pkIssuerBytes, message);
      const sPrime = bytesToBigIntBE(sBytes);

      const pkIssuerPoint = secp256k1.Point.fromHex(pkIssuerBytes);
      const RPrimePoint = secp256k1.Point.fromHex(RBytes);

      // s'·G + c'·PK_I
      const sG = secp256k1.Point.BASE.multiply(mod(sPrime, SECP256K1_ORDER));
      const cPK = pkIssuerPoint.multiply(mod(cPrime, SECP256K1_ORDER));
      const lhs = sG.add(cPK);

      return lhs.equals(RPrimePoint);
    } catch {
      return false;
    }
  })();
}

export async function blindSchnorrIssuance(params: {
  issuer_sk: Uint8Array; // scalar (32 bytes)
  issuer_pk: Uint8Array; // compressed point (33 bytes)
  voter_pk_xonly: Uint8Array; // x-only pk (32 bytes) — the message to sign
}): Promise<{ R: Uint8Array; s: Uint8Array }> {
  const { issuer_sk, issuer_pk, voter_pk_xonly } = params;
  const skI = bytesToBigIntBE(issuer_sk);

  // ── ISSUER STEP 1: generate nonce k, compute R = k·G ──
  const kBytes = secp256k1.utils.randomSecretKey();
  const k = bytesToBigIntBE(kBytes);
  const R = secp256k1.Point.BASE.multiply(mod(k, SECP256K1_ORDER));

  // ── VOTER STEP 2: blind the nonce ──
  const alphaBytes = secp256k1.utils.randomSecretKey();
  const alpha = bytesToBigIntBE(alphaBytes);
  const betaBytes = secp256k1.utils.randomSecretKey();
  const beta = bytesToBigIntBE(betaBytes);

  const pkIssuerPoint = secp256k1.Point.fromHex(issuer_pk);

  // R' = R + α·G + β·PK_I
  const RPrime = R.add(
    secp256k1.Point.BASE.multiply(mod(alpha, SECP256K1_ORDER)),
  ).add(
    pkIssuerPoint.multiply(mod(beta, SECP256K1_ORDER)),
  );
  const RPrimeBytes = RPrime.toBytes(true); // 33 bytes compressed

  // c' = H(domain ‖ R' ‖ PK_I ‖ m)
  const cPrime = await blindSchnorrChallenge(RPrimeBytes, issuer_pk, voter_pk_xonly);

  // c = c' − β mod q (sent to issuer)
  const c = mod(cPrime - beta, SECP256K1_ORDER);

  // ── ISSUER STEP 3: sign blinded challenge ──
  // s = k − c·sk_I mod q
  const s = mod(k - c * skI, SECP256K1_ORDER);

  // ── VOTER STEP 4: unblind the signature ──
  // s' = s + α mod q
  const sPrime = mod(s + alpha, SECP256K1_ORDER);

  return {
    R: RPrimeBytes,
    s: bigIntToBytesBE(sPrime, 32),
  };
}
