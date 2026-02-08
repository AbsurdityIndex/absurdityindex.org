/**
 * VoteChain POC — Tally Publication
 *
 * Reconstruct the election secret from trustee shares, decrypt all
 * ballots, aggregate counts, sign the tally, and anchor it on the VCL.
 */

import { secp256k1 } from '@noble/curves/secp256k1';

import type {
  PocTally,
  PocTrusteeShareRecord,
  PocEncryptedBallot,
  PocVclEvent,
} from './types.js';
import {
  sha256B64u,
  utf8,
  canonicalJson,
  bytesToB64u,
  b64uToBytes,
  nowIso,
} from './encoding.js';
import { SECP256K1_ORDER, bytesToBigIntBE, bigIntToBytesBE, mod } from './crypto/bigint.js';
import { shamirCombine } from './crypto/shamir.js';
import { unwrapBallotKeyWithElectionSecret } from './crypto/ecies.js';
import { signB64u } from './crypto/ecdsa.js';
import { vclSignEvent } from './vcl.js';
import { ensureInitialized, saveState } from './state.js';
import { decryptBallotWithKey, validateBallotPlaintext } from './ballot.js';

export async function publishTally(params?: {
  shares?: PocTrusteeShareRecord[];
}): Promise<PocTally | { error: string }> {
  const state = await ensureInitialized();
  const latestSth = state.bb.sth_history.at(-1);
  if (!latestSth) return { error: 'No ballots on the bulletin board.' };

  const threshold = state.trustees.threshold;
  const selectedShares = (params?.shares ?? state.trustees.shares).slice();
  if (selectedShares.length < threshold.t) {
    return { error: `Need at least ${threshold.t} trustee shares to decrypt the tally.` };
  }

  // Reconstruct election secret from >= t shares, then verify it matches the manifest public key.
  selectedShares.sort((a, b) => a.x - b.x);
  const sharesForReconstruction = selectedShares.slice(0, threshold.t).map((s) => ({
    x: BigInt(s.x),
    y: bytesToBigIntBE(b64uToBytes(s.share)),
  }));
  const electionSecret = shamirCombine(sharesForReconstruction);
  let reconstructedPk = '';
  try {
    const skBytes = bigIntToBytesBE(mod(electionSecret, SECP256K1_ORDER), 32);
    reconstructedPk = bytesToB64u(secp256k1.getPublicKey(skBytes, true));
  } catch {
    return { error: 'Trustee shares reconstructed an invalid election secret key.' };
  }
  if (reconstructedPk !== state.manifest.crypto.pk_election) {
    return { error: 'Trustee shares did not reconstruct the manifest election key.' };
  }

  // Compute totals by decrypting each ballot.
  const totals: Record<string, Record<string, number>> = {};
  for (const contest of state.election.contests) {
    totals[contest.contest_id] = Object.fromEntries(contest.options.map((o) => [o.id, 0]));
  }

  let ballot_count = 0;
  for (const leaf of state.bb.leaves) {
    const encrypted = (leaf.payload.encrypted_ballot ?? null) as unknown as PocEncryptedBallot | null;
    if (!encrypted?.ciphertext) continue;
    const ballotKey = await unwrapBallotKeyWithElectionSecret({
      wrapped_ballot_key: encrypted.wrapped_ballot_key,
      wrapped_ballot_key_epk: encrypted.wrapped_ballot_key_epk,
      election_id: state.election.election_id,
      ballot_id: encrypted.ballot_id,
      election_secret: electionSecret,
    });
    if (!ballotKey) continue;

    const plaintext = await decryptBallotWithKey(encrypted.ciphertext, ballotKey);
    if (!plaintext) continue;
    if (!validateBallotPlaintext(state, plaintext)) continue;
    for (const entry of plaintext.contests) {
      const config = state.election.contests.find((c) => c.contest_id === entry.contest_id);
      if (!config) continue;
      if (!config.options.some((o) => o.id === entry.selection)) continue;
      if (totals[entry.contest_id]) totals[entry.contest_id][entry.selection] += 1;
    }
    ballot_count += 1;
  }

  const unsigned: Omit<PocTally, 'sig'> = {
    election_id: state.election.election_id,
    manifest_id: state.manifest.manifest_id,
    bb_close_root_hash: latestSth.root_hash,
    computed_at: nowIso(),
    totals,
    ballot_count,
    kid: state.keys.ewg.kid,
  };

  const sig = await signB64u(state.keys.ewg.jwk_private, utf8(canonicalJson(unsigned)));
  const tally: PocTally = { ...unsigned, sig };

  state.tally = tally;

  // Anchor tally on VCL.
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'tally_published',
    recorded_at: nowIso(),
    payload: {
      election_id: tally.election_id,
      manifest_id: tally.manifest_id,
      bb_close_root_hash: tally.bb_close_root_hash,
      tally_hash: await sha256B64u(utf8(canonicalJson(tally))),
    },
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });

  saveState(state);
  return tally;
}
