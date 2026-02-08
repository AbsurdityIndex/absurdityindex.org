/**
 * VoteChain POC — Credential Management & Eligibility Proofs
 *
 * Voter credential registration (blind Schnorr issuance), nullifier
 * derivation, and BIP340 eligibility proof construction / verification.
 */

import { schnorr } from '@noble/curves/secp256k1';

import type {
  Hex0x,
  PocCredential,
  PocEligibilityProof,
  PocChallengeResponse,
  PocChallengeRecord,
  PocStateV2,
} from './types.js';
import {
  sha256,
  sha256B64u,
  sha256Hex0x,
  utf8,
  concatBytes,
  canonicalJson,
  bytesToB64u,
  b64uToBytes,
  randomBytes,
  nowIso,
} from './encoding.js';
import { blindSchnorrIssuance, verifyBlindSchnorr } from './crypto/blind-schnorr.js';
import { signB64u } from './crypto/ecdsa.js';
import { ensureInitialized, saveState } from './state.js';
import { vclSignEvent } from './vcl.js';
import { replicateIfConfigured } from './vcl-client.js';

export async function computeNullifier(credentialPubB64u: string, election_id: string): Promise<Hex0x> {
  const pub = b64uToBytes(credentialPubB64u);
  return sha256Hex0x(concatBytes(utf8('votechain:nullifier:v1:'), pub, utf8(election_id)));
}

async function registerCredential(): Promise<PocCredential> {
  const state = await ensureInitialized();
  if (state.credential) return state.credential;

  // 1. Generate voter secp256k1 keypair
  const skBytes = schnorr.utils.randomPrivateKey();
  const pkBytes = schnorr.getPublicKey(skBytes); // x-only (32 bytes)

  // 2. Run the blind Schnorr issuance ceremony with ALL independent issuers.
  //    Each issuer independently signs without learning the voter's public key.
  //    Requiring t-of-n signatures prevents any single rogue authority from forging credentials.
  const blindSigs: PocCredential['blind_sigs'] = [];

  for (let i = 0; i < state.issuers.length; i++) {
    const issuerSkBytes = b64uToBytes(state.issuers[i].sk);
    const issuerPkBytes = b64uToBytes(state.issuers[i].pk);

    const blindSig = await blindSchnorrIssuance({
      issuer_sk: issuerSkBytes,
      issuer_pk: issuerPkBytes,
      voter_pk_xonly: pkBytes,
    });

    // Self-verify each issuer's blind signature
    const sigValid = await verifyBlindSchnorr(
      issuerPkBytes,
      pkBytes,
      blindSig.R,
      blindSig.s,
    );
    if (!sigValid) {
      throw new Error(`Blind Schnorr self-verification failed for issuer ${i}.`);
    }

    blindSigs.push({
      issuer_index: i,
      R: bytesToB64u(blindSig.R),
      s: bytesToB64u(blindSig.s),
    });
  }

  // 3. Store credential with all blind signatures
  const didSuffix = await sha256B64u(concatBytes(utf8('votechain:poc:did:v1:'), pkBytes));
  const credential: PocCredential = {
    did: `did:votechain:poc:${didSuffix}`,
    curve: 'secp256k1',
    pk: bytesToB64u(pkBytes),
    sk: bytesToB64u(skBytes),
    blind_sigs: blindSigs,
    created_at: nowIso(),
  };

  state.credential = credential;

  // 4. Log credential issuance on VCL (privacy-preserving: only sequence number, not identity)
  state.credential_issuance_count += 1;
  const issuanceEvent = {
    type: 'credential_issued' as const,
    recorded_at: nowIso(),
    payload: {
      election_id: state.election.election_id,
      issuance_sequence: state.credential_issuance_count,
      issuer_count: state.issuers.length,
      voter_roll_ceiling: state.manifest.crypto.voter_roll_commitment.total_eligible,
    },
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(issuanceEvent, state.keys.vcl);
  state.vcl.events.push({ ...issuanceEvent, ...signed });

  saveState(state);

  // Fire-and-forget replication of credential_issued event to state node
  replicateIfConfigured({
    type: issuanceEvent.type,
    payload: issuanceEvent.payload,
    tx_id: signed.tx_id,
    recorded_at: issuanceEvent.recorded_at,
  });

  return credential;
}

// Alias so existing imports (e.g. vote.astro) continue to work.
export const ensureCredential = registerCredential;

export async function buildEligibilityProof(
  credential: PocCredential,
  election_id: string,
  jurisdiction_id: string,
  nullifier: Hex0x,
  challenge: string,
): Promise<PocEligibilityProof> {
  const public_inputs = { election_id, jurisdiction_id, nullifier, challenge };
  const transcript = canonicalJson({
    domain: 'votechain:poc:eligibility_proof:v1',
    public_inputs,
    credential_pub: credential.pk,
  });
  const msgHash = await sha256(utf8(transcript)); // 32 bytes

  return {
    zk_suite: 'votechain_zk_threshold_blind_schnorr_bip340_poc_v2',
    vk_id: 'poc-threshold-blind-schnorr-bip340-vk-1',
    public_inputs,
    pi: bytesToB64u(
      schnorr.sign(msgHash, b64uToBytes(credential.sk), randomBytes(32)),
    ),
    credential_pub: credential.pk,
    issuer_blind_sigs: credential.blind_sigs,
  };
}

export async function verifyEligibilityProof(
  state: PocStateV2,
  proof: PocEligibilityProof,
): Promise<boolean> {
  // ── Threshold blind Schnorr credential verification ──
  // Check that the proof carries enough issuer signatures to meet the threshold.
  if (!Array.isArray(proof.issuer_blind_sigs) || proof.issuer_blind_sigs.length === 0) return false;
  if (!Array.isArray(state.manifest?.crypto?.pk_issuers)) return false;

  const requiredThreshold = state.manifest.crypto.issuer_threshold?.t ?? 1;
  if (proof.issuer_blind_sigs.length < requiredThreshold) return false;

  const voterPkBytes = b64uToBytes(proof.credential_pub);
  let validCount = 0;

  for (const sig of proof.issuer_blind_sigs) {
    // Ensure the issuer_index refers to a valid issuer in the manifest
    if (sig.issuer_index < 0 || sig.issuer_index >= state.manifest.crypto.pk_issuers.length) {
      continue;
    }
    const issuerPkBytes = b64uToBytes(state.manifest.crypto.pk_issuers[sig.issuer_index]);

    const sigValid = await verifyBlindSchnorr(
      issuerPkBytes,
      voterPkBytes,
      b64uToBytes(sig.R),
      b64uToBytes(sig.s),
    );
    if (sigValid) validCount++;
  }

  if (validCount < requiredThreshold) return false;

  // ── BIP340 proof-of-knowledge ──
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

export async function issueChallenge(client_session: string): Promise<PocChallengeResponse> {
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
