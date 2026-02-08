# Load, Failover, and Degraded-Mode Drills (Internal)

Purpose:

- Validate availability and continuity claims under stress:
  - high traffic, partial outages, network partitions
- Ensure failure handling does not create disenfranchisement risks.

Primary references:

- VoteChain PRD: failure modes and fallbacks in `PRD-VOTER-VERIFICATION-CHAIN.md`
- EWP PRD: operational requirements and rate limiting guidance in `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md`

## Inputs (Before You Start)

- A staging environment that resembles intended deployment topology
- Load profiles:
  - expected peak request rates (challenge, cast, verify, BB proof fetch)
  - worst-case bursts (opening/closing windows, after media events)
- Degraded-mode rules:
  - what happens when BB is slow
  - what happens when VoteChain anchoring is slow
  - what happens when a gateway is overloaded (alternate gateways)
- Observability:
  - latency percentiles, error codes, queue depths
  - monitor coverage and alerting

## What To Do

### 1. Baseline Load Test

Measure:

- p50/p95/p99 latency by endpoint
- error rates by error code
- resource saturation points (CPU, memory, storage, network)

Expected output:

- `load-baseline.md` with graphs and a "capacity estimate" statement.

### 2. Failure Injection (Controlled)

Simulate:

- one gateway instance down
- BB slowed or unavailable
- VoteChain anchor writes delayed
- monitor downtime
- partial network partition (some poll devices lose connectivity)

Expected:

- safe behavior:
  - no silent acceptance of unverifiable states
  - continuity paths are explicit (queue, alternate gateway, provisional handling)

### 3. Rate Limiting and Overload Safety

Validate:

- rate limiting is deterministic and does not leak sensitive state
- overload responses provide safe next steps (retry/backoff, alternate gateways)
- policies do not disproportionately affect certain regions/cohorts (equity tie-in)

Expected output:

- `overload-behavior.md` with explicit "good" and "bad" patterns observed.

## What To Expect (Common Findings)

- Timeout and retry storms amplify load during partial outages.
- Strict rate limiting can become an accidental disenfranchisement mechanism.
- Missing backpressure causes memory growth and cascading failures.

## How To Patch

Patch patterns:

- introduce backpressure and queueing
- implement consistent retry guidance (with jitter/backoff)
- provide alternate gateway lists and transparent status pages
- define and test a "degraded but safe" operating mode explicitly

## What To Hand Off To Third Parties

- Load test methodology and results
- Failure-injection scenarios and outcomes
- Degraded-mode rules and evidence they work
- Observability dashboards and alert runbooks
