# Secure Code Review (Internal)

Purpose:

- Catch implementation flaws before external audits and penetration tests.
- Reduce the chance that security properties are undermined by "normal" web/app bugs:
  parsing differences, time handling, weak randomness, logging leaks, unsafe defaults.

This is written as if you have a real reference build (gateway/BB/monitor/trustees). For
this repo today, you can still apply the review mindset to the local POC:

- POC implementation: `src/votechain-poc/poc.ts`

## Pre-Review Setup

### 1. Establish Review Scope

Split code into domains:

- Protocol correctness (hashing, signing, canonicalization, proof verification)
- API boundary (input validation, authz, rate limiting, replay handling)
- Key handling (HSM interfaces, rotation, revocation)
- Storage (append-only logs, immutability guarantees, tamper evidence)
- Observability (logs, metrics, traces, audit exports)
- Privacy (PII handling, correlation fields, data minimization)

Expected output:

- `review-scope.md` listing repos/services/modules in scope.

### 2. Run Baseline Automated Checks

In this repo:

```bash
npm run verify
```

Security-specific checks already wired:

```bash
npm run security:ci
```

Expected output:

- a single CI log artifact per run
- any failures filed as issues with owners and deadlines

## What To Review (Checklist)

### Protocol / Crypto Boundary

Look for:

- Non-canonical signing and verification (signing "pretty JSON" instead of canonical bytes)
- Missing domain separators for hashes
- Weak comparisons (timing leaks) on sensitive tokens
- Bad randomness sources (non-cryptographic RNG)
- Time window checks that can be bypassed by clock skew or timezone mistakes

Expected:

- Every signature/proof verification includes explicit context binding:
  `election_id`, `jurisdiction_id`, `manifest_id`, `challenge`, and any policy gates.

### API and Input Validation

Look for:

- Accepting unknown fields that could create "confused deputy" behavior
- Parsing differences across languages (float vs int, unicode normalization, NaN)
- Missing payload size limits (DoS via large requests)
- Idempotency edge cases (same key, different body)

Expected:

- Explicit request schemas with strict rejection of unknown fields.
- Deterministic error codes that do not leak sensitive details.

### Replay and Uniqueness Enforcement

Look for:

- Challenges that are not single-use
- Challenge expiry not enforced, or enforced inconsistently across servers
- Nullifier uniqueness checked only in some paths (race conditions)

Expected:

- Replay attempts fail deterministically.
- Nullifier uniqueness is enforced in the authoritative system of record.

### Key Management and Rotation

Look for:

- Keys present in filesystem/env without HSM protection
- Rotation without a transparency mechanism (clients can be tricked into trusting a fake key)
- No "break glass" policy or audit trail for emergency changes

Expected:

- HSM-backed keys for receipt signing and STH signing (per EWP PRD guidance).
- Rotation events are auditable and verifiable.

### Logging and Evidence Integrity

Look for:

- Logging of PII or correlation identifiers in ways that violate the privacy model
- Unstructured logs that cannot be used for forensic reconstruction
- Missing audit anchors (evidence objects not hashed/anchored)

Expected:

- A clear event taxonomy, retention policy, and export format for auditors.

## Secure Code Review Test Checklist (30 Checks)

Use this as a consistent internal baseline. Each check is written as a "review test":
what to inspect, how to sanity-test it, and what evidence should exist.

If you are reviewing the in-repo POC, the primary file is:

- `src/votechain-poc/poc.ts`

### Canonicalization, Hashing, Encoding (CR01-CR10)

CR01. **Canonical JSON is used everywhere required**
- Inspect: all signing/hashing code paths.
- Test: create two JSON objects with different key orders; ensure canonicalization outputs identical bytes.
- Expect: stable `manifest_id`/hashes; signatures verify regardless of field order in source objects.

