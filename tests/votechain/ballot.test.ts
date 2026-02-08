import { describe, it, expect } from 'vitest';
import {
  encryptBallot,
  decryptBallotWithKey,
  validateBallotPlaintext,
  verifySpoiledBallot,
} from '../../src/votechain-poc/ballot.js';
import { bytesToB64u } from '../../src/votechain-poc/encoding.js';
import type {
  PocBallotPlaintext,
  PocElectionManifest,
  PocStateV2,
} from '../../src/votechain-poc/types.js';
import { secp256k1 } from '@noble/curves/secp256k1';

describe('ballot', () => {
  function makePlaintext(overrides?: Partial<PocBallotPlaintext>): PocBallotPlaintext {
    return {
      election_id: 'test-election',
      manifest_id: 'test-manifest',
      ballot_id: 'placeholder',
      contests: [
        { contest_id: 'senate', selection: 'alice' },
        { contest_id: 'prop-1', selection: 'yes' },
      ],
      cast_at: new Date().toISOString(),
      ...overrides,
    };
  }

  function makeManifest(): PocElectionManifest {
    const sk = secp256k1.utils.randomSecretKey();
    const pk = secp256k1.getPublicKey(sk, true);
    return {
      election_id: 'test-election',
      jurisdiction_id: 'test-jurisdiction',
      manifest_id: 'test-manifest',
      not_before: '2025-01-01T00:00:00Z',
      not_after: '2025-12-31T23:59:59Z',
      crypto: {
        suite: 'test-suite',
        pk_election: bytesToB64u(pk),
        pk_issuers: [],
        issuer_threshold: { t: 1, n: 1 },
        voter_roll_commitment: { merkle_root: 'test', total_eligible: 100 },
        trustees: [],
        threshold: { t: 2, n: 3 },
      },
      endpoints: { challenge: '/c', cast: '/cast', bb: '/bb' },
      signing: { alg: 'test', kid: 'kid', sig: 'sig' },
    };
  }

  function makeState(): PocStateV2 {
    return {
      election: {
        election_id: 'test-election',
        jurisdiction_id: 'test-jurisdiction',
        contests: [
          {
            contest_id: 'senate',
            title: 'Senate',
            type: 'candidate',
            options: [
              { id: 'alice', label: 'Alice' },
              { id: 'bob', label: 'Bob' },
            ],
          },
          {
            contest_id: 'prop-1',
            title: 'Proposition 1',
            type: 'referendum',
            options: [
              { id: 'yes', label: 'Yes' },
              { id: 'no', label: 'No' },
            ],
          },
        ],
      },
      manifest: { manifest_id: 'test-manifest' },
    } as unknown as PocStateV2;
  }

  describe('encryptBallot', () => {
    it('returns encrypted ballot with all required fields', async () => {
      const manifest = makeManifest();
      const plaintext = makePlaintext();
      const result = await encryptBallot(plaintext, manifest);

      expect(result.encrypted_ballot.ballot_id).toBeDefined();
      expect(result.encrypted_ballot.ciphertext).toBeDefined();
      expect(result.encrypted_ballot.ballot_hash).toBeDefined();
      expect(result.encrypted_ballot.wrapped_ballot_key).toBeDefined();
      expect(result.encrypted_ballot.wrapped_ballot_key_epk).toBeDefined();
      expect(result.encrypted_ballot.ballot_validity_proof).toBeDefined();
    });

    it('ballot_id is assigned and differs from input', async () => {
      const result = await encryptBallot(makePlaintext(), makeManifest());
      expect(result.encrypted_ballot.ballot_id).not.toBe('placeholder');
      expect(result.plaintext.ballot_id).toBe(result.encrypted_ballot.ballot_id);
    });

    it('returns iv and ballot_key for spoil/verify', async () => {
      const result = await encryptBallot(makePlaintext(), makeManifest());
      expect(result.iv).toBeInstanceOf(Uint8Array);
      expect(result.iv.length).toBe(12);
      expect(result.ballot_key).toBeInstanceOf(Uint8Array);
      expect(result.ballot_key.length).toBe(32);
    });
  });

  describe('decryptBallotWithKey', () => {
    it('decrypts to original plaintext', async () => {
      const manifest = makeManifest();
      const plaintext = makePlaintext();
      const result = await encryptBallot(plaintext, manifest);

      const decrypted = await decryptBallotWithKey(
        result.encrypted_ballot.ciphertext,
        result.ballot_key,
      );

      expect(decrypted).not.toBeNull();
      expect(decrypted!.election_id).toBe('test-election');
      expect(decrypted!.contests).toEqual(plaintext.contests);
    });

    it('returns null with wrong key', async () => {
      const result = await encryptBallot(makePlaintext(), makeManifest());
      const wrongKey = new Uint8Array(32);
      crypto.getRandomValues(wrongKey);

      const decrypted = await decryptBallotWithKey(
        result.encrypted_ballot.ciphertext,
        wrongKey,
      );
      expect(decrypted).toBeNull();
    });

    it('returns null with corrupt ciphertext', async () => {
      const result = await encryptBallot(makePlaintext(), makeManifest());
      const decrypted = await decryptBallotWithKey('invalid-base64url', result.ballot_key);
      expect(decrypted).toBeNull();
    });
  });

  describe('validateBallotPlaintext', () => {
    it('accepts valid plaintext', () => {
      const state = makeState();
      const plaintext = makePlaintext();
      expect(validateBallotPlaintext(state, plaintext)).toBe(true);
    });

    it('rejects wrong election_id', () => {
      const state = makeState();
      const plaintext = makePlaintext({ election_id: 'wrong' });
      expect(validateBallotPlaintext(state, plaintext)).toBe(false);
    });

    it('rejects wrong manifest_id', () => {
      const state = makeState();
      const plaintext = makePlaintext({ manifest_id: 'wrong' });
      expect(validateBallotPlaintext(state, plaintext)).toBe(false);
    });

    it('rejects unknown contest_id', () => {
      const state = makeState();
      const plaintext = makePlaintext({
        contests: [{ contest_id: 'nonexistent', selection: 'alice' }],
      });
      expect(validateBallotPlaintext(state, plaintext)).toBe(false);
    });

    it('rejects unknown selection for a valid contest', () => {
      const state = makeState();
      const plaintext = makePlaintext({
        contests: [{ contest_id: 'senate', selection: 'unknown-candidate' }],
      });
      expect(validateBallotPlaintext(state, plaintext)).toBe(false);
    });
  });

  describe('verifySpoiledBallot', () => {
    it('returns match=true for honest encryption', async () => {
      const manifest = makeManifest();
      const plaintext = makePlaintext();
      const result = await encryptBallot(plaintext, manifest);

      const verification = await verifySpoiledBallot({
        encrypted_ballot: result.encrypted_ballot,
        iv: bytesToB64u(result.iv),
        ballot_key: bytesToB64u(result.ballot_key),
        plaintext: result.plaintext,
      });

      expect(verification.match).toBe(true);
      expect(verification.details).toContain('matches');
    });

    it('returns match=false when plaintext is tampered', async () => {
      const result = await encryptBallot(makePlaintext(), makeManifest());

      const tamperedPlaintext = {
        ...result.plaintext,
        contests: [{ contest_id: 'senate', selection: 'bob' }],
      };

      const verification = await verifySpoiledBallot({
        encrypted_ballot: result.encrypted_ballot,
        iv: bytesToB64u(result.iv),
        ballot_key: bytesToB64u(result.ballot_key),
        plaintext: tamperedPlaintext,
      });

      expect(verification.match).toBe(false);
      expect(verification.details).toContain('MISMATCH');
    });
  });
});
