const TE = new TextEncoder();

export function utf8ToBytes(s: string): Uint8Array {
  return TE.encode(s);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function bytesToB64u(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // btoa is available in Cloudflare Workers and Node 20+.
  const b64 = btoa(bin);
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function randomHex(bytesLen: number): string {
  const b = new Uint8Array(bytesLen);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}

