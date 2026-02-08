# Plan: VoteChain + EWP Security Assurance (POC -> Pilot -> Production)

This repo contains:

- `PRD-VOTER-VERIFICATION-CHAIN.md` (VoteChain: eligibility + verification)
- `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md` (EWP: cast-to-tally integrity)
- `src/votechain-poc/poc.ts` (local-only browser POC simulating EWP primitives)

This plan turns the PRD-level requirements (red team, bug bounty, audits) into a concrete
"how to" program, and calls out gaps that block pilot-grade confidence.

Internal step-by-step playbooks live in:

- `docs/votechain-assurance/`

## 1. Define What "Past POC" Means

Before doing more testing, align on the deployment target:

1. Mode 1 pilot (in-person only, polling-place devices) is the first credible milestone.
2. Mode 2 pilot (supervised facilities) is similar operationally, with added logistics.
3. Mode 3 (unsupervised remote) is gated and should not be the first success criteria.

For Mode 1/2 pilots, "past POC" should mean:

- A spec that is tight enough to test conformance (test vectors, wire formats, invariants).
- At least one reference implementation (gateway, bulletin board, monitor, trustee tooling).
- Independent adversarial testing (red team, pen test) with published findings.
- Independent audits (crypto review, implementation review, operational review).
- Operational readiness (key ceremonies, HSMs, incident response, update freeze rules).

## 2. Assurance Methods (What To Do, What You Get)

Each method below has:

- Inputs: what the team must prepare before testing starts
- Execution: what the testers do
- Outputs: what evidence you should end up with

### 2.1 Threat Modeling (Design-Level)

Inputs:

- Updated architecture diagrams for VoteChain and EWP (including trust boundaries).
- Explicit threat model tables per component: enrollment, credential recovery, poll devices,
  gateways, bulletin board, monitors, trustees, chaincode, oversight portal.
- A single "security properties" section that maps claims to mechanisms and assumptions.

Execution:

- Walk each trust boundary and list attacker capabilities (remote, insider, physical, supply chain).
- For each security property, identify how it can fail and how failure is detected.
- Produce a risk register with likelihood, impact, and mitigation plan.

Outputs:

- Versioned threat model doc.
- Risk register with owners and deadlines.
- A list of required security tests derived from the model.

### 2.2 Protocol Review + Cryptographic Audit (Spec-Level)

Inputs:

- Fully specified suites for:
  - eligibility proof verification (ZK suite, VK distribution, update process)
  - ballot encryption + ballot validity proofs
  - bulletin board append-only proof APIs (STH, inclusion, consistency proofs)
  - receipt format and offline verification trust chain
- Conformance test vectors for each suite.

Execution:

- Independent cryptographers review the protocol for:
  - privacy leaks and correlation channels
  - replay/cut-and-choose failure modes (Benaloh challenge + spoil path)
  - non-equivocation requirements (monitor coverage, BB consistency proofs)
  - key ceremonies and trustee threshold governance

Outputs:

- Written crypto review with findings and required changes.
- A conformance test suite definition (inputs/outputs, pass/fail).

### 2.3 Secure Implementation Review (Code-Level)

Inputs:

- A reference build that matches the spec (not a demo that diverges from it).
- Reproducible build story for polling-place clients and gateway services.
- Logging and telemetry event taxonomy for auditability.

Execution:

- Third-party code audit focused on:
  - input validation and canonicalization rules
  - signature verification boundaries
  - storage and key handling
  - downgrade and replay protection
  - error handling that can cause disenfranchisement (rate limits, overload behavior)

Outputs:

- Audit report with patches and retest results.
- Static analysis and dependency audit results as attachments.

### 2.4 Pen Test (App/Infra-Level)

Inputs:

- A realistic staging environment for Mode 1 (poll devices, gateway, BB, monitor).
- Test credentials and test elections with safe synthetic data.
- Clear "rules of engagement" and safe-harbor language for testers.

Execution:

- Attack services like a real adversary:
  - gateway API abuse, idempotency, replay, cache poisoning, rate limiting bypass
  - BB log tampering, equivocation attempts, STH manipulation
  - monitor blinding and alert suppression
  - misconfiguration hunts (TLS, headers, authz)

Outputs:

- A report that includes exploit paths, not just findings.
- A prioritized remediation plan and retest sign-off.

