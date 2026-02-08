import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetPocState,
  getPocState,
  getManifest,
  getTrusteeShares,
  getCredential,
} from '../../src/votechain-poc/state.js';
import { ensureCredential, issueChallenge } from '../../src/votechain-poc/credential.js';
import { encryptBallotForReview, spoilBallot, verifySpoiledBallot } from '../../src/votechain-poc/ballot.js';
import { hasAlreadyVoted, buildCastRequest, castBallot } from '../../src/votechain-poc/cast.js';
import { verifyReceipt } from '../../src/votechain-poc/verify.js';
import { publishTally } from '../../src/votechain-poc/tally.js';
import { lookupBallotByHash } from '../../src/votechain-poc/lookup.js';
import { getDashboardSnapshot } from '../../src/votechain-poc/dashboard.js';
import {
  verifyManifestSignature,
  verifyAllSthSignatures,
  verifyAllVclEventSignatures,
  verifyBulletinBoardIntegrity,
  getPublicKeys,
} from '../../src/votechain-poc/trust-portal.js';
import { verifyManifest } from '../../src/votechain-poc/manifest.js';
import type { PocCastRecordedResponse, PocTally } from '../../src/votechain-poc/types.js';

describe('VoteChain POC — Full Integration', () => {
  beforeEach(() => {
    resetPocState();
  });

  describe('state initialization', () => {
    it('getPocState initializes fresh state on first call', async () => {
      const state = await getPocState();
      expect(state.version).toBe(2);
      expect(state.election.election_id).toBe('poc-2026-demo');
      expect(state.election.contests.length).toBeGreaterThan(0);
      expect(state.manifest).toBeDefined();
      expect(state.manifest.manifest_id).toBeDefined();
      expect(state.keys.manifest).toBeDefined();
      expect(state.keys.ewg).toBeDefined();
      expect(state.keys.bb).toBeDefined();
      expect(state.keys.vcl).toBeDefined();
    });

    it('state persists across calls (same manifest_id)', async () => {
      const state1 = await getPocState();
      const state2 = await getPocState();
      expect(state1.manifest.manifest_id).toBe(state2.manifest.manifest_id);
    });

    it('resetPocState clears and next call reinitializes', async () => {
      const state1 = await getPocState();
      const mid1 = state1.manifest.manifest_id;
      resetPocState();
      const state2 = await getPocState();
      // Different random keys, so manifest_id will differ
      expect(state2.manifest.manifest_id).not.toBe(mid1);
    });

    it('manifest is self-consistent', async () => {
      const state = await getPocState();
      const valid = await verifyManifest(state.manifest, state.keys.manifest);
      expect(valid).toBe(true);
    });

    it('initial VCL has election_manifest_published event', async () => {
      const state = await getPocState();
      const manifestEvent = state.vcl.events.find(
        (e) => e.type === 'election_manifest_published',
      );
      expect(manifestEvent).toBeDefined();
      expect(manifestEvent!.payload.manifest_id).toBe(state.manifest.manifest_id);
    });

    it('getManifest returns the election manifest', async () => {
      const manifest = await getManifest();
      expect(manifest.election_id).toBe('poc-2026-demo');
      expect(manifest.crypto.suite).toBe(
        'ewp_suite_poc_threshold_blind_schnorr_ecies_aesgcm_v2',
      );
    });

    it('getTrusteeShares returns threshold and shares', async () => {
      const { threshold, shares } = await getTrusteeShares();
      expect(threshold.t).toBe(2);
      expect(threshold.n).toBe(3);
      expect(shares.length).toBe(3);
      expect(shares[0].id).toBe('T1');
    });

    it('getCredential returns null before registration', async () => {
      const cred = await getCredential();
      expect(cred).toBeNull();
    });
  });

  describe('credential registration', () => {
    it('ensureCredential creates and persists a credential', async () => {
      const cred = await ensureCredential();
      expect(cred.did).toMatch(/^did:votechain:poc:/);
      expect(cred.curve).toBe('secp256k1');
      expect(cred.pk).toBeDefined();
      expect(cred.sk).toBeDefined();
      expect(cred.created_at).toBeDefined();
    });

    it('credential is idempotent (same pk on second call)', async () => {
      const cred1 = await ensureCredential();
      const cred2 = await ensureCredential();
      expect(cred1.pk).toBe(cred2.pk);
    });

    it('credential is persisted in state', async () => {
      await ensureCredential();
      const cred = await getCredential();
      expect(cred).not.toBeNull();
      expect(cred!.pk).toBeDefined();
    });
  });

  describe('challenge issuance', () => {
    it('issues a challenge with correct structure', async () => {
      const challenge = await issueChallenge('test-session');
      expect(challenge.challenge_id).toBeDefined();
      expect(challenge.challenge).toBeDefined();
      expect(challenge.expires_at).toBeDefined();
      expect(challenge.kid).toBeDefined();
      expect(challenge.server_sig).toBeDefined();
    });

    it('challenges have unique IDs', async () => {
      const c1 = await issueChallenge('s1');
      const c2 = await issueChallenge('s2');
      expect(c1.challenge_id).not.toBe(c2.challenge_id);
    });
  });

  describe('ballot encryption & spoil', () => {
    it('encryptBallotForReview returns encrypted ballot', async () => {
      const result = await encryptBallotForReview({
        contests: [
          { contest_id: 'us-senate-ny-2026', selection: 'gutierrez-d' },
          { contest_id: 'prop-12-infrastructure', selection: 'yes' },
        ],
      });

      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.encrypted_ballot).toBeDefined();
        expect(result.iv).toBeDefined();
        expect(result.ballot_key).toBeDefined();
        expect(result.plaintext).toBeDefined();
      }
    });

    it('rejects invalid contest selection', async () => {
      const result = await encryptBallotForReview({
        contests: [
          { contest_id: 'us-senate-ny-2026', selection: 'nonexistent' },
        ],
      });
      expect('error' in result).toBe(true);
    });

    it('spoil + verify round-trip confirms honest encryption', async () => {
      const encrypted = await encryptBallotForReview({
        contests: [
          { contest_id: 'us-senate-ny-2026', selection: 'chen-r' },
          { contest_id: 'prop-12-infrastructure', selection: 'no' },
        ],
      });

      expect('error' in encrypted).toBe(false);
      if ('error' in encrypted) return;

      const spoilResult = await spoilBallot({
        encrypted_ballot: encrypted.encrypted_ballot,
        iv: encrypted.iv,
        ballot_key: encrypted.ballot_key,
        plaintext: encrypted.plaintext,
      });

      expect(spoilResult.status).toBe('ballot_spoiled');
      expect(spoilResult.spoil_receipt).toBeDefined();

      const verify = await verifySpoiledBallot({
        encrypted_ballot: encrypted.encrypted_ballot,
        iv: encrypted.iv,
        ballot_key: encrypted.ballot_key,
        plaintext: encrypted.plaintext,
      });

      expect(verify.match).toBe(true);
    });
  });

  describe('full cast flow', () => {
    it('casts a ballot and returns cast_recorded', async () => {
      await ensureCredential();
      const challenge = await issueChallenge('session-1');

      const encrypted = await encryptBallotForReview({
        contests: [
          { contest_id: 'us-senate-ny-2026', selection: 'gutierrez-d' },
          { contest_id: 'prop-12-infrastructure', selection: 'yes' },
        ],
      });
      expect('error' in encrypted).toBe(false);
      if ('error' in encrypted) return;

      const buildResult = await buildCastRequest({
        encrypted_ballot: encrypted.encrypted_ballot,
        challenge,
      });
      expect('error' in buildResult).toBe(false);
      if ('error' in buildResult) return;

      const response = await castBallot({
        request: buildResult.request,
        idempotencyKey: buildResult.idempotencyKey,
      });

      expect('status' in response).toBe(true);
      expect((response as PocCastRecordedResponse).status).toBe('cast_recorded');

      const recorded = response as PocCastRecordedResponse;
      expect(recorded.cast_receipt.election_id).toBe('poc-2026-demo');
      expect(recorded.cast_receipt.bb_sth).toBeDefined();
      expect(recorded.cast_receipt.votechain_anchor).toBeDefined();
    });

    it('hasAlreadyVoted returns false before cast, true after', async () => {
      expect(await hasAlreadyVoted()).toBe(false);

      await ensureCredential();
      const challenge = await issueChallenge('s1');
      const encrypted = await encryptBallotForReview({
        contests: [
          { contest_id: 'us-senate-ny-2026', selection: 'gutierrez-d' },
          { contest_id: 'prop-12-infrastructure', selection: 'yes' },
        ],
      });
      if ('error' in encrypted) throw new Error('encrypt failed');

      const buildResult = await buildCastRequest({
        encrypted_ballot: encrypted.encrypted_ballot,
        challenge,
      });
      if ('error' in buildResult) throw new Error('build failed');

      await castBallot({
        request: buildResult.request,
        idempotencyKey: buildResult.idempotencyKey,
      });

      expect(await hasAlreadyVoted()).toBe(true);
    });

    it('duplicate vote attempt is rejected with EWP_NULLIFIER_USED', async () => {
      await ensureCredential();

      // First vote
      const c1 = await issueChallenge('s1');
      const e1 = await encryptBallotForReview({
        contests: [{ contest_id: 'us-senate-ny-2026', selection: 'gutierrez-d' }],
      });
      if ('error' in e1) throw new Error('encrypt failed');
      const b1 = await buildCastRequest({ encrypted_ballot: e1.encrypted_ballot, challenge: c1 });
      if ('error' in b1) throw new Error('build failed');
      const r1 = await castBallot({ request: b1.request, idempotencyKey: b1.idempotencyKey });
      expect((r1 as PocCastRecordedResponse).status).toBe('cast_recorded');

      // Second vote attempt (same credential = same nullifier)
      const c2 = await issueChallenge('s2');
      const e2 = await encryptBallotForReview({
        contests: [{ contest_id: 'us-senate-ny-2026', selection: 'chen-r' }],
      });
      if ('error' in e2) throw new Error('encrypt failed');
      const b2 = await buildCastRequest({ encrypted_ballot: e2.encrypted_ballot, challenge: c2 });
      if ('error' in b2) throw new Error('build failed');
      const r2 = await castBallot({ request: b2.request, idempotencyKey: b2.idempotencyKey });

      expect('error' in r2).toBe(true);
      if ('error' in r2) {
        expect(r2.error.code).toBe('EWP_NULLIFIER_USED');
      }
    });

    it('idempotent replay returns same response', async () => {
      await ensureCredential();
      const challenge = await issueChallenge('s1');
      const encrypted = await encryptBallotForReview({
        contests: [{ contest_id: 'us-senate-ny-2026', selection: 'gutierrez-d' }],
      });
      if ('error' in encrypted) throw new Error('encrypt failed');
      const buildResult = await buildCastRequest({
        encrypted_ballot: encrypted.encrypted_ballot,
        challenge,
        idempotencyKey: 'fixed-key',
      });
      if ('error' in buildResult) throw new Error('build failed');

      const r1 = await castBallot({ request: buildResult.request, idempotencyKey: 'fixed-key' });
      const r2 = await castBallot({ request: buildResult.request, idempotencyKey: 'fixed-key' });

      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    });
  });

  describe('receipt verification', () => {
    it('verifies a valid receipt', async () => {
      await ensureCredential();
      const challenge = await issueChallenge('s1');
      const encrypted = await encryptBallotForReview({
        contests: [
          { contest_id: 'us-senate-ny-2026', selection: 'okafor-i' },
          { contest_id: 'prop-12-infrastructure', selection: 'no' },
        ],
      });
      if ('error' in encrypted) throw new Error('encrypt failed');
      const buildResult = await buildCastRequest({
        encrypted_ballot: encrypted.encrypted_ballot,
        challenge,
      });
      if ('error' in buildResult) throw new Error('build failed');
      const response = await castBallot({
        request: buildResult.request,
        idempotencyKey: buildResult.idempotencyKey,
      });
      expect((response as PocCastRecordedResponse).status).toBe('cast_recorded');

      const receipt = (response as PocCastRecordedResponse).cast_receipt;
      const result = await verifyReceipt(receipt);

      expect(result.status).toBe('ok');
      expect(result.checks.every((c) => c.status === 'ok')).toBe(true);
      expect(result.inclusion_proof).toBeDefined();
    });
  });

  describe('ballot lookup', () => {
    it('looks up a cast ballot by hash', async () => {
      await ensureCredential();
      const challenge = await issueChallenge('s1');
      const encrypted = await encryptBallotForReview({
        contests: [{ contest_id: 'us-senate-ny-2026', selection: 'gutierrez-d' }],
      });
      if ('error' in encrypted) throw new Error('encrypt failed');
      const buildResult = await buildCastRequest({
        encrypted_ballot: encrypted.encrypted_ballot,
        challenge,
      });
      if ('error' in buildResult) throw new Error('build failed');
      const response = await castBallot({
        request: buildResult.request,
        idempotencyKey: buildResult.idempotencyKey,
      });
      const receipt = (response as PocCastRecordedResponse).cast_receipt;

      const lookup = await lookupBallotByHash(receipt.ballot_hash);
      expect(lookup.found).toBe(true);
      expect(lookup.checks.every((c) => c.status === 'ok')).toBe(true);
    });

    it('returns found=false for unknown ballot hash', async () => {
      await getPocState(); // ensure initialized
      const lookup = await lookupBallotByHash('nonexistent-hash');
      expect(lookup.found).toBe(false);
    });
  });

  describe('tally', () => {
    it('publishes tally after casting ballots', async () => {
      await ensureCredential();
      const challenge = await issueChallenge('s1');
      const encrypted = await encryptBallotForReview({
        contests: [
          { contest_id: 'us-senate-ny-2026', selection: 'gutierrez-d' },
          { contest_id: 'prop-12-infrastructure', selection: 'yes' },
        ],
      });
      if ('error' in encrypted) throw new Error('encrypt failed');
      const buildResult = await buildCastRequest({
        encrypted_ballot: encrypted.encrypted_ballot,
        challenge,
      });
      if ('error' in buildResult) throw new Error('build failed');
      await castBallot({ request: buildResult.request, idempotencyKey: buildResult.idempotencyKey });

      const tally = await publishTally();
      expect('error' in tally).toBe(false);

      const t = tally as PocTally;
      expect(t.ballot_count).toBe(1);
      expect(t.totals['us-senate-ny-2026']['gutierrez-d']).toBe(1);
      expect(t.totals['prop-12-infrastructure']['yes']).toBe(1);
      expect(t.sig).toBeDefined();
    });

    it('returns error when no ballots exist', async () => {
      await getPocState(); // init empty state
      const result = await publishTally();
      expect('error' in result).toBe(true);
    });
  });

  describe('trust portal', () => {
    it('verifyManifestSignature returns valid', async () => {
      const result = await verifyManifestSignature();
      expect(result.valid).toBe(true);
      expect(result.manifest_id).toBeDefined();
    });

    it('verifyAllSthSignatures returns all valid after casting', async () => {
      await ensureCredential();
      const ch = await issueChallenge('s1');
      const enc = await encryptBallotForReview({
        contests: [{ contest_id: 'us-senate-ny-2026', selection: 'gutierrez-d' }],
      });
      if ('error' in enc) throw new Error('encrypt failed');
      const br = await buildCastRequest({ encrypted_ballot: enc.encrypted_ballot, challenge: ch });
      if ('error' in br) throw new Error('build failed');
      await castBallot({ request: br.request, idempotencyKey: br.idempotencyKey });

      const result = await verifyAllSthSignatures();
      expect(result.all_valid).toBe(true);
      expect(result.total).toBeGreaterThan(0);
    });

    it('verifyAllVclEventSignatures returns all valid', async () => {
      const result = await verifyAllVclEventSignatures();
      expect(result.all_valid).toBe(true);
      expect(result.total).toBeGreaterThan(0); // At least the manifest event
    });

    it('verifyBulletinBoardIntegrity returns valid for empty board', async () => {
      const result = await verifyBulletinBoardIntegrity();
      expect(result.valid).toBe(true);
    });

    it('getPublicKeys returns all key types', async () => {
      const keys = await getPublicKeys();
      expect(keys.manifest.kid).toBeDefined();
      expect(keys.ewg.kid).toBeDefined();
      expect(keys.bb.kid).toBeDefined();
      expect(keys.vcl.kid).toBeDefined();
      expect(keys.issuers.length).toBeGreaterThan(0);
      expect(keys.issuers[0].pk).toBeDefined();
      expect(keys.issuer_threshold).toBeDefined();
    });
  });

  describe('dashboard', () => {
    it('returns snapshot with correct shape for fresh state', async () => {
      const snap = await getDashboardSnapshot();
      expect(snap.election.election_id).toBe('poc-2026-demo');
      expect(snap.manifest).toBeDefined();
      expect(snap.bb.leaf_count).toBe(0);
      expect(snap.vcl.event_count).toBeGreaterThan(0); // manifest publish event
      expect(snap.metrics.verified).toBe(0);
    });

    it('reflects cast ballots in metrics', async () => {
      await ensureCredential();
      const ch = await issueChallenge('s1');
      const enc = await encryptBallotForReview({
        contests: [{ contest_id: 'us-senate-ny-2026', selection: 'gutierrez-d' }],
      });
      if ('error' in enc) throw new Error('encrypt failed');
      const br = await buildCastRequest({ encrypted_ballot: enc.encrypted_ballot, challenge: ch });
      if ('error' in br) throw new Error('build failed');
      await castBallot({ request: br.request, idempotencyKey: br.idempotencyKey });

      const snap = await getDashboardSnapshot();
      expect(snap.bb.leaf_count).toBe(1);
      expect(snap.vcl.ewp_casts).toBe(1);
      expect(snap.metrics.verified).toBe(1);
    });
  });
});
