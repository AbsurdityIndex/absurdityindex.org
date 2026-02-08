/* eslint-disable no-undef */
import type { DurableObjectState } from './cf-types.js';
import type {
  LedgerAppendResponse,
  LedgerEntry,
  LedgerHead,
  LedgerStats,
  NodeAck,
  NodeKey,
  VclEvent,
  VclEventType,
} from './types.js';
import { readJson, jsonError, jsonResponse } from './http.js';
import { bytesToB64u, utf8ToBytes } from './encoding.js';
import { kidFromJwk, newTxId, sha256B64u } from './crypto.js';
import { stableStringify } from './stable-json.js';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_LIST_LIMIT = 200;

const VCL_EVENT_TYPES: VclEventType[] = [
  'election_manifest_published',
  'credential_issued',
  'ewp_ballot_cast',
  'bb_sth_published',
  'tally_published',
  'fraud_flag',
  'fraud_flag_action',
];

type NodeSigningRecord = {
  alg: NodeAck['alg'];
  kid: string;
  jwk_public: JsonWebKey;
  jwk_private: JsonWebKey;
};

type LedgerMeta = {
  created_at: string;
  updated_at: string;
  height: number;
  head_hash: string;
  type_counts: Record<string, number>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function keyForIndex(index: number): string {
  return `entry:${String(index).padStart(12, '0')}`;
}

function parsePositiveInt(raw: string | null, fallback: number): number | null {
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function coerceVclEvent(input: unknown): { ok: true; value: VclEvent } | { ok: false; error: Response } {
  if (!isRecord(input)) {
    return { ok: false, error: jsonError(400, 'BAD_EVENT', 'Event must be a JSON object.') };
  }

  const type = input.type;
  if (typeof type !== 'string' || !VCL_EVENT_TYPES.includes(type as VclEventType)) {
    return {
      ok: false,
      error: jsonError(400, 'BAD_EVENT_TYPE', 'Event type is missing or invalid.', {
        allowed: VCL_EVENT_TYPES,
      }),
    };
  }

  const payload = input.payload;
  if (!isRecord(payload)) {
    return { ok: false, error: jsonError(400, 'BAD_EVENT_PAYLOAD', 'Event payload must be an object.') };
  }

  const tx_id_raw = input.tx_id;
  const tx_id = typeof tx_id_raw === 'string' && tx_id_raw.startsWith('0x') ? (tx_id_raw as `0x${string}`) : newTxId();

  const recorded_at_raw = input.recorded_at;
  const recorded_at = typeof recorded_at_raw === 'string' && recorded_at_raw.length > 0 ? recorded_at_raw : nowIso();

  return {
    ok: true,
    value: {
      tx_id,
      type: type as VclEventType,
      recorded_at,
      payload: payload as Record<string, unknown>,
    },
  };
}

async function computeEntryHash(prevHash: string, event: VclEvent): Promise<string> {
  // Deterministic hash over previous head + stable JSON of the event.
  // This is a POC ledger hash (not a production consensus scheme).
  const canonical = stableStringify(event);
  return sha256B64u(`${prevHash}\n${canonical}`);
}

export class LedgerDO {
  private readonly state: DurableObjectState;
  private initPromise: Promise<void> | null = null;
  private metaCache: LedgerMeta | null = null;
  private signingCache: (NodeSigningRecord & { publicKey: CryptoKey; privateKey: CryptoKey }) | null = null;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.state.blockConcurrencyWhile(async () => {
      const [meta, signing] = await Promise.all([
        this.state.storage.get<LedgerMeta>('meta'),
        this.state.storage.get<NodeSigningRecord>('signing'),
      ]);

      if (!meta) {
        const created_at = nowIso();
        const genesis = await sha256B64u('genesis');
        const nextMeta: LedgerMeta = {
          created_at,
          updated_at: created_at,
          height: 0,
          head_hash: genesis,
          type_counts: {},
        };
        await this.state.storage.put('meta', nextMeta);
        this.metaCache = nextMeta;
      } else {
        this.metaCache = meta;
      }

      if (!signing) {
        const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
          'sign',
          'verify',
        ]);

        const [jwk_public, jwk_private] = await Promise.all([
          crypto.subtle.exportKey('jwk', keyPair.publicKey),
          crypto.subtle.exportKey('jwk', keyPair.privateKey),
        ]);

        const kid = await kidFromJwk(jwk_public);
        const record: NodeSigningRecord = { alg: 'ECDSA_P256_SHA256', kid, jwk_public, jwk_private };
        await this.state.storage.put('signing', record);
      }
    });

    return this.initPromise;
  }

  private async getMeta(): Promise<LedgerMeta> {
    await this.ensureInitialized();
    if (!this.metaCache) {
      // Should not happen, but keep a defensive fallback.
      const meta = await this.state.storage.get<LedgerMeta>('meta');
      if (!meta) throw new Error('Ledger meta missing after initialization.');
      this.metaCache = meta;
    }
    return this.metaCache;
  }

  private async getSigning(): Promise<NodeSigningRecord> {
    await this.ensureInitialized();
    const signing = await this.state.storage.get<NodeSigningRecord>('signing');
    if (!signing) throw new Error('Signing record missing after initialization.');
    return signing;
  }

  private async getSigningKeys(): Promise<NodeSigningRecord & { publicKey: CryptoKey; privateKey: CryptoKey }> {
    if (this.signingCache) return this.signingCache;

    const signing = await this.getSigning();
    const [publicKey, privateKey] = await Promise.all([
      crypto.subtle.importKey('jwk', signing.jwk_public, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']),
      crypto.subtle.importKey('jwk', signing.jwk_private, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']),
    ]);

    this.signingCache = { ...signing, publicKey, privateKey };
    return this.signingCache;
  }

  private async signAck(hash: string): Promise<NodeAck> {
    const signing = await this.getSigningKeys();
    const sigBuf = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signing.privateKey, utf8ToBytes(hash));
    return {
      alg: signing.alg,
      kid: signing.kid,
      sig: bytesToB64u(new Uint8Array(sigBuf)),
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();

    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = url.pathname;

    if (method === 'GET' && path === '/head') {
      const meta = await this.getMeta();
      const head: LedgerHead = { height: meta.height, head_hash: meta.head_hash, updated_at: meta.updated_at };
      return jsonResponse(head);
    }

    if (method === 'GET' && path === '/stats') {
      const meta = await this.getMeta();
      const stats: LedgerStats = { height: meta.height, type_counts: meta.type_counts, updated_at: meta.updated_at };
      return jsonResponse(stats);
    }

    if (method === 'GET' && path === '/key') {
      const signing = await this.getSigning();
      const nodeKey: NodeKey = { alg: signing.alg, kid: signing.kid, jwk_public: signing.jwk_public };
      return jsonResponse(nodeKey);
    }

    if (method === 'GET' && path === '/entries') {
      const meta = await this.getMeta();
      const from = parsePositiveInt(url.searchParams.get('from'), 1);
      if (from == null) return jsonError(400, 'BAD_FROM', '`from` must be a positive integer.');

      const limit = parsePositiveInt(url.searchParams.get('limit'), 50);
      if (limit == null) return jsonError(400, 'BAD_LIMIT', '`limit` must be a positive integer.');

      const clampedLimit = Math.min(limit, MAX_LIST_LIMIT);
      const startKey = keyForIndex(from);

      const list = await this.state.storage.list<LedgerEntry>({
        prefix: 'entry:',
        start: startKey,
        limit: clampedLimit,
      });

      const entries = Array.from(list.values()).sort((a, b) => a.index - b.index);

      return jsonResponse({
        height: meta.height,
        entries,
        next_from: entries.length > 0 ? entries[entries.length - 1].index + 1 : from,
      });
    }

    if (method === 'GET' && path.startsWith('/entries/')) {
      const raw = path.slice('/entries/'.length);
      const index = Number.parseInt(raw, 10);
      if (!Number.isFinite(index) || index < 1) return jsonError(400, 'BAD_INDEX', 'Entry index must be a positive integer.');

      const entry = await this.state.storage.get<LedgerEntry>(keyForIndex(index));
      if (!entry) return jsonError(404, 'NOT_FOUND', 'Entry not found.');
      return jsonResponse(entry);
    }

    if (method === 'POST' && path === '/append') {
      const parsed = await readJson<unknown>(request, { maxBytes: MAX_BODY_BYTES });
      if (!parsed.ok) return parsed.error;

      const eventResult = coerceVclEvent(parsed.value);
      if (!eventResult.ok) return eventResult.error;
      const event = eventResult.value;

      let out: LedgerAppendResponse | null = null;

      await this.state.blockConcurrencyWhile(async () => {
        const meta = await this.getMeta();
        const index = meta.height + 1;
        const prev_hash = meta.head_hash;
        const hash = await computeEntryHash(prev_hash, event);
        const accepted_at = nowIso();

        const entry: LedgerEntry = { index, prev_hash, hash, accepted_at, event };
        meta.height = index;
        meta.head_hash = hash;
        meta.updated_at = accepted_at;
        meta.type_counts[event.type] = (meta.type_counts[event.type] ?? 0) + 1;

        await Promise.all([
          this.state.storage.put(keyForIndex(index), entry),
          this.state.storage.put('meta', meta),
        ]);
        this.metaCache = meta;

        const ack = await this.signAck(hash);
        out = { entry, ack };
      });

      if (!out) return jsonError(500, 'INTERNAL', 'Failed to append entry.');
      return jsonResponse(out, { status: 201 });
    }

    return jsonError(404, 'NOT_FOUND', 'Not found.');
  }
}

