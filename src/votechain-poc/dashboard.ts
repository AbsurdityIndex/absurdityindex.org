/**
 * VoteChain POC — Dashboard Snapshot
 *
 * Aggregate election state into a single snapshot for the admin dashboard.
 */

import type {
  PocElectionManifest,
  PocSignedTreeHead,
  PocVclEvent,
  PocBbLeaf,
  PocFraudCase,
  PocTally,
  PocStateV2,
} from './types.js';
import { ensureInitialized } from './state.js';
import { deriveFraudCases } from './fraud.js';

export interface DashboardSnapshot {
  election: PocStateV2['election'];
  manifest: PocElectionManifest;
  bb: {
    leaf_count: number;
    latest_sth: PocSignedTreeHead | null;
  };
  vcl: {
    event_count: number;
    fraud_flags: number;
    ewp_casts: number;
  };
  metrics: {
    verified: number;
    crypto_conflict: number;
    spoiled: number;
    pending: number;
    provisional: number;
  };
  fraud_cases: PocFraudCase[];
  events: PocVclEvent[];
  leaves: PocBbLeaf[];
  tally?: PocTally;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const state = await ensureInitialized();

  const events = [...state.vcl.events].reverse();
  const leaves = [...state.bb.leaves].slice().reverse();

  const ewp_casts = state.vcl.events.filter((e) => e.type === 'ewp_ballot_cast').length;
  const fraud_flags = state.vcl.events.filter((e) => e.type === 'fraud_flag').length;

  // POC: "verified" = recorded casts, "crypto_conflict" = duplicate attempts, "pending" = 0 (sync).
  const verified = ewp_casts;
  const crypto_conflict = fraud_flags;
  const spoiled = state.spoiled_ballots.length;
  const pending = 0;
  const provisional = 0;

  return {
    election: state.election,
    manifest: state.manifest,
    bb: {
      leaf_count: state.bb.leaves.length,
      latest_sth: state.bb.sth_history.at(-1) ?? null,
    },
    vcl: {
      event_count: state.vcl.events.length,
      fraud_flags,
      ewp_casts,
    },
    metrics: {
      verified,
      crypto_conflict,
      spoiled,
      pending,
      provisional,
    },
    fraud_cases: deriveFraudCases(state),
    events,
    leaves,
    tally: state.tally,
  };
}
