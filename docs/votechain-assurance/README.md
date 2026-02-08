# VoteChain Assurance Playbooks (Internal)

These playbooks are for internal teams to do pre-flight assurance work before involving
independent third parties (audit firms, red teams, certification labs). They are written
to match the PRDs in this repo, but they are not a replacement for independent review.

Scope:

- VoteChain (eligibility/verification): `PRD-VOTER-VERIFICATION-CHAIN.md`
- EWP (ballot integrity cast-to-tally): `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`
- Local-only demo (NOT production): `src/votechain-poc/poc.ts` and `src/pages/votechain/poc/*`

Non-goal:

- This repo's POC is not a secure system. Treat it as an educational harness for receipts,
  inclusion proofs, and "binding" concepts. Most playbooks below assume a future reference
  build that runs as real services (gateway, bulletin board, monitors, trustees).

Important rule:

- Do not run any offensive testing against systems you do not own or explicitly control.

## Playbooks

Recommended order (left-to-right is earlier):

- `14-attack-case-library.md` (public adversarial test cases; expected defenses + patch patterns)
- `01-threat-modeling.md` (design risks -> test plan)
- `02-ewp-conformance-testing.md` (spec -> test vectors -> interoperability)
- `03-crypto-protocol-review.md` (protocol-level review checklist)
- `09-privacy-audit.md` (privacy claims -> data-flow validation)
- `10-usability-phishing-defense.md` (EWP gateway phishing defense)
- `11-equity-access-testing.md` (equity/access parity validation)
- `04-secure-code-review.md` (implementation review + internal audit prep)
- `12-monitoring-non-equivocation.md` (BB equivocation detection + monitor ops)
- `13-load-failover-drills.md` (DoS, degraded mode, continuity)
- `05-penetration-testing.md` (staging pentest, pre-3P)
- `06-red-team-exercises.md` (end-to-end scenarios, insider/physical/supply-chain)
- `08-operational-audit.md` (keys, ceremonies, change control, incident response)
- `07-bug-bounty-vdp.md` (VDP + optional bounty readiness)

## Internal Output Expectations

Every playbook should produce artifacts that are easy to hand to third parties:

- A single "assurance index" spreadsheet or markdown table:
  - claim -> test -> result -> evidence link -> owner -> next retest date
- A risk register with severities and deadlines
- A changelog of security-relevant changes (what changed, why, who approved)

## Repo Pointers (For Internal Dry Runs)

Local demo paths (run `npm run dev`, then open these in the browser):

- `/votechain/poc` (index)
- `/votechain/poc/vote` (challenge + cast)
- `/votechain/poc/verify` (verify receipt)
- `/votechain/poc/dashboard` (BB + anchors + tally)

Code entry points:

- `src/votechain-poc/poc.ts`:
  - `issueChallenge()` / `castBallot()` / `verifyReceipt()` / `publishTally()`
