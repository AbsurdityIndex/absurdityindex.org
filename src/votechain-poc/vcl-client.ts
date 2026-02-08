/**
 * VoteChain POC — VCL Client Library
 *
 * Typed client for interacting with the 3 Cloudflare Workers VoteChain nodes
 * (federal, state, oversight). Provides health checks, ledger reads, event
 * append, and fire-and-forget replication from the browser-side POC.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type NodeRole = 'federal' | 'state' | 'oversight';

export interface VclNodeConfig {
  name: string;
  role: NodeRole;
  url: string;
  writeToken?: string;
}

export interface NodeHealthResult {
  online: boolean;
  node_id?: string;
  role?: string;
  ts?: string;
  error?: string;
}

export interface NodeInfo {
  node_id: string;
  role: string;
  allowed_originating_event_types: string[];
  signing: { alg: string; kid: string; jwk_public: JsonWebKey };
  ledger: { height: number; head_hash: string; updated_at: string };
}

export interface LedgerHead {
  height: number;
  head_hash: string;
  updated_at: string;
}

export interface LedgerStats {
  height: number;
  type_counts: Record<string, number>;
  updated_at: string;
}

export interface LedgerEntry {
  index: number;
  prev_hash: string;
  hash: string;
  accepted_at: string;
  event: {
    tx_id: string;
    type: string;
    recorded_at: string;
    payload: Record<string, unknown>;
  };
}

export interface EntriesPage {
  height: number;
  entries: LedgerEntry[];
  next_from: number;
}

export interface LedgerAppendResponse {
  entry: LedgerEntry;
  ack: { alg: string; kid: string; sig: string };
}

export interface ReplicationResult {
  node: string;
  role: NodeRole;
  ok: boolean;
  entry?: LedgerEntry;
  error?: string;
}

export interface AllNodesHealth {
  nodes: Array<VclNodeConfig & NodeHealthResult>;
  allOnline: boolean;
}

// ── Event-to-node routing ────────────────────────────────────────────────────

type VclEventType =
  | 'election_manifest_published'
  | 'credential_issued'
  | 'ewp_ballot_cast'
  | 'bb_sth_published'
  | 'tally_published'
  | 'fraud_flag'
  | 'fraud_flag_action';

const ORIGINATING_TYPES_MAP: Record<VclEventType, NodeRole> = {
  election_manifest_published: 'federal',
  tally_published: 'federal',
  credential_issued: 'state',
  ewp_ballot_cast: 'state',
  bb_sth_published: 'state',
  fraud_flag: 'oversight',
  fraud_flag_action: 'oversight',
};

// ── Configuration persistence ────────────────────────────────────────────────

const STORAGE_KEY = 'votechain_node_config';
const FETCH_TIMEOUT_MS = 8_000;

// Production node URLs — read endpoints are public (no auth required).
// Write tokens are configured as Cloudflare Worker secrets on each node.
const WORKERS_BASE = 'https://votechain-{role}-node.corey-steinwand.workers.dev';

function defaultNodes(): VclNodeConfig[] {
  return [
    { name: 'Federal', role: 'federal', url: WORKERS_BASE.replace('{role}', 'federal') },
    { name: 'State', role: 'state', url: WORKERS_BASE.replace('{role}', 'state') },
    { name: 'Oversight', role: 'oversight', url: WORKERS_BASE.replace('{role}', 'oversight') },
  ];
}

export function getNodeConfig(): VclNodeConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultNodes();
    const parsed = JSON.parse(raw) as VclNodeConfig[];
    if (!Array.isArray(parsed) || parsed.length !== 3) return defaultNodes();
    return parsed;
  } catch {
    return defaultNodes();
  }
}

export function setNodeConfig(nodes: VclNodeConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
}

export function isConfigured(): boolean {
  const nodes = getNodeConfig();
  return nodes.some((n) => n.url.trim().length > 0);
}

function getNodeByRole(role: NodeRole): VclNodeConfig | null {
  const nodes = getNodeConfig();
  const node = nodes.find((n) => n.role === role);
  return node && node.url.trim().length > 0 ? node : null;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(node: VclNodeConfig): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (node.writeToken?.trim()) {
    headers['authorization'] = `Bearer ${node.writeToken.trim()}`;
  }
  return headers;
}

// ── Node API calls ───────────────────────────────────────────────────────────

export async function fetchNodeHealth(node: VclNodeConfig): Promise<NodeHealthResult> {
  try {
    const res = await fetchWithTimeout(`${node.url.replace(/\/$/, '')}/health`);
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { online: true, node_id: data.node_id, role: data.role, ts: data.ts };
  } catch (err) {
    return { online: false, error: String(err) };
  }
}

export async function fetchNodeInfo(node: VclNodeConfig): Promise<NodeInfo | null> {
  try {
    const res = await fetchWithTimeout(`${node.url.replace(/\/$/, '')}/v1/node`);
    if (!res.ok) return null;
    return (await res.json()) as NodeInfo;
  } catch {
    return null;
  }
}

export async function fetchLedgerHead(node: VclNodeConfig): Promise<LedgerHead | null> {
  try {
    const res = await fetchWithTimeout(`${node.url.replace(/\/$/, '')}/v1/ledger/head`);
    if (!res.ok) return null;
    return (await res.json()) as LedgerHead;
  } catch {
    return null;
  }
}

export async function fetchLedgerStats(node: VclNodeConfig): Promise<LedgerStats | null> {
  try {
    const res = await fetchWithTimeout(`${node.url.replace(/\/$/, '')}/v1/ledger/stats`);
    if (!res.ok) return null;
    return (await res.json()) as LedgerStats;
  } catch {
    return null;
  }
}

export async function fetchLedgerEntries(
  node: VclNodeConfig,
  opts?: { from?: number; limit?: number },
): Promise<EntriesPage | null> {
  try {
    const params = new URLSearchParams();
    if (opts?.from != null) params.set('from', String(opts.from));
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const url = `${node.url.replace(/\/$/, '')}/v1/ledger/entries${qs ? `?${qs}` : ''}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    return (await res.json()) as EntriesPage;
  } catch {
    return null;
  }
}

export async function appendEvent(
  node: VclNodeConfig,
  event: { type: string; payload: Record<string, unknown>; tx_id?: string; recorded_at?: string },
): Promise<LedgerAppendResponse | { error: string }> {
  try {
    const res = await fetchWithTimeout(
      `${node.url.replace(/\/$/, '')}/v1/ledger/append`,
      { method: 'POST', headers: authHeaders(node), body: JSON.stringify(event) },
    );
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return data as LedgerAppendResponse;
  } catch (err) {
    return { error: String(err) };
  }
}

// ── Replication ──────────────────────────────────────────────────────────────

/**
 * Replicate a POC VCL event to the appropriate Workers node based on event type.
 * Returns the replication result; callers should treat failures as non-blocking.
 */
