/**
 * VoteChain POC — ECIES Ballot-Key Wrapping
 *
 * Ephemeral ECDH + AES-GCM to wrap/unwrap a per-ballot symmetric key
 * under the election public key.
 */

import { secp256k1 } from '@noble/curves/secp256k1';

import {
  sha256,
  utf8,
  concatBytes,
  canonicalJson,
  bytesToB64u,
  b64uToBytes,
  randomBytes,
  toArrayBuffer,
} from '../encoding.js';
import { SECP256K1_ORDER, bytesToBigIntBE, mod } from './bigint.js';

async function deriveWrapKey(params: {
  shared_point: Uint8Array;
  election_id: string;
  ballot_id: string;
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

export async function wrapBallotKeyToElectionPk(params: {
  pk_election: string;
  election_id: string;
  ballot_id: string;
  ballot_key: Uint8Array; // 32 bytes
}): Promise<{ wrapped_ballot_key: string; wrapped_ballot_key_epk: string }> {
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

export async function unwrapBallotKeyWithElectionSecret(params: {
  wrapped_ballot_key: string;
  wrapped_ballot_key_epk: string;
  election_id: string;
  ballot_id: string;
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
    return new Uint8Array(plainBuf);
  } catch {
    return null;
  }
}