### 2.5 Red Team (End-to-End, Human + Physical + Insider)

Inputs:

- A scenario library with success criteria tied to election risk:
  - alter a counted outcome without detection
  - cause targeted disenfranchisement
  - compromise a poll device fleet or update channel
  - coerce voters in Mode 3 simulations (for gate validation)
- A blue-team runbook for detection and response during exercises.

Execution:

- Simulate realistic constraints:
  - physical access attempts
  - phishing enrollment/recovery staff
  - insider collusion (gateway operator, BB operator, trustee)
  - supply-chain compromise attempts (build system, signing keys)

Outputs:

- Red team report plus a public summary with redactions.
- Measured detection time, containment time, and recovery outcomes.

### 2.6 Bug Bounty / VDP (Continuous Ethical Hacking)

Inputs:

- Public policy: scope, safe harbor, severity rubric, reward bands, disclosure process.
- A stable target environment (staging) that can accept inbound testing traffic.

Execution:

- Run a standing program with SLA targets for acknowledgment, triage, fix, and disclosure.

Outputs:

- Quarterly transparency report (counts by severity, median time-to-fix).
- A backlog of hardening improvements driven by recurring classes of issues.

### 2.7 Operational Audit (Keys, Ceremonies, Change Control)

Inputs:

- Key management procedures:
  - HSM-backed signing keys (gateway receipts, BB STH signing)
  - trustee key ceremony transcripts + hash anchoring
  - rotation and revocation playbooks (including "lost credential media" scenarios)
- Software update policy:
  - "no changes during voting window"
  - emergency break-glass process with public audit trail

Execution:

- Independent auditors verify that:
  - ceremonies are reproducible and witnessable
  - keys are not exportable
  - access requires dual control where required
  - logs are tamper-evident and retention meets requirements

Outputs:

- Signed operational audit package.
- Action items that become pilot entry/exit criteria.

## 3. Gap Scan (From Current PRDs/POC)

This is a quick list of gaps that will come up immediately when you try to run the methods above.

### 3.1 Spec Gaps (Block Conformance / Auditability)

- EWP non-equivocation relies on "consistency proofs", but the concrete BB API surface for
  `get-consistency-proof` and proof format is not fully specified.
- EWP calls for HSM-backed keys and offline-verifiable receipts, but does not define a
  verifier trust chain and key rotation transparency mechanism (how clients learn new `kid` safely).
- VoteChain recovery is described as "Shamir recovery", but without:
  - threshold parameters
  - recovery agent selection and anti-collusion requirements
  - recovery ceremony logging and audit anchors
- VoteChain "lost device/card" behavior implies revocation and re-issuance, but the PRD
  does not explicitly define the revocation event semantics for lost credential media.
- Mode 1/2 certification gates are referenced as "EWP conformance + VoteChain integration
  certification", but a concrete conformance test suite and pass/fail rubric is not yet defined.

### 3.2 Implementation Gaps (Block Realistic Pen Testing)

- The repo POC is intentionally local-only. It is useful for explaining receipts and inclusion,
  but it cannot be used to validate:
  - multi-operator gateway diversity
  - monitor gossip coverage and alerting
  - HSM-backed keys and rotation
  - threshold decryption and tally proofs
  - real network and DoS failure modes

### 3.3 Ops / Governance Gaps (Block Pilot Readiness)

- Chaincode update governance is listed as an open question, but a pilot needs a concrete
  change-control policy, emergency patch policy, and public audit trail requirements.
- Data-feed oracle operations (death/judicial feeds) have SLAs, but the audit plan for feed
  integrity, replay prevention, and outage handling is not fully spelled out.
- VDP/bug bounty exists as a PRD bullet, but repo-level policy is currently a basic `SECURITY.md`
  without scope/safe-harbor/rewards/disclosure details.

## 4. Next Concrete Steps (Recommended)

1. Write a conformance-test outline for EWP:
   - test vectors for manifest signing, challenge binding, receipt verification
   - BB inclusion + consistency proof verification vectors
2. Add a "lost credential media" section to VoteChain PRD:
   - explicit revocation semantics and replacement issuance flow
3. Expand `SECURITY.md` into a real VDP policy:
   - scope, safe harbor, severity rubric, response SLAs, optional rewards language
4. Create a red-team scenario library document:
   - scenarios tied to security properties (P0-P7 / pillars) with measurable success criteria
