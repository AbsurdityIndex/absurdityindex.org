const COOKIE_NAME = 'vc_poc_access';
const COOKIE_PATH = '/votechain/poc';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function bytesToB64u(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
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

function makeCookieValue(payloadObj, cookieSecret) {
  const payloadJson = JSON.stringify(payloadObj);
  const payloadB64u = bytesToB64u(new TextEncoder().encode(payloadJson));
  return hmacB64u(cookieSecret, payloadB64u).then((sigB64u) => `${payloadB64u}.${sigB64u}`);
}

async function verifyTurnstile({ secret, token, remoteip }) {
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteip) form.set('remoteip', remoteip);

  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });

  if (!resp.ok) {
    return {
      ok: false,
      status: 502,
      data: { error: { code: 'TURNSTILE_UPSTREAM', message: 'Turnstile verification failed.' } },
    };
  }

  const data = await resp.json();
  if (!data?.success) {
    return {
      ok: false,
      status: 403,
      data: {
        error: {
          code: 'TURNSTILE_REJECTED',
          message: 'Turnstile verification was not accepted.',
          details: { 'error-codes': data?.['error-codes'] ?? [] },
        },
      },
    };
  }

  return { ok: true, status: 200, data };
}

export async function onRequestPost(context) {
  const turnstileSecret = context.env?.TURNSTILE_SECRET_KEY;
  const cookieSecret = context.env?.POC_ACCESS_COOKIE_SECRET;

  if (!turnstileSecret || !cookieSecret) {
    return jsonResponse(
      {
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Turnstile is not configured on this deployment.',
        },
      },
      500,
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: { code: 'BAD_JSON', message: 'Request body must be JSON.' } }, 400);
  }

  const token = body?.token;
  if (typeof token !== 'string' || token.length < 10) {
    return jsonResponse({ error: { code: 'BAD_TOKEN', message: 'Missing Turnstile token.' } }, 400);
  }

  const remoteip = context.request.headers.get('CF-Connecting-IP') || null;
  const verify = await verifyTurnstile({ secret: turnstileSecret, token, remoteip });
  if (!verify.ok) return jsonResponse(verify.data, verify.status);

  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;

  const cookieValue = await makeCookieValue({ iat: now, exp, v: 1 }, cookieSecret);

  const setCookie = `${COOKIE_NAME}=${cookieValue}; Max-Age=${SESSION_TTL_SECONDS}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax`;

  return jsonResponse(
    {
      ok: true,
      expires_at: new Date(exp * 1000).toISOString(),
    },
    200,
    {
      'Set-Cookie': setCookie,
    },
  );
}

