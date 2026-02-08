# Usability Testing: Phishing Gateway Defense (Internal)

Purpose:

- Validate that real voters can reliably distinguish a legitimate EWP gateway from a phishing
  gateway, and that the client UX enforces manifest verification before ballot display.
- Produce measurable evidence for EWP Mode 3 gate criteria (and harden Mode 1/2 UX anyway).

Primary reference:

- EWP PRD, Mode 3 gate G5: `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`

## Inputs (Before You Start)

- A prototype client UX that:
  - verifies manifest signature
  - cross-checks `manifest_id` against VoteChain anchors
  - shows the voter a clear "this is official" indicator that is hard to spoof
- A phishing simulation environment:
  - a look-alike gateway that fails verification in subtle ways
- A usability test plan:
  - participant recruitment plan (representative demographics)
  - success metrics
  - ethical review / informed consent procedures

## What To Do

### 1. Define Success Metrics

Examples:

- percent of users who correctly reject a phishing gateway
- time-to-decision under realistic pressure
- percent of users who can explain what the verification indicator means
- false reject rate (users rejecting legitimate gateways)

Expected output:

- `phishing-defense-metrics.md` with thresholds for pass/fail.

### 2. Run Structured User Tests

Test conditions:

- different device types and screen sizes
- varying network conditions (slow, captive portal-like behavior)
- different voter literacy levels (technical and non-technical)

Run:

- baseline test (no training)
- test after a short in-app explanation
- follow-up test after a delay (memory retention)

Expected output:

- an anonymized results summary with methodology.

### 3. Validate UX Against Spoofing

Pressure-test:

- can a phishing site replicate the indicator?
- does the UX rely on cues that users commonly ignore (URL bar, padlock icon)?
- does the client enforce a "hard stop" when manifest verification fails?

Expected output:

- `ux-spoofing-review.md` with concrete improvement tasks.

## What To Expect (Common Findings)

- Users do not reliably use URL/TLS cues.
- Too much "security text" leads to rapid skipping and blind acceptance.
- Indicators that are not bound to a cryptographic check become meaningless.

## How To Patch

Effective patch patterns:

- make verification automatic and non-optional (no "continue anyway")
- keep messaging short and repeatable
- use a small number of strong cues that are hard to spoof
- add a forced rehearsal step (users must demonstrate understanding once)
- treat high false-reject rates as a real risk (disenfranchisement via confusion)

## What To Hand Off To Third Parties

- Test plan + methodology
- Anonymized results and metrics
- UX flows and screenshots
- The exact cryptographic checks the client performs before showing a ballot
