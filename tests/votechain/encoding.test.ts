import { describe, it, expect } from 'vitest';
import {
  nowIso,
  utf8,
  toArrayBuffer,
  concatBytes,
  randomBytes,
  b64ToBytes,
  bytesToB64,
  bytesToB64u,
  b64uToBytes,
  bytesToHex,
  canonicalJson,
  sha256,
  sha256B64u,
  sha256Hex0x,
} from '../../src/votechain-poc/encoding.js';

describe('encoding', () => {
  describe('nowIso', () => {
    it('returns a valid ISO 8601 timestamp', () => {
      const ts = nowIso();
      expect(new Date(ts).toISOString()).toBe(ts);
    });
  });

  describe('utf8', () => {
    it('encodes ASCII string', () => {
      const result = utf8('hello');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(5);
      expect(result[0]).toBe(0x68); // 'h'
    });

    it('encodes empty string', () => {
      expect(utf8('').length).toBe(0);
    });

    it('handles multi-byte characters', () => {
      const result = utf8('\u00e9'); // é
      expect(result.length).toBe(2); // UTF-8 encoded
    });
  });

  describe('toArrayBuffer', () => {
    it('returns a proper ArrayBuffer from Uint8Array', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const ab = toArrayBuffer(bytes);
      expect(ab).toBeInstanceOf(ArrayBuffer);
      expect(ab.byteLength).toBe(3);
    });

    it('handles sliced arrays correctly', () => {
      const full = new Uint8Array([0, 1, 2, 3, 4]);
      const slice = full.subarray(1, 4); // [1, 2, 3]
      const ab = toArrayBuffer(slice);
      expect(new Uint8Array(ab)).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('concatBytes', () => {
    it('concatenates multiple arrays', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([3, 4, 5]);
      const result = concatBytes(a, b);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it('handles empty arrays', () => {
      const result = concatBytes(new Uint8Array([]), new Uint8Array([1]));
      expect(result).toEqual(new Uint8Array([1]));
    });

    it('handles no arguments', () => {
      const result = concatBytes();
      expect(result.length).toBe(0);
    });

    it('handles single argument', () => {
      const input = new Uint8Array([1, 2, 3]);
      expect(concatBytes(input)).toEqual(input);
    });
  });

  describe('randomBytes', () => {
    it('returns correct length', () => {
      expect(randomBytes(16).length).toBe(16);
      expect(randomBytes(32).length).toBe(32);
    });

    it('returns different values on subsequent calls', () => {
      const a = randomBytes(32);
      const b = randomBytes(32);
      // Extremely unlikely to be equal
      expect(a).not.toEqual(b);
    });
  });

  describe('base64', () => {
    it('round-trips bytes through b64', () => {
      const original = new Uint8Array([0, 1, 127, 128, 255]);
      const encoded = bytesToB64(original);
      const decoded = b64ToBytes(encoded);
      expect(decoded).toEqual(original);
    });

    it('encodes known value', () => {
      // "hello" → "aGVsbG8="
      const result = bytesToB64(utf8('hello'));
      expect(result).toBe('aGVsbG8=');
    });
  });

  describe('base64url', () => {
    it('round-trips bytes through b64u', () => {
      const original = randomBytes(48);
      const encoded = bytesToB64u(original);
      const decoded = b64uToBytes(encoded);
      expect(decoded).toEqual(original);
    });

    it('does not contain +, /, or = characters', () => {
      // Use bytes that produce +/= in standard base64
      const bytes = new Uint8Array([0xff, 0xff, 0xfe]);
      const encoded = bytesToB64u(bytes);
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it('handles empty input', () => {
      const encoded = bytesToB64u(new Uint8Array([]));
      const decoded = b64uToBytes(encoded);
      expect(decoded).toEqual(new Uint8Array([]));
    });

    it('handles 1-byte input (padding needed)', () => {
      const original = new Uint8Array([0xab]);
      const encoded = bytesToB64u(original);
      const decoded = b64uToBytes(encoded);
      expect(decoded).toEqual(original);
    });
  });

  describe('bytesToHex', () => {
    it('converts bytes to hex string', () => {
      expect(bytesToHex(new Uint8Array([0xff, 0x00, 0x0a]))).toBe('ff000a');
    });

    it('handles empty input', () => {
      expect(bytesToHex(new Uint8Array([]))).toBe('');
    });

    it('pads single digits', () => {
      expect(bytesToHex(new Uint8Array([1]))).toBe('01');
    });
  });

  describe('canonicalJson', () => {
    it('sorts keys alphabetically', () => {
      const result = canonicalJson({ z: 1, a: 2, m: 3 });
      expect(result).toBe('{"a":2,"m":3,"z":1}');
    });

    it('handles nested objects', () => {
      const result = canonicalJson({ b: { d: 1, c: 2 }, a: 3 });
      expect(result).toBe('{"a":3,"b":{"c":2,"d":1}}');
    });

    it('preserves array order', () => {
      const result = canonicalJson({ arr: [3, 1, 2] });
      expect(result).toBe('{"arr":[3,1,2]}');
    });

    it('handles nulls', () => {
      const result = canonicalJson({ a: null });
      expect(result).toBe('{"a":null}');
    });

    it('is deterministic', () => {
      const obj = { foo: 'bar', baz: [1, { z: 2, a: 1 }] };
      expect(canonicalJson(obj)).toBe(canonicalJson(obj));
    });
  });

  describe('sha256', () => {
    it('returns 32 bytes', async () => {
      const hash = await sha256(utf8('hello'));
      expect(hash.length).toBe(32);
    });

    it('produces correct hash for known input', async () => {
      // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      const hash = await sha256(utf8('hello'));
      expect(bytesToHex(hash)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('is deterministic', async () => {
      const a = await sha256(utf8('test'));
      const b = await sha256(utf8('test'));
      expect(a).toEqual(b);
    });

    it('different inputs produce different hashes', async () => {
      const a = await sha256(utf8('hello'));
      const b = await sha256(utf8('world'));
      expect(a).not.toEqual(b);
    });
  });

  describe('sha256B64u', () => {
    it('returns a base64url string', async () => {
      const result = await sha256B64u(utf8('test'));
      expect(result).not.toMatch(/[+/=]/);
      expect(typeof result).toBe('string');
    });

    it('is consistent with sha256 + bytesToB64u', async () => {
      const data = utf8('hello world');
      const direct = await sha256B64u(data);
      const manual = bytesToB64u(await sha256(data));
      expect(direct).toBe(manual);
    });
  });

  describe('sha256Hex0x', () => {
    it('returns 0x-prefixed hex string', async () => {
      const result = await sha256Hex0x(utf8('test'));
      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('is consistent with sha256 + bytesToHex', async () => {
      const data = utf8('hello');
      const direct = await sha256Hex0x(data);
      const manual = `0x${bytesToHex(await sha256(data))}`;
      expect(direct).toBe(manual);
    });
  });
});
