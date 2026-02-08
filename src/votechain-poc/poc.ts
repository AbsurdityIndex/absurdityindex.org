/* eslint-disable no-undef */
/* VoteChain POC (local-only)
 *
 * This is a browser-based proof-of-concept that simulates:
 * - VoteChain ledger (VCL): append-only signed events
 * - Bulletin board (BB): append-only Merkle log + signed tree heads (STH)
 * - Election web gateway (EWG): challenge + cast + idempotency behavior
 *
 * It implements:
 * - A POC eligibility proof as a Schnorr-style NIZK proof-of-knowledge (Fiat-Shamir)
 *   bound to (election_id, jurisdiction_id, nullifier, challenge).
 * - A POC threshold-decryption model for ballot secrecy: each ballot uses a fresh
 *   symmetric key, and that key is wrapped to an election public key whose secret is
 *   split among trustees (t-of-n). Decryption is only performed at tally time.
 *
 * This remains a toy/demo (single-browser, localStorage). It is not production voting
 * software and does not implement full anonymous credential membership proofs or
 * real-world trustee ceremonies / decryption proofs.
 */

import { secp256k1, schnorr } from '@noble/curves/secp256k1';

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
    pk_issuer: B64u; // Registration authority's compressed secp256k1 public key (33 bytes)
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
  curve: 'secp256k1';
  // BIP340 x-only public key (32 bytes, base64url)
  pk: B64u;
  // Private key (32 bytes, base64url). POC only: stored in localStorage.
  sk: B64u;
  // Blind Schnorr signature from the registration authority (issuer).
  // The issuer certified this credential without learning which public key it certified,
  // breaking the link between registration and voting.
  blind_sig: {
    R: B64u; // Unblinded nonce point R' (33 bytes compressed)
    s: B64u; // Unblinded scalar s' (32 bytes)
  };
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
  // Schnorr-style NIZK proof (Fiat-Shamir) as base64url bytes.
  pi: B64u;
  // The voter's x-only public key. It is still disclosed in the proof (needed for nullifier
  // derivation and BIP340 proof-of-knowledge verification), but blind Schnorr issuance makes
  // it **unlinkable to registration** — the issuer cannot tell which credential it certified.
  credential_pub: B64u;
  // Blind Schnorr signature from the registration authority, proving this credential was
  // authorized without revealing which signing session produced it.
  issuer_blind_sig: {
    R: B64u;
    s: B64u;
  };
}

