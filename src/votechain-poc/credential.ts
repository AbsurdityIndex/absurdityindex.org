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

  // 2. Run the blind Schnorr issuance ceremony.
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

export async function verifyEligibilityProof(
  state: PocStateV2,
  proof: PocEligibilityProof,
): Promise<boolean> {
  // ── Blind Schnorr credential verification ──
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
