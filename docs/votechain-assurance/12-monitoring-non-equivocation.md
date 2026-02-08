# Monitoring and Non-Equivocation Testing (Internal)

Purpose:

- Validate EWP non-equivocation claims:
  - the bulletin board (BB) cannot show different histories to different observers without detection
- Stand up monitor operations early, because cryptography alone does not create transparency.

Primary reference:

- EWP PRD: non-equivocation and monitor requirements in `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`

## Inputs (Before You Start)

- A BB implementation that supports:
  - signed tree heads (STHs)
  - inclusion proofs
  - consistency proofs
- A VoteChain anchoring mechanism for STH roots
- At least 3 monitor instances (ideally run by different teams even internally)
- Alerting:
  - paging for equivocation signals and monitor downtime

## What To Do

### 1. Define Monitor Responsibilities

Each monitor should:

- fetch new STHs from BB
- fetch anchors from VoteChain
- verify signature validity and anchor linkage
- request and verify consistency proofs across STH history
- gossip STHs to peer monitors (or publish to a shared transparency channel)

Expected output:

- `monitor-spec.md` describing polling cadence, gossip mechanism, and alert thresholds.

### 2. Validate Consistency Proof Semantics

Before any equivocation simulation:

- ensure consistency proofs are well-defined and verifiable
- ensure "missing proofs" are treated as high-severity signals

Expected output:

- a conformance vector set for consistency proofs.

### 3. Simulate Non-Equivocation Failures (Controlled)

In a controlled staging environment, test:

- inconsistent STH views (two clients see different roots at the same size)
- missing anchors (BB root not anchored when it should be)
- delayed anchors (anchors arrive late)
- monitor downtime (coverage gaps)

Expected:

- monitors detect, alert, and preserve evidence artifacts (STHs, signatures, proof transcripts).

## What To Expect (Common Gaps)

- Monitors do not agree on "what constitutes failure" (spec ambiguity).
- Alerting is noisy or absent, leading to slow detection.
- Consistency proof APIs are missing or underspecified.

## How To Patch

1. Tighten the spec:
   - define what monitors MUST fetch, what MUST be verified, and what is a critical alert
2. Add conformance tests for:
   - STH signatures, anchor linkage, consistency proof verification
3. Improve operational monitoring:
   - uptime SLOs, alert routing, on-call runbooks
4. Re-run the simulation until:
   - detection time and evidence quality meet targets

## What To Hand Off To Third Parties

- Monitor design and runbooks
- Evidence from controlled equivocation simulations
- Conformance vectors for STH/inclusion/consistency proofs
- Uptime/coverage reports during simulated voting windows
