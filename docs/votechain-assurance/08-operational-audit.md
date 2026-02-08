# Operational Security Audit (Internal Pre-3P)

Purpose:

- Ensure the operational story matches the cryptographic story.
- Prepare key management, ceremonies, and change control so external auditors have a real
  system to evaluate (not a pile of intentions).

Primary references:

- VoteChain PRD: `PRD-VOTER-VERIFICATION-CHAIN.md`
- EWP PRD: `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`

## Inputs (Before You Start)

- A defined deployment mode (Mode 1 or Mode 2 for first pilots)
- An inventory of keys and who controls them:
  - enrollment authority keys
  - gateway receipt signing keys
  - BB STH signing keys
  - trustee keys
  - chain node keys / chaincode admin keys
- HSM plan (or a documented interim control for staging):
  - what keys are non-exportable
  - rotation policies
  - audit logs from HSMs
- Incident response runbooks and on-call rotations

## What To Do

### 1. Key Inventory and Classification

For each key:

- purpose (what it signs/decrypts)
- blast radius if compromised
- storage mechanism (HSM vs software)
- rotation frequency and trigger conditions
- revocation mechanism and how clients learn revocation

Expected output:

- `keys.md` plus a "keys table" suitable for auditors.

### 2. Ceremony Procedures (Trustees and Critical Keys)

For any key ceremony:

- publish a step-by-step procedure
- require independent witnesses
- record transcripts (video/logs) and hash them
- anchor transcript hashes on VoteChain (per PRD guidance)

Expected output:

- `ceremonies.md` and a sample transcript artifact for staging.

### 3. Change Control and Voting-Window Freeze

Define:

- "no changes during voting window" enforcement mechanism
- emergency break-glass:
  - who can approve
  - what evidence must be published/anchored
  - how to prevent silent hotfixes
- chaincode update governance (multi-party approval as suggested in PRD open questions)

Expected output:

- `change-control.md` and an "emergency change" template.

### 4. Incident Response and Continuity

Practice:

- key compromise response:
  - rotate keys, publish new `kid`, revoke old
  - ensure offline receipt verification still works with the updated trust chain
- degraded mode:
  - partial outages (chain/BB/gateway) and safe fallback behavior
- "no voter turned away solely for network failure" continuity objectives

Expected output:

- `ir-runbook.md` plus drill results with timings.

### 5. Audit Log and Evidence Handling

Define:

- what is logged (and what must never be logged)
- log retention
- tamper evidence (hash chaining, append-only stores)
- evidence bundles for contested cases (hashes anchored on-chain)

Expected output:

- `logging-and-evidence.md` with explicit "do not log" guidance and audit export formats.

## Operational Audit Test Checklist (30 Tests)

These are concrete operational checks to run in staging before external auditors.
Each one should produce an artifact (screenshot, log excerpt, signed report, or hash anchor).

### Key Management and HSM Controls (OA01-OA12)

OA01. **Key inventory completeness**

- Steps: enumerate all signing/decryption keys used by the system; confirm owners and storage locations.
- Expect: nothing "unknown" or "temporary" remains in the pilot path.
- Evidence: `keys.md` with owner + purpose + storage + rotation policy.

OA02. **Non-exportable key enforcement (HSM)**

- Steps: attempt to export receipt/STH signing keys from the HSM (administratively, in staging).
- Expect: export denied; audit log records the attempt.
- Evidence: HSM audit log entry; denial result.

OA03. **Key access requires least privilege**

- Steps: review IAM/RBAC for key operations (sign, rotate, revoke).
- Expect: only required roles can invoke operations; no broad admin access.
- Evidence: RBAC policy diff; role-to-action mapping.

OA04. **Dual control for critical operations**

- Steps: require two-person approval for key rotation/revocation and emergency changes.
- Expect: cannot execute with a single operator.
- Evidence: approval records; enforced workflow proof.

OA05. **Key rotation rehearsal**

- Steps: rotate a gateway receipt signing key in staging and publish the new `kid`.
- Expect: new receipts verify; old receipts remain verifiable; clients learn the new `kid` safely.
- Evidence: before/after receipts; verifier outputs; rotation log + anchor.

OA06. **Key revocation rehearsal**

- Steps: revoke a compromised key in staging.
- Expect: clients/verifiers treat it as revoked for new artifacts; old artifacts remain auditable with clear status.
- Evidence: revocation event + distribution proof; verifier behavior.

OA07. **Clock/time source consistency**

- Steps: validate all components use a consistent time source or defined skew tolerance.
- Expect: no component treats valid artifacts as expired (or vice versa) due to drift.
- Evidence: time sync config; drift report.

OA08. **Secrets management audit**

- Steps: verify secrets are stored in a secrets manager, not environment variables/files in plain text.
- Expect: short-lived credentials and audited access.
- Evidence: secret store policy; access logs.

OA09. **Receipt verification offline**

- Steps: verify receipts on an offline machine using only published keys/anchors.
- Expect: verification succeeds without privileged network access.
- Evidence: offline verification transcript.

OA10. **STH signing key separation**

- Steps: ensure BB STH signing key and gateway receipt signing key are distinct and independently controlled.
- Expect: compromise of one does not enable forging the other.
- Evidence: key inventory; HSM partitions; policy proof.

OA11. **Trustee key custody separation**

