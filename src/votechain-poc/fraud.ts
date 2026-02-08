/**
 * VoteChain POC — Fraud Case Management
 *
 * Record fraud flags, review/triage fraud cases, and derive the
 * aggregated fraud-case list from the VCL event stream.
 */

import type {
  Hex0x,
  PocVclEvent,
  PocFraudCase,
  PocFraudCaseActionRecord,
  PocFraudFlagAction,
  PocFraudFlagStatus,
  PocStateV2,
} from './types.js';
import { nowIso } from './encoding.js';
import { vclSignEvent } from './vcl.js';
import { ensureInitialized, saveState } from './state.js';

export async function recordFraudFlag(state: PocStateV2, flag: Record<string, unknown>): Promise<void> {
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'fraud_flag',
    recorded_at: nowIso(),
    payload: flag,
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });
}

async function recordFraudFlagAction(state: PocStateV2, action: Record<string, unknown>): Promise<void> {
  const eventUnsigned: Omit<PocVclEvent, 'sig' | 'tx_id'> = {
    type: 'fraud_flag_action',
    recorded_at: nowIso(),
    payload: action,
    kid: state.keys.vcl.kid,
  };
  const signed = await vclSignEvent(eventUnsigned, state.keys.vcl);
  state.vcl.events.push({ ...eventUnsigned, ...signed });
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isResolvedFraudStatus(status: string): boolean {
  return status.startsWith('resolved_');
}

export function deriveFraudCases(state: PocStateV2): PocFraudCase[] {
  const createEvents = state.vcl.events.filter((e) => e.type === 'fraud_flag');
  const actionEvents = state.vcl.events.filter((e) => e.type === 'fraud_flag_action');

  const actionsByCase = new Map<string, PocFraudCaseActionRecord[]>();
  for (const evt of actionEvents) {
    const case_id = asString(evt.payload.case_id);
    if (!case_id) continue;

    const actionRecord: PocFraudCaseActionRecord = {
      tx_id: evt.tx_id,
      recorded_at: evt.recorded_at,
      action: asString(evt.payload.action) ?? 'unknown',
      reviewer_id: asString(evt.payload.reviewer_id) ?? 'unknown',
      from_status: asString(evt.payload.from_status) ?? 'unknown',
      to_status: asString(evt.payload.to_status) ?? (asString(evt.payload.from_status) ?? 'unknown'),
      reason_code: asString(evt.payload.reason_code),
      note: asString(evt.payload.note),
      assigned_to: asString(evt.payload.assigned_to),
    };

    const list = actionsByCase.get(case_id) ?? [];
    list.push(actionRecord);
    actionsByCase.set(case_id, list);
  }

  const cases: PocFraudCase[] = [];
  for (const create of createEvents) {
    const case_id = create.tx_id;
    const actions = actionsByCase.get(case_id)?.slice() ?? [];
    actions.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

    const flag_type = asString(create.payload.flag_type) ?? 'unknown';
    const severity = asString(create.payload.severity);
    const evidence_strength = asString(create.payload.evidence_strength);
    const election_id = asString(create.payload.election_id);
    const jurisdiction_id = asString(create.payload.jurisdiction_id);
    const nullifier = asString(create.payload.nullifier);

    let status: string = asString(create.payload.status) ?? 'pending_review';
    let updated_at = create.recorded_at;
    let assigned_to: string | undefined;

    for (const a of actions) {
      if (a.to_status) status = a.to_status;
      if (a.assigned_to) assigned_to = a.assigned_to;
      updated_at = a.recorded_at;
    }

    cases.push({
      case_id,
      created_at: create.recorded_at,
      updated_at,
      status,
      flag_type,
      severity,
      evidence_strength,
      election_id,
      jurisdiction_id,
      nullifier,
      assigned_to,
      flag_payload: create.payload,
      actions,
    });
  }

  cases.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return cases;
}

export async function reviewFraudFlag(params: {
  case_id: Hex0x;
  reviewer_id: string;
  action: PocFraudFlagAction;
  note?: string;
  reason_code?: string;
}): Promise<{ ok: true } | { error: string }> {
  const state = await ensureInitialized();

  const reviewer_id = params.reviewer_id.trim();
  if (!reviewer_id) return { error: 'Reviewer ID is required.' };

  const exists = state.vcl.events.some((e) => e.type === 'fraud_flag' && e.tx_id === params.case_id);
  if (!exists) return { error: 'Unknown fraud case id.' };

  const current = deriveFraudCases(state).find((c) => c.case_id === params.case_id);
  const currentStatus = current?.status ?? 'pending_review';

  if (isResolvedFraudStatus(currentStatus) && params.action !== 'note') {
    return { error: `Case is already ${currentStatus}. Only notes are allowed.` };
  }

  const nextStatusByAction: Partial<Record<PocFraudFlagAction, PocFraudFlagStatus>> = {
    take_case: 'triaged',
    start_investigation: 'investigating',
    escalate: 'escalated',
    resolve_cleared: 'resolved_cleared',
    resolve_confirmed_fraud: 'resolved_confirmed_fraud',
    resolve_system_error: 'resolved_system_error',
  };

  const to_status = nextStatusByAction[params.action] ?? currentStatus;

  const actionPayload: Record<string, unknown> = {
    case_id: params.case_id,
    action: params.action,
    reviewer_id,
    from_status: currentStatus,
    to_status,
    ...(params.reason_code ? { reason_code: params.reason_code } : {}),
    ...(params.note ? { note: params.note } : {}),
    ...(params.action === 'take_case' ? { assigned_to: reviewer_id } : {}),
  };

  await recordFraudFlagAction(state, actionPayload);
  saveState(state);
  return { ok: true };
}
