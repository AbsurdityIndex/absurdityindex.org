import { describe, it, expect } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  wrapBallotKeyToElectionPk,
  unwrapBallotKeyWithElectionSecret,
} from '../../../src/votechain-poc/crypto/ecies.js';
import {
  bytesToB64u,
  randomBytes,
} from '../../../src/votechain-poc/encoding.js';
import { bytesToBigIntBE } from '../../../src/votechain-poc/crypto/bigint.js';

describe('crypto/ecies', () => {
  function generateElectionKeys() {
    const skBytes = secp256k1.utils.randomSecretKey();
    const pkBytes = secp256k1.getPublicKey(skBytes, true); // 33 bytes compressed
    const secret = bytesToBigIntBE(skBytes);
    return { skBytes, pkBytes, secret, pk_election: bytesToB64u(pkBytes) };
  }

  describe('wrapBallotKeyToElectionPk', () => {
    it('returns wrapped key and ephemeral public key as base64url', async () => {
      const election = generateElectionKeys();
      const ballotKey = randomBytes(32);

      const result = await wrapBallotKeyToElectionPk({
        pk_election: election.pk_election,
        election_id: 'test-election',
        ballot_id: 'test-ballot',
        ballot_key: ballotKey,
      });

      expect(typeof result.wrapped_ballot_key).toBe('string');
      expect(typeof result.wrapped_ballot_key_epk).toBe('string');
      expect(result.wrapped_ballot_key).not.toMatch(/[+/=]/);
      expect(result.wrapped_ballot_key_epk).not.toMatch(/[+/=]/);
    });

    it('produces different wrapped keys for different ballot keys', async () => {
      const election = generateElectionKeys();

      const r1 = await wrapBallotKeyToElectionPk({
        pk_election: election.pk_election,
        election_id: 'e1',
        ballot_id: 'b1',
        ballot_key: randomBytes(32),
      });
      const r2 = await wrapBallotKeyToElectionPk({
        pk_election: election.pk_election,
        election_id: 'e1',
        ballot_id: 'b1',
        ballot_key: randomBytes(32),
      });

      expect(r1.wrapped_ballot_key).not.toBe(r2.wrapped_ballot_key);
    });
  });

  describe('unwrapBallotKeyWithElectionSecret', () => {
    it('round-trips: unwrapped key matches original ballot key', async () => {
      const election = generateElectionKeys();
      const ballotKey = randomBytes(32);
      const election_id = 'test-election';
      const ballot_id = 'test-ballot';

      const wrapped = await wrapBallotKeyToElectionPk({
        pk_election: election.pk_election,
        election_id,
        ballot_id,
        ballot_key: ballotKey,
      });

      const unwrapped = await unwrapBallotKeyWithElectionSecret({
        ...wrapped,
        election_id,
        ballot_id,
        election_secret: election.secret,
      });

      expect(unwrapped).not.toBeNull();
      expect(unwrapped).toEqual(ballotKey);
    });

    it('returns null with wrong election secret', async () => {
      const election = generateElectionKeys();
      const wrongElection = generateElectionKeys();
      const ballotKey = randomBytes(32);

      const wrapped = await wrapBallotKeyToElectionPk({
        pk_election: election.pk_election,
        election_id: 'e1',
        ballot_id: 'b1',
        ballot_key: ballotKey,
      });

      const unwrapped = await unwrapBallotKeyWithElectionSecret({
        ...wrapped,
        election_id: 'e1',
        ballot_id: 'b1',
        election_secret: wrongElection.secret,
      });

      expect(unwrapped).toBeNull();
    });

    it('returns null with wrong election_id (AAD mismatch)', async () => {
      const election = generateElectionKeys();
      const ballotKey = randomBytes(32);

      const wrapped = await wrapBallotKeyToElectionPk({
        pk_election: election.pk_election,
        election_id: 'election-1',
        ballot_id: 'ballot-1',
        ballot_key: ballotKey,
      });

      const unwrapped = await unwrapBallotKeyWithElectionSecret({
        ...wrapped,
        election_id: 'wrong-election',
        ballot_id: 'ballot-1',
        election_secret: election.secret,
      });

      expect(unwrapped).toBeNull();
    });

    it('returns null with wrong ballot_id (AAD mismatch)', async () => {
      const election = generateElectionKeys();
      const ballotKey = randomBytes(32);

      const wrapped = await wrapBallotKeyToElectionPk({
        pk_election: election.pk_election,
        election_id: 'e1',
        ballot_id: 'ballot-1',
        ballot_key: ballotKey,
      });

      const unwrapped = await unwrapBallotKeyWithElectionSecret({
        ...wrapped,
        election_id: 'e1',
        ballot_id: 'wrong-ballot',
        election_secret: election.secret,
      });

      expect(unwrapped).toBeNull();
    });

    it('handles corrupt wrapped key data', async () => {
      const election = generateElectionKeys();

      const unwrapped = await unwrapBallotKeyWithElectionSecret({
        wrapped_ballot_key: bytesToB64u(randomBytes(60)),
        wrapped_ballot_key_epk: bytesToB64u(randomBytes(33)),
        election_id: 'e1',
        ballot_id: 'b1',
        election_secret: election.secret,
      });

      expect(unwrapped).toBeNull();
    });
  });
});
