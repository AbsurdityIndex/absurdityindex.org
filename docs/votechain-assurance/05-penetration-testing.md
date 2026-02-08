# Penetration Testing (Internal Pre-3P)

Purpose:

- Run an internal pentest against a controlled staging environment to catch obvious
  implementation and configuration issues before you pay external firms to do it.
- Produce clean artifacts (scope, logs, repro steps) that make third-party testing faster.

This is not a substitute for an independent pentest.

## Inputs (Before You Start)

- A staging environment that matches the intended pilot mode (Mode 1 or Mode 2 recommended):
  - gateways, BB log, monitors, chain integration, trustee tooling (if applicable)
- Synthetic test elections and synthetic voter credentials (no real voter data)
- A written Rules of Engagement (RoE):
  - scope, allowed techniques, time windows, stop conditions
  - explicit prohibition on testing outside staging
- Instrumentation:
  - request logs, security events, rate limit events
  - monitor alerts, BB/chain anchoring logs

## What To Do

### 1. Validate the "Security Invariants" With Negative Tests

Run controlled tests that should fail:

- Replay resistance:
  - reuse challenges after use/expiry
- Idempotency:
  - reuse idempotency keys with different payloads
- Uniqueness:
  - attempt duplicate casts for the same nullifier (strict mode)
- Integrity:
  - mutate a signed object field and confirm verification fails
- Availability safety:
  - trigger rate limiting and confirm the client has a safe fallback (alternate gateway list,
    provisional path, clear user messaging)

Expected:

- deterministic error codes and non-leaky error messages
- no state corruption after failed requests

### 2. API Hardening Checks

Focus areas:

- schema validation and unknown-field rejection
- payload size limits (per endpoint)
- request timeouts and backpressure behavior
- consistent canonicalization before hashing/signing

Expected:

- consistent behavior across gateway instances
- no "best effort" parsing that could create inconsistent behavior

### 3. Configuration and Infrastructure Checks

Validate:

- TLS configurations, certificate rotation, and trust store correctness
- secret management (no keys in env/files where they should be HSM-backed)
- network segmentation (polling-place clients have minimal outbound routes)
- update controls (no code changes during voting windows)
- logging:
  - no PII leakage
  - logs are tamper-evident and retained per policy

Expected:

- documented configuration baselines and drift detection

### 4. Denial-of-Service and Degraded-Mode Drills (Safe)

Within staging, simulate load and failure:

- elevated request rates against challenge/cast endpoints
- partial dependency outages (BB unavailable, chain unavailable, monitor unavailable)
- network partition scenarios for a subset of clients

Expected:

- continuity behavior matches PRD principles:
  - voters are not turned away solely due to network failure
  - the system degrades to safe alternatives (queueing, alternate gateways, provisional paths)

## Penetration Test Case Library (30 Tests)

Use these as a consistent internal baseline before paying for external pentesting.

Notes:

- Run only against systems you own/control (staging).
- Keep it deterministic: record exact inputs, timestamps, and expected error codes.
- Prefer "invariant tests" over bug class fishing. This protocol has specific properties;
  try to break those properties and verify detection and safe failure.

### Protocol / Invariants (PT01-PT14)

PT01. **Challenge replay (single-use)**

- Steps: issue one challenge; perform a successful cast; attempt a second cast using the same `challenge_id` + `challenge`.
- Expect: second cast rejected deterministically; no state corruption; no second receipt.
- Evidence: request/response logs; challenge state (consumed); error code.

PT02. **Challenge expiry**

- Steps: issue a short-lived challenge; wait past `expires_at`; attempt cast.
- Expect: rejected as expired; retryable guidance to request a new challenge.
- Evidence: gateway time source; error code; client guidance text.

PT03. **Challenge mismatch**

- Steps: use a valid `challenge_id` but an incorrect `challenge` value in the cast request.
- Expect: rejected as invalid proof / invalid challenge; no state change.
- Evidence: error code; audit log entry with safe details (no secret disclosure).

PT04. **Manifest mismatch (wrong `manifest_id`)**

