# VoteChain Production Architecture (Servers, Trust Boundaries, and Why)

This page maps the production alignment for the complete system:

- **VoteChain** (verification + fraud review evidence layer)
- **EWP** (cast-to-tally ballot integrity layer)

It focuses on "what runs where" and "why", and is written to be concrete enough to critique.

Notes:

- **Mode 1 (in-person)** and **Mode 2 (supervised)** are the primary targets for early pilots.
- **Mode 3 (unsupervised remote)** is explicitly gated and should not be treated as a default.

## 1. Two Planes (Minimize Correlation)

Production separates the system into two logical planes:

- **Eligibility / verification plane (VoteChain):** eligibility ZK proofs, nullifier uniqueness, revocations, fraud flags, audit anchors.
- **Ballot content plane (EWP):** encrypted ballots, public bulletin board, non-equivocation monitoring, threshold decryption, tally proofs.

They are linked only by **audit anchors** (hashes/commitments), not by voter identity or ballot plaintext.

## 2. Operator Categories (Who Runs What)

These are the distinct operator categories the architecture assumes:

- **Election authority (state/local):** enrollment operations, voter services, election definition, gateways (some or all), incident response.
- **VoteChain consortium:** permissioned ledger operators (federal + state + auditor + oversight categories) and supporting read APIs.
- **Independent trustees/guardians:** hold threshold key shares; participate in key ceremony and tally decryption/proof publication.
- **Independent monitors:** continuously fetch BB checkpoints and VoteChain anchors; detect equivocation and suppression.
- **External data sources (government feeds):** SSA/vital records/USCIS/passport feeds used at enrollment and for post-enrollment revocation signals.

## 3. Production Component Map (The Servers)

The minimal production build (Mode 1/2 pilot) includes the following server-side components.
Names are descriptive; implementations can vary as long as the interfaces and invariants are preserved.

- `enrollment-service`
  - Where: state enrollment offices (DMV/SSA partner desks, county offices, mobile units).
  - Why: identity proofing and recovery are operational processes, not internet flows.

- `attestation-issuer`
  - Where: election authority secured environment, HSM-backed signing keys.
  - Why: produces signed attestations for the five verification pillars without storing PII on-chain.

- `recovery-service`
  - Where: enrollment offices; in-person only for early phases.
  - Why: handles lost device/card scenarios via identity re-verification + Shamir recovery governance.

- `fraud-detection-engine`
  - Where: election authority secured analytics environment.
  - Why: ingests external signals (death/judicial/move patterns), emits `fraud_flag` events, routes cases.

- `oversight-portal`
  - Where: election authority + oversight team environment (role-gated).
  - Why: case management, evidence bundles, reviewer actions, and audit exports.

- `votechain-ledger` (permissioned network)
  - Where: 74 permissioned nodes operated across categories (Federal 6, State 50, Auditor 12, Oversight 6), using a category-quorum consensus policy.
  - Why: no single party can unilaterally rewrite or suppress verification or audit anchors.

- `votechain-read-api`
  - Where: multiple operators; cached and distributed.
  - Why: lets clients/monitors verify anchors without trusting a single gateway.

- `ewp-gateway` (multiple operators)
  - Where: at least two operator categories; geographically redundant.
  - Why: availability and anti-disenfranchisement; no single gateway is a single point of failure.

- `bb-log` (public bulletin board)
  - Where: publicly reachable service; can be multi-operator or replicated; append-only.
  - Why: transparency log for encrypted ballots and election artifacts.

- `bb-sth-signer` (STH signing service)
  - Where: HSM-backed key service operated by the BB operator(s).
  - Why: signs checkpoints (STHs) so equivocation is detectable when monitors compare and verify anchors.

- `monitor` (independent)
  - Where: run by independent parties (academic/NGO/media/government).
  - Why: detects inconsistent BB views (equivocation), missing anchors, and suppression attempts.

- `trustee-service`
  - Where: used by trustees/guardians (often on dedicated hardware/HSM environments).
  - Why: supports key ceremony, partial decryptions, and publication of decryption/shuffle proofs at tally.

- `tally-publisher`
  - Where: election authority public publication service.
  - Why: publishes the final tally artifact and the proof bundle; anchors the tally hash to VoteChain.

## 4. Alignment Diagram (Production Ownership + Data Paths)

