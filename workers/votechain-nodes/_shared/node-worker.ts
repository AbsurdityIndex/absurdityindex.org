import type { DurableObjectNamespace, ExecutionContext } from './cf-types.js';
import type { NodeRole, VclEventType } from './types.js';
import { bearerToken, jsonError, jsonResponse, readJson, withCors } from './http.js';

const MAX_BODY_BYTES = 64 * 1024;

const ALL_VCL_EVENT_TYPES: VclEventType[] = [
  'election_manifest_published',
  'credential_issued',
  'ewp_ballot_cast',
  'bb_sth_published',
  'tally_published',
  'fraud_flag',
  'fraud_flag_action',
];

const ORIGINATING_TYPES_BY_ROLE: Record<NodeRole, VclEventType[]> = {
  federal: ['election_manifest_published', 'tally_published'],
  state: ['credential_issued', 'ewp_ballot_cast', 'bb_sth_published'],
  oversight: ['fraud_flag', 'fraud_flag_action'],
};

export interface NodeEnv {
  LEDGER: DurableObjectNamespace;
  NODE_ID?: string;
  CORS_ORIGIN?: string;
  WRITE_TOKEN?: string;
  STATE_CODE?: string;
}

function ledgerStub(env: NodeEnv) {
  const id = env.LEDGER.idFromName('main');
  return env.LEDGER.get(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function allowedOriginatingTypes(role: NodeRole): VclEventType[] {
  return ORIGINATING_TYPES_BY_ROLE[role];
}

function corsOrigin(env: NodeEnv): string {
  return env.CORS_ORIGIN?.trim() || '*';
}

function requireWriteAuth(req: Request, env: NodeEnv): Response | null {
  const required = env.WRITE_TOKEN?.trim();
  if (!required) return null;
  const got = bearerToken(req);
  if (got !== required) return jsonError(401, 'UNAUTHORIZED', 'Missing or invalid bearer token.');
  return null;
}

export function createNodeWorker(role: NodeRole) {
  const allowed = allowedOriginatingTypes(role);

  return {
    async fetch(req: Request, env: NodeEnv, _ctx: ExecutionContext): Promise<Response> {
      const origin = corsOrigin(env);
      const url = new URL(req.url);
      const method = req.method.toUpperCase();
      const path = url.pathname;
      const node_id = env.NODE_ID?.trim() || `${role}-node-1`;

      if (method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }), origin);
      }

      if (method === 'GET' && path === '/') {
        return withCors(
          jsonResponse({
            node_id,
            role,
            endpoints: {
              health: '/health',
              node: '/v1/node',
              ledger_head: '/v1/ledger/head',
              ledger_entries: '/v1/ledger/entries',
              ledger_append: '/v1/ledger/append',
            },
          }),
          origin,
        );
      }

      if (method === 'GET' && path === '/health') {
        return withCors(jsonResponse({ ok: true, node_id, role, ts: new Date().toISOString() }), origin);
      }

      // Node metadata (includes current head + signing pubkey).
      if (method === 'GET' && path === '/v1/node') {
        const stub = ledgerStub(env);
        const [headRes, keyRes] = await Promise.all([
          stub.fetch('https://ledger/head'),
          stub.fetch('https://ledger/key'),
        ]);

        const head = await headRes.json();
        const key = await keyRes.json();

        return withCors(
          jsonResponse({
            node_id,
            role,
            allowed_originating_event_types: allowed,
            signing: key,
            ledger: head,
          }),
          origin,
        );
      }

      if (method === 'GET' && path === '/v1/node/key') {
        const stub = ledgerStub(env);
        const r = await stub.fetch('https://ledger/key');
        return withCors(r, origin);
      }

      if (method === 'GET' && path === '/v1/ledger/head') {
        const stub = ledgerStub(env);
        const r = await stub.fetch('https://ledger/head');
        return withCors(r, origin);
      }

      if (method === 'GET' && path === '/v1/ledger/stats') {
        const stub = ledgerStub(env);
        const r = await stub.fetch('https://ledger/stats');
        return withCors(r, origin);
      }

      if (method === 'GET' && path === '/v1/ledger/entries') {
        const qs = url.searchParams.toString();
        const stub = ledgerStub(env);
        const r = await stub.fetch(`https://ledger/entries${qs ? `?${qs}` : ''}`);
        return withCors(r, origin);
      }

      if (method === 'GET' && path.startsWith('/v1/ledger/entries/')) {
        const suffix = path.slice('/v1/ledger/entries'.length); // includes leading "/"
        const stub = ledgerStub(env);
        const r = await stub.fetch(`https://ledger/entries${suffix}`);
        return withCors(r, origin);
      }

      if (method === 'POST' && path === '/v1/ledger/append') {
        const authErr = requireWriteAuth(req, env);
        if (authErr) return withCors(authErr, origin);

        const parsed = await readJson<unknown>(req, { maxBytes: MAX_BODY_BYTES });
        if (!parsed.ok) return withCors(parsed.error, origin);

        if (!isRecord(parsed.value)) {
          return withCors(jsonError(400, 'BAD_EVENT', 'Event must be a JSON object.'), origin);
        }

        const type = parsed.value.type;
        if (typeof type !== 'string' || !ALL_VCL_EVENT_TYPES.includes(type as VclEventType)) {
          return withCors(
            jsonError(400, 'BAD_EVENT_TYPE', 'Event type is missing or invalid.', { allowed: ALL_VCL_EVENT_TYPES }),
            origin,
          );
        }

        if (!allowed.includes(type as VclEventType)) {
          return withCors(
            jsonError(403, 'ROLE_FORBIDDEN', 'This node role cannot originate this event type.', {
              role,
              allowed_originating_event_types: allowed,
            }),
            origin,
          );
        }

        const payload = parsed.value.payload;
        if (!isRecord(payload)) {
          return withCors(jsonError(400, 'BAD_EVENT_PAYLOAD', 'Event payload must be an object.'), origin);
        }

        const stub = ledgerStub(env);
        const r = await stub.fetch('https://ledger/append', {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(parsed.value),
        });
        return withCors(r, origin);
      }

      return withCors(jsonError(404, 'NOT_FOUND', 'Not found.'), origin);
    },
  };
}