export interface PocEncryptedBallot {
  ballot_id: B64u;
  ciphertext: B64u;
  ballot_validity_proof: B64u;
  ballot_hash: B64u;
  // POC threshold decryption support:
  // - ballot is encrypted with a fresh per-ballot AES key (revealed only on spoil)
  // - that key is wrapped to the election public key via ECIES-style ECDH + AES-GCM
  wrapped_ballot_key: B64u;
  wrapped_ballot_key_epk: B64u;
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
  ballot_key: B64u;
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
  ballot_key: Uint8Array;
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

export interface PocTrusteeShareRecord {
  id: string;
  x: number; // 1..n (Shamir x-coordinate)
  share: B64u; // scalar bytes (base64url, 32 bytes)
}

interface PocStateV2 {
  version: 2;
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
  trustees: {
    threshold: { t: number; n: number };
    // POC-only: private shares used to reconstruct the election secret at tally time.
    shares: PocTrusteeShareRecord[];
  };
  // Registration authority (issuer) keypair for blind Schnorr credential issuance.
  issuer: {
    sk: B64u; // secp256k1 scalar (32 bytes)
    pk: B64u; // secp256k1 compressed point (33 bytes)
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

const STORAGE_KEY = 'votechain_poc_state_v2';

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

// secp256k1 subgroup order (q / n). Hard-coded to avoid depending on deprecated curve internals.
const SECP256K1_ORDER: bigint = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);

function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}

function bigIntToBytesBE(n: bigint, len: number): Uint8Array {
  if (n < 0n) throw new Error('bigIntToBytesBE: negative');
  const out = new Uint8Array(len);
  let x = n;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function mod(a: bigint, m: bigint): bigint {
  const res = a % m;
  return res >= 0n ? res : res + m;
}

function modInv(a: bigint, m: bigint): bigint {
  // Extended Euclidean algorithm. Assumes m is prime and a != 0 mod m.
  let t = 0n;
  let newT = 1n;
  let r = m;
  let newR = mod(a, m);

  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }

  if (r !== 1n) throw new Error('modInv: not invertible');
  return t < 0n ? t + m : t;
}

// ── Blind Schnorr Signature Primitives ──────────────────────────────────────
//
// Protocol (s = k − c·sk convention):
//
//   Setup: Issuer has (sk_I, PK_I = sk_I·G)
//
//   1. ISSUER:  k ∈ Z_q,  R = k·G  →  send R to voter
//   2. VOTER:   α, β ∈ Z_q
//               R' = R + α·G + β·PK_I
//               c' = H("votechain:blind_schnorr:v1:" ‖ R' ‖ PK_I ‖ m)
//               c  = c' − β mod q   →  send c to issuer
//   3. ISSUER:  s  = k − c·sk_I mod q  →  send s to voter
//   4. VOTER:   s' = s + α mod q
//
//   Signature: (R', s')
//   Verify(PK_I, m, R', s'):  c' = H(…),  check s'·G + c'·PK_I == R'
//
// Message `m` = voter's x-only public key (32 bytes).

async function blindSchnorrChallenge(
  RPrime: Uint8Array, // compressed point (33 bytes)
  pkIssuer: Uint8Array, // compressed point (33 bytes)
  message: Uint8Array, // voter's x-only pk (32 bytes)
): Promise<bigint> {
  // Domain-separated SHA-256 hash reduced mod q
  const hash = await sha256(
    concatBytes(
      utf8('votechain:blind_schnorr:v1:'),
      RPrime,
      pkIssuer,
      message,
    ),
  );
  return mod(bytesToBigIntBE(hash), SECP256K1_ORDER);
}

function verifyBlindSchnorr(
  pkIssuerBytes: Uint8Array, // compressed point (33 bytes)
  message: Uint8Array, // voter's x-only pk (32 bytes)
  RBytes: Uint8Array, // compressed point (33 bytes) — unblinded R'
  sBytes: Uint8Array, // scalar (32 bytes) — unblinded s'
): Promise<boolean> {
  // Verify: s'·G + c'·PK_I == R'
  return (async () => {
    try {
      const cPrime = await blindSchnorrChallenge(RBytes, pkIssuerBytes, message);
      const sPrime = bytesToBigIntBE(sBytes);

      const pkIssuerPoint = secp256k1.Point.fromHex(pkIssuerBytes);
      const RPrimePoint = secp256k1.Point.fromHex(RBytes);

      // s'·G + c'·PK_I
      const sG = secp256k1.Point.BASE.multiply(mod(sPrime, SECP256K1_ORDER));
      const cPK = pkIssuerPoint.multiply(mod(cPrime, SECP256K1_ORDER));
      const lhs = sG.add(cPK);

      return lhs.equals(RPrimePoint);
    } catch {
      return false;
    }
  })();
}

async function blindSchnorrIssuance(params: {
  issuer_sk: Uint8Array; // scalar (32 bytes)
  issuer_pk: Uint8Array; // compressed point (33 bytes)
  voter_pk_xonly: Uint8Array; // x-only pk (32 bytes) — the message to sign
}): Promise<{ R: Uint8Array; s: Uint8Array }> {
  const { issuer_sk, issuer_pk, voter_pk_xonly } = params;
  const skI = bytesToBigIntBE(issuer_sk);

  // ── ISSUER STEP 1: generate nonce k, compute R = k·G ──
  const kBytes = secp256k1.utils.randomSecretKey();
  const k = bytesToBigIntBE(kBytes);
  const R = secp256k1.Point.BASE.multiply(mod(k, SECP256K1_ORDER));

  // ── VOTER STEP 2: blind the nonce ──
  const alphaBytes = secp256k1.utils.randomSecretKey();
  const alpha = bytesToBigIntBE(alphaBytes);
  const betaBytes = secp256k1.utils.randomSecretKey();
  const beta = bytesToBigIntBE(betaBytes);

  const pkIssuerPoint = secp256k1.Point.fromHex(issuer_pk);

  // R' = R + α·G + β·PK_I
  const RPrime = R.add(
    secp256k1.Point.BASE.multiply(mod(alpha, SECP256K1_ORDER)),
  ).add(
    pkIssuerPoint.multiply(mod(beta, SECP256K1_ORDER)),
  );
  const RPrimeBytes = RPrime.toBytes(true); // 33 bytes compressed

  // c' = H(domain ‖ R' ‖ PK_I ‖ m)
  const cPrime = await blindSchnorrChallenge(RPrimeBytes, issuer_pk, voter_pk_xonly);

  // c = c' − β mod q (sent to issuer)
  const c = mod(cPrime - beta, SECP256K1_ORDER);

  // ── ISSUER STEP 3: sign blinded challenge ──
  // s = k − c·sk_I mod q
  const s = mod(k - c * skI, SECP256K1_ORDER);

  // ── VOTER STEP 4: unblind the signature ──
  // s' = s + α mod q
  const sPrime = mod(s + alpha, SECP256K1_ORDER);

  return {
    R: RPrimeBytes,
    s: bigIntToBytesBE(sPrime, 32),
  };
}

type ShamirShare = { x: bigint; y: bigint };

function shamirSplit(secret: bigint, t: number, nShares: number): ShamirShare[] {
  if (!(t >= 2)) throw new Error('shamirSplit: threshold must be >= 2');
  if (!(nShares >= t)) throw new Error('shamirSplit: n must be >= t');

  // f(x) = a0 + a1*x + ... + a_{t-1}*x^{t-1} mod q, where a0=secret
  const coeffs: bigint[] = [mod(secret, SECP256K1_ORDER)];
  for (let i = 1; i < t; i++) {
    const r = secp256k1.utils.randomSecretKey(); // 1..n-1
    coeffs.push(bytesToBigIntBE(r));
  }

  const shares: ShamirShare[] = [];
  for (let i = 1; i <= nShares; i++) {
    const x = BigInt(i);
    let y = 0n;
    let xPow = 1n;
    for (const c of coeffs) {
      y = mod(y + c * xPow, SECP256K1_ORDER);
      xPow = mod(xPow * x, SECP256K1_ORDER);
    }
    shares.push({ x, y });
  }
  return shares;
}

function shamirCombine(shares: ShamirShare[]): bigint {
  if (shares.length === 0) throw new Error('shamirCombine: no shares');

  // Lagrange interpolation at x=0:
  // secret = Σ y_i * Π_{j!=i} (-x_j)/(x_i-x_j) mod q
  let secret = 0n;
  for (let i = 0; i < shares.length; i++) {
    const xi = shares[i].x;
    const yi = shares[i].y;
    let num = 1n;
    let den = 1n;
    for (let j = 0; j < shares.length; j++) {
      if (j === i) continue;
      const xj = shares[j].x;
      num = mod(num * mod(-xj, SECP256K1_ORDER), SECP256K1_ORDER);
      den = mod(den * mod(xi - xj, SECP256K1_ORDER), SECP256K1_ORDER);
    }
    const li = mod(num * modInv(den, SECP256K1_ORDER), SECP256K1_ORDER);
    secret = mod(secret + yi * li, SECP256K1_ORDER);
  }
  return secret;
}

async function deriveWrapKey(params: {
  shared_point: Uint8Array;
  election_id: string;
  ballot_id: B64u;
}): Promise<Uint8Array> {
  // Domain separated KDF.
  return sha256(
    concatBytes(
      utf8('votechain:poc:ecies-wrapkey:v1:'),
      params.shared_point,
      utf8(params.election_id),
      utf8(params.ballot_id),
    ),
  );
}

async function wrapBallotKeyToElectionPk(params: {
  pk_election: B64u;
  election_id: string;
  ballot_id: B64u;
  ballot_key: Uint8Array; // 32 bytes
}): Promise<{ wrapped_ballot_key: B64u; wrapped_ballot_key_epk: B64u }> {
  const pkElectionBytes = b64uToBytes(params.pk_election);
  const pkPoint = secp256k1.Point.fromHex(pkElectionBytes);

  const ephSkBytes = secp256k1.utils.randomSecretKey();
  const ephSk = bytesToBigIntBE(ephSkBytes);
  const ephPkBytes = secp256k1.getPublicKey(ephSkBytes, true); // 33 bytes compressed

  const sharedPoint = pkPoint.multiply(ephSk).toBytes(true);
  const wrapKey = await deriveWrapKey({
    shared_point: sharedPoint,
    election_id: params.election_id,
    ballot_id: params.ballot_id,
  });

  const aad = utf8(
    canonicalJson({
      election_id: params.election_id,
      ballot_id: params.ballot_id,
      suite: 'poc_ecies_aesgcm_v1',
    }),
  );

  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(wrapKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: toArrayBuffer(aad) },
    key,
    toArrayBuffer(params.ballot_key),
  );

