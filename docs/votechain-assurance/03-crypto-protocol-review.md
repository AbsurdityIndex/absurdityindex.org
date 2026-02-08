# Crypto + Protocol Review (Internal)

Purpose:

- Prepare the protocol and spec package so that an external crypto audit is efficient,
  measurable, and not blocked by ambiguity.
- Identify high-risk design gaps early (before implementation hardening).

Primary references:

- VoteChain PRD: `PRD-VOTER-VERIFICATION-CHAIN.md`
- EWP PRD: `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`

## Inputs (Before You Start)

- A list of claims you want reviewers to validate:
  - privacy claims (what is hidden from whom)
  - integrity claims (what cannot be altered without detection)
  - availability/continuity claims (what happens in outages)
- Concrete suite selections (or a short list with clear decision criteria)
- Draft conformance vectors (from `02-ewp-conformance-testing.md`)

## What To Do

### 1. Normalize the Spec Into "Audit-Ready" Form

For each major protocol mechanism, ensure you have:

- Threat addressed
- Security property claimed
- Assumptions
- Precise statement of what is proven vs what is operationally controlled
- Pass/fail acceptance criteria and testability

Expected output:

- `audit-questions.md` that asks auditors direct questions with yes/no answers and rationale.

### 2. Review Cryptographic Binding and Domain Separation

Check that every signature/proof binds to the right context:

- `election_id` and `jurisdiction_id`
- `manifest_id`
- challenge nonce (anti-replay)
- nullifier (uniqueness anchor)
- deployment_mode (for audit metadata, not validity)

Check that every hash has a clear domain separator (prefix).

Expected output:

- A list of all signed/proved payloads and their exact byte-serialization inputs.

### 3. Privacy + Correlation Review

Pressure-test the privacy model:

- Can time/location metadata correlate a DID to a person?
- Can gateway operators correlate IP/network identifiers to voters (Mode 3 gate concern)?
- Do receipts accidentally become "vote receipts" (coercion risk)?
- Can any single party decrypt individual ballots?

Expected output:

- A "privacy leakage matrix" listing each metadata field and the correlation risks.

### 4. Non-Equivocation and Monitor Coverage

Non-equivocation is only as strong as:

- BB consistency proof semantics
- monitor diversity + uptime
- alerting and public transparency rules

Expected output:

- A clear spec and enforcement mechanism for monitor selection, accountability, and failure handling.

### 5. Key Ceremony + Rotation Review

Ensure the protocol includes:

- explicit key ceremony transcript requirements
- what gets anchored on-chain (hashes of transcripts, key IDs)
- rotation rules (how new `kid` is published and trusted)
- revocation rules (what happens if a key is suspected compromised)

Expected output:

- `key-ceremony.md` and `key-rotation.md` drafts with concrete steps and evidence artifacts.

## What To Expect (Typical Audit Findings)

- Ambiguous canonicalization rules (hashes/signatures disagree across implementations).
- Under-specified upgrade/change-control processes (how chaincode or policy changes happen).
- Hidden correlation channels (timestamps, network identifiers, recovery flows).
- Insufficiently specified negative cases (what MUST fail and how errors are surfaced).

## Adversarial Design Reviews To Run Internally (Safe)

These are design-level "how could this fail" questions:

- If a gateway colludes with a BB operator, what evidence still prevents undetectable tampering?
- If a trustee set is partially compromised, what threshold still prevents single-party decryption?
- If a monitor coalition is missing or censored, how is equivocation detected and what is the operational response?
- If eligibility proofs are correct but the client is malicious, what protocol features still enable cast-as-intended audits?

## How To Patch

When a review finds a gap:

1. Patch the PRD with a concrete rule:
   - the exact field list to bind, and exact encoding
   - measurable gates (for Mode 3 or for pilot certification)
2. Add conformance vectors that lock down the rule
3. Implement with tests that prove the negative cases fail
4. Add governance/ops requirements where crypto cannot solve the problem

## What To Hand Off To Third Parties

External crypto reviewers should get:

- A "claims list" with acceptance criteria
- A complete set of signed/proved payload definitions
- Conformance vectors
- Key ceremony and rotation procedures
- A list of open questions with proposed resolutions
