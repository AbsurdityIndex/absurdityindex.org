/* eslint-disable no-undef */
/* VoteChain POC (local-only)
 *
 * This is a browser-based proof-of-concept that simulates:
 * - VoteChain ledger (VCL): append-only signed events
 * - Bulletin board (BB): append-only Merkle log + signed tree heads (STH)
 * - Election web gateway (EWG): challenge + cast + idempotency behavior
 *
 * It intentionally does NOT implement ZK proofs or threshold cryptography.
 * Where the PRDs call for ZK, this POC uses signatures to demonstrate binding
 * to (election_id, jurisdiction_id, nullifier, challenge) and receipt verification.
 */

export const POC_EWP_VERSION = '0.1-preview';
export const POC_EWP_MEDIA_TYPE = 'application/votechain.ewp.v1+json';

type B64u = string;
type Hex0x = `0x${string}`;

export type EwpErrorCode =
  | 'EWP_BAD_MANIFEST'
  | 'EWP_CHALLENGE_EXPIRED'
  | 'EWP_IDEMPOTENCY_MISMATCH'
  | 'EWP_PROOF_INVALID'
  | 'EWP_NULLIFIER_USED'
  | 'EWP_BALLOT_INVALID'
  | 'EWP_RATE_LIMITED'
  | 'EWP_GATEWAY_OVERLOADED';

export type CastStatus = 'cast_recorded' | 'cast_pending';

export type VerifyStatus = 'ok' | 'fail';

export interface PocSignedTreeHead {
  tree_size: number;
  root_hash: B64u;
  timestamp: string; // ISO
  kid: string;
  sig: B64u;
}

export interface PocCastReceipt {
  receipt_id: B64u;
  election_id: string;
  manifest_id: B64u;
  ballot_hash: B64u;
  bb_leaf_hash: B64u;
  bb_sth: PocSignedTreeHead;
  votechain_anchor: {
    tx_id: Hex0x;
    event_type: 'ewp_ballot_cast';
    sth_root_hash: B64u;
  };
  kid: string;
  sig: B64u;
}

export interface PocCastRecordedResponse {
  status: 'cast_recorded';
  cast_receipt: PocCastReceipt;
}

export interface PocCastPendingResponse {
  status: 'cast_pending';
  cast_id: B64u;
  poll_url: string;
}

export type PocCastResponse = PocCastRecordedResponse | PocCastPendingResponse;

export interface PocEwpErrorResponse {
  error: {
    code: EwpErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export interface PocElectionManifest {
  election_id: string;
  jurisdiction_id: string;
  manifest_id: B64u;
  not_before: string;
  not_after: string;
  crypto: {
    suite: string;
    pk_election: B64u;
    trustees: Array<{ id: string; pubkey: B64u }>;
    threshold: { t: number; n: number };
  };
  endpoints: {
    challenge: string;
    cast: string;
    bb: string;
  };
  signing: {
    alg: string;
    kid: string;
    sig: B64u;
  };
}

export interface PocCredential {
  did: string;
  pub_spki: B64u;
  jwk_public: JsonWebKey;
  jwk_private: JsonWebKey;
  created_at: string;
}

export interface PocChallengeResponse {
  challenge_id: B64u;
  challenge: B64u;
  expires_at: string;
  kid: string;
  server_sig: B64u;
}

export interface PocEligibilityProof {
  zk_suite: string;
  vk_id: string;
  public_inputs: {
    election_id: string;
    jurisdiction_id: string;
    nullifier: Hex0x;
    challenge: B64u;
  };
  // In real EWP this is a ZK proof. In this POC it's an ECDSA signature.
  pi: B64u;
  // POC-only disclosure to make verification possible without ZK.
  did: string;
  did_pub_spki: B64u;
}

export interface PocEncryptedBallot {
  ballot_id: B64u;
  ciphertext: B64u;
  ballot_validity_proof: B64u;
  ballot_hash: B64u;
}

export interface PocCastRequest {
  ewp_version: string;
  election_id: string;
  jurisdiction_id: string;
  manifest_id: B64u;
  challenge_id: B64u;
  challenge: B64u;
  nullifier: Hex0x;
  eligibility_proof: PocEligibilityProof;
  encrypted_ballot: PocEncryptedBallot;
}

export interface PocBallotPlaintext {
  election_id: string;
  manifest_id: B64u;
  ballot_id: B64u;
  contests: Array<{ contest_id: string; selection: string }>;
  cast_at: string; // ISO
}

export interface PocContest {
  contest_id: string;
  title: string;
  type: 'candidate' | 'referendum';
  options: Array<{ id: string; label: string }>;
}

export interface PocSpoilReceipt {
  receipt_id: B64u;
  election_id: string;
  ballot_hash: B64u;
  spoiled_at: string;
  kid: string;
  sig: B64u;
}

export interface PocBallotRandomnessReveal {
  ballot_id: B64u;
  iv: B64u;
  aes_key: B64u;
  plaintext: PocBallotPlaintext;
}

export interface PocSpoilResponse {
  status: 'ballot_spoiled';
  spoil_receipt: PocSpoilReceipt;
  randomness_reveal: PocBallotRandomnessReveal;
}

export interface PocSpoiledBallotRecord {
  ballot_hash: B64u;
  encrypted_ballot: PocEncryptedBallot;
  randomness_reveal: PocBallotRandomnessReveal;
  spoil_receipt: PocSpoilReceipt;
  spoiled_at: string;
}

interface EncryptionResult {
  encrypted_ballot: PocEncryptedBallot;
  iv: Uint8Array;
  plaintext: PocBallotPlaintext;
}

interface StoredKeyPair {
  kid: string;
  alg: string;
  jwk_public: JsonWebKey;
  jwk_private: JsonWebKey;
}

interface PocVclEvent {
  tx_id: Hex0x;
  type:
    | 'election_manifest_published'
    | 'ewp_ballot_cast'
    | 'bb_sth_published'
    | 'tally_published'
    | 'fraud_flag'
    | 'fraud_flag_action';
  recorded_at: string;
  payload: Record<string, unknown>;
  kid: string;
  sig: B64u;
}

export type PocFraudFlagStatus =
  | 'pending_review'
  | 'triaged'
  | 'investigating'
  | 'escalated'
  | 'resolved_cleared'
  | 'resolved_confirmed_fraud'
  | 'resolved_system_error';

export type PocFraudFlagAction =
  | 'take_case'
  | 'start_investigation'
  | 'escalate'
  | 'resolve_cleared'
  | 'resolve_confirmed_fraud'
  | 'resolve_system_error'
  | 'note';

export interface PocFraudCaseActionRecord {
  tx_id: Hex0x;
  recorded_at: string;
  action: PocFraudFlagAction | string;
  reviewer_id: string;
  from_status: PocFraudFlagStatus | string;
  to_status: PocFraudFlagStatus | string;
  reason_code?: string;
  note?: string;
  assigned_to?: string;
}

export interface PocFraudCase {
  case_id: Hex0x;
  created_at: string;
  updated_at: string;
  status: PocFraudFlagStatus | string;
  flag_type: string;
  severity?: string;
  evidence_strength?: string;
  election_id?: string;
  jurisdiction_id?: string;
  nullifier?: string;
  assigned_to?: string;
  flag_payload: Record<string, unknown>;
  actions: PocFraudCaseActionRecord[];
}

interface PocBbLeaf {
  leaf_hash: B64u;
  payload: Record<string, unknown>;
}

interface PocChallengeRecord {
  challenge_id: B64u;
  challenge: B64u;
  expires_at: string;
  used: boolean;
  kid: string;
  server_sig: B64u;
}

interface PocIdempotencyRecord {
  request_hash: B64u;
  response: PocCastResponse | PocEwpErrorResponse;
  stored_at: string;
}

interface PocTally {
  election_id: string;
  manifest_id: B64u;
  bb_close_root_hash: B64u;
  computed_at: string;
  totals: Record<string, Record<string, number>>;
  ballot_count: number;
  kid: string;
  sig: B64u;
}

interface PocStateV1 {
  version: 1;
  election: {
    election_id: string;
    jurisdiction_id: string;
    contests: PocContest[];
  };
  keys: {
    manifest: StoredKeyPair;
    ewg: StoredKeyPair;
    bb: StoredKeyPair;
    vcl: StoredKeyPair;
  };
  manifest: PocElectionManifest;
  election_secret: {
    // AES-GCM 256 key bytes (base64url)
    aes_key: B64u;
  };
  credential?: PocCredential;
  challenges: Record<string, PocChallengeRecord>;
  idempotency: Record<string, PocIdempotencyRecord>;
  bb: {
    leaves: PocBbLeaf[];
    sth_history: PocSignedTreeHead[];
  };
  vcl: {
    events: PocVclEvent[];
  };
  spoiled_ballots: PocSpoiledBallotRecord[];
  tally?: PocTally;
}

const STORAGE_KEY = 'votechain_poc_state_v1';

function nowIso() {
  return new Date().toISOString();
}

function utf8(input: string) {
  return new TextEncoder().encode(input);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // WebCrypto typings can be strict about `ArrayBuffer` vs `ArrayBufferLike`.
  // For this POC, our Uint8Arrays are backed by `ArrayBuffer` in practice.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function concatBytes(...chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function b64ToBytes(b64: string) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function bytesToB64u(bytes: Uint8Array): B64u {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function b64uToBytes(b64u: B64u): Uint8Array {
  const padded = b64u
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(b64u.length / 4) * 4, '=');
  return b64ToBytes(padded);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomBytes(n: number) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((v) => canonicalize(v));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = canonicalize(record[k]);
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

async function sha256(data: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(data));
  return new Uint8Array(digest);
}

async function sha256B64u(data: Uint8Array): Promise<B64u> {
  return bytesToB64u(await sha256(data));
}

async function sha256Hex0x(data: Uint8Array): Promise<Hex0x> {
  const h = await sha256(data);
  return `0x${bytesToHex(h)}`;
}

async function generateEcdsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
}

