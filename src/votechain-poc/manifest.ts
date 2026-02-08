/**
 * VoteChain POC — Election Manifest Operations
 *
 * Compute manifest ID, sign/verify election manifests using ECDSA.
 */

import type { PocElectionManifest, StoredKeyPair } from './types.js';
import { sha256B64u, utf8, canonicalJson } from './encoding.js';
import { signB64u, verifyB64u } from './crypto/ecdsa.js';

export async function computeManifestId(
  manifestUnsigned: Omit<PocElectionManifest, 'manifest_id' | 'signing'>,
): Promise<string> {
  return sha256B64u(utf8(canonicalJson(manifestUnsigned)));
}

export async function signManifest(
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

export async function verifyManifest(
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