  const packed = concatBytes(iv, new Uint8Array(cipherBuf));

  return {
    wrapped_ballot_key: bytesToB64u(packed),
    wrapped_ballot_key_epk: bytesToB64u(ephPkBytes),
  };
}

async function unwrapBallotKeyWithElectionSecret(params: {
  wrapped_ballot_key: B64u;
  wrapped_ballot_key_epk: B64u;
  election_id: string;
  ballot_id: B64u;
  election_secret: bigint;
}): Promise<Uint8Array | null> {
  try {
    const ephPkBytes = b64uToBytes(params.wrapped_ballot_key_epk);
    const ephPoint = secp256k1.Point.fromHex(ephPkBytes);
    const sharedPoint = ephPoint
      .multiply(mod(params.election_secret, SECP256K1_ORDER))
      .toBytes(true);
    const wrapKey = await deriveWrapKey({
      shared_point: sharedPoint,
      election_id: params.election_id,
      ballot_id: params.ballot_id,
    });

    const aad = utf8(
      canonicalJson({
        election_id: params.election_id,
        ballot_id: params.ballot_id,
        suite: 'poc_ecies_aesgcm_v1',
      }),
    );

    const packed = b64uToBytes(params.wrapped_ballot_key);
    const iv = packed.slice(0, 12);
    const cipher = packed.slice(12);

    const key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(wrapKey),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad) },
      key,
      toArrayBuffer(cipher),
    );
    const ballotKey = new Uint8Array(plainBuf);
    return ballotKey;
  } catch {
    return null;
  }
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

