# Privacy Audit (Internal Pre-3P)

Purpose:

- Validate that the implementation matches the privacy model described in the PRDs.
- Identify correlation channels that can deanonymize voters (even without explicit PII).

Primary references:

- VoteChain PRD: privacy model and principles in `PRD-VOTER-VERIFICATION-CHAIN.md`
- EWP PRD: separation of eligibility proof and ballot content in `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`

## Inputs (Before You Start)

- Data-flow diagrams for:
  - enrollment
  - election-day verification
  - casting and receipts
  - fraud case evidence bundles
  - monitoring and incident response
- A log/event taxonomy (what fields exist in logs/metrics/traces)
- A list of privacy claims you want to enforce (as testable statements)

## What To Do

### 1. Build a Privacy Claims Checklist

Convert narrative claims into testable checks:

- no PII on-chain
- poll worker does not see name/address/SSN/biometric
- receipts prove inclusion only, not vote selections
- eligibility proof plane and ballot content plane are logically separated
- timestamps/location metadata are bounded to reduce correlation risk
- evidence bundles are access-controlled and exportable with integrity proofs

Expected output:

- `privacy-claims.md` with pass/fail criteria.

### 2. Field Inventory (Everywhere Data Appears)

Inventory fields across:

- on-chain events
- BB leaves and STHs
- receipts
- logs and metrics
- support tickets and case management systems

For each field, record:

- necessity (why it exists)
- retention
- who can access it
- correlation risk (low/medium/high)

Expected output:

- `privacy-field-inventory.csv` (or markdown table).

### 3. Correlation Risk Testing

Evaluate realistic correlation attempts:

- time/location linkage:
  - does precision enable linking a DID to a real person at a polling place?
- network identifiers:
  - do gateways learn IP-to-voter mappings (Mode 3 gate concern)?
- operational logs:
  - do logs accidentally include stable identifiers that defeat pseudonymity?
- recovery flows:
  - does the recovery process create a centralized mapping that can be abused?

Expected output:

- `correlation-analysis.md` listing risks and mitigations.

### 4. Receipt and Proof Review (Coercion/Receipt-Freeness)

Confirm receipts and published artifacts:

- do not contain vote selections
- do not contain decryptable individual ballot content by any single party
- do not allow a voter to prove selections to a coercer

Expected output:

- `receipt-review.md` with a clear statement of what the receipt proves.

## What To Expect (Common Findings)

- Logs contain stable identifiers (session IDs, IP addresses, device fingerprints) that create
  avoidable correlation risk.
- Timestamps are more precise than needed and become a linking vector.
- "Debug mode" pathways leak sensitive fields during incidents.

## How To Patch

Preferred fixes:

- remove the field entirely (best)
- reduce precision (time bucketing, location hashing)
- scope access via RBAC and dual control
- store sensitive artifacts off-chain with encrypted storage and on-chain hashes only
- add test cases that fail builds if privacy constraints are violated

## What To Hand Off To Third Parties

- Data-flow diagrams
- Field inventory with correlation risk ratings
- Evidence that privacy claims are testable and tested
- A list of accepted residual risks (explicitly documented)
