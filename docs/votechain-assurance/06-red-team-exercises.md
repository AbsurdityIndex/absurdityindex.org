# Red Team Exercises (Internal Pre-3P)

Purpose:

- Simulate end-to-end attacks that combine technical, human, and operational vectors.
- Validate detection and response, not just prevention.
- Produce a scenario library and measurable outcomes before hiring external red teams.

This is not a substitute for independent red teaming.

## Inputs (Before You Start)

- Target pilot mode (Mode 1 recommended for first exercises)
- A staging environment that resembles production topology (multi-operator where possible)
- A blue-team runbook:
  - alerting channels, on-call rotations, escalation, comms templates
- A set of "stop conditions":
  - anything that risks spilling secrets outside staging
  - anything that causes uncontrolled harm (disable and roll back)

## What To Do

### 1. Build a Scenario Library (Write It Down)

Each scenario must define:

- goal (integrity, availability, privacy, disenfranchisement)
- attacker capability assumptions
- success criteria (measurable)
- expected detection signals and response steps
- artifacts to capture (logs, anchors, proofs, receipts)

Recommended scenario themes (Mode 1/2):

- Supply chain:
  - compromised build pipeline or signing key abuse
- Insider:
  - malicious operator at a gateway/BB/monitor organization
- Physical:
  - poll device tampering attempts and attestation failures
- Availability:
  - coordinated traffic surges causing degraded mode behavior
- Audit integrity:
  - attempts to create inconsistent public views of BB state (equivocation)

Expected output:

- `scenarios.md` plus a scoring rubric.

### 2. Run "Purple Team" Drills First

Start with cooperative drills:

- red team announces which class of attack is being simulated
- blue team practices detection, triage, and containment
- observers record timings and errors

Expected output:

- a set of runbooks that actually work under stress

### 3. Move to Blind Exercises

Only after purple drills:

- run scenarios with limited prior notice
- measure time-to-detect and time-to-contain
- verify evidence chain integrity for every incident

Expected:

- gaps will be operational, not purely cryptographic

## What To Expect (Common Gaps)

- Alert fatigue: too many low-signal alerts, missed high-signal events.
- Missing "owner" for key decisions (who can rotate keys, who can halt).
- Insufficient audit anchoring for incident artifacts.
- Confusion about degraded-mode rules and voter-facing messaging.

## "Bypass" Mindset (Safe Guidance)

Treat the exercise as "can we make a bad thing happen without being noticed":

- can a malicious operator cause inconsistent logs?
- can a failure cascade into unsafe defaults?
- can an attacker induce a downgrade to a less-verifiable path?

Do not publish step-by-step exploit instructions in repo docs.

## How To Patch (After Each Exercise)

1. Write a short postmortem:
   - what happened, detection signals, containment, user impact risk
2. Patch:
   - runbooks and ownership boundaries (often the biggest improvement)
   - monitoring thresholds and alert routing
   - spec requirements if an assumption was invalid
   - code fixes + regression tests for any discovered technical weakness
3. Re-run the scenario until:
   - detection and containment meet targets

## What To Hand Off To Third Parties

- Scenario library + scoring rubric
- Prior exercise outcomes and evidence
- Blue-team runbooks and on-call structure
- Known weak points you want external teams to pressure-test

