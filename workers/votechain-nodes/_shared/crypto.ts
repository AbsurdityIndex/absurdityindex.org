/* eslint-disable no-undef */
import { bytesToB64u, randomHex, utf8ToBytes } from './encoding.js';
import { stableStringify } from './stable-json.js';

export async function sha256B64u(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? utf8ToBytes(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToB64u(new Uint8Array(digest));
}

export async function kidFromJwk(jwkPublic: JsonWebKey): Promise<string> {
  // Stable KID: sha256 over stable JSON of the public JWK.
  return sha256B64u(stableStringify(jwkPublic));
}

export function newTxId(): `0x${string}` {
  return `0x${randomHex(32)}`;
}