CR02. **Domain separation on hashes**
- Inspect: hash construction for nullifiers, BB leaf hashes, Merkle nodes.
- Test: ensure each hash input includes a clear prefix / domain tag.
- Expect: no cross-protocol hash reuse ambiguity.

CR03. **Base64url encoding/decoding is strict**
- Inspect: base64url helpers.
- Test: invalid characters and incorrect padding must be rejected deterministically.
- Expect: no crashes; no silent truncation.

CR04. **Signature payload bytes are unambiguous**
- Inspect: what exact bytes are signed for manifests, receipts, STHs, anchors.
- Test: verify sign and verify use the identical byte-serialization routine.
- Expect: no "verify works by accident" due to forgiving parsing.

CR05. **No implicit float/int parsing in security-critical fields**
- Inspect: JSON parsers and schema validation.
- Test: attempt to pass numbers where strings are expected; ensure schema rejection.
- Expect: deterministic errors; no coercion.

CR06. **Timestamp parsing and UTC comparisons**
- Inspect: expiry and "not_before/not_after" enforcement.
- Test: ensure comparisons are done in UTC with defined skew tolerance.
- Expect: no timezone bugs; no bypass via clock skew assumptions.

CR07. **Crypto suite identifiers are validated**
- Inspect: suite selection and enforcement.
- Test: attempt unknown `suite`/`zk_suite` values and ensure rejection.
- Expect: no downgrade acceptance.

CR08. **No mixed canonicalization standards**
- Inspect: use of JCS (RFC 8785) or equivalent.
- Test: ensure the same canonicalization standard is used in every language/component.
- Expect: conformance vectors pass across implementations.

CR09. **Binary-to-text conversions are explicit**
- Inspect: any use of string encoders/decoders around signatures/hashes.
- Test: ensure there are no implicit Unicode normalization surprises.
- Expect: stable bytes and hashes.

CR10. **Constant-time comparisons for secrets where applicable**
- Inspect: comparisons of tokens/keys/credentials in server code.
- Test: ensure equality checks do not leak timing in a meaningful way (language-specific).
- Expect: safe compare utilities are used where needed.

### Replay, Idempotency, Uniqueness (CR11-CR18)

CR11. **Challenge single-use enforcement is atomic**
- Inspect: challenge lifecycle update.
- Test: concurrent requests must not consume the same challenge twice.
- Expect: deterministic rejection on second use.

CR12. **Challenge expiry is enforced consistently**
- Inspect: where expiry is checked (gateway, downstream services).
- Test: expired challenges must always fail before any state mutation.
- Expect: no partial writes.

CR13. **Challenge is bound to cast request context**
- Inspect: proof/challenge binding rules.
- Test: try mixing a challenge with different `election_id`/`jurisdiction_id` in tests.
- Expect: verification fails.

CR14. **Idempotency semantics are exact**
- Inspect: idempotency key storage and request hashing.
- Test: same idempotency key + different body must fail; same body must return same outcome.
- Expect: no double-writes; deterministic responses.

CR15. **Nullifier uniqueness enforced at authoritative write point**
- Inspect: uniqueness checks and storage.
- Test: concurrent casts for same nullifier must not both be accepted as counted.
- Expect: one accepted, others rejected/flagged.

CR16. **Nullifier derivation verification**
- Inspect: derived vs provided nullifier checks.
- Test: mismatched nullifier must always fail early.
- Expect: no "accept then flag later" for cryptographic conflicts.

CR17. **Revoting extension (if implemented) is monotonic and auditable**
- Inspect: seq monotonic rules and tally selection.
- Test: seq regressions must fail; only final valid cast counted.
- Expect: earlier casts remain auditable but not counted.

CR18. **No state mutation on validation failure**
- Inspect: ordering of validation vs writes (BB, anchors, fraud flags).
- Test: intentionally invalid inputs must not write leaves or anchors.
- Expect: clean failure without side effects.

### Bulletin Board, Anchoring, Receipts (CR19-CR25)