function loadState(): PocStateV2 | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PocStateV2;
  } catch {
    return null;
  }
}

function saveState(state: PocStateV2) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetPocState() {
  localStorage.removeItem('votechain_poc_state_v1');
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

function isStateUsable(s: PocStateV2): boolean {
  // Validate that critical fields match the current code's expectations.
  // This catches stale localStorage left over from earlier development iterations
  // where the version was already 2 but the internal schema differed.
  if (s.manifest?.crypto?.suite !== 'ewp_suite_poc_blind_schnorr_ecies_aesgcm_threshold_v1') return false;
  if (!Array.isArray(s.trustees?.shares)) return false;
  if (s.credential && typeof s.credential.pk !== 'string') return false;
  if (!s.issuer?.pk) return false;
  if (!s.manifest?.crypto?.pk_issuer) return false;
  return true;
}

async function ensureInitialized(): Promise<PocStateV2> {
  const existing = loadState();
  if (existing?.version === 2 && isStateUsable(existing)) return existing;
  // Old or incompatible schema detected — reset and re-initialize
  resetPocState();

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

  const threshold = { t: 2, n: 3 };

  // Election secret is a scalar x in Z_q. Only the public key is published.
  const electionSkBytes = secp256k1.utils.randomSecretKey();
  const electionSecret = bytesToBigIntBE(electionSkBytes);
  const pkElectionBytes = secp256k1.getPublicKey(electionSkBytes, true);
  const pk_election = bytesToB64u(pkElectionBytes);

  // Registration authority (issuer) keypair for blind Schnorr credential issuance.
  // The issuer certifies voter credentials without learning which credential it certified.
  const issuerSkBytes = secp256k1.utils.randomSecretKey();
  const issuerPkBytes = secp256k1.getPublicKey(issuerSkBytes, true); // 33 bytes compressed
  const pk_issuer = bytesToB64u(issuerPkBytes);

  // POC-only: split the election secret among trustees (t-of-n).
  const shares = shamirSplit(electionSecret, threshold.t, threshold.n);
  const trusteeShares: PocTrusteeShareRecord[] = shares.map((s, idx) => ({
    id: `T${idx + 1}`,
    x: Number(s.x),
    share: bytesToB64u(bigIntToBytesBE(s.y, 32)),
  }));

  // Trustee public keys are published in the manifest. In real deployments these would be used
  // to authenticate trustee outputs and decryption proofs. In this POC they are informational.
  const trustees = Array.from({ length: threshold.n }).map((_, i) => {
    const tSk = secp256k1.utils.randomSecretKey();
    const tPk = secp256k1.getPublicKey(tSk, true);
    return { id: `T${i + 1}`, pubkey: bytesToB64u(tPk) };
  });

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
      suite: 'ewp_suite_poc_blind_schnorr_ecies_aesgcm_threshold_v1',
      pk_election,
      pk_issuer,
      trustees,
      threshold,
    },
    endpoints,
  };

  const manifest = await signManifest(unsignedManifest, keys.manifest);

  const initialState: PocStateV2 = {
    version: 2,
    election: { election_id, jurisdiction_id, contests },
    keys,
    manifest,
    trustees: {
      threshold,
      shares: trusteeShares,
    },
    issuer: {
      sk: bytesToB64u(issuerSkBytes),
      pk: bytesToB64u(issuerPkBytes),
    },
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

export async function getTrusteeShares(): Promise<{
  threshold: { t: number; n: number };
  shares: PocTrusteeShareRecord[];
}> {
  const state = await ensureInitialized();
  return { threshold: state.trustees.threshold, shares: state.trustees.shares };
}

export async function getCredential(): Promise<PocCredential | null> {
  const state = await ensureInitialized();
  return state.credential ?? null;
}

async function registerCredential(): Promise<PocCredential> {
  const state = await ensureInitialized();
  if (state.credential) return state.credential;

  // 1. Generate voter secp256k1 keypair
  const skBytes = secp256k1.utils.randomSecretKey();
  const pkBytes = schnorr.getPublicKey(skBytes); // x-only (32 bytes)

  // 2. Run the blind Schnorr issuance ceremony.
  //    In a real system, the issuer and voter are separate parties communicating over a
  //    secure channel. Here we simulate both roles in-browser for the POC.
  const issuerSkBytes = b64uToBytes(state.issuer.sk);
  const issuerPkBytes = b64uToBytes(state.issuer.pk);

  const blindSig = await blindSchnorrIssuance({
    issuer_sk: issuerSkBytes,
    issuer_pk: issuerPkBytes,
    voter_pk_xonly: pkBytes,
  });

  // 3. Self-verify the blind signature (sanity check)
  const sigValid = await verifyBlindSchnorr(
    issuerPkBytes,
    pkBytes,
    blindSig.R,
    blindSig.s,
  );
  if (!sigValid) {
    throw new Error('Blind Schnorr self-verification failed — this should never happen.');
  }

  // 4. Store credential with blind signature
  const didSuffix = await sha256B64u(concatBytes(utf8('votechain:poc:did:v1:'), pkBytes));
  const credential: PocCredential = {
    did: `did:votechain:poc:${didSuffix}`,
    curve: 'secp256k1',
    pk: bytesToB64u(pkBytes),
    sk: bytesToB64u(skBytes),
    blind_sig: {
      R: bytesToB64u(blindSig.R),
      s: bytesToB64u(blindSig.s),
    },
    created_at: nowIso(),
  };

  state.credential = credential;
  saveState(state);
  return credential;
}

// Alias so existing imports (e.g. vote.astro) continue to work.
export const ensureCredential = registerCredential;

export async function computeNullifier(credentialPubB64u: B64u, election_id: string): Promise<Hex0x> {
  const pub = b64uToBytes(credentialPubB64u);
  return sha256Hex0x(concatBytes(utf8('votechain:nullifier:v1:'), pub, utf8(election_id)));
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
  manifest: PocElectionManifest,
): Promise<EncryptionResult> {
  const ballot_id = bytesToB64u(randomBytes(16));
  const iv = randomBytes(12);
  const ballotKey = randomBytes(32);

  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(ballotKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const fullPlaintext: PocBallotPlaintext = { ...plaintext, ballot_id };
  const body = utf8(canonicalJson(fullPlaintext));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(body));
  const cipherBytes = new Uint8Array(cipherBuf);
  const packed = concatBytes(iv, cipherBytes);

  const wrapped = await wrapBallotKeyToElectionPk({
    pk_election: manifest.crypto.pk_election,
    election_id: manifest.election_id,
    ballot_id,
    ballot_key: ballotKey,
  });

  return {
    encrypted_ballot: {
      ballot_id,
      ciphertext: bytesToB64u(packed),
      ballot_validity_proof: bytesToB64u(utf8('poc_validity_v1')),
      ballot_hash: await sha256B64u(packed),
      wrapped_ballot_key: wrapped.wrapped_ballot_key,
      wrapped_ballot_key_epk: wrapped.wrapped_ballot_key_epk,
    },
    iv,
    ballot_key: ballotKey,
    plaintext: fullPlaintext,
  };
}

async function decryptBallotWithKey(
  ciphertextB64u: B64u,
  ballotKey: Uint8Array,
): Promise<PocBallotPlaintext | null> {
  try {
    const packed = b64uToBytes(ciphertextB64u);
    const iv = packed.slice(0, 12);
    const cipher = packed.slice(12);
    const key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(ballotKey),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(cipher));
    const plainText = new TextDecoder().decode(new Uint8Array(plainBuf));
    return JSON.parse(plainText) as PocBallotPlaintext;
  } catch {
    return null;
  }
}