async function exportKeyPair(keyPair: CryptoKeyPair, kid: string): Promise<StoredKeyPair> {
  const jwk_public = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const jwk_private = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  return {
    kid,
    alg: 'ECDSA_P-256_SHA256',
    jwk_public,
    jwk_private,
  };
}

async function importPublicKey(jwk: JsonWebKey) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'verify',
  ]);
}

async function importPrivateKey(jwk: JsonWebKey) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ]);
}

async function signB64u(privateJwk: JsonWebKey, message: Uint8Array): Promise<B64u> {
  const key = await importPrivateKey(privateJwk);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    toArrayBuffer(message),
  );
  return bytesToB64u(new Uint8Array(sig));
}

async function verifyB64u(
  publicJwk: JsonWebKey,
  message: Uint8Array,
  sigB64u: B64u,
): Promise<boolean> {
  const key = await importPublicKey(publicJwk);
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    toArrayBuffer(b64uToBytes(sigB64u)),
    toArrayBuffer(message),
  );
}

function loadState(): PocStateV1 | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PocStateV1;
  } catch {
    return null;
  }
}

function saveState(state: PocStateV1) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetPocState() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('votechain_poc_last_receipt');
}

async function computeManifestId(
  manifestUnsigned: Omit<PocElectionManifest, 'manifest_id' | 'signing'>,
) {
  return sha256B64u(utf8(canonicalJson(manifestUnsigned)));
}

async function signManifest(
  manifestUnsigned: Omit<PocElectionManifest, 'manifest_id' | 'signing'>,
  manifestKey: StoredKeyPair,
): Promise<PocElectionManifest> {
  const manifest_id = await computeManifestId(manifestUnsigned);
  const signingPayload = {
    ...manifestUnsigned,
    manifest_id,
  };
  const sig = await signB64u(manifestKey.jwk_private, utf8(canonicalJson(signingPayload)));
  return {
    ...manifestUnsigned,
    manifest_id,
    signing: {
      alg: manifestKey.alg,
      kid: manifestKey.kid,
      sig,
    },
  };
}

async function verifyManifest(
  manifest: PocElectionManifest,
  manifestKey: StoredKeyPair,
): Promise<boolean> {
  const { signing, manifest_id, ...unsigned } = manifest;
  const expectedId = await sha256B64u(utf8(canonicalJson(unsigned)));
  if (expectedId !== manifest_id) return false;
  return verifyB64u(
    manifestKey.jwk_public,
    utf8(canonicalJson({ ...unsigned, manifest_id })),
    signing.sig,
  );
}

async function bbLeafHash(payload: Record<string, unknown>) {
  const body = utf8(canonicalJson(payload));
  return sha256B64u(concatBytes(utf8('votechain:bb:leaf:v1:'), body));
}

async function bbNodeHash(left: Uint8Array, right: Uint8Array) {
  return sha256(concatBytes(utf8('votechain:bb:node:v1:'), left, right));
}

async function computeMerkleRootFromLeafHashes(leafHashesB64u: B64u[]): Promise<Uint8Array> {
  if (leafHashesB64u.length === 0)
    return new Uint8Array(await sha256(utf8('votechain:bb:empty:v1')));

  let level = leafHashesB64u.map((h) => b64uToBytes(h));

  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(await bbNodeHash(left, right));
    }
    level = next;
  }

  return level[0];
}

export interface PocInclusionProof {
  leaf_hash: B64u;
  root_hash: B64u;
  tree_size: number;
  leaf_index: number;
  path: Array<{ side: 'left' | 'right'; hash: B64u }>;
}

async function computeInclusionProof(
  leafHashes: B64u[],
  leafIndex: number,
): Promise<PocInclusionProof | null> {
  if (leafIndex < 0 || leafIndex >= leafHashes.length) return null;

  const path: Array<{ side: 'left' | 'right'; hash: B64u }> = [];
  let index = leafIndex;
  let level = leafHashes.map((h) => b64uToBytes(h));

  while (level.length > 1) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    const sibling = level[siblingIndex] ?? level[index];
    path.push({ side: isRight ? 'left' : 'right', hash: bytesToB64u(sibling) });

    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(await bbNodeHash(left, right));
    }

    index = Math.floor(index / 2);
    level = next;
  }

  return {
    leaf_hash: leafHashes[leafIndex],
    root_hash: bytesToB64u(level[0]),
    tree_size: leafHashes.length,
    leaf_index: leafIndex,
    path,
  };
}

export async function verifyInclusionProof(proof: PocInclusionProof): Promise<boolean> {
  let acc = b64uToBytes(proof.leaf_hash);
  for (const step of proof.path) {
    const sibling = b64uToBytes(step.hash);
    acc = step.side === 'left' ? await bbNodeHash(sibling, acc) : await bbNodeHash(acc, sibling);
  }
  return bytesToB64u(acc) === proof.root_hash;
}

async function vclTxId(payload: Record<string, unknown>) {
  return sha256Hex0x(utf8(canonicalJson(payload)));
}

