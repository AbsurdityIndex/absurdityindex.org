# Threat Modeling (Internal)

Purpose:

- Turn PRD security claims into explicit assumptions, failure modes, and a test plan.
- Produce a risk register that drives what the red team / auditors should focus on.

Primary references:

- VoteChain PRD: `PRD-VOTER-VERIFICATION-CHAIN.md`
- EWP PRD: `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`

## Inputs (Before You Start)

- A current architecture diagram with trust boundaries:
  - voter client, poll device, enrollment authority, recovery agents, gateway, bulletin board,
    monitors, trustees, chain nodes, oversight portal, data-feed oracles
- A list of security properties you are claiming:
  - VoteChain: "five verification pillars" + fraud flag lifecycle + provisional-first guardrail
  - EWP: P0-P7 (cast-as-intended, recorded-as-cast, counted-as-recorded, non-equivocation, etc.)
- A list of deployment modes you are targeting (Mode 1/2/3)

## What To Do

### 1. Asset Inventory

Write down assets and why they matter:

- Eligibility credential material (voter-controlled keys / secure cards)
- Enrollment authority signing keys
- Gateway receipt signing keys
- Bulletin board STH signing keys
- Trustee keys / threshold ceremony transcripts
- Chaincode update keys / governance process
- Operational logs and fraud case evidence bundles
- Availability of polling-place verification and casting flows

Expected output:

- `assets.md` listing each asset, where it lives, who can access it, and worst-case compromise impact.

### 2. Trust Boundaries and Assumptions

For each component boundary, document:

- What is trusted (if anything)
- What is untrusted
- What must be cryptographically verified vs operationally controlled

Do not accept implicit assumptions like "TLS is enough" or "HSM solves it".

Expected output:

- `trust-boundaries.md` with diagrams and a table of assumptions.

### 3. Attacker Profiles (Capability Models)

Use attacker models already referenced in the PRDs (insiders, compromised clients, coercers,
physical access, DDoS, supply chain). For each profile, state:

- Access (network-only, physical, privileged, supply-chain)
- Goals (alter outcome, disenfranchise, deanonymize, corrupt audit trail)
- Constraints (time window, detection tolerance)

Expected output:

- `attackers.md` used as shared language across teams.

### 4. Claim-to-Mechanism Mapping

Build a matrix:

- Claim (property / goal)
- Mechanism (what enforces it)
- Assumptions (what must remain true)
- Detection (how we notice failure)
- Recovery (how operations continue without disenfranchisement)

Example claim categories to cover:

- Nullifier uniqueness / anti-duplication
- Replay resistance (challenge binding)
- Non-equivocation (BB consistency + monitor gossip)
- Key compromise detection and rotation
- Coercion mitigations (Mode 3 only; must not block Mode 1/2)
- Privacy and correlation (time/location/IP)
- Degraded mode / offline-continuity behaviors

Expected output:

- `claims-matrix.md` (this becomes your test plan backbone).

### 5. Risk Register + Prioritization

Create a risk register row per failure mode:

- Risk description
- Impact: integrity, availability, privacy, disenfranchisement
- Likelihood (with justification)
- Detection path (what signals will show it)
- Owner and deadline
- "Entry/exit criteria" (what must be proven before a pilot)

Expected output:

- `risk-register.md` plus a single prioritized "top 10" for leadership.

## "Bypass" Thinking (Safe Internal Exercises)

Do not write exploit playbooks. Instead, pressure-test assumptions with questions like:

- If one gateway operator is malicious, can they cause undetectable outcome changes?
- If a poll device fleet is compromised, what mechanisms still detect or bound the damage?
- If monitors go down, how quickly does non-equivocation detection degrade?
- If a key is rotated under duress, how do clients learn the new key without trusting a single channel?
- Can an attacker force false "duplicate nullifier" conflicts at scale (denial via conflicts)?

Expected result:

- You should discover places where the PRDs say "must" but do not define measurable criteria
  or operational enforcement mechanisms. Those are gaps to close before external testing.

## How To Patch Gaps

When you find an ambiguity or missing requirement:

1. Patch the spec (PRD) first:
   - define the invariant precisely
   - define pass/fail test criteria
2. Add it to the conformance suite (even if only as a stub/test vector TODO)
3. Implement the enforcement and add a regression test
4. Update the claims matrix and risk register

## What To Hand Off To Third Parties

Third-party auditors/red teams should receive:

- Architecture + trust boundaries
- Attacker profiles
- Claims matrix (what properties you think you have)
- Risk register (where you think you are weak)
- Clear "pilot mode" target (Mode 1/2/3) and what is in-scope
