# Vulnerability Disclosure Program (VDP) / Bug Bounty Readiness (Internal)

Purpose:

- Stand up a predictable process for receiving, triaging, and fixing security reports.
- Run an internal "dry run" before you open anything to the public.

Repository policy baseline:

- `SECURITY.md` (reporting channels and response targets)

## Inputs (Before You Start)

- A single intake channel with access controls:
  - GitHub Security Advisories (preferred) or a dedicated email queue
- A triage team roster with on-call coverage
- A severity rubric tailored to election risk:
  - integrity (outcome correctness)
  - availability (ability to vote / verify)
  - privacy (deanonymization / correlation)
  - disenfranchisement risk (false rejects, unfair rate limiting)
- A disclosure policy:
  - embargo windows
  - coordinated disclosure rules
  - what gets published when

## What To Do

### 1. Define Scope and Safe Harbor (Even If Private)

Document what is in scope for testing:

- staging environments, demo environments, specific endpoints
- explicit exclusions (production, third-party dependencies, social engineering limits)

Safe harbor language should state:

- authorized good-faith testing within scope will not be pursued legally
- researchers must not exfiltrate real sensitive data

Expected output:

- `vdp-policy.md` (internal) that can later be adapted for public release.

### 2. Define SLAs and Roles

At minimum:

- acknowledgment SLA
- triage decision SLA
- patch ETA expectation by severity
- who can approve emergency changes

Expected output:

- `triage-runbook.md` with a single owner per step.

### 3. Internal Dry Run

Have internal engineers act as "external reporters":

- submit reports in the intake channel with:
  - clear repro steps (safe)
  - impact statement
  - suggested fix

Triage team should:

- reproduce and confirm
- assign severity using the rubric
- create remediation tasks with deadlines
- communicate status updates on schedule

Expected output:

- a complete end-to-end rehearsal of intake -> fix -> disclosure.

### 4. Build a Fix-and-Retest Muscle

For each confirmed issue:

- patch with a regression test
- add a conformance vector if it was spec-related
- retest in staging
- write a short "lessons learned"

Expected output:

- a backlog that trends downward, with measurable time-to-fix.

## What To Expect

- Duplicates, false positives, and low-quality reports (plan for it).
- High-severity findings that are operational (misconfig, key handling) rather than code.
- Reports that are "the spec is ambiguous" (treat as real work).

## "Bypass" Mindset (Safe Guidance)

Assume reporters will probe:

- replay and race conditions
- parsing/canonicalization drift
- rate limiting and overload paths
- key rotation and trust chain weaknesses
- privacy/correlation fields in logs and receipts

Focus on building deterministic defenses and clear error behavior.

## How To Patch

1. Patch the enforcement point, not the symptom:
   - if replay is possible, fix challenge lifecycle and binding, not just error text
2. Add a regression test or vector
3. Update documentation:
   - PRD / conformance / runbooks as needed
4. Track to closure with a retest timestamp and evidence link

## What To Hand Off To Third Parties

- VDP policy + severity rubric
- Triage runbooks and SLAs
- A sanitized "recent findings" report (classes of issues, not sensitive details)
- Evidence that you can fix and retest quickly
