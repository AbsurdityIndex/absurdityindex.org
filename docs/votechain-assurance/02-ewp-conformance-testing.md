# EWP Conformance Testing (Internal)

Purpose:

- Make EWP implementable by multiple independent teams with interoperable results.
- Turn "should/must" language into test vectors and pass/fail checks.
- Catch spec ambiguity early, before crypto audits and certification labs.

Primary reference:

- EWP PRD: `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`

Related reference:

- VoteChain PRD (eligibility proof + nullifier semantics): `PRD-VOTER-VERIFICATION-CHAIN.md`

## What "Conformance" Means Here

An implementation is conformant if it:

- Parses/serializes objects exactly as specified (canonicalization, encoding).
- Verifies signatures/proofs exactly as specified.
- Enforces invariants (anti-replay, uniqueness, non-equivocation evidence).
- Produces verifiable artifacts (receipts, STHs, proofs) that independent verifiers accept.

## Inputs (Before You Start)

- A fully specified baseline suite (algorithms + parameters + proof systems) for:
  - eligibility proofs
  - ballot encryption
  - ballot validity proofs
  - BB log proofs (inclusion + consistency)
  - threshold decryption proof format (tally proofs)
- Normative encoding rules:
  - canonical JSON (JCS), base64url rules, hash domain separators, timestamp formats
- A minimal reference implementation plan:
  - `ewp-gateway`, `bb-log`, `monitor`, `trustee-service`

## What To Do

### 1. Define the Conformance Surface

Write down every message/object that crosses an interface boundary:

- Discovery document (`/.well-known/votechain-ewp`)
- Election manifest (signed)
- Challenge response (signed)
- Cast request (proofs, ciphertext, idempotency)
- Cast response (receipt or error)
- BB APIs (STH fetch, inclusion proof fetch, consistency proof fetch)
- Tally artifacts (threshold decrypt + proof objects)

Expected output:

- `conformance-surface.md` listing endpoint, method, request/response schemas, error codes.

### 2. Build Test Vectors

For each object type:

- Provide "golden" JSON input
- Provide expected derived values:
  - object hash (`manifest_id`, `ballot_hash`)
  - signature bytes
  - verification success/failure
- Provide negative vectors (must fail) that cover:
  - wrong canonicalization / key order differences
  - wrong base64url padding/charset
  - wrong domain separator / hash prefix
  - stale timestamp windows
  - mismatched `election_id`, `jurisdiction_id`, `manifest_id`

Expected output:

- `vectors/` directory containing signed artifacts and expected outputs.

### 3. Create a Conformance Harness

Build a harness that can:

- Spin up an implementation-under-test (IUT) in a reproducible way
- Replay test vectors against the IUT
- Verify outputs with an independent verifier implementation

Minimum harness requirements:

- Deterministic seeds where randomness would otherwise vary (for vector generation)
- Strict diffing of expected vs actual fields (do not ignore unknown fields)
- Artifact capture (full request/response logs, plus signed receipts)

Expected output:

- A `conformance-run.md` or script that produces a machine-readable report.

### 4. Add "Invariant Tests" (Not Just Schemas)

Conformance must include behavioral invariants:

- Challenge anti-replay:
  - challenge is single-use, has expiry, and is bound to the cast request inputs
- Idempotency:
  - reuse of idempotency key with different body must be rejected deterministically
- Nullifier uniqueness:
  - strict mode: second cast must not become "counted"
  - revoting extension (if enabled): only last cast counts, earlier casts remain auditable
- Receipt verification:
  - receipt signature and BB/anchor linkage must verify offline
- BB non-equivocation:
  - IUT must provide consistency proofs, monitors must detect mismatched views

Expected output:

- A "behavior" test suite that fails on invariants, not just JSON structure.

### 5. Minimal Negative Test Set (Cookbook)

Use a stable set of negative tests so regressions are obvious.

These names are suggestions; align expected codes to the PRD as it evolves:

| Test ID | Negative test (must fail) | Expected outcome |
| --------: | ---------------------------- | ------------------ |
| N01 | Manifest signature invalid | `EWP_BAD_MANIFEST` |
| N02 | Cast request does not match active manifest (`election_id`, `jurisdiction_id`, `manifest_id`) | `EWP_BAD_MANIFEST` |
| N03 | Challenge not found | `EWP_PROOF_INVALID` |
| N04 | Challenge expired | `EWP_CHALLENGE_EXPIRED` (retryable) |
| N05 | Challenge already used | `EWP_PROOF_INVALID` |
| N06 | Idempotency key reused with different body | `EWP_IDEMPOTENCY_MISMATCH` |
| N07 | Nullifier derivation mismatch | `EWP_PROOF_INVALID` |
| N08 | Eligibility proof invalid | `EWP_PROOF_INVALID` |
| N09 | Nullifier already used | `EWP_NULLIFIER_USED` |
| N10 | Ballot validity checks fail | `EWP_BALLOT_INVALID` |

## What To Expect (Common Early Failures)

- "Looks the same" JSON that hashes differently across implementations due to canonicalization drift.
- Time comparisons done with local timezones instead of absolute UTC.
- Base64url decoding differences (padding, invalid characters).
- Signature verification done over the wrong bytes (non-canonical JSON).
- Implicit assumptions about trust in transport (TLS) instead of explicit artifact verification.

## Adversarial Negative Tests To Include (Safe)

These are not exploit recipes. They are invariant pressure-tests:

- Replay the same challenge twice and ensure the second attempt fails deterministically.
- Alter exactly one field in a signed object and confirm verification fails (manifest, receipt, STH).
- Swap `election_id` across objects and ensure the system rejects cross-election mixing.
- Provide two different encodings of the "same" JSON and ensure canonicalization collapses them.
- Attempt to make two different requests share an idempotency key and confirm mismatch handling.

## How To Patch (If You Find Conformance Gaps)

1. Patch the PRD with:
   - explicit MUST-level encoding rules
   - explicit pass/fail conditions
2. Add or tighten test vectors to lock the behavior
3. Patch IUT code and add regression tests
4. Repeat until:
   - 2+ implementations pass the same vector suite

## What To Hand Off To Third Parties

Third-party certification/audit teams should receive:

- Conformance surface definition
- Full test vector set
- Harness runner + report format
- Known-deviation list (if anything is not final)