export async function replicateVclEvent(event: {
  type: string;
  payload: Record<string, unknown>;
  tx_id?: string;
  recorded_at?: string;
}): Promise<ReplicationResult> {
  const targetRole = ORIGINATING_TYPES_MAP[event.type as VclEventType];
  if (!targetRole) {
    return { node: 'unknown', role: 'federal', ok: false, error: `Unknown event type: ${event.type}` };
  }

  const node = getNodeByRole(targetRole);
  if (!node) {
    return { node: targetRole, role: targetRole, ok: false, error: 'Node not configured' };
  }

  const result = await appendEvent(node, event);
  if ('error' in result) {
    return { node: node.name, role: targetRole, ok: false, error: result.error };
  }
  return { node: node.name, role: targetRole, ok: true, entry: result.entry };
}

/**
 * Fire-and-forget replication: if Workers are configured, replicate the event.
 * Failures are logged to console but never thrown.
 */
export async function replicateIfConfigured(event: {
  type: string;
  payload: Record<string, unknown>;
  tx_id?: string;
  recorded_at?: string;
}): Promise<void> {
  if (!isConfigured()) return;
  try {
    const result = await replicateVclEvent(event);
    if (!result.ok) {
      console.warn(`[VCL] Replication to ${result.node} failed: ${result.error}`);
    } else {
      console.info(`[VCL] Replicated ${event.type} to ${result.node} (index=${result.entry?.index})`);
    }
  } catch (err) {
    console.warn('[VCL] Replication error:', err);
  }
}

// ── Multi-node operations ────────────────────────────────────────────────────

export async function fetchAllNodesHealth(): Promise<AllNodesHealth> {
  const configs = getNodeConfig();
  const results = await Promise.all(
    configs.map(async (cfg) => {
      if (!cfg.url.trim()) {
        return { ...cfg, online: false, error: 'URL not configured' } as VclNodeConfig & NodeHealthResult;
      }
      const health = await fetchNodeHealth(cfg);
      return { ...cfg, ...health };
    }),
  );
  return {
    nodes: results,
    allOnline: results.every((n) => n.online),
  };
}
