/**
 * VoteChain POC — Replication Proxy
 *
 * Server-side proxy that receives VCL events from the browser, attaches the
 * appropriate Worker write token from Pages secrets, and forwards to the
 * correct VoteChain node. Write tokens never leave the server.
 *
 * POST /api/votechain/poc/replicate
 * Body: { type, payload, tx_id?, recorded_at? }
 * Returns: { ok, entry?, ack?, error? }
 */

const COOKIE_NAME = 'vc_poc_access';

// ── Event-to-node routing ──────────────────────────────────────────────────

const ORIGINATING_TYPES_MAP = {
  election_manifest_published: 'federal',
  tally_published: 'federal',
  credential_issued: 'state',
  ewp_ballot_cast: 'state',
  bb_sth_published: 'state',
  fraud_flag: 'oversight',
  fraud_flag_action: 'oversight',
};

const WORKER_URLS = {
  federal: 'https://votechain-federal-node.corey-steinwand.workers.dev',
  state: 'https://votechain-state-node.corey-steinwand.workers.dev',
  oversight: 'https://votechain-oversight-node.corey-steinwand.workers.dev',
};

// ── Helpers (inlined from session.js — Functions have no build step) ────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
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

// ── Token lookup ───────────────────────────────────────────────────────────

function getWriteToken(env, role) {
  if (role === 'federal') return env?.VOTECHAIN_FEDERAL_WRITE_TOKEN;
  if (role === 'state') return env?.VOTECHAIN_STATE_WRITE_TOKEN;
  if (role === 'oversight') return env?.VOTECHAIN_OVERSIGHT_WRITE_TOKEN;
  return undefined;
}

// ── POST handler ───────────────────────────────────────────────────────────

export async function onRequestPost(context) {
  // 1. Validate Turnstile session cookie (if configured)
  const cookieSecret = context.env?.POC_ACCESS_COOKIE_SECRET;
  const turnstileEnabled = Boolean(
    context.env?.PUBLIC_TURNSTILE_SITE_KEY &&
    context.env?.TURNSTILE_SECRET_KEY &&
    cookieSecret,
  );

  if (turnstileEnabled) {
    const cookies = parseCookieHeader(context.request.headers.get('Cookie'));
    const result = await verifyCookie(cookies[COOKIE_NAME], cookieSecret);
    if (!result.ok) {
      return jsonResponse({ ok: false, error: 'Session expired or invalid. Complete the verification check first.' }, 403);
    }
  }

  // 2. Parse body
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const { type, payload, tx_id, recorded_at } = body;
  if (!type || typeof type !== 'string') {
    return jsonResponse({ ok: false, error: 'Missing or invalid event type.' }, 400);
  }
  if (!payload || typeof payload !== 'object') {
    return jsonResponse({ ok: false, error: 'Missing or invalid payload.' }, 400);
  }

  // 3. Route to correct Worker node
  const role = ORIGINATING_TYPES_MAP[type];
  if (!role) {
    return jsonResponse({ ok: false, error: `Unknown event type: ${type}` }, 400);
  }

  const workerUrl = WORKER_URLS[role];
  const writeToken = getWriteToken(context.env, role);
  if (!writeToken) {
    return jsonResponse({ ok: false, error: `Write token not configured for ${role} node.` }, 503);
  }

  // 4. Forward to Worker
  const event = { type, payload };
  if (tx_id) event.tx_id = tx_id;
  if (recorded_at) event.recorded_at = recorded_at;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(`${workerUrl}/v1/ledger/append`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${writeToken}`,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = await res.json();

    if (!res.ok) {
      return jsonResponse({
        ok: false,
        error: data?.error?.message ?? `Worker responded with HTTP ${res.status}`,
      }, res.status >= 500 ? 502 : res.status);
    }

    return jsonResponse({
      ok: true,
      entry: data.entry,
      ack: data.ack,
    });
  } catch (err) {
    const message = err?.name === 'AbortError'
      ? `${role} node timed out (10s).`
      : `${role} node unreachable: ${String(err)}`;
    return jsonResponse({ ok: false, error: message }, 502);
  }
}
