# Bill Evolution Schema Redesign

## Current Problems

The existing `billEvolution` stage enum is House-centric and incomplete:

```typescript
// Current - broken for Senate bills
stage: z.enum([
  'introduced',
  'committee-markup',
  'house-passed',      // What about Senate bills?
  'senate-amended',    // What about House amending Senate bills?
  'conference',
  'final'              // No distinction between signed/vetoed/died
])
```

## Real Legislative Flows

### Standard Bicameral Path (Happy Path)
```
Origin Chamber → Receiving Chamber → President
    ↓                   ↓               ↓
 Introduce          Receive          Sign/Veto
 Committee          Committee
 Floor Vote         Floor Vote
 Pass               Pass (identical) → Enrolled
```

### Amendment Ping-Pong
```
House passes H.R. 123
    ↓
Senate amends & passes
    ↓
House considers Senate amendments
    ├─→ Concurs (accepts) → Enrolled → President
    └─→ Rejects → Conference OR further amendments
              ↓
        Conference Committee
              ↓
        Conference Report
              ↓
        Both chambers vote on report
              ↓
        Enrolled → President
```

### Presidential Actions
```
Enrolled Bill → President
                    ├─→ Signs → Public Law
                    ├─→ Vetoes → Back to Congress
                    │       ├─→ Override attempt (⅔ both chambers)
                    │       └─→ Veto sustained (bill dies)
                    └─→ Pocket Veto (if Congress adjourns)
```

## Proposed Schema

### Option A: Chamber-Agnostic Stages (Recommended)

Use relative naming (`origin`, `receiving`) that adapts based on bill type:

```typescript
const billEvolutionStageSchema = z.object({
  stage: z.enum([
    // Introduction
    'introduced',

    // Origin chamber (House for H.R., Senate for S.)
    'origin-committee',
    'origin-reported',        // Out of committee
    'origin-floor',           // Floor consideration
    'origin-passed',          // Passed origin chamber

    // Receiving chamber
    'receiving-received',
    'receiving-committee',
    'receiving-reported',
    'receiving-floor',
    'receiving-passed',        // Passed without changes → enrolled
    'receiving-amended',       // Passed WITH changes → ping-pong

    // Ping-pong (origin reconsiders)
    'origin-considers-amendments',
    'origin-concurs',          // Accepts receiving's changes → enrolled
    'origin-disagrees',        // Rejects → conference or more amendments

    // Conference
    'conference-requested',
    'conference-appointed',
    'conference-report-filed',
    'conference-house-adopts',
    'conference-senate-adopts',

    // Enrollment
    'enrolled',

    // Presidential action
    'presented-to-president',
    'signed',
    'vetoed',
    'pocket-vetoed',

    // Veto override
    'override-house-vote',
    'override-senate-vote',
    'override-successful',
    'veto-sustained',

    // Terminal states
    'became-law',
    'died-in-committee',
    'died-on-floor',
    'died-in-conference',
    'expired',                 // Congress ended without action
  ]),

  // NEW: Track which chamber this occurred in (for explicit display)
  chamber: z.enum(['house', 'senate', 'both', 'president']).optional(),

  // NEW: For ping-pong, track the round number
  round: z.number().optional(),  // 1 = first pass, 2 = after amendments, etc.

  date: z.coerce.date(),
  paraphrasedText: z.string(),
  cumulativePork: z.number(),
  porkAddedThisStage: z.number(),
  keyChanges: z.array(z.string()),
  amendmentsIncluded: z.array(z.string()).optional(),
  porkItems: z.array(porkItemSchema).optional(),

  // NEW: Vote data for this specific stage
  vote: z.object({
    yeas: z.number(),
    nays: z.number(),
    notVoting: z.number().optional(),
    passed: z.boolean(),
    chamber: z.enum(['house', 'senate']),
    rollCallNumber: z.number().optional(),
    rollCallUrl: z.string().url().optional(),
  }).optional(),
});
```

### Benefits of Chamber-Agnostic Naming

1. **Works for any bill type**: `origin-passed` means House for H.R., Senate for S.
2. **Self-documenting flow**: Stages read in order regardless of origin
3. **Handles ping-pong**: Multiple `origin-*` / `receiving-*` stages with `round` number
4. **Explicit terminal states**: Know exactly why a bill died

### Migration Path

Old stage → New stage mapping:
```
'introduced'       → 'introduced'
'committee-markup' → 'origin-committee' or 'origin-reported'
'house-passed'     → 'origin-passed' (for H.R.) or 'receiving-passed' (for S.)
'senate-amended'   → 'receiving-amended' (for H.R.) or 'origin-passed' (for S.)
'conference'       → 'conference-report-filed'
'final'            → 'became-law' or 'signed' or 'expired' (context-dependent)
```

## Display Logic

The UI would resolve `origin`/`receiving` to actual chamber names:

```typescript
function resolveStageLabel(stage: string, billType: BillTypeInfo): string {
  const isHouseOrigin = billType.originChamber === 'house';

  const labels: Record<string, string> = {
    'origin-committee': `${isHouseOrigin ? 'House' : 'Senate'} Committee`,
    'origin-passed': `Passed ${isHouseOrigin ? 'House' : 'Senate'}`,
    'receiving-amended': `${isHouseOrigin ? 'Senate' : 'House'} Amended`,
    // etc.
  };

  return labels[stage] || stage;
}
```

## Simple Resolutions

For H.Res./S.Res. (single chamber, no president), use a subset:

```typescript
// Valid stages for simple resolutions
const simpleResolutionStages = [
  'introduced',
  'origin-committee',
  'origin-reported',
  'origin-floor',
  'origin-passed',  // Terminal for simple resolutions
  'died-in-committee',
  'died-on-floor',
  'expired',
];
```

## Concurrent Resolutions

For H.Con.Res./S.Con.Res. (both chambers, no president):

```typescript
// Skip presidential stages
const concurrentResolutionStages = [
  // ... all chamber stages ...
  'enrolled',  // Terminal - becomes effective without President
];
```

## Implementation Steps

1. **Update schema** in `src/content.config.ts`
2. **Migrate existing MDX files** to new stage names
3. **Update BillEvolutionModal** to use new labels
4. **Update EvolutionTimeline** component
5. **Add validation** to ensure stage sequences are logical

## Example: S. 1 (Laken Riley Act) with New Schema

```yaml
billEvolution:
  - stage: introduced
    chamber: senate
    date: 2025-01-03
    # ...

  - stage: origin-committee
    chamber: senate
    date: 2025-01-15
    # ...

  - stage: origin-passed
    chamber: senate
    date: 2025-01-20
    vote:
      yeas: 64
      nays: 35
      chamber: senate
    # ...

  - stage: receiving-received
    chamber: house
    date: 2025-01-21
    # ...

  - stage: receiving-passed
    chamber: house
    date: 2025-01-22
    vote:
      yeas: 263
      nays: 156
      chamber: house
    # ...

  - stage: signed
    chamber: president
    date: 2025-01-29
    # ...

  - stage: became-law
    date: 2025-01-29
    # ...
```

## Questions to Resolve

1. **Granularity**: Do we need `origin-reported` separate from `origin-floor`?
2. **Ping-pong depth**: How many rounds do we support? (Most bills settle in 1-2)
3. **Backward compatibility**: Keep old stages as aliases during transition?