- Steps: confirm trustees are in distinct organizational categories and have separate custody controls.
- Expect: no single org controls threshold decryption.
- Evidence: trustee roster; custody attestation docs.

OA12. **Key ceremony transcript anchoring**

- Steps: run a staging key ceremony and produce a transcript; hash and anchor it.
- Expect: anyone can verify transcript integrity via anchor.
- Evidence: transcript hash; anchor tx; published ceremony report.

### Change Control and Freeze (OA13-OA18)

OA13. **Voting-window change freeze enforcement**

- Steps: attempt to deploy a non-emergency change during a simulated voting window.
- Expect: blocked by policy and tooling.
- Evidence: CI/CD denial log; policy doc.

OA14. **Emergency break-glass flow**

- Steps: execute a staged emergency change using break-glass process.
- Expect: dual approval; public/auditable evidence trail; post-change validation required.
- Evidence: approval artifacts; change record; audit anchor.

OA15. **Chaincode update governance rehearsal**

- Steps: simulate a chaincode/policy update with multi-party approval as required.
- Expect: update cannot be applied without the required quorum.
- Evidence: approval record; update transaction; version registry.

OA16. **Configuration drift detection**

- Steps: intentionally drift a config (safe in staging) and ensure drift is detected and alerted.
- Expect: alert within SLA; rollback path defined.
- Evidence: drift alert; remediation action.

OA17. **Software supply-chain integrity**

- Steps: confirm build artifacts are signed and provenance is recorded.
- Expect: operators cannot deploy unsigned artifacts.
- Evidence: signature verification logs; provenance record.

OA18. **Dependency update governance**

- Steps: ensure security updates have an expedited process with documented risk acceptance when deferred.
- Expect: clear owners and deadlines; no indefinite deferrals.
- Evidence: policy; recent example ticket.

### Incident Response and Continuity (OA19-OA26)

OA19. **Key compromise drill**

- Steps: run a tabletop and a live staging drill for compromised signing key.
- Expect: rotate, revoke, publish, and verify within target times.
- Evidence: incident timeline; artifacts; retest results.

OA20. **Gateway operator outage failover**

- Steps: take one gateway operator offline in staging.
- Expect: voters/clients can fail over; no silent dead ends.
- Evidence: failover logs; UX screenshots; uptime metrics.

OA21. **BB outage degraded mode**

- Steps: make BB unavailable; observe behavior.
- Expect: defined degraded behavior with safe continuity and auditable reconciliation.
- Evidence: incident record; reconciliation plan; post-restore validation.

OA22. **VoteChain anchoring outage degraded mode**

- Steps: delay or disable anchoring writes.
- Expect: system does not silently accept unverifiable states; explicit pending/reconcile state is used.
- Evidence: logs; audit anchors when restored; reconciliation report.

OA23. **Monitor downtime handling**

- Steps: take monitors down beyond allowed thresholds (staging).
- Expect: alert; documented response (add monitors, extend window, halt if required).
- Evidence: downtime alert; operator actions.

OA24. **DDoS / traffic surge drill**

- Steps: simulate a safe traffic surge in staging.
- Expect: load shedding + backoff guidance; no catastrophic cascade; continuity objectives met.
- Evidence: latency graphs; error codes; fallbacks used.

OA25. **Backup and restore rehearsal**

- Steps: restore BB/ledger state from backups in staging.
- Expect: restored state verifiable; anchors and proofs still validate.
- Evidence: restore runbook; verification transcript; RTO/RPO metrics.

OA26. **Audit evidence bundle export**

- Steps: export a contested-case evidence bundle from staging.
- Expect: signed manifest; integrity verifiable; access controlled.
- Evidence: exported bundle; verifier output; access logs.

### Logging, Privacy, and Oversight Ops (OA27-OA30)

OA27. **Log retention and tamper evidence**

- Steps: verify logs are append-only or hash-chained; retention meets policy.
- Expect: tampering attempts are detectable.
- Evidence: logging design doc; integrity checks; retention policy proof.

OA28. **PII access dual control**

- Steps: attempt to access sensitive PII views for a case; ensure dual control and audit logging.
- Expect: no unilateral access; all access logged.
- Evidence: access logs; RBAC policy.

OA29. **Public transparency artifacts**

- Steps: generate and publish the election transparency artifacts required (aggregates, roots, anonymized outcomes).
- Expect: artifacts are complete and verifiable; publication process is auditable.
- Evidence: published artifact list; hashes; anchors.

OA30. **Oversight workflow SLA rehearsal**

- Steps: simulate a flagged case; run through notice + case ID + tiered escalation; measure timings.
- Expect: SLA targets met (or gaps documented with remediation).
- Evidence: case timeline; status updates; final disposition record.

## What To Expect (Common Audit Findings)

- Undefined ownership boundaries for emergency changes.
- Key rotation without a verifiable transparency mechanism.
- Missing evidence chain for operational actions (rotations, revocations, overrides).
- Logs that contain correlation identifiers that undermine privacy claims.

## How To Patch

Operational gaps are patched by:

- written procedures with explicit owners
- automation with guardrails (fewer manual steps)
- independent monitoring and transparency requirements
- drills with measured outcomes and iterative improvements

## What To Hand Off To Third Parties

- Key inventory and classification
- Ceremony procedures + transcripts/hashes
- Change control + freeze policy
- IR runbooks + drill evidence
- Logging/evidence retention policy and export examples