- Steps: keep `election_id` and `jurisdiction_id` the same; alter `manifest_id` in the cast request.
- Expect: rejected; no BB append; no anchor write.
- Evidence: error code; absence of BB leaf and VoteChain anchor.

PT05. **Cross-election binding failure**

- Steps: attempt to cast with `election_id` that does not match the active manifest.
- Expect: rejected; no state change.
- Evidence: error code; logs show binding mismatch without leaking sensitive internals.

PT06. **Cross-jurisdiction binding failure**

- Steps: attempt to cast with `jurisdiction_id` that does not match the active manifest.
- Expect: rejected; no state change.
- Evidence: error code; logs show binding mismatch.

PT07. **Idempotency replay (same body)**

- Steps: submit a valid cast request with an idempotency key; then resend the identical request with the same idempotency key.
- Expect: deterministic same outcome; no double-write to BB/VoteChain; no second receipt.
- Evidence: idempotency store entry; event counts unchanged.

PT08. **Idempotency key body mismatch**

- Steps: reuse the same idempotency key with a request body that differs by one field.
- Expect: deterministic mismatch error; must not accept under ambiguity.
- Evidence: stored request hash; mismatch response; no BB/VoteChain writes.

PT09. **Nullifier reuse (strict mode)**

- Steps: cast once successfully; attempt a second cast with the same nullifier under strict rules.
- Expect: rejected or routed to flagged/provisional handling per policy; must not become counted twice.
- Evidence: uniqueness oracle results; fraud flag records; tally input set.

PT10. **Nullifier derivation mismatch**

- Steps: provide a nullifier that does not match the required derivation for the credential/election.
- Expect: rejected as invalid proof/integrity mismatch.
- Evidence: error code; verifier logs.

PT11. **Eligibility proof invalid**

- Steps: submit a cast with an invalid eligibility proof (proof fails verification).
- Expect: rejected; must not consume nullifier; must not append to BB.
- Evidence: error code; no BB leaf; no anchor write.

PT12. **Ballot validity proof invalid (suite-specific)**

- Steps: submit a ballot that fails validity proof (or encodes an invalid ballot structure).
- Expect: rejected; no BB append; no anchor write.
- Evidence: error code; safe validation logs.

PT13. **Receipt tamper (offline verification)**

- Steps: take a valid receipt; alter one field; verify offline.
- Expect: signature and/or linkage checks fail deterministically.
- Evidence: verifier output; failed check name; reason.

PT14. **Receipt cross-election swap**

- Steps: try verifying a receipt under a different election/manifest context.
- Expect: fails binding/linkage checks.
- Evidence: verifier output and mismatch explanation.

### Bulletin Board / Non-Equivocation (PT15-PT21)

PT15. **STH signature verification**

- Steps: tamper with an STH signature or key id (`kid`) in a controlled dataset; verify.
- Expect: verification fails; monitors treat as critical.
- Evidence: monitor logs; alert event; preserved artifacts.

PT16. **Inclusion proof mismatch**

- Steps: modify one inclusion proof path hash; verify.
- Expect: inclusion verification fails.
- Evidence: verifier output; failing proof step.

PT17. **Anchor mismatch**

- Steps: construct a receipt with a `bb_leaf_hash` that has no corresponding VoteChain anchor.
- Expect: anchor check fails; receipt overall fails.
- Evidence: verifier output; missing anchor evidence.

PT18. **Split-view STH simulation**

- Steps: simulate two observers receiving different STHs for the same tree size (controlled staging).
- Expect: monitors detect inconsistency; alert; preserve evidence.
- Evidence: both STHs; signatures; proof transcripts; alert record.

PT19. **Missing consistency proof**

- Steps: force a condition where a consistency proof cannot be fetched or is omitted.
- Expect: monitors treat as high severity; evidence preserved.
- Evidence: monitor logs; error classification; alert.

PT20. **Invalid consistency proof**

- Steps: provide a malformed/invalid consistency proof (controlled).
- Expect: verification fails; alert.
- Evidence: proof bytes/hash; verifier output.

