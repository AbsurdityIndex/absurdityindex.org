# Attack Case Library (Public, Non-Weaponized)

Purpose:

- Publish concrete adversarial test cases that the public can critique and improve.
- Make it easy to verify that defenses work by providing repeatable negative tests and
  expected outcomes.
- Provide patch patterns and regression test guidance so fixes stick.

Important:

- Do not use this document to attack systems you do not own or explicitly control.
- This library is written to avoid step-by-step exploit instructions that would be
  directly weaponizable against real systems. It focuses on *verifying invariants* and
  *detecting failures* in controlled environments.

References:

- VoteChain PRD: `PRD-VOTER-VERIFICATION-CHAIN.md`
- EWP PRD: `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`
- Local-only demo harness: `/votechain/poc` (runs entirely in-browser)

## Format (Use This Template)

Each case should be written as:

- ID
- Target invariant / security property
- Preconditions
- Test (adversarial attempt)
- Expected defense behavior
- Evidence to capture
- Common root causes
- Patch patterns
- Regression tests to add

## Case Set A: Replay and Idempotency (Gateway)

### A01: Challenge Replay (Single-Use)

- Target: anti-replay via challenge lifecycle
- Preconditions: a valid challenge has been issued
- Test: attempt to use the same challenge for two casts in a controlled environment
- Expected: the second cast is rejected deterministically (no state corruption)
- Evidence: gateway logs, error code, idempotency records, receipt absence
- Root causes: challenges not marked used atomically; caching mistakes; multi-node races
- Patch patterns: atomic challenge consumption; bind challenge to cast inputs; consistent TTL checks
- Regression: integration test that replays a challenge and asserts deterministic rejection

POC validation (safe, local-only):

1. Open `/votechain/poc/vote`
2. Generate credential, request a challenge
3. Cast once (should succeed)
4. Cast again without requesting a new challenge (should fail)

### A02: Challenge Expiry Enforcement

- Target: freshness windows and expiry handling
- Preconditions: issue a challenge with a short TTL (or wait until it expires)
- Test: attempt to cast after expiry
- Expected: rejection with a retryable "expired" style error (and guidance to request a new challenge)
- Evidence: server-side timestamps, rejection code, client-facing message
- Root causes: clock skew handling; parsing timestamps incorrectly; inconsistent TTL across nodes
- Patch patterns: use a consistent time source; define skew tolerance; always compare in UTC
- Regression: test vector with a challenge `expires_at` in the past must fail

### A03: Idempotency-Key Body Mismatch

- Target: idempotency semantics prevent replay + confusion
- Preconditions: a valid cast request exists
- Test: reuse the same idempotency key with a different request body
- Expected: deterministic mismatch error; must not accept either request under ambiguity
- Evidence: idempotency store entry, request hashes, error response
- Root causes: hashing non-canonical bodies; partial hashing; storing only subset of fields
- Patch patterns: hash canonical request; reject unknown fields; store request hash and compare
- Regression: integration test that mutates one field and asserts mismatch rejection

## Case Set B: Binding and Canonicalization (Protocol)

### B01: Manifest Tamper (Signature Must Fail)

- Target: signed manifest integrity
- Preconditions: a signed manifest exists
- Test: in a controlled environment, mutate one manifest field (for example `not_after`) and verify
- Expected: signature verification fails; system rejects the manifest
- Evidence: verifier output; audit log line; conformance test result
- Root causes: verifying over non-canonical bytes; ignoring signature failures; trusting transport
- Patch patterns: strict canonical JSON; signature verify must be a hard gate
- Regression: conformance vector where a mutated manifest must fail

POC validation (safe, local-only):

- Use the receipt verification page to observe that signature checks fail when you edit signed fields.

### B02: Receipt Tamper (Offline Verification Must Fail)

- Target: receipt signature + linkage to BB and VoteChain anchor
- Preconditions: a valid receipt exists
- Test: modify a receipt field (for example `bb_leaf_hash`) and re-run verification
- Expected: receipt signature check fails OR linkage checks fail (depending on which field changes)
- Evidence: verification output; which check failed; proof artifacts
- Root causes: verifier not validating all fields; accepting partial linkage
- Patch patterns: verify receipt signature over exact defined payload; enforce full linkage
- Regression: unit tests for signature + linkage checks

## Case Set C: Uniqueness and Double-Counting (Nullifiers)

### C01: Nullifier Reuse (Strict Mode)

- Target: at-most-one-counted cast per (credential, election)
- Preconditions: strict uniqueness policy enabled
- Test: attempt a second cast using the same nullifier
- Expected: system rejects or routes to provisional/flagged handling; must not be counted twice
- Evidence: fraud flag records; uniqueness oracle queries; tally inputs
- Root causes: race conditions; uniqueness checked after append; inconsistent oracle reads
- Patch patterns: enforce uniqueness at the authoritative write point; make it auditable
- Regression: integration test with concurrent casts must never count two

## Case Set D: Bulletin Board Non-Equivocation (Transparency)

### D01: Split-View STH Detection

- Target: BB non-equivocation (cannot show different histories without detection)
- Preconditions: monitors exist; STH anchoring exists; consistency proofs exist
- Test: in a controlled environment, simulate two observers receiving different STHs for the same tree size
- Expected: monitors detect inconsistency; evidence is preserved; alert fires
- Evidence: the two STHs, signatures, proof transcripts, alert record, anchor mismatch evidence
- Root causes: missing consistency proof enforcement; monitor coverage gaps; poor alerting
- Patch patterns: define consistency proof APIs and hard-failure on missing proofs; monitor diversity SLAs
- Regression: simulated equivocation test in staging, plus automated consistency checks in monitors

## Case Set E: Overload and Disenfranchisement Risk (Availability)

### E01: Rate Limit Safety

- Target: overload handling does not become silent disenfranchisement
- Preconditions: realistic rate limiting is configured
- Test: trigger rate limiting in staging under load (controlled)
- Expected: clear retry guidance, safe backoff, alternate gateway list; logs show why
- Evidence: error codes; client messaging; metrics (429 rates); fallbacks used
- Root causes: aggressive global limits; no per-location shaping; missing backoff; retry storms
- Patch patterns: load shedding with explicit guidance; per-tenant limits; jittered backoff
- Regression: load tests that verify bounded error rates and no cascading failures

## How To Contribute

If you find a gap:

1. Open an issue with:
   - case ID(s)
   - what invariant you think can be broken
   - what evidence you observed
2. Submit a PR that includes:
   - a spec clarification (PRD or conformance rule)
   - a regression test or conformance vector
   - a short note in the case entry about what changed

