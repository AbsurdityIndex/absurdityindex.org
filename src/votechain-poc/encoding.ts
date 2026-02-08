/**
 * VoteChain POC — Encoding & Hashing Utilities
 *
 * Base64, base64url, hex encoding, SHA-256 hashing, JSON canonicalization,
 * and other low-level byte manipulation helpers.
 */

import type { Hex0x } from './types.js';

// ── Timestamp ───────────────────────────────────────────────────────────────

export function nowIso(): string {
  return new Date().toISOString();
}

// ── Text Encoding ───────────────────────────────────────────────────────────

export function utf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // WebCrypto typings can be strict about `ArrayBuffer` vs `ArrayBufferLike`.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// ── Byte Manipulation ───────────────────────────────────────────────────────

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

// ── Base64 ──────────────────────────────────────────────────────────────────

export function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.codePointAt(i)!;
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const byte of bytes) s += String.fromCodePoint(byte);
  return btoa(s);
}

// ── Base64url ───────────────────────────────────────────────────────────────

export function bytesToB64u(bytes: Uint8Array): string {
  return bytesToB64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/g, '');
}

export function b64uToBytes(b64u: string): Uint8Array {
  const padded = b64u
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(b64u.length / 4) * 4, '=');
  return b64ToBytes(padded);
}

// ── Hex ─────────────────────────────────────────────────────────────────────

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── JSON Canonicalization ───────────────────────────────────────────────────

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((v) => canonicalize(v));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = canonicalize(record[k]);
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

// ── SHA-256 ─────────────────────────────────────────────────────────────────

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(data));
  return new Uint8Array(digest);
}

export async function sha256B64u(data: Uint8Array): Promise<string> {
  return bytesToB64u(await sha256(data));
}

export async function sha256Hex0x(data: Uint8Array): Promise<Hex0x> {
  const h = await sha256(data);
  return `0x${bytesToHex(h)}`;
}