async function vclSignEvent(
  eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'>,
  vclKey: StoredKeyPair,
) {
  const txPayload = {
    type: eventUnsigned.type,
    recorded_at: eventUnsigned.recorded_at,
    payload: eventUnsigned.payload,
    kid: eventUnsigned.kid,
  };
  const tx_id = await vclTxId(txPayload);
  const sig = await signB64u(vclKey.jwk_private, utf8(canonicalJson({ tx_id, ...txPayload })));
  return { tx_id, sig };
}

async function vclVerifyEvent(event: PocVclEvent, vclKey: StoredKeyPair) {
  const { sig, ...unsigned } = event;
  const txPayload = {
    type: unsigned.type,
    recorded_at: unsigned.recorded_at,
    payload: unsigned.payload,
    kid: unsigned.kid,
  };
  const expectedTxId = await vclTxId(txPayload);
  if (expectedTxId !== unsigned.tx_id) return false;
  return verifyB64u(vclKey.jwk_public, utf8(canonicalJson(unsigned)), sig);
}

function buildEwpError(
  code: EwpErrorCode,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>,
): PocEwpErrorResponse {
  return {
    error: {
      code,
      message,
      retryable,
      ...(details ? { details } : {}),
    },
  };
}

async function ensureInitialized(): Promise<PocStateV1> {
  const existing = loadState();
  // Detect old single-contest schema and force re-init
  if (existing?.version === 1 && Array.isArray((existing.election as any).contests) && Array.isArray(existing.spoiled_ballots)) return existing;
  if (existing) {
    // Old schema detected — reset and re-initialize
    localStorage.removeItem(STORAGE_KEY);
  }

  const [manifestKeyPair, ewgKeyPair, bbKeyPair, vclKeyPair] = await Promise.all([
    generateEcdsaKeyPair(),
    generateEcdsaKeyPair(),
    generateEcdsaKeyPair(),
    generateEcdsaKeyPair(),
  ]);

  const keys = {
    manifest: await exportKeyPair(manifestKeyPair, 'poc-manifest-kid-1'),
    ewg: await exportKeyPair(ewgKeyPair, 'poc-ewg-kid-1'),
    bb: await exportKeyPair(bbKeyPair, 'poc-bb-kid-1'),
    vcl: await exportKeyPair(vclKeyPair, 'poc-vcl-kid-1'),
  };

  const election_id = 'poc-2026-demo';
  const jurisdiction_id = 'poc_jurisdiction_hash_0x9c1d';
  const contests: PocContest[] = [
    {
      contest_id: 'us-senate-ny-2026',
      title: 'U.S. Senate \u2014 New York',
      type: 'candidate',
      options: [
        { id: 'gutierrez-d', label: 'Maria Gutierrez (D)' },
        { id: 'chen-r', label: 'James Chen (R)' },
        { id: 'okafor-i', label: 'Adaeze Okafor (I)' },
      ],
    },
    {
      contest_id: 'prop-12-infrastructure',
      title: 'Proposition 12 \u2014 Infrastructure Bond',
      type: 'referendum',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
    },
  ];

  const aesKey = randomBytes(32);
  const pkElection = await sha256B64u(concatBytes(utf8('votechain:poc:pk_election:'), aesKey));

  const endpoints = {
    challenge: `/votechain/poc/vote#challenge`,
    cast: `/votechain/poc/vote#cast`,
    bb: `/votechain/poc/dashboard#bb`,
  };

  const not_before = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const not_after = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const unsignedManifest: Omit<PocElectionManifest, 'manifest_id' | 'signing'> = {
    election_id,
    jurisdiction_id,
    not_before,
    not_after,
    crypto: {
      suite: 'ewp_suite_aesgcm_poc_v1',
      pk_election: pkElection,
      trustees: [
        { id: 'T1', pubkey: pkElection },
        { id: 'T2', pubkey: pkElection },
        { id: 'T3', pubkey: pkElection },
      ],
      threshold: { t: 2, n: 3 },
    },
    endpoints,
  };

  const manifest = await signManifest(unsignedManifest, keys.manifest);

  const initialState: PocStateV1 = {
    version: 1,
    election: { election_id, jurisdiction_id, contests },
    keys,
    manifest,
    election_secret: { aes_key: bytesToB64u(aesKey) },
    challenges: {},
    idempotency: {},
    bb: { leaves: [], sth_history: [] },
    vcl: { events: [] },
    spoiled_ballots: [],
  };

  // Anchor the manifest on the simulated VoteChain ledger.
  const manifestPublish: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'election_manifest_published',
    recorded_at: nowIso(),
    payload: {
      election_id,
      jurisdiction_id,
      manifest_id: manifest.manifest_id,
      signer_kid: manifest.signing.kid,
    },
    kid: keys.vcl.kid,
  };

  const manifestPublishSig = await vclSignEvent(manifestPublish, keys.vcl);
  initialState.vcl.events.push({ ...manifestPublish, ...manifestPublishSig });

  saveState(initialState);
  return initialState;
}

export async function getPocState() {
  return ensureInitialized();
}

export async function getManifest(): Promise<PocElectionManifest> {
  const state = await ensureInitialized();
  return state.manifest;
}

export async function getCredential(): Promise<PocCredential | null> {
  const state = await ensureInitialized();
  return state.credential ?? null;
}

export async function ensureCredential(): Promise<PocCredential> {
  const state = await ensureInitialized();
  if (state.credential) return state.credential;

  const voterKeys = await generateEcdsaKeyPair();
  const jwk_public = await crypto.subtle.exportKey('jwk', voterKeys.publicKey);
  const jwk_private = await crypto.subtle.exportKey('jwk', voterKeys.privateKey);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', voterKeys.publicKey));

  const didSuffix = await sha256B64u(concatBytes(utf8('votechain:poc:did:v1:'), spki));
  const credential: PocCredential = {
    did: `did:votechain:poc:${didSuffix}`,
    pub_spki: bytesToB64u(spki),
    jwk_public,
    jwk_private,
    created_at: nowIso(),
  };

  state.credential = credential;
  saveState(state);
  return credential;
}

export async function computeNullifier(pubSpkiB64u: B64u, election_id: string): Promise<Hex0x> {
  const pubSpki = b64uToBytes(pubSpkiB64u);
  return sha256Hex0x(concatBytes(utf8('votechain:nullifier:v1:'), pubSpki, utf8(election_id)));
}

export async function issueChallenge(client_session: B64u): Promise<PocChallengeResponse> {
  const state = await ensureInitialized();

  const challenge_id = bytesToB64u(randomBytes(16));
  const challenge = bytesToB64u(randomBytes(32));
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const unsigned = {
    challenge_id,
    challenge,
    expires_at,
    client_session,
    kid: state.keys.ewg.kid,
  };

  const server_sig = await signB64u(state.keys.ewg.jwk_private, utf8(canonicalJson(unsigned)));

  const record: PocChallengeRecord = {
    challenge_id,
    challenge,
    expires_at,
    used: false,
    kid: state.keys.ewg.kid,
    server_sig,
  };

  state.challenges[challenge_id] = record;
  saveState(state);

  return {
    challenge_id,
    challenge,
    expires_at,
    kid: state.keys.ewg.kid,
    server_sig,
  };
}

