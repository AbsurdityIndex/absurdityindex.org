/**
 * Cloudflare Pages middleware — restrict access to US visitors only
 * and enforce security headers on every response.
 *
 * IMPORTANT: Security headers are set here (not in `public/_headers`) because
 * the `_headers` file is unreliably applied when requests pass through Functions.
 * This middleware is the authoritative layer for all response headers.
 */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://cloudflareinsights.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; upgrade-insecure-requests",
};

function applySecurityHeaders(response) {
  const patched = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    patched.headers.set(key, value);
  }
  return patched;
}

const POC_COOKIE_NAME = 'vc_poc_access';
const POC_PATH_PREFIX = '/votechain/poc';

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

function isPocIndexPath(pathname) {
  return pathname === POC_PATH_PREFIX || pathname === `${POC_PATH_PREFIX}/`;
}

function isPocProtectedPath(pathname) {
  if (!pathname.startsWith(`${POC_PATH_PREFIX}/`)) return false;
  // Allow the index route itself (trailing slash variant).
  if (isPocIndexPath(pathname)) return false;
  return true;
}

async function isValidPocAccessCookie(cookieValue, cookieSecret) {
  if (!cookieValue || typeof cookieValue !== 'string') return false;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64u, sigB64u] = parts;
  if (!payloadB64u || !sigB64u) return false;

  const expectedSig = await hmacB64u(cookieSecret, payloadB64u);
  const okSig = constantTimeEqual(b64uToBytes(sigB64u), b64uToBytes(expectedSig));
  if (!okSig) return false;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64uToBytes(payloadB64u)));
  } catch {
    return false;
  }

  const exp = payload?.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp > now;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Enforce canonical host (www -> root). This is a safety net in case CF rules drift.
  if (url.hostname === 'www.absurdityindex.org') {
    url.hostname = 'absurdityindex.org';

    return new Response(null, {
      status: 301,
      headers: {
        Location: url.toString(),
        ...SECURITY_HEADERS,
      },
    });
  }

  const country = context.request.cf?.country;

  // Allow US and US territories
  const allowed = new Set([
    'US', // United States
    'PR', // Puerto Rico
    'GU', // Guam
    'VI', // US Virgin Islands
    'AS', // American Samoa
    'MP', // Northern Mariana Islands
  ]);

  // Allow requests with no country info (local dev, health checks, bots).
  // If Turnstile gating is enabled, we still gate VoteChain POC module routes.
  const isCountryAllowed = !country || allowed.has(country);
  if (isCountryAllowed) {
    const turnstileEnabled = Boolean(
      context.env?.PUBLIC_TURNSTILE_SITE_KEY &&
        context.env?.TURNSTILE_SECRET_KEY &&
        context.env?.POC_ACCESS_COOKIE_SECRET,
    );

    if (turnstileEnabled && isPocProtectedPath(url.pathname)) {
      const cookies = parseCookieHeader(context.request.headers.get('Cookie'));
      const ok = await isValidPocAccessCookie(
        cookies[POC_COOKIE_NAME],
        context.env.POC_ACCESS_COOKIE_SECRET,
      );

      if (!ok) {
        const next = encodeURIComponent(url.pathname + url.search);
        return applySecurityHeaders(
          new Response(null, {
            status: 302,
            headers: {
              Location: `${POC_PATH_PREFIX}?next=${next}`,
              'Cache-Control': 'no-store',
            },
          }),
        );
      }
    }

    const response = await context.next();
    return applySecurityHeaders(response);
  }

  // Block with a 403 and a themed response
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access Restricted | Absurdity Index</title>
  <style>
    body { font-family: Georgia, serif; background: #F5F0E8; color: #0A1628; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { max-width: 500px; text-align: center; background: #fff; border: 2px solid #C5A572; border-radius: 8px; padding: 3rem 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    h1 { color: #0A1628; font-size: 1.5rem; margin-bottom: 0.5rem; }
    .seal { color: #C5A572; margin-bottom: 1rem; display: flex; justify-content: center; }
    .seal svg { width: 3rem; height: 3rem; }
    p { color: #334155; line-height: 1.6; }
    .small { font-size: 0.8rem; color: #94a3b8; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="seal" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 18v-7" />
        <path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z" />
        <path d="M14 18v-7" />
        <path d="M18 18v-7" />
        <path d="M3 22h18" />
        <path d="M6 18v-7" />
      </svg>
    </div>
    <h1>Access Restricted to U.S. Visitors</h1>
    <p>The Absurdity Index is currently available only within the United States and its territories.</p>
    <p>Much like Congress itself, we're not quite ready for an international audience.</p>
    <p class="small">If you believe this is an error, our complaints department is on permanent recess.</p>
  </div>
</body>
</html>`,
    {
      status: 403,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
      },
    }
  );
}
