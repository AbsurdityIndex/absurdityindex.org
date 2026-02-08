/**
 * VoteChain POC — BigInt Arithmetic Helpers for secp256k1
 *
 * Modular arithmetic, byte ↔ bigint conversion, and the secp256k1
 * subgroup order constant.
 */

/** secp256k1 subgroup order (q / n). */
export const SECP256K1_ORDER: bigint = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);

export function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}

export function bigIntToBytesBE(n: bigint, len: number): Uint8Array {
  if (n < 0n) throw new Error('bigIntToBytesBE: negative');
  const out = new Uint8Array(len);
  let x = n;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

export function mod(a: bigint, m: bigint): bigint {
  const res = a % m;
  return res >= 0n ? res : res + m;
}

export function modInv(a: bigint, m: bigint): bigint {
  // Extended Euclidean algorithm. Assumes m is prime and a != 0 mod m.
  let t = 0n;
  let newT = 1n;
  let r = m;
  let newR = mod(a, m);

  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }

  if (r !== 1n) throw new Error('modInv: not invertible');
  return t < 0n ? t + m : t;
}