async function encryptBallot(
  plaintext: PocBallotPlaintext,
  aesKeyB64u: B64u,
): Promise<EncryptionResult> {
  const ballot_id = bytesToB64u(randomBytes(16));
  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(b64uToBytes(aesKeyB64u)),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const fullPlaintext: PocBallotPlaintext = { ...plaintext, ballot_id };
  const body = utf8(canonicalJson(fullPlaintext));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, body);
  const cipherBytes = new Uint8Array(cipherBuf);
  const packed = concatBytes(iv, cipherBytes);

  return {
    encrypted_ballot: {
      ballot_id,
      ciphertext: bytesToB64u(packed),
      ballot_validity_proof: bytesToB64u(utf8('poc_validity_v1')),
      ballot_hash: await sha256B64u(packed),
    },
    iv,
    plaintext: fullPlaintext,
  };
}

async function decryptBallot(
  ciphertextB64u: B64u,
  aesKeyB64u: B64u,
): Promise<PocBallotPlaintext | null> {
  try {
    const packed = b64uToBytes(ciphertextB64u);
    const iv = packed.slice(0, 12);
    const cipher = packed.slice(12);
    const key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(b64uToBytes(aesKeyB64u)),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    const plainText = new TextDecoder().decode(new Uint8Array(plainBuf));
    return JSON.parse(plainText) as PocBallotPlaintext;
  } catch {
    return null;
  }
}

function validateBallotPlaintext(state: PocStateV1, plaintext: PocBallotPlaintext): boolean {
  if (plaintext.election_id !== state.election.election_id) return false;
  if (plaintext.manifest_id !== state.manifest.manifest_id) return false;
  if (!Array.isArray(plaintext.contests)) return false;
  for (const entry of plaintext.contests) {
    const config = state.election.contests.find((c) => c.contest_id === entry.contest_id);
    if (!config) return false;
    if (!config.options.some((o) => o.id === entry.selection)) return false;
  }
  return true;
}

async function issueBbSth(state: PocStateV1): Promise<PocSignedTreeHead> {
  const leafHashes = state.bb.leaves.map((l) => l.leaf_hash);
  const rootBytes = await computeMerkleRootFromLeafHashes(leafHashes);
  const sthUnsigned = {
    tree_size: leafHashes.length,
    root_hash: bytesToB64u(rootBytes),
    timestamp: nowIso(),
    kid: state.keys.bb.kid,
  };
  const sig = await signB64u(state.keys.bb.jwk_private, utf8(canonicalJson(sthUnsigned)));
  const sth: PocSignedTreeHead = { ...sthUnsigned, sig };
  state.bb.sth_history.push(sth);
  return sth;
}

async function verifyBbSth(sth: PocSignedTreeHead, bbKey: StoredKeyPair): Promise<boolean> {
  const { sig, ...unsigned } = sth;
  return verifyB64u(bbKey.jwk_public, utf8(canonicalJson(unsigned)), sig);
}

async function receiptSigPayload(receipt: Omit<PocCastReceipt, 'sig'>) {
  return utf8(canonicalJson(receipt));
}

async function signReceipt(
  state: PocStateV1,
  receiptUnsigned: Omit<PocCastReceipt, 'sig'>,
): Promise<B64u> {
  return signB64u(state.keys.ewg.jwk_private, await receiptSigPayload(receiptUnsigned));
}

async function verifyReceiptSig(receipt: PocCastReceipt, ewgKey: StoredKeyPair): Promise<boolean> {
  const { sig, ...unsigned } = receipt;
  return verifyB64u(ewgKey.jwk_public, await receiptSigPayload(unsigned), sig);
}

function getAnchorEventForLeaf(state: PocStateV1, bb_leaf_hash: B64u): PocVclEvent | null {
  const match = state.vcl.events.find(
    (evt) => evt.type === 'ewp_ballot_cast' && evt.payload.bb_leaf_hash === bb_leaf_hash,
  );
  return match ?? null;
}

function hasUsedNullifier(state: PocStateV1, nullifier: Hex0x) {
  return state.vcl.events.some(
    (evt) => evt.type === 'ewp_ballot_cast' && evt.payload.nullifier === nullifier,
  );
}

async function recordFraudFlag(state: PocStateV1, flag: Record<string, unknown>) {
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'fraud_flag',
    recorded_at: nowIso(),
    payload: flag,
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });
}

async function recordFraudFlagAction(state: PocStateV1, action: Record<string, unknown>) {
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'fraud_flag_action',
    recorded_at: nowIso(),
    payload: action,
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isResolvedFraudStatus(status: string) {
  return status.startsWith('resolved_');
}

function deriveFraudCases(state: PocStateV1): PocFraudCase[] {
  const createEvents = state.vcl.events.filter((e) => e.type === 'fraud_flag');
  const actionEvents = state.vcl.events.filter((e) => e.type === 'fraud_flag_action');

  const actionsByCase = new Map<string, PocFraudCaseActionRecord[]>();
  for (const evt of actionEvents) {
    const case_id = asString(evt.payload.case_id);
    if (!case_id) continue;

    const actionRecord: PocFraudCaseActionRecord = {
      tx_id: evt.tx_id,
      recorded_at: evt.recorded_at,
      action: asString(evt.payload.action) ?? 'unknown',
      reviewer_id: asString(evt.payload.reviewer_id) ?? 'unknown',
      from_status: asString(evt.payload.from_status) ?? 'unknown',
      to_status: asString(evt.payload.to_status) ?? (asString(evt.payload.from_status) ?? 'unknown'),
      reason_code: asString(evt.payload.reason_code),
      note: asString(evt.payload.note),
      assigned_to: asString(evt.payload.assigned_to),
    };

    const list = actionsByCase.get(case_id) ?? [];
    list.push(actionRecord);
    actionsByCase.set(case_id, list);
  }

  const cases: PocFraudCase[] = [];
  for (const create of createEvents) {
    const case_id = create.tx_id;
    const actions = actionsByCase.get(case_id)?.slice() ?? [];
    actions.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

    const flag_type = asString(create.payload.flag_type) ?? 'unknown';
    const severity = asString(create.payload.severity);
    const evidence_strength = asString(create.payload.evidence_strength);
    const election_id = asString(create.payload.election_id);
    const jurisdiction_id = asString(create.payload.jurisdiction_id);
    const nullifier = asString(create.payload.nullifier);

    let status: string = asString(create.payload.status) ?? 'pending_review';
    let updated_at = create.recorded_at;
    let assigned_to: string | undefined;

    for (const a of actions) {
      if (a.to_status) status = a.to_status;
      if (a.assigned_to) assigned_to = a.assigned_to;
      updated_at = a.recorded_at;
    }

    cases.push({
      case_id,
      created_at: create.recorded_at,
      updated_at,
      status,
      flag_type,
      severity,
      evidence_strength,
      election_id,
      jurisdiction_id,
      nullifier,
      assigned_to,
      flag_payload: create.payload,
      actions,
    });
  }

  cases.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return cases;
}

async function recordBbSthPublished(state: PocStateV1, sth: PocSignedTreeHead) {
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'bb_sth_published',
    recorded_at: nowIso(),
    payload: {
      election_id: state.election.election_id,
      bb_root_hash: sth.root_hash,
      tree_size: sth.tree_size,
      kid: sth.kid,
      sth_sig: sth.sig,
    },
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });
}

async function recordEwpBallotCast(
  state: PocStateV1,
  request: PocCastRequest,
  bb_leaf_hash: B64u,
  bb_root_hash: B64u,
) {
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'ewp_ballot_cast',
    recorded_at: nowIso(),
    payload: {
      election_id: request.election_id,
      jurisdiction_id: request.jurisdiction_id,
      deployment_mode: 'mode_3',
      nullifier: request.nullifier,
      ballot_hash: request.encrypted_ballot.ballot_hash,
      bb_leaf_hash,
      bb_root_hash,
      gateway_id: 'ewg_poc_1',
    },
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });
  return { tx_id: signed.tx_id };
}