PT21. **BB append-only enforcement**

- Steps: attempt to delete/modify an existing BB entry in staging (administrative simulation).
- Expect: detection through anchor mismatch or monitor checks; evidence preserved.
- Evidence: anchors before/after; monitor divergence report.

### API Hardening / Parsing / Canonicalization (PT22-PT27)

PT22. **Unknown field rejection**

- Steps: add unknown top-level fields to cast requests and manifests.
- Expect: strict rejection (or strict ignore, if the spec says so); behavior must be consistent across nodes.
- Evidence: response; logs; conformance result.

PT23. **Type confusion**

- Steps: send wrong JSON types for critical fields (numbers where strings are required, arrays vs objects).
- Expect: deterministic schema failure; no partial processing.
- Evidence: error code; no state changes.

PT24. **Malformed base64url inputs**

- Steps: provide malformed base64url strings in fields like signatures/hashes.
- Expect: deterministic rejection; no crashes; no high CPU loops.
- Evidence: response; error classification; metrics.

PT25. **Canonicalization drift**

- Steps: submit logically-equivalent JSON with different key orders/whitespace; verify hashing/signing behavior stays stable.
- Expect: canonicalization produces identical bytes; signatures verify identically.
- Evidence: computed hashes; signature verification outputs.

PT26. **Duplicate JSON keys**

- Steps: test parser behavior with duplicated keys (language-dependent).
- Expect: explicit rejection or deterministic handling with conformance-defined rules.
- Evidence: parser logs; conformance result; documented behavior.

PT27. **Payload size limits**

- Steps: send oversized requests (cast, proof fetch, discovery endpoints).
- Expect: clean rejection with bounded resource usage.
- Evidence: response; server CPU/mem; rate limit telemetry.

### Availability / Overload / Safe Failure (PT28-PT30)

PT28. **Overload behavior (retry + alternate gateways)**

- Steps: induce overload in staging; observe client/server behavior.
- Expect: explicit retry guidance (backoff/jitter), optional alternate gateway list, and no silent failure loops.
- Evidence: error codes; client UX; metrics.

PT29. **Degraded dependency handling**

- Steps: take BB or VoteChain anchoring offline in staging during voting window simulation.
- Expect: defined degraded mode behavior; continuity goals met; auditable reconciliation plan.
- Evidence: incident timeline; audit anchors; reconciliation report.

PT30. **Slow-client resource exhaustion protection**

- Steps: simulate slow or stalled clients to ensure server timeouts and per-connection limits prevent resource exhaustion.
- Expect: bounded impact; other clients remain served; alerts fire.
- Evidence: server metrics; connection counts; timeout logs.

## What To Expect (Common Findings)

- Inconsistent canonicalization across services.
- Payload size / timeout defaults that enable cheap DoS.
- Missing audit anchors for some artifacts.
- Error responses that leak internals (stack traces, key IDs, validation detail).
- Rate limiting that unintentionally creates disenfranchisement risk.

## "Bypass" Mindset (Safe Guidance)

Focus on whether invariants hold under edge conditions:

- race conditions:
  - can two gateway instances accept conflicting states before finalization?
- partial failure:
  - can an attacker cause inconsistent BB views to different clients without detection?
- downgrade pressure:
  - can clients be pushed into a less-verified path under outage?

Do not write payload-level exploit recipes in repo docs.

## How To Patch

When a pentest finding occurs:

1. Reproduce in a minimal fixture.
2. Patch the enforcement point:
   - gateway validation, BB append-only checks, monitor alerting, chaincode rules
3. Add a regression test:
   - unit test for parsing/canonicalization
   - integration test for the invariant (replay/uniqueness/non-equivocation)
4. Update conformance vectors if the bug indicates spec ambiguity.
5. Retest and record the evidence link in the assurance index.

## What To Hand Off To Third Parties

- Staging architecture + access approach (accounts, VPN, allowlists)
- RoE from internal test, plus what you already tested
- Logs and artifacts for any fixed issues (before/after)
- Open issues you want them to focus on (high-risk areas)
