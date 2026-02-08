import { describe, it, expect } from 'vitest';
import {
  computeManifestId,
  signManifest,
  verifyManifest,
} from '../../src/votechain-poc/manifest.js';
import { generateEcdsaKeyPair, exportKeyPair } from '../../src/votechain-poc/crypto/ecdsa.js';
import type { PocElectionManifest, StoredKeyPair } from '../../src/votechain-poc/types.js';

describe('manifest', () => {
  async function makeKey(kid: string): Promise<StoredKeyPair> {
    const kp = await generateEcdsaKeyPair();
    return exportKeyPair(kp, kid);
  }

  function makeUnsignedManifest(): Omit<PocElectionManifest, 'manifest_id' | 'signing'> {
    return {
      election_id: 'test-election',
      jurisdiction_id: 'test-jurisdiction',
      not_before: '2025-01-01T00:00:00.000Z',
      not_after: '2025-12-31T23:59:59.000Z',
      crypto: {
        suite: 'ewp_suite_poc_threshold_blind_schnorr_ecies_aesgcm_v2',
        pk_election: 'test-pk-election',
        pk_issuers: ['issuer-pk-1', 'issuer-pk-2'],
        issuer_threshold: { t: 2, n: 2 },
        voter_roll_commitment: {
          merkle_root: 'test-root',
          total_eligible: 100,
        },
        trustees: [
          { id: 'T1', pubkey: 'pk-t1' },
          { id: 'T2', pubkey: 'pk-t2' },
        ],
        threshold: { t: 2, n: 2 },
      },
      endpoints: {
        challenge: '/challenge',
        cast: '/cast',
        bb: '/bb',
      },
    };
  }

  describe('computeManifestId', () => {
    it('returns a deterministic base64url hash', async () => {
      const unsigned = makeUnsignedManifest();
      const id1 = await computeManifestId(unsigned);
      const id2 = await computeManifestId(unsigned);
      expect(id1).toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });

    it('different manifests produce different IDs', async () => {
      const a = makeUnsignedManifest();
      const b = { ...a, election_id: 'different-election' };
      const idA = await computeManifestId(a);
      const idB = await computeManifestId(b);
      expect(idA).not.toBe(idB);
    });
  });

  describe('signManifest', () => {
    it('adds manifest_id and signing fields', async () => {
      const key = await makeKey('manifest-kid-1');
      const unsigned = makeUnsignedManifest();
      const signed = await signManifest(unsigned, key);

      expect(signed.manifest_id).toBeDefined();
      expect(signed.signing).toBeDefined();
      expect(signed.signing.kid).toBe('manifest-kid-1');
      expect(signed.signing.alg).toBe('ECDSA_P-256_SHA256');
      expect(typeof signed.signing.sig).toBe('string');
    });

    it('preserves unsigned fields', async () => {
      const key = await makeKey('kid');
      const unsigned = makeUnsignedManifest();
      const signed = await signManifest(unsigned, key);

      expect(signed.election_id).toBe(unsigned.election_id);
      expect(signed.jurisdiction_id).toBe(unsigned.jurisdiction_id);
      expect(signed.crypto).toEqual(unsigned.crypto);
    });
  });

  describe('verifyManifest', () => {
    it('returns true for a validly signed manifest', async () => {
      const key = await makeKey('kid');
      const unsigned = makeUnsignedManifest();
      const signed = await signManifest(unsigned, key);

      const valid = await verifyManifest(signed, key);
      expect(valid).toBe(true);
    });

    it('returns false for a different key', async () => {
      const key1 = await makeKey('kid-1');
      const key2 = await makeKey('kid-2');
      const signed = await signManifest(makeUnsignedManifest(), key1);

      const valid = await verifyManifest(signed, key2);
      expect(valid).toBe(false);
    });

    it('returns false if manifest_id is tampered', async () => {
      const key = await makeKey('kid');
      const signed = await signManifest(makeUnsignedManifest(), key);

      const tampered = { ...signed, manifest_id: 'tampered-id' };
      const valid = await verifyManifest(tampered, key);
      expect(valid).toBe(false);
    });

    it('returns false if content is tampered', async () => {
      const key = await makeKey('kid');
      const signed = await signManifest(makeUnsignedManifest(), key);

      const tampered = { ...signed, election_id: 'tampered-election' };
      const valid = await verifyManifest(tampered, key);
      expect(valid).toBe(false);
    });
  });
});