async function buildEligibilityProof(
  credential: PocCredential,
  election_id: string,
  jurisdiction_id: string,
  nullifier: Hex0x,
  challenge: B64u,
): Promise<PocEligibilityProof> {
  const msg = {
    election_id,
    jurisdiction_id,
    nullifier,
    challenge,
  };
  const pi = await signB64u(credential.jwk_private, utf8(canonicalJson(msg)));

  return {
    zk_suite: 'votechain_zk_poc_sig_v1',
    vk_id: 'poc-vk-1',
    public_inputs: { election_id, jurisdiction_id, nullifier, challenge },
    pi,
    did: credential.did,
    did_pub_spki: credential.pub_spki,
  };
}

async function verifyEligibilityProof(
  state: PocStateV1,
  proof: PocEligibilityProof,
): Promise<boolean> {
  const msg = canonicalJson({
    election_id: proof.public_inputs.election_id,
    jurisdiction_id: proof.public_inputs.jurisdiction_id,
    nullifier: proof.public_inputs.nullifier,
    challenge: proof.public_inputs.challenge,
  });

  // POC-only: recover the key from disclosed DID public material.
  // We deliberately do NOT store any PII; the DID is pseudonymous.
  const pubSpkiBytes = b64uToBytes(proof.did_pub_spki);
  // We only need a public JWK to verify, but webcrypto can't import SPKI directly to ECDSA via JWK.
  // In this POC, we use the stored credential public JWK if it matches the DID.
  if (!state.credential || state.credential.did !== proof.did) return false;
  // Ensure disclosed SPKI matches stored credential.
  if (state.credential.pub_spki !== bytesToB64u(pubSpkiBytes)) return false;

  return verifyB64u(state.credential.jwk_public, utf8(msg), proof.pi);
}

export async function buildCastRequest(params: {
  encrypted_ballot: PocEncryptedBallot;
  challenge: PocChallengeResponse;
  idempotencyKey?: string;
}): Promise<{ request: PocCastRequest; idempotencyKey: string } | { error: string }> {
  const state = await ensureInitialized();
  const credential = await ensureCredential();

  const nullifier = await computeNullifier(credential.pub_spki, state.election.election_id);

  const eligibility_proof = await buildEligibilityProof(
    credential,
    state.election.election_id,
    state.election.jurisdiction_id,
    nullifier,
    params.challenge.challenge,
  );

  const request: PocCastRequest = {
    ewp_version: POC_EWP_VERSION,
    election_id: state.election.election_id,
    jurisdiction_id: state.election.jurisdiction_id,
    manifest_id: state.manifest.manifest_id,
    challenge_id: params.challenge.challenge_id,
    challenge: params.challenge.challenge,
    nullifier,
    eligibility_proof,
    encrypted_ballot: params.encrypted_ballot,
  };

  return { request, idempotencyKey: params.idempotencyKey ?? crypto.randomUUID() };
}

export async function encryptBallotForReview(params: {
  contests: Array<{ contest_id: string; selection: string }>;
}): Promise<
  { encrypted_ballot: PocEncryptedBallot; iv: B64u; plaintext: PocBallotPlaintext } | { error: string }
> {
  const state = await ensureInitialized();

  const plaintext: PocBallotPlaintext = {
    election_id: state.election.election_id,
    manifest_id: state.manifest.manifest_id,
    ballot_id: 'unused', // replaced by encryptBallot
    contests: params.contests,
    cast_at: nowIso(),
  };

  if (!validateBallotPlaintext(state, plaintext)) {
    return { error: 'Ballot is not valid for this manifest.' };
  }

  const result = await encryptBallot(plaintext, state.election_secret.aes_key);
  return {
    encrypted_ballot: result.encrypted_ballot,
    iv: bytesToB64u(result.iv),
    plaintext: result.plaintext,
  };
}

export async function spoilBallot(params: {
  encrypted_ballot: PocEncryptedBallot;
  iv: B64u;
  plaintext: PocBallotPlaintext;
}): Promise<PocSpoilResponse> {
  const state = await ensureInitialized();

  const receipt_id = bytesToB64u(randomBytes(16));
  const spoiled_at = nowIso();

  const receiptUnsigned = {
    receipt_id,
    election_id: state.election.election_id,
    ballot_hash: params.encrypted_ballot.ballot_hash,
    spoiled_at,
    kid: state.keys.ewg.kid,
  };

  const sig = await signB64u(
    state.keys.ewg.jwk_private,
    utf8(canonicalJson(receiptUnsigned)),
  );

  const spoil_receipt: PocSpoilReceipt = { ...receiptUnsigned, sig };

  const randomness_reveal: PocBallotRandomnessReveal = {
    ballot_id: params.encrypted_ballot.ballot_id,
    iv: params.iv,
    aes_key: state.election_secret.aes_key,
    plaintext: params.plaintext,
  };

  state.spoiled_ballots.push({
    ballot_hash: params.encrypted_ballot.ballot_hash,
    encrypted_ballot: params.encrypted_ballot,
    randomness_reveal,
    spoil_receipt,
    spoiled_at,
  });

  saveState(state);

  return { status: 'ballot_spoiled', spoil_receipt, randomness_reveal };
}

export async function verifySpoiledBallot(params: {
  encrypted_ballot: PocEncryptedBallot;
  iv: B64u;
  aes_key: B64u;
  plaintext: PocBallotPlaintext;
}): Promise<{ match: boolean; details: string }> {
  const ivBytes = b64uToBytes(params.iv);
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(b64uToBytes(params.aes_key)),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const body = utf8(canonicalJson(params.plaintext));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    key,
    toArrayBuffer(body),
  );
  const cipherBytes = new Uint8Array(cipherBuf);
  const packed = concatBytes(ivBytes, cipherBytes);
  const recomputedCiphertext = bytesToB64u(packed);

  const match = recomputedCiphertext === params.encrypted_ballot.ciphertext;
  return {
    match,
    details: match
      ? 'Ciphertext matches re-encryption. Device encrypted honestly.'
      : 'MISMATCH: ciphertext does not match re-encryption! Device may have altered your ballot.',
  };
}