CR19. **BB append-only semantics**
- Inspect: BB write path and storage immutability assumptions.
- Test: verify there is no "update leaf" operation; only append.
- Expect: immutability is enforced and auditable.

CR20. **STH issuance and signing**
- Inspect: STH signing key usage and payload definition.
- Test: any change to STH content must invalidate signature.
- Expect: verifier catches tampering.

CR21. **Inclusion proof correctness**
- Inspect: inclusion proof computation and verification.
- Test: mutate any path element; proof must fail deterministically.
- Expect: no false positives.

CR22. **Consistency proof support (if claimed)**
- Inspect: presence and verification of consistency proofs.
- Test: missing/invalid consistency proofs must be treated as high severity.
- Expect: monitor alerts and preserved evidence artifacts.

CR23. **Receipt contains inclusion-only data (no vote selections)**
- Inspect: receipt schema and its signed payload.
- Test: verify no selection plaintext appears; confirm no side-channel fields are included.
- Expect: receipt does not enable vote-selling/coercion proofs.

CR24. **Receipt linkage checks are strict**
- Inspect: receipt verification path.
- Test: swap `bb_leaf_hash` or `tx_id`; verifier must fail.
- Expect: no partial acceptance.

CR25. **Anchors are verifiable offline**
- Inspect: what a verifier needs to validate receipts/anchors.
- Test: ensure verification does not require privileged access or hidden keys.
- Expect: offline verification feasible with published keys/anchors.

### Logging, Privacy, Dependencies, Build (CR26-CR30)

CR26. **No PII in logs**
- Inspect: all log fields and event payloads.
- Test: run a synthetic election flow; scrape logs for disallowed fields.
- Expect: no names, addresses, biometrics, or correlating identifiers beyond spec.

CR27. **Error responses are non-leaky**
- Inspect: API error rendering.
- Test: intentionally invalid inputs; ensure no stack traces, secrets, or internal IDs leak.
- Expect: stable error codes + safe messages.

CR28. **Secrets are not committed**
- Inspect: repo scanning and CI checks (for this repo: `npm run security:scan-secrets`).
- Test: ensure secret scanner runs in CI and blocks merges on findings.
- Expect: secrets remain out of source and build artifacts.

CR29. **Dependency risks are managed**
- Inspect: dependency audit process and lockfile hygiene.
- Test: run `npm run security:audit` and triage high severity findings.
- Expect: SLA-driven remediation with owners and deadlines.

CR30. **Reproducible builds and signed releases (where applicable)**
- Inspect: build pipeline, artifact hashes, signing steps.
- Test: rebuild the same commit twice; compare artifact hashes where reproducible builds are claimed.
- Expect: transparent, auditable build outputs.

## Adversarial Review Tactics (Safe)

These are "review moves" to find bugs early:

- Trace one object end-to-end (manifest, cast request, receipt) and confirm the exact bytes
  used for hashing/signing are identical across creation and verification.
- Introduce benign field reordering in JSON fixtures and ensure canonicalization removes ambiguity.
- Fuzz boundary conditions:
  - empty arrays, huge arrays, missing required fields, extra unknown fields
  - timestamp edge cases (near expiration, leap seconds/clock skew handling)
- Review error handling for disenfranchisement risk:
  - rate limiting and overload must fail safely (alternate gateways, provisional paths)

## How To Patch (When You Find a Bug)

Use a consistent remediation loop:

1. Write a minimal reproduction (test or fixture).
2. Patch the implementation.
3. Add a regression test that fails without the patch.
4. Update the PRD/conformance vectors if the bug reveals a spec ambiguity.
5. Add a short postmortem note:
   - root cause category, affected invariants, and prevention step.

## What To Hand Off To Third Parties

- Review scope and architecture notes
- A list of known issues and fixes since last audit
- Conformance test results
- Secure build + dependency inventory (SBOM if available)
- Key management and rotation docs (even if mocked for staging)
