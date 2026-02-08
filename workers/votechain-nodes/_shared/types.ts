/* eslint-disable no-undef */
export type NodeRole = 'federal' | 'state' | 'oversight';

export type VclEventType =
  | 'election_manifest_published'
  | 'credential_issued'
  | 'ewp_ballot_cast'
  | 'bb_sth_published'
  | 'tally_published'
  | 'fraud_flag'
  | 'fraud_flag_action';

export interface VclEvent {
  tx_id: `0x${string}`;
  type: VclEventType;
  recorded_at: string; // ISO timestamp
  payload: Record<string, unknown>;
}

export interface LedgerEntry {
  index: number;
  prev_hash: string;
  hash: string;
  accepted_at: string; // ISO timestamp
  event: VclEvent;
}

export interface NodeAck {
  alg: 'ECDSA_P256_SHA256';
  kid: string;
  sig: string; // base64url signature bytes (P-256 r||s)
}

export interface LedgerAppendResponse {
  entry: LedgerEntry;
  ack: NodeAck;
}

export interface LedgerHead {
  height: number;
  head_hash: string;
  updated_at: string; // ISO timestamp
}

export interface LedgerStats {
  height: number;
  type_counts: Record<string, number>;
  updated_at: string;
}

export interface NodeKey {
  alg: NodeAck['alg'];
  kid: string;
  jwk_public: JsonWebKey;
}