export async function castBallot(args: {
  request: PocCastRequest;
  idempotencyKey: string;
}): Promise<PocCastResponse | PocEwpErrorResponse> {
  const state = await ensureInitialized();

  const requestHash = await sha256B64u(utf8(canonicalJson(args.request)));

  const existing = state.idempotency[args.idempotencyKey];
  if (existing) {
    if (existing.request_hash !== requestHash) {
      return buildEwpError(
        'EWP_IDEMPOTENCY_MISMATCH',
        'Idempotency-Key reused with different body.',
        false,
      );
    }
    return existing.response;
  }

  // 1) Validate manifest
  const manifestOk = await verifyManifest(state.manifest, state.keys.manifest);
  if (!manifestOk) {
    const err = buildEwpError('EWP_BAD_MANIFEST', 'Manifest signature invalid.', false);
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  if (
    args.request.ewp_version !== POC_EWP_VERSION ||
    args.request.election_id !== state.election.election_id ||
    args.request.jurisdiction_id !== state.election.jurisdiction_id ||
    args.request.manifest_id !== state.manifest.manifest_id
  ) {
    const err = buildEwpError(
      'EWP_BAD_MANIFEST',
      'Cast request does not match the active manifest.',
      false,
    );
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  // 2) Validate challenge
  const challenge = state.challenges[args.request.challenge_id];
  if (!challenge || challenge.challenge !== args.request.challenge) {
    const err = buildEwpError('EWP_PROOF_INVALID', 'Challenge not found.', false);
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  if (challenge.used) {
    const err = buildEwpError('EWP_PROOF_INVALID', 'Challenge already used.', false);
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  const exp = Date.parse(challenge.expires_at);
  if (Number.isFinite(exp) && Date.now() > exp) {
    const err = buildEwpError('EWP_CHALLENGE_EXPIRED', 'Challenge expired.', true);
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  // 3) Validate nullifier derivation (POC integrity)
  const expectedNullifier = await computeNullifier(
    args.request.eligibility_proof.did_pub_spki,
    state.election.election_id,
  );
  if (expectedNullifier !== args.request.nullifier) {
    const err = buildEwpError('EWP_PROOF_INVALID', 'Nullifier derivation mismatch.', false);
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  // 4) Verify eligibility "proof" (signature)
  const proofOk = await verifyEligibilityProof(state, args.request.eligibility_proof);
  if (!proofOk) {
    const err = buildEwpError(
      'EWP_PROOF_INVALID',
      'Eligibility proof failed verification.',
      false,
      {
        vk_id: args.request.eligibility_proof.vk_id,
      },
    );
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  // 5) Nullifier uniqueness
  if (hasUsedNullifier(state, args.request.nullifier)) {
    await recordFraudFlag(state, {
      flag_type: 'duplicate_vote_attempt',
      election_id: args.request.election_id,
      jurisdiction_id: args.request.jurisdiction_id,
      nullifier: args.request.nullifier,
      evidence_strength: 'cryptographic',
      status: 'pending_review',
    });
    const err = buildEwpError('EWP_NULLIFIER_USED', 'Nullifier already used.', false);
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  // 6) Ballot validity (decrypt + check structure) [POC ONLY]
  const plaintext = await decryptBallot(
    args.request.encrypted_ballot.ciphertext,
    state.election_secret.aes_key,
  );
  if (!plaintext || !validateBallotPlaintext(state, plaintext)) {
    const err = buildEwpError('EWP_BALLOT_INVALID', 'Ballot failed validity checks.', false);
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  // Mark challenge as used as part of accepting cast.
  challenge.used = true;

  // 7) Write leaf to BB (append-only)
  const leafPayload = {
    ewp_version: args.request.ewp_version,
    election_id: args.request.election_id,
    manifest_id: args.request.manifest_id,
    encrypted_ballot: args.request.encrypted_ballot,
    received_at: nowIso(),
    gateway_id: 'ewg_poc_1',
  };
  const leaf_hash = await bbLeafHash(leafPayload);
  state.bb.leaves.push({ leaf_hash, payload: leafPayload });

  // 8) Issue STH and anchor it
  const sth = await issueBbSth(state);
  await recordBbSthPublished(state, sth);

  // 9) Anchor cast on VCL
  const anchor = await recordEwpBallotCast(state, args.request, leaf_hash, sth.root_hash);

  // 10) Build receipt
  const receiptUnsigned: Omit<PocCastReceipt, 'sig'> = {
    receipt_id: bytesToB64u(randomBytes(16)),
    election_id: args.request.election_id,
    manifest_id: args.request.manifest_id,
    ballot_hash: args.request.encrypted_ballot.ballot_hash,
    bb_leaf_hash: leaf_hash,
    bb_sth: sth,
    votechain_anchor: {
      tx_id: anchor.tx_id,
      event_type: 'ewp_ballot_cast',
      sth_root_hash: sth.root_hash,
    },
    kid: state.keys.ewg.kid,
  };
  const sig = await signReceipt(state, receiptUnsigned);
  const receipt: PocCastReceipt = { ...receiptUnsigned, sig };

  const response: PocCastRecordedResponse = { status: 'cast_recorded', cast_receipt: receipt };

  state.idempotency[args.idempotencyKey] = {
    request_hash: requestHash,
    response,
    stored_at: nowIso(),
  };
  saveState(state);

  return response;
}

export interface ReceiptVerificationResult {
  status: VerifyStatus;
  checks: Array<{ name: string; status: VerifyStatus; details?: string }>;
  inclusion_proof?: PocInclusionProof;
}

export async function verifyReceipt(receipt: PocCastReceipt): Promise<ReceiptVerificationResult> {
  const state = await ensureInitialized();
  const checks: Array<{ name: string; status: VerifyStatus; details?: string }> = [];

  // Manifest anchored?
  const manifestEvent = state.vcl.events.find(
    (e) =>
      e.type === 'election_manifest_published' && e.payload.manifest_id === receipt.manifest_id,
  );
  checks.push({
    name: 'manifest_anchored',
    status: manifestEvent ? 'ok' : 'fail',
    details: manifestEvent
      ? `tx_id=${manifestEvent.tx_id}`
      : 'No election_manifest_published event found.',
  });

  // Receipt signature
  const receiptSigOk = await verifyReceiptSig(receipt, state.keys.ewg);
  checks.push({
    name: 'receipt_signature',
    status: receiptSigOk ? 'ok' : 'fail',
    details: receiptSigOk ? `kid=${receipt.kid}` : 'Receipt signature invalid.',
  });

  // BB STH signature
  const sthOk = await verifyBbSth(receipt.bb_sth, state.keys.bb);
  checks.push({
    name: 'bb_sth_signature',
    status: sthOk ? 'ok' : 'fail',
    details: sthOk ? `kid=${receipt.bb_sth.kid}` : 'STH signature invalid.',
  });

  // Leaf exists?
  const leaf = state.bb.leaves.find((l) => l.leaf_hash === receipt.bb_leaf_hash);
  checks.push({
    name: 'bb_leaf_exists',
    status: leaf ? 'ok' : 'fail',
    details: leaf
      ? 'Leaf present in local bulletin board.'
      : 'Leaf not found in local bulletin board.',
  });

  // Inclusion proof
  let inclusionProof: PocInclusionProof | undefined;
  if (leaf) {
    const leafHashes = state.bb.leaves.map((l) => l.leaf_hash);
    const idx = leafHashes.indexOf(receipt.bb_leaf_hash);
    const computed = await computeInclusionProof(leafHashes, idx);
    inclusionProof = computed ?? undefined;
    const proofOk = inclusionProof ? await verifyInclusionProof(inclusionProof) : false;
    const rootMatches = inclusionProof
      ? inclusionProof.root_hash === receipt.bb_sth.root_hash
      : false;
    checks.push({
      name: 'bb_inclusion_proof',
      status: proofOk && rootMatches ? 'ok' : 'fail',
      details:
        proofOk && rootMatches
          ? `leaf_index=${idx} tree_size=${leafHashes.length}`
          : 'Inclusion proof failed or root hash mismatch.',
    });
  } else {
    checks.push({
      name: 'bb_inclusion_proof',
      status: 'fail',
      details: 'Cannot compute inclusion proof without the leaf.',
    });
  }

  // VoteChain anchor event
  const anchorEvent = getAnchorEventForLeaf(state, receipt.bb_leaf_hash);
  const anchorOk = !!anchorEvent && anchorEvent.tx_id === receipt.votechain_anchor.tx_id;
  checks.push({
    name: 'votechain_anchor',
    status: anchorOk ? 'ok' : 'fail',
    details: anchorOk
      ? `tx_id=${receipt.votechain_anchor.tx_id}`
      : 'No matching ewp_ballot_cast event found.',
  });

  // Anchor event signature
  if (anchorEvent) {
    const vclSigOk = await vclVerifyEvent(anchorEvent, state.keys.vcl);
    checks.push({
      name: 'votechain_anchor_signature',
      status: vclSigOk ? 'ok' : 'fail',
      details: vclSigOk ? `kid=${anchorEvent.kid}` : 'VCL event signature invalid.',
    });
  } else {
    checks.push({
      name: 'votechain_anchor_signature',
      status: 'fail',
      details: 'No anchor event available to verify signature.',
    });
  }

  const status = checks.every((c) => c.status === 'ok') ? 'ok' : 'fail';
  return { status, checks, inclusion_proof: inclusionProof };
}

export interface DashboardSnapshot {
  election: PocStateV1['election'];
  manifest: PocElectionManifest;
  bb: {
    leaf_count: number;
    latest_sth: PocSignedTreeHead | null;
  };
  vcl: {
    event_count: number;
    fraud_flags: number;
    ewp_casts: number;
  };
  metrics: {
    verified: number;
    crypto_conflict: number;
    spoiled: number;
    pending: number;
    provisional: number;
  };
  fraud_cases: PocFraudCase[];
  events: PocVclEvent[];
  leaves: PocBbLeaf[];
  tally?: PocTally;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const state = await ensureInitialized();

  const events = [...state.vcl.events].reverse();
  const leaves = [...state.bb.leaves].slice().reverse();

  const ewp_casts = state.vcl.events.filter((e) => e.type === 'ewp_ballot_cast').length;
  const fraud_flags = state.vcl.events.filter((e) => e.type === 'fraud_flag').length;

  // POC: "verified" = recorded casts, "crypto_conflict" = duplicate attempts, "pending" = 0 (sync).
  const verified = ewp_casts;
  const crypto_conflict = fraud_flags;
  const spoiled = state.spoiled_ballots.length;
  const pending = 0;
  const provisional = 0;

  return {
    election: state.election,
    manifest: state.manifest,
    bb: {
      leaf_count: state.bb.leaves.length,
      latest_sth: state.bb.sth_history[state.bb.sth_history.length - 1] ?? null,
    },
    vcl: {
      event_count: state.vcl.events.length,
      fraud_flags,
      ewp_casts,
    },
    metrics: {
      verified,
      crypto_conflict,
      spoiled,
      pending,
      provisional,
    },
    fraud_cases: deriveFraudCases(state),
    events,
    leaves,
    tally: state.tally,
  };
}

export async function reviewFraudFlag(params: {
  case_id: Hex0x;
  reviewer_id: string;
  action: PocFraudFlagAction;
  note?: string;
  reason_code?: string;
}): Promise<{ ok: true } | { error: string }> {
  const state = await ensureInitialized();

  const reviewer_id = params.reviewer_id.trim();
  if (!reviewer_id) return { error: 'Reviewer ID is required.' };

  const exists = state.vcl.events.some((e) => e.type === 'fraud_flag' && e.tx_id === params.case_id);
  if (!exists) return { error: 'Unknown fraud case id.' };

  const current = deriveFraudCases(state).find((c) => c.case_id === params.case_id);
  const currentStatus = (current?.status ?? 'pending_review') as string;

  if (isResolvedFraudStatus(currentStatus) && params.action !== 'note') {
    return { error: `Case is already ${currentStatus}. Only notes are allowed.` };
  }

  const nextStatusByAction: Partial<Record<PocFraudFlagAction, PocFraudFlagStatus>> = {
    take_case: 'triaged',
    start_investigation: 'investigating',
    escalate: 'escalated',
    resolve_cleared: 'resolved_cleared',
    resolve_confirmed_fraud: 'resolved_confirmed_fraud',
    resolve_system_error: 'resolved_system_error',
  };

  const to_status = nextStatusByAction[params.action] ?? currentStatus;

  const actionPayload: Record<string, unknown> = {
    case_id: params.case_id,
    action: params.action,
    reviewer_id,
    from_status: currentStatus,
    to_status,
    ...(params.reason_code ? { reason_code: params.reason_code } : {}),
    ...(params.note ? { note: params.note } : {}),
    ...(params.action === 'take_case' ? { assigned_to: reviewer_id } : {}),
  };

  await recordFraudFlagAction(state, actionPayload);
  saveState(state);
  return { ok: true };
}

export async function publishTally(): Promise<PocTally | { error: string }> {
  const state = await ensureInitialized();
  const latestSth = state.bb.sth_history[state.bb.sth_history.length - 1];
  if (!latestSth) return { error: 'No ballots on the bulletin board.' };

  // Compute totals by decrypting each ballot (POC only).
  const totals: Record<string, Record<string, number>> = {};
  for (const contest of state.election.contests) {
    totals[contest.contest_id] = Object.fromEntries(contest.options.map((o) => [o.id, 0]));
  }

  let ballot_count = 0;
  for (const leaf of state.bb.leaves) {
    const encrypted = (leaf.payload.encrypted_ballot ??
      null) as unknown as PocEncryptedBallot | null;
    if (!encrypted?.ciphertext) continue;
    const plaintext = await decryptBallot(encrypted.ciphertext, state.election_secret.aes_key);
    if (!plaintext) continue;
    if (!validateBallotPlaintext(state, plaintext)) continue;
    for (const entry of plaintext.contests) {
      const config = state.election.contests.find((c) => c.contest_id === entry.contest_id);
      if (!config) continue;
      if (!config.options.some((o) => o.id === entry.selection)) continue;
      if (totals[entry.contest_id]) totals[entry.contest_id][entry.selection] += 1;
    }
    ballot_count += 1;
  }

  const unsigned: Omit<PocTally, 'sig'> = {
    election_id: state.election.election_id,
    manifest_id: state.manifest.manifest_id,
    bb_close_root_hash: latestSth.root_hash,
    computed_at: nowIso(),
    totals,
    ballot_count,
    kid: state.keys.ewg.kid,
  };

  const sig = await signB64u(state.keys.ewg.jwk_private, utf8(canonicalJson(unsigned)));
  const tally: PocTally = { ...unsigned, sig };

  state.tally = tally;

  // Anchor tally on VCL.
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'tally_published',
    recorded_at: nowIso(),
    payload: {
      election_id: tally.election_id,
      manifest_id: tally.manifest_id,
      bb_close_root_hash: tally.bb_close_root_hash,
      tally_hash: await sha256B64u(utf8(canonicalJson(tally))),
    },
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });

  saveState(state);
  return tally;
}

export interface BallotLookupResult {
  found: boolean;
  ballot_hash: string;
  leaf_hash?: string;
  leaf_index?: number;
  received_at?: string;
  inclusion_proof?: PocInclusionProof;
  anchor_event?: {
    tx_id: string;
    recorded_at: string;
    nullifier?: string;
  };
  latest_sth?: PocSignedTreeHead;
  checks: Array<{ name: string; status: VerifyStatus; details?: string }>;
}

export async function lookupBallotByHash(ballotHash: string): Promise<BallotLookupResult> {
  const state = await ensureInitialized();
  const checks: Array<{ name: string; status: VerifyStatus; details?: string }> = [];

  // Find the leaf containing this ballot hash
  const leafIndex = state.bb.leaves.findIndex(
    (l) => (l.payload as any)?.encrypted_ballot?.ballot_hash === ballotHash,
  );

  if (leafIndex === -1) {
    checks.push({
      name: 'ballot_on_bulletin_board',
      status: 'fail',
      details: 'No ballot with this hash found on the bulletin board.',
    });
    return { found: false, ballot_hash: ballotHash, checks };
  }

  const leaf = state.bb.leaves[leafIndex];
  const receivedAt = (leaf.payload as any)?.received_at as string | undefined;

  checks.push({
    name: 'ballot_on_bulletin_board',
    status: 'ok',
    details: `Found at leaf index ${leafIndex} (leaf_hash: ${leaf.leaf_hash.slice(0, 16)}...)`,
  });

  // Compute inclusion proof
  const leafHashes = state.bb.leaves.map((l) => l.leaf_hash);
  const proof = await computeInclusionProof(leafHashes, leafIndex);
  const proofOk = proof ? await verifyInclusionProof(proof) : false;

  checks.push({
    name: 'merkle_inclusion_proof',
    status: proofOk ? 'ok' : 'fail',
    details: proofOk
      ? `Verified at leaf_index=${leafIndex}, tree_size=${leafHashes.length}`
      : 'Inclusion proof verification failed.',
  });

  // Check for VCL anchor event
  const anchorEvent = state.vcl.events.find(
    (evt) => evt.type === 'ewp_ballot_cast' && evt.payload.ballot_hash === ballotHash,
  );

  checks.push({
    name: 'votechain_anchor',
    status: anchorEvent ? 'ok' : 'fail',
    details: anchorEvent
      ? `Anchored: tx_id=${anchorEvent.tx_id.slice(0, 16)}...`
      : 'No matching ewp_ballot_cast event found on the ledger.',
  });

  // Verify anchor event signature
  if (anchorEvent) {
    const sigOk = await vclVerifyEvent(anchorEvent, state.keys.vcl);
    checks.push({
      name: 'anchor_signature',
      status: sigOk ? 'ok' : 'fail',
      details: sigOk ? `Signature valid (kid=${anchorEvent.kid})` : 'VCL event signature invalid.',
    });
  }

  // Latest STH
  const latestSth = state.bb.sth_history[state.bb.sth_history.length - 1] ?? undefined;
  if (latestSth) {
    const sthOk = await verifyBbSth(latestSth, state.keys.bb);
    checks.push({
      name: 'latest_sth_signature',
      status: sthOk ? 'ok' : 'fail',
      details: sthOk
        ? `STH tree_size=${latestSth.tree_size}, signed by ${latestSth.kid}`
        : 'Latest STH signature invalid.',
    });
  }

  return {
    found: true,
    ballot_hash: ballotHash,
    leaf_hash: leaf.leaf_hash,
    leaf_index: leafIndex,
    received_at: receivedAt,
    inclusion_proof: proof ?? undefined,
    anchor_event: anchorEvent
      ? {
          tx_id: anchorEvent.tx_id,
          recorded_at: anchorEvent.recorded_at,
          nullifier: anchorEvent.payload.nullifier as string | undefined,
        }
      : undefined,
    latest_sth: latestSth,
    checks,
  };
}

// ── Trust Portal API ────────────────────────────────────────────────────────
// These functions wrap existing internal crypto operations for the Public Trust
// Portal, enabling independent verification of every signature and data
// structure in the system.

export async function verifyManifestSignature(): Promise<{
  valid: boolean;
  manifest_id: string;
  kid: string;
}> {
  const state = await ensureInitialized();
  const valid = await verifyManifest(state.manifest, state.keys.manifest);
  return {
    valid,
    manifest_id: state.manifest.manifest_id,
    kid: state.manifest.signing.kid,
  };
}

export async function verifyAllSthSignatures(): Promise<{
  total: number;
  all_valid: boolean;
  results: Array<{ tree_size: number; timestamp: string; valid: boolean }>;
}> {
  const state = await ensureInitialized();
  const results: Array<{ tree_size: number; timestamp: string; valid: boolean }> = [];
  for (const sth of state.bb.sth_history) {
    const valid = await verifyBbSth(sth, state.keys.bb);
    results.push({ tree_size: sth.tree_size, timestamp: sth.timestamp, valid });
  }
  return {
    total: results.length,
    all_valid: results.every((r) => r.valid),
    results,
  };
}

export async function verifyAllVclEventSignatures(): Promise<{
  total: number;
  all_valid: boolean;
  results: Array<{ tx_id: string; type: string; valid: boolean }>;
}> {
  const state = await ensureInitialized();
  const results: Array<{ tx_id: string; type: string; valid: boolean }> = [];
  for (const event of state.vcl.events) {
    const valid = await vclVerifyEvent(event, state.keys.vcl);
    results.push({ tx_id: event.tx_id, type: event.type, valid });
  }
  return {
    total: results.length,
    all_valid: results.every((r) => r.valid),
    results,
  };
}

export async function verifyBulletinBoardIntegrity(): Promise<{
  valid: boolean;
  tree_size: number;
  computed_root: string;
  latest_sth_root: string;
}> {
  const state = await ensureInitialized();
  const leafHashes = state.bb.leaves.map((l) => l.leaf_hash);
  const computedRootBytes = await computeMerkleRootFromLeafHashes(leafHashes);
  const computed_root = bytesToB64u(computedRootBytes);
  const latestSth = state.bb.sth_history[state.bb.sth_history.length - 1];
  const latest_sth_root = latestSth?.root_hash ?? '';
  // If there are no STHs and no leaves, the tree is trivially valid (empty state)
  const valid = latestSth ? computed_root === latest_sth_root : leafHashes.length === 0;
  return {
    valid,
    tree_size: leafHashes.length,
    computed_root,
    latest_sth_root,
  };
}

export async function getPublicKeys(): Promise<{
  manifest: { kid: string; alg: string; jwk: JsonWebKey };
  ewg: { kid: string; alg: string; jwk: JsonWebKey };
  bb: { kid: string; alg: string; jwk: JsonWebKey };
  vcl: { kid: string; alg: string; jwk: JsonWebKey };
}> {
  const state = await ensureInitialized();
  return {
    manifest: { kid: state.keys.manifest.kid, alg: state.keys.manifest.alg, jwk: state.keys.manifest.jwk_public },
    ewg: { kid: state.keys.ewg.kid, alg: state.keys.ewg.alg, jwk: state.keys.ewg.jwk_public },
    bb: { kid: state.keys.bb.kid, alg: state.keys.bb.alg, jwk: state.keys.bb.jwk_public },
    vcl: { kid: state.keys.vcl.kid, alg: state.keys.vcl.alg, jwk: state.keys.vcl.jwk_public },
  };
}

export async function verifyTally(tally: PocTally): Promise<ReceiptVerificationResult> {
  const state = await ensureInitialized();
  const checks: Array<{ name: string; status: VerifyStatus; details?: string }> = [];

  const tallyHash = await sha256B64u(utf8(canonicalJson(tally)));

  const sigOk = await verifyB64u(
    state.keys.ewg.jwk_public,
    utf8(canonicalJson({ ...tally, sig: undefined })),
    tally.sig,
  );
  checks.push({
    name: 'tally_signature',
    status: sigOk ? 'ok' : 'fail',
    details: sigOk ? `kid=${tally.kid}` : 'Tally signature invalid.',
  });

  const anchored = state.vcl.events.some(
    (e) => e.type === 'tally_published' && e.payload.tally_hash === tallyHash,
  );
  checks.push({
    name: 'tally_anchored',
    status: anchored ? 'ok' : 'fail',
    details: anchored ? 'Found tally_published anchor.' : 'No tally_published anchor found.',
  });

  const status = checks.every((c) => c.status === 'ok') ? 'ok' : 'fail';
  return { status, checks };
}
