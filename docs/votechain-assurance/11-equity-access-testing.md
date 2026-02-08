# Equity and Access Testing (Internal)

Purpose:

- Validate that verification/casting paths do not create a two-tier system:
  - higher failure rates for certain populations
  - longer verification times that effectively deter voting
  - device/network requirements that exclude voters
- Produce measurable evidence aligned with PRD requirements and Mode 3 gate criteria.

Primary references:

- VoteChain PRD: Accessibility & Equity section in `PRD-VOTER-VERIFICATION-CHAIN.md`
- EWP PRD: Mode 3 gate G6 in `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`

## Inputs (Before You Start)

- A test matrix that covers:
  - device types (low-end phones, older devices, assistive tech)
  - network conditions (no internet for voter, slow networks, intermittent)
  - language and accessibility needs
  - enrollment channel variants (assisted, mobile units, in-office)
- A measurement plan:
  - what metrics will be collected
  - how data is anonymized and stored

## What To Do

### 1. Define Key Metrics and Thresholds

Examples:

- verification time distribution by cohort (median, p95)
- failure/escalation rates by cohort
- provisional ballot rates by cohort
- support burden (calls per 1k voters) by cohort

Expected output:

- `equity-metrics.md` with explicit "if X is worse than Y by more than Z%, investigate" rules.

### 2. Run End-to-End Exercises With Representative Users

Cover:

- assisted enrollment (low digital literacy)
- no smartphone path (secure card path)
- disability access (screen readers, large text, seated kiosks)
- non-biometric path (PIN/passphrase + possession + poll worker attestation)

Expected output:

- anonymized results summary + a backlog of fixes.

### 3. Stress the "No Internet Required For Voter" Claim

Validate:

- polling-place devices provide connectivity; voter does not need a data plan
- degraded mode behavior does not disproportionately affect certain locations/populations

Expected output:

- `offline-and-degraded-mode-equity.md` describing observed disparities and fixes.

## What To Expect (Common Findings)

- UX that is fine for engineers but confusing for low-literacy users.
- Accessibility regressions (labels, focus order, audio prompts).
- Rate limiting / fraud heuristics that trigger more often for certain cohorts.

## How To Patch

Patch patterns:

- simplify flows; reduce steps and cognitive load
- make alternate paths first-class (not hidden or "fallback only")
- ensure human support channels exist and are staffed
- treat disproportional provisional rates as a defect until explained and mitigated

## What To Hand Off To Third Parties

- Test matrix and methodology
- Anonymized metrics by cohort
- Identified disparities + remediation plan
- Evidence that alternate paths are operationally supported, not theoretical