function validateBallotPlaintext(state: PocStateV2, plaintext: PocBallotPlaintext): boolean {
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

async function issueBbSth(state: PocStateV2): Promise<PocSignedTreeHead> {
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
  state: PocStateV2,
  receiptUnsigned: Omit<PocCastReceipt, 'sig'>,
): Promise<B64u> {
  return signB64u(state.keys.ewg.jwk_private, await receiptSigPayload(receiptUnsigned));
}

async function verifyReceiptSig(receipt: PocCastReceipt, ewgKey: StoredKeyPair): Promise<boolean> {
  const { sig, ...unsigned } = receipt;
  return verifyB64u(ewgKey.jwk_public, await receiptSigPayload(unsigned), sig);
}

function getAnchorEventForLeaf(state: PocStateV2, bb_leaf_hash: B64u): PocVclEvent | null {
  const match = state.vcl.events.find(
    (evt) => evt.type === 'ewp_ballot_cast' && evt.payload.bb_leaf_hash === bb_leaf_hash,
  );
  return match ?? null;
}

function hasUsedNullifier(state: PocStateV2, nullifier: Hex0x) {
  return state.vcl.events.some(
    (evt) => evt.type === 'ewp_ballot_cast' && evt.payload.nullifier === nullifier,
  );
}

async function recordFraudFlag(state: PocStateV2, flag: Record<string, unknown>) {
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'fraud_flag',
    recorded_at: nowIso(),
    payload: flag,
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });
}