```mermaid
flowchart LR
  %% Voter environments
  subgraph VOTERS["Voter Environments"]
    VC1["Voter Client (Mode 1: Polling Place Device)"]
    VC2["Voter Client (Mode 2: Supervised Kiosk)"]
    VC3["Voter Client (Mode 3: Personal Device - Gated)"]
  end

  %% Election authority (state/local)
  subgraph EA["Election Authority (State/Local)"]
    ENR["Enrollment Service"]
    ISS["Attestation Issuer (HSM)"]
    REC["Recovery Service (In-Person)"]
    FE["Fraud Detection Engine"]
    OP["Oversight Portal (Case Review)"]
    TP["Tally Publisher (Public Artifacts)"]
  end

  %% VoteChain consortium
  subgraph VCL["VoteChain Consortium (Permissioned Ledger)"]
    direction TB
    subgraph VCL_OPS["Node Operators (74 total)"]
      direction LR
      VF["Federal (6)"]
      VS["State (50)"]
      VA["Auditor (12)"]
      VO["Oversight (6)"]
    end

    VCLCQ["Category-Quorum Consensus"]
    VCLN["VoteChain Nodes (74)"]
    VCLW["VoteChain Write Gateway/SDK"]
    VCLR["VoteChain Read API (Public, Replicated)"]

    VF --> VCLCQ
    VS --> VCLCQ
    VA --> VCLCQ
    VO --> VCLCQ
    VCLCQ --> VCLN
    VCLW -->|submit tx| VCLN
    VCLN -->|serve queries| VCLR
  end

  %% EWP services
  subgraph EWP["EWP Services (Multiple Operators)"]
    G1["EWP Gateway A"]
    G2["EWP Gateway B"]
    G3["EWP Gateway C"]
  end

  subgraph BB["Bulletin Board (Public Append-Only Log)"]
    BLOG["BB Log + Inclusion/Consistency APIs"]
    STH["STH Signer (HSM)"]
  end

  %% Trustees and monitors
  subgraph TRUSTEES["Trustees / Guardians (Independent)"]
    TS["Trustee Service (Key Ceremony + Decrypt Proofs)"]
    T1["Trustee 1 (Share)"]
    T2["Trustee 2 (Share)"]
    TN["Trustee n (Share)"]
  end

  subgraph MON["Independent Monitors"]
    M1["Monitor (Academic)"]
    M2["Monitor (NGO)"]
    M3["Monitor (Media)"]
  end

  %% Enrollment and credential lifecycle
  ENR -->|identity checks| ISS
  ENR -->|lost device/card recovery| REC
  ISS -->|"pillar attestations (no PII)"| VCLW
  FE -->|fraud_flag events| VCLW
  OP -->|review actions| VCLW

  %% Client verification dependencies
  VC1 -->|verify manifest anchor, receipt anchors| VCLR
  VC2 -->|verify manifest anchor, receipt anchors| VCLR
  VC3 -->|verify manifest anchor, receipt anchors| VCLR

  %% EWP cast path (gateway diversity)
  VC1 -->|manifest/challenge/cast| G1
  VC1 -->|failover| G2
  VC2 -->|manifest/challenge/cast| G1
  VC3 -->|manifest/challenge/cast| G1

  %% Gateways write to BB and anchor to VoteChain
  G1 -->|append encrypted ballot| BLOG
  G2 -->|append encrypted ballot| BLOG
  G3 -->|append encrypted ballot| BLOG
  BLOG -->|issue STH| STH
  STH -->|anchor STH hash| VCLW
  G1 -->|anchor cast receipt + nullifier used| VCLW
  G2 -->|anchor cast receipt + nullifier used| VCLW
  G3 -->|anchor cast receipt + nullifier used| VCLW

  %% Monitors detect equivocation/suppression
  M1 -->|fetch STH + proofs| BLOG
  M2 -->|fetch STH + proofs| BLOG
  M3 -->|fetch STH + proofs| BLOG
  M1 -->|cross-check anchors| VCLR
  M2 -->|cross-check anchors| VCLR
  M3 -->|cross-check anchors| VCLR

  %% Trustees: key ceremony (pre-election) + tally (post-election)
  TS --- T1
  TS --- T2
  TS --- TN
  TS -->|publish PK_e + trustee set in manifest| G1
  TS -->|tally decrypt proofs + tally bundle| TP
  TP -->|anchor tally hash| VCLW
  TP -->|publish artifacts| BLOG
```

## 5. Why These Pieces Live Where They Do

This alignment is designed to satisfy the core claims without adding new "trust me" gaps:

- **No single point can silently alter outcomes**
  - Multiple gateways, independent monitors, append-only BB, and VoteChain anchors.

- **No single operator can decrypt individual ballots**
  - Threshold trustees hold shares; decryption occurs at tally with published proofs.

- **Clients do not have to trust a gateway**
  - Manifest and anchors are cross-checked via VoteChain read APIs.

- **Non-equivocation is externally detectable**
  - BB checkpoints are signed and anchored; monitors compare views and demand consistency proofs.

- **Operations stay inside existing election legal guardrails**
  - Identity proofing and recovery remain in-person processes for early phases.
  - Flagged cases route to provisional handling and auditable reviewer workflows.

## 6. "What Is Public" vs "What Is Private"

Public artifacts (everyone can fetch and archive):

- Election manifest + signing keys (or their identifiers) and VoteChain manifest anchors
- BB leaves (encrypted ballots) + STH history + inclusion/consistency proofs
- Cast receipts (do not reveal vote selections)
- Tally artifact + proof bundle + VoteChain tally anchors

Private / restricted artifacts (role-gated, never on-chain):

- Enrollment PII and identity verification evidence
- Fraud investigation case files containing sensitive evidence
- Trustee private shares and HSM internals
