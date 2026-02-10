const COOKIE_NAME = 'vc_poc_access';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function parseCookieHeader(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

function bytesToB64u(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function b64uToBytes(b64u) {
  const b64 = String(b64u).replaceAll('-', '+').replaceAll('_', '/');
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + '='.repeat(padLen);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(aBytes, bBytes) {
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

async function hmacB64u(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToB64u(new Uint8Array(sig));
}

async function verifyCookie(cookieValue, cookieSecret) {
  if (!cookieValue || typeof cookieValue !== 'string') return { ok: false };
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return { ok: false };

  const [payloadB64u, sigB64u] = parts;
  if (!payloadB64u || !sigB64u) return { ok: false };

  const expectedSig = await hmacB64u(cookieSecret, payloadB64u);
  const okSig = constantTimeEqual(b64uToBytes(sigB64u), b64uToBytes(expectedSig));
  if (!okSig) return { ok: false };

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64uToBytes(payloadB64u)));
  } catch {
    return { ok: false };
  }

  const exp = payload?.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return { ok: false };
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) return { ok: false };

  return { ok: true, exp };
}

export async function onRequestGet(context) {
  const cookieSecret = context.env?.POC_ACCESS_COOKIE_SECRET;
  const enabled = Boolean(
    context.env?.PUBLIC_TURNSTILE_SITE_KEY && context.env?.TURNSTILE_SECRET_KEY && cookieSecret,
  );

  if (!enabled) return jsonResponse({ enabled: false, unlocked: false }, 200);

  const cookies = parseCookieHeader(context.request.headers.get('Cookie'));
  const result = await verifyCookie(cookies[COOKIE_NAME], cookieSecret);

  if (!result.ok) return jsonResponse({ enabled: true, unlocked: false }, 200);

  return jsonResponse(
    {
      enabled: true,
      unlocked: true,
      expires_at: new Date(result.exp * 1000).toISOString(),
    },
    200,
  );
}
