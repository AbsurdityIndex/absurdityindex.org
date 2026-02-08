/**
 * VoteChain POC — State Management
 *
 * localStorage-backed state persistence, initialization of the POC
 * election (keys, manifest, trustees, contests), and state accessors.
 */

import { secp256k1 } from '@noble/curves/secp256k1';

import type {
  PocStateV2,
  PocContest,
  PocVclEvent,
  PocTrusteeShareRecord,
  PocElectionManifest,
  PocCredential,
} from './types.js';
import { nowIso, bytesToB64u } from './encoding.js';
import { bytesToBigIntBE, bigIntToBytesBE } from './crypto/bigint.js';
import { shamirSplit } from './crypto/shamir.js';
import { generateEcdsaKeyPair, exportKeyPair } from './crypto/ecdsa.js';
import { signManifest } from './manifest.js';
import { vclSignEvent } from './vcl.js';

const STORAGE_KEY = 'votechain_poc_state_v2';

export function loadState(): PocStateV2 | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PocStateV2;
  } catch {
    return null;
  }
}

export function saveState(state: PocStateV2): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetPocState(): void {
  localStorage.removeItem('votechain_poc_state_v1');
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('votechain_poc_last_receipt');
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

export async function ensureInitialized(): Promise<PocStateV2> {
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

// ── Public accessors ────────────────────────────────────────────────────────

export async function getPocState(): Promise<PocStateV2> {
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
