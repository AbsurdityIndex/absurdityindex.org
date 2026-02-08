/**
 * VoteChain POC — Ballot Encryption, Decryption & Validation
 *
 * Encrypt/decrypt individual ballots, validate plaintext against the
 * election manifest, and handle spoil + re-encryption verification.
 */

import type {
  PocBallotPlaintext,
  PocEncryptedBallot,
  PocElectionManifest,
  PocSpoilResponse,
  PocSpoilReceipt,
  PocBallotRandomnessReveal,
  PocStateV2,
  EncryptionResult,
} from './types.js';
import {
  utf8,
  canonicalJson,
  bytesToB64u,
  b64uToBytes,
  randomBytes,
  toArrayBuffer,
  concatBytes,
  sha256B64u,
  nowIso,
} from './encoding.js';
import { wrapBallotKeyToElectionPk } from './crypto/ecies.js';
import { signB64u } from './crypto/ecdsa.js';
import { ensureInitialized, saveState } from './state.js';

export async function encryptBallot(
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

export async function decryptBallotWithKey(
  ciphertextB64u: string,
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

export function validateBallotPlaintext(state: PocStateV2, plaintext: PocBallotPlaintext): boolean {
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

export async function encryptBallotForReview(params: {
  contests: Array<{ contest_id: string; selection: string }>;
}): Promise<
  | { encrypted_ballot: PocEncryptedBallot; iv: string; ballot_key: string; plaintext: PocBallotPlaintext }
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
  iv: string;
  ballot_key: string;
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
  iv: string;
  ballot_key: string;
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
