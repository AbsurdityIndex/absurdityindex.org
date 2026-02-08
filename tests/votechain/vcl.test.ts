import { describe, it, expect } from 'vitest';
import {
  vclTxId,
  vclSignEvent,
  vclVerifyEvent,
  buildEwpError,
  hasUsedNullifier,
  getAnchorEventForLeaf,
} from '../../src/votechain-poc/vcl.js';
import { generateEcdsaKeyPair, exportKeyPair } from '../../src/votechain-poc/crypto/ecdsa.js';
import type { PocStateV2, PocVclEvent, StoredKeyPair } from '../../src/votechain-poc/types.js';

describe('vcl', () => {
  async function makeKey(kid: string): Promise<StoredKeyPair> {
    const kp = await generateEcdsaKeyPair();
    return exportKeyPair(kp, kid);
  }

  describe('vclTxId', () => {
    it('returns a 0x-prefixed hex string', async () => {
      const txId = await vclTxId({ type: 'test', data: 'hello' });
      expect(txId).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('is deterministic', async () => {
      const payload = { type: 'test', value: 42 };
      const id1 = await vclTxId(payload);
      const id2 = await vclTxId(payload);
      expect(id1).toBe(id2);
    });

    it('is order-independent due to canonical JSON', async () => {
      const id1 = await vclTxId({ b: 2, a: 1 });
      const id2 = await vclTxId({ a: 1, b: 2 });
      expect(id1).toBe(id2);
    });
  });

  describe('vclSignEvent / vclVerifyEvent', () => {
    it('sign and verify round-trip', async () => {
      const key = await makeKey('vcl-kid');
      const eventUnsigned = {
        type: 'ewp_ballot_cast' as const,
        recorded_at: new Date().toISOString(),
        payload: { election_id: 'e1', nullifier: '0xabc' },
        kid: 'vcl-kid',
      };

      const { tx_id, sig } = await vclSignEvent(eventUnsigned, key);
      const event: PocVclEvent = { ...eventUnsigned, tx_id, sig };

      const valid = await vclVerifyEvent(event, key);
      expect(valid).toBe(true);
    });

    it('verification fails with wrong key', async () => {
      const key1 = await makeKey('kid-1');
      const key2 = await makeKey('kid-2');

      const eventUnsigned = {
        type: 'bb_sth_published' as const,
        recorded_at: new Date().toISOString(),
        payload: { root_hash: 'abc' },
        kid: 'kid-1',
      };

      const signed = await vclSignEvent(eventUnsigned, key1);
      const event: PocVclEvent = { ...eventUnsigned, ...signed };

      const valid = await vclVerifyEvent(event, key2);
      expect(valid).toBe(false);
    });

    it('verification fails if tx_id is tampered', async () => {
      const key = await makeKey('kid');
      const eventUnsigned = {
        type: 'fraud_flag' as const,
        recorded_at: new Date().toISOString(),
        payload: { flag: 'test' },
        kid: 'kid',
      };

      const signed = await vclSignEvent(eventUnsigned, key);
      const event: PocVclEvent = { ...eventUnsigned, ...signed, tx_id: '0x0000000000000000000000000000000000000000000000000000000000000000' };

      const valid = await vclVerifyEvent(event, key);
      expect(valid).toBe(false);
    });

    it('verification fails if payload is tampered', async () => {
      const key = await makeKey('kid');
      const eventUnsigned = {
        type: 'tally_published' as const,
        recorded_at: new Date().toISOString(),
        payload: { result: 'original' },
        kid: 'kid',
      };

      const signed = await vclSignEvent(eventUnsigned, key);
      const event: PocVclEvent = {
        ...eventUnsigned,
        ...signed,
        payload: { result: 'tampered' },
      };

      const valid = await vclVerifyEvent(event, key);
      expect(valid).toBe(false);
    });
  });

  describe('buildEwpError', () => {
    it('constructs error response with correct shape', () => {
      const err = buildEwpError('EWP_BAD_MANIFEST', 'Bad manifest', false);
      expect(err.error.code).toBe('EWP_BAD_MANIFEST');
      expect(err.error.message).toBe('Bad manifest');
      expect(err.error.retryable).toBe(false);
      expect(err.error.details).toBeUndefined();
    });

    it('includes details when provided', () => {
      const err = buildEwpError('EWP_PROOF_INVALID', 'Proof failed', false, { vk_id: 'test' });
      expect(err.error.details).toEqual({ vk_id: 'test' });
    });

    it('supports retryable flag', () => {
      const err = buildEwpError('EWP_CHALLENGE_EXPIRED', 'Expired', true);
      expect(err.error.retryable).toBe(true);
    });
  });

  describe('hasUsedNullifier', () => {
    it('returns false when no matching event exists', () => {
      const state = {
        vcl: { events: [] },
      } as unknown as PocStateV2;

      expect(hasUsedNullifier(state, '0xabc')).toBe(false);
    });

    it('returns true when matching ewp_ballot_cast event exists', () => {
      const state = {
        vcl: {
          events: [
            {
              type: 'ewp_ballot_cast',
              payload: { nullifier: '0xabc' },
            },
          ],
        },
      } as unknown as PocStateV2;

      expect(hasUsedNullifier(state, '0xabc')).toBe(true);
    });

    it('ignores non-ewp_ballot_cast events', () => {
      const state = {
        vcl: {
          events: [
            {
              type: 'fraud_flag',
              payload: { nullifier: '0xabc' },
            },
          ],
        },
      } as unknown as PocStateV2;

      expect(hasUsedNullifier(state, '0xabc')).toBe(false);
    });
  });

  describe('getAnchorEventForLeaf', () => {
    it('returns null when no matching event', () => {
      const state = {
        vcl: { events: [] },
      } as unknown as PocStateV2;

      expect(getAnchorEventForLeaf(state, 'leaf-hash-1')).toBeNull();
    });

    it('returns matching anchor event', () => {
      const event = {
        type: 'ewp_ballot_cast',
        payload: { bb_leaf_hash: 'leaf-hash-1' },
        tx_id: '0xabc',
      };
      const state = {
        vcl: { events: [event] },
      } as unknown as PocStateV2;

      const result = getAnchorEventForLeaf(state, 'leaf-hash-1');
      expect(result).toBe(event);
    });
  });
});
