/* eslint-disable no-undef */
/**
 * VoteChain POC — ECDSA Key Management & Signing
 *
 * P-256 ECDSA key generation, import/export, and base64url-encoded
 * sign/verify helpers used throughout the POC.
 */

import type { StoredKeyPair } from '../types.js';
import { bytesToB64u, b64uToBytes, toArrayBuffer } from '../encoding.js';

export async function generateEcdsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
}

export async function exportKeyPair(keyPair: CryptoKeyPair, kid: string): Promise<StoredKeyPair> {
  const jwk_public = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const jwk_private = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  return {
    kid,
    alg: 'ECDSA_P-256_SHA256',
    jwk_public,
    jwk_private,
  };
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'verify',
  ]);
}

export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ]);
}

export async function signB64u(privateJwk: JsonWebKey, message: Uint8Array): Promise<string> {
  const key = await importPrivateKey(privateJwk);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    toArrayBuffer(message),
  );
  return bytesToB64u(new Uint8Array(sig));
}

export async function verifyB64u(
  publicJwk: JsonWebKey,
  message: Uint8Array,
  sigB64u: string,
): Promise<boolean> {
  const key = await importPublicKey(publicJwk);
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    toArrayBuffer(b64uToBytes(sigB64u)),
    toArrayBuffer(message),
  );
}