async function recordFraudFlagAction(state: PocStateV2, action: Record<string, unknown>) {
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

function deriveFraudCases(state: PocStateV2): PocFraudCase[] {
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

async function recordBbSthPublished(state: PocStateV2, sth: PocSignedTreeHead) {
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
  state: PocStateV2,
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
  const public_inputs = { election_id, jurisdiction_id, nullifier, challenge };
  const transcript = canonicalJson({
    domain: 'votechain:poc:eligibility_proof:v1',
    public_inputs,
    credential_pub: credential.pk,
  });
  const msgHash = await sha256(utf8(transcript)); // 32 bytes

  return {
    zk_suite: 'votechain_zk_blind_schnorr_bip340_poc_v1',
    vk_id: 'poc-blind-schnorr-bip340-vk-1',
    public_inputs,
    pi: bytesToB64u(
      schnorr.sign(msgHash, b64uToBytes(credential.sk), randomBytes(32)),
    ),
    credential_pub: credential.pk,
    issuer_blind_sig: credential.blind_sig,
  };
}

async function verifyEligibilityProof(
  state: PocStateV2,
  proof: PocEligibilityProof,
): Promise<boolean> {
  // ── Blind Schnorr credential verification ──
  // Instead of directly comparing the voter's pk against a stored credential (which would
  // link registration to voting), we verify the issuer's blind signature on the voter's pk.
  // This proves the credential was authorized by the registration authority without
  // revealing which signing session produced it.
  if (!proof.issuer_blind_sig?.R || !proof.issuer_blind_sig?.s) return false;
  if (!state.manifest?.crypto?.pk_issuer) return false;

  const issuerPkBytes = b64uToBytes(state.manifest.crypto.pk_issuer);
  const voterPkBytes = b64uToBytes(proof.credential_pub);
  const blindSigValid = await verifyBlindSchnorr(
    issuerPkBytes,
    voterPkBytes,
    b64uToBytes(proof.issuer_blind_sig.R),
    b64uToBytes(proof.issuer_blind_sig.s),
  );
  if (!blindSigValid) return false;

  // ── BIP340 proof-of-knowledge ── (unchanged)
  // Proves the voter owns the secret key behind credential_pub.
  try {
    const transcript = canonicalJson({
      domain: 'votechain:poc:eligibility_proof:v1',
      public_inputs: proof.public_inputs,
      credential_pub: proof.credential_pub,
    });
    const msgHash = await sha256(utf8(transcript));
    return schnorr.verify(
      b64uToBytes(proof.pi),
      msgHash,
      b64uToBytes(proof.credential_pub),
    );
  } catch {
    return false;
  }
}

export async function buildCastRequest(params: {
  encrypted_ballot: PocEncryptedBallot;
  challenge: PocChallengeResponse;
  idempotencyKey?: string;
}): Promise<{ request: PocCastRequest; idempotencyKey: string } | { error: string }> {
  const state = await ensureInitialized();
  const credential = await ensureCredential();

  const nullifier = await computeNullifier(credential.pk, state.election.election_id);

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
  | { encrypted_ballot: PocEncryptedBallot; iv: B64u; ballot_key: B64u; plaintext: PocBallotPlaintext }
  | { error: string }
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

  const result = await encryptBallot(plaintext, state.manifest);
  return {
    encrypted_ballot: result.encrypted_ballot,
    iv: bytesToB64u(result.iv),
    ballot_key: bytesToB64u(result.ballot_key),
    plaintext: result.plaintext,
  };
}

export async function spoilBallot(params: {
  encrypted_ballot: PocEncryptedBallot;
  iv: B64u;
  ballot_key: B64u;
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
    ballot_key: params.ballot_key,
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
  ballot_key: B64u;
  plaintext: PocBallotPlaintext;
}): Promise<{ match: boolean; details: string }> {
  const ivBytes = b64uToBytes(params.iv);
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(b64uToBytes(params.ballot_key)),
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
  const pi = args.request.eligibility_proof.public_inputs;
  if (
    pi.election_id !== args.request.election_id ||
    pi.jurisdiction_id !== args.request.jurisdiction_id ||
    pi.nullifier !== args.request.nullifier ||
    pi.challenge !== args.request.challenge
  ) {
    const err = buildEwpError('EWP_PROOF_INVALID', 'Eligibility public inputs mismatch.', false);
    state.idempotency[args.idempotencyKey] = {
      request_hash: requestHash,
      response: err,
      stored_at: nowIso(),
    };
    saveState(state);
    return err;
  }

  const expectedNullifier = await computeNullifier(
    args.request.eligibility_proof.credential_pub,
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

  // 6) Ballot envelope integrity (POC only; real EWP uses ballot validity proofs)
  const packed = (() => {
    try {
      return b64uToBytes(args.request.encrypted_ballot.ciphertext);
    } catch {
      return null;
    }
  })();
  const ballotHashOk = packed
    ? (await sha256B64u(packed)) === args.request.encrypted_ballot.ballot_hash
    : false;
  const wrapFieldsOk = Boolean(
    args.request.encrypted_ballot.wrapped_ballot_key &&
      args.request.encrypted_ballot.wrapped_ballot_key_epk,
  );
  if (!ballotHashOk || !wrapFieldsOk) {
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
  election: PocStateV2['election'];
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

export async function publishTally(params?: {
  shares?: PocTrusteeShareRecord[];
}): Promise<PocTally | { error: string }> {
  const state = await ensureInitialized();
  const latestSth = state.bb.sth_history[state.bb.sth_history.length - 1];
  if (!latestSth) return { error: 'No ballots on the bulletin board.' };

  const threshold = state.trustees.threshold;
  const selectedShares = (params?.shares ?? state.trustees.shares).slice();
  if (selectedShares.length < threshold.t) {
    return { error: `Need at least ${threshold.t} trustee shares to decrypt the tally.` };
  }

  // Reconstruct election secret from >= t shares, then verify it matches the manifest public key.
  selectedShares.sort((a, b) => a.x - b.x);
  const sharesForReconstruction = selectedShares.slice(0, threshold.t).map((s) => ({
    x: BigInt(s.x),
    y: bytesToBigIntBE(b64uToBytes(s.share)),
  }));
  const electionSecret = shamirCombine(sharesForReconstruction);
  let reconstructedPk = '';
  try {
    const skBytes = bigIntToBytesBE(mod(electionSecret, SECP256K1_ORDER), 32);
    reconstructedPk = bytesToB64u(secp256k1.getPublicKey(skBytes, true));
  } catch {
    return { error: 'Trustee shares reconstructed an invalid election secret key.' };
  }
  if (reconstructedPk !== state.manifest.crypto.pk_election) {
    return { error: 'Trustee shares did not reconstruct the manifest election key.' };
  }

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
    const ballotKey = await unwrapBallotKeyWithElectionSecret({
      wrapped_ballot_key: encrypted.wrapped_ballot_key,
      wrapped_ballot_key_epk: encrypted.wrapped_ballot_key_epk,
      election_id: state.election.election_id,
      ballot_id: encrypted.ballot_id,
      election_secret: electionSecret,
    });
    if (!ballotKey) continue;

    const plaintext = await decryptBallotWithKey(encrypted.ciphertext, ballotKey);
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
  issuer: { alg: string; pk: B64u };
}> {
  const state = await ensureInitialized();
  return {
    manifest: { kid: state.keys.manifest.kid, alg: state.keys.manifest.alg, jwk: state.keys.manifest.jwk_public },
    ewg: { kid: state.keys.ewg.kid, alg: state.keys.ewg.alg, jwk: state.keys.ewg.jwk_public },
    bb: { kid: state.keys.bb.kid, alg: state.keys.bb.alg, jwk: state.keys.bb.jwk_public },
    vcl: { kid: state.keys.vcl.kid, alg: state.keys.vcl.alg, jwk: state.keys.vcl.jwk_public },
    issuer: { alg: 'blind_schnorr_secp256k1', pk: state.issuer.pk },
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
