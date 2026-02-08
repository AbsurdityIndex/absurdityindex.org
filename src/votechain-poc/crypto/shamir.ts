/**
 * VoteChain POC — Shamir Secret Sharing
 *
 * t-of-n threshold splitting and Lagrange interpolation reconstruction
 * over the secp256k1 scalar field.
 */

import { secp256k1 } from '@noble/curves/secp256k1';

import { SECP256K1_ORDER, bytesToBigIntBE, mod, modInv } from './bigint.js';

export type ShamirShare = { x: bigint; y: bigint };

export function shamirSplit(secret: bigint, t: number, nShares: number): ShamirShare[] {
  if (t < 2) throw new Error('shamirSplit: threshold must be >= 2');
  if (nShares < t) throw new Error('shamirSplit: n must be >= t');

  // f(x) = a0 + a1*x + ... + a_{t-1}*x^{t-1} mod q, where a0=secret
  const coeffs: bigint[] = [mod(secret, SECP256K1_ORDER)];
  for (let i = 1; i < t; i++) {
    const r = secp256k1.utils.randomSecretKey(); // 1..n-1
    coeffs.push(bytesToBigIntBE(r));
  }

  const shares: ShamirShare[] = [];
  for (let i = 1; i <= nShares; i++) {
    const x = BigInt(i);
    let y = 0n;
    let xPow = 1n;
    for (const c of coeffs) {
      y = mod(y + c * xPow, SECP256K1_ORDER);
      xPow = mod(xPow * x, SECP256K1_ORDER);
    }
    shares.push({ x, y });
  }
  return shares;
}

export function shamirCombine(shares: ShamirShare[]): bigint {
  if (shares.length === 0) throw new Error('shamirCombine: no shares');

  // Lagrange interpolation at x=0:
  // secret = Σ y_i * Π_{j!=i} (-x_j)/(x_i-x_j) mod q
  let secret = 0n;
  for (let i = 0; i < shares.length; i++) {
    const xi = shares[i].x;
    const yi = shares[i].y;
    let num = 1n;
    let den = 1n;
    for (let j = 0; j < shares.length; j++) {
      if (j === i) continue;
      const xj = shares[j].x;
      num = mod(num * mod(-xj, SECP256K1_ORDER), SECP256K1_ORDER);
      den = mod(den * mod(xi - xj, SECP256K1_ORDER), SECP256K1_ORDER);
    }
    const li = mod(num * modInv(den, SECP256K1_ORDER), SECP256K1_ORDER);
    secret = mod(secret + yi * li, SECP256K1_ORDER);
  }
  return secret;
}
