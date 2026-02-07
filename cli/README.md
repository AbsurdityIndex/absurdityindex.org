# Absurdity Index CLI

Auto-post satirical congressional content to X. Generates content with Claude, runs multi-layer safety checks, and posts with branded image cards.

## Setup

### Prerequisites

- Node.js >= 20
- npm >= 10
- Playwright browsers: `npx playwright install chromium`

### Install

```bash
cd cli
npm install
npm run build
```

### Environment

Create a `.env` file in `cli/` or the project root:

```env
# Required: Anthropic (content generation + safety)
ANTHROPIC_API_KEY=sk-ant-...

# Required for API posting (OAuth 1.0a user context)
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_SECRET=...

# Required for reading tweets/trends (bearer token)
X_BEARER_TOKEN=...

# Optional: Congress.gov API (bill discovery)
CONGRESS_API_KEY=...

# Optional: Meme generation
IMGFLIP_USERNAME=...
IMGFLIP_PASSWORD=...
GIPHY_API_KEY=...

# Optional: Overrides
SITE_URL=https://absurdityindex.org   # default
LOG_LEVEL=info                         # debug | info | warn | error
BROWSER_HEADLESS=true                  # false for debug
```

If X API credentials aren't set, posting falls back to browser automation (requires `absurdity-index login` first).

### First-time browser auth

```bash
npx tsx src/index.ts login
```

Opens a Chromium window to log into X. Session is saved for future browser-based posting.

## Commands

### `post` -- Generate and post to X

```bash
# Post about a bill (generates branded card by default)
absurdity-index post bill --slug real-hr-1234
absurdity-index post bill --slug real-hr-1234 --meme        # meme instead of card
absurdity-index post bill --slug real-hr-1234 --dry-run     # preview without posting
absurdity-index post bill --slug real-hr-1234 --type pork-barrel-report

# Post about a trending topic
absurdity-index post trend --topic "government shutdown"
absurdity-index post trend --topic "debt ceiling" --meme

# Post an existing draft
absurdity-index post draft-id --id 42
```

**Posting flow:** Generate content (URL-free) -> Generate branded image card (or meme with `--meme`) -> Post tweet with image -> Reply to own tweet with CTA + source links.

**Prompt types:** `bill-roast` (default), `trend-jack`, `cspan-after-dark`, `pork-barrel-report`, `floor-speech`

### `draft` -- Generate without posting

```bash
# Draft a single bill post
absurdity-index draft bill --slug real-hr-1234
absurdity-index draft bill --slug real-hr-1234 --meme    # generate + save meme

# Batch-generate multiple drafts
absurdity-index draft batch --count 5
absurdity-index draft batch --count 10 --api batch       # 50% cheaper via Batch API
absurdity-index draft batch --resume <batchId>           # resume polling a batch
```

### `engage` -- Quote-tweet and reply engagement

```bash
# Scan for engagement opportunities
absurdity-index engage scan

# Quote-tweet a specific tweet (full pipeline: research -> generate -> fact-check -> safety)
absurdity-index engage quote <tweet-id-or-url>
absurdity-index engage quote https://x.com/user/status/123 --dry-run

# Continuous engagement scanner
absurdity-index engage watch
absurdity-index engage watch --interval 15 --min-opportunity-score 60 --dry-run

# View tracked opportunities and stats
absurdity-index engage status

# Local monitoring dashboard
absurdity-index engage dashboard --port 3847
```

**Engagement pipeline:** Fetch tweet context -> Research (Sonnet) -> Generate (Opus) -> Fact-check (Sonnet) -> Safety -> Post -> CTA reply with links.

### `discover` -- Find absurd bills from Congress.gov

```bash
# Scan Congress.gov for new bills
absurdity-index discover scan
absurdity-index discover scan --days 14 --limit 500

# View high-scoring candidates
absurdity-index discover candidates --min-score 7

# Generate MDX files for the site
absurdity-index discover ingest --id 42
absurdity-index discover ingest --auto     # all candidates >= 8

# View scan history and costs
absurdity-index discover stats
```

### `auto` -- Full autopilot

```bash
absurdity-index auto start
absurdity-index auto start --max-posts-per-day 6 --interval 30 --dry-run
```

Monitors trends, matches bills, generates content, runs safety checks, and posts automatically.

### `review` -- Human review queue

```bash
absurdity-index review list                    # list flagged posts
absurdity-index review list --status draft     # list drafts
absurdity-index review approve 42 --post-now   # approve and post immediately
absurdity-index review reject 42
```

### `schedule` -- Post queue management

```bash
absurdity-index schedule list
absurdity-index schedule add 42
absurdity-index schedule remove 42
absurdity-index schedule next
absurdity-index schedule clear
```

### `monitor` -- Trend monitoring

```bash
absurdity-index monitor start --interval 15
absurdity-index monitor once --dry-run
```

### `analytics` -- Post performance

```bash
absurdity-index analytics summary
absurdity-index analytics refresh    # fetch latest metrics from X
```

### `status` -- System state snapshot

```bash
absurdity-index status
absurdity-index status --json
```

### `meme` -- Render branded meme images

```bash
absurdity-index meme "Your tax dollars at work" --filename pork-meme
absurdity-index meme --text-file speech.txt --filename floor --template navy-card
```

Templates: `committee-memo` (default), `navy-card`

### `test-safety` -- Debug safety scoring

```bash
absurdity-index test-safety "some tweet text" --verbose
absurdity-index test-safety "some tweet text" --skip-claude
```

### `login` -- Browser authentication

```bash
absurdity-index login
```

## Development

```bash
# Run commands in dev mode (no build needed)
npx tsx src/index.ts post bill --slug real-hr-1234 --dry-run

# Build
npm run build

# Run tests
npm test
npm run test:watch
```

## Architecture

```
cli/
  src/
    commands/          # CLI command handlers
    modules/
      bills/           # Bill loading from MDX frontmatter
      cards/           # Branded image card generation (Playwright)
      claude/          # Claude API client + prompt templates
      dashboard/       # Local monitoring web UI
      discovery/       # Congress.gov bill discovery pipeline
      engage/          # Engagement scanner + generator
      memes/           # Meme/GIF generation (Imgflip, Giphy)
      posting/         # Post-with-reply flow
      safety/          # Hot Pot Detector (multi-layer safety)
      scheduler/       # Cooldowns + scheduling
      scoring/         # Engagement opportunity scoring
      state/           # SQLite DB + models
      trending/        # Trend monitoring
      x-api/           # X API clients (read + write + browser)
    utils/             # Formatting, logging, pricing
  data/                # SQLite DB, browser state, memes
```

## Safety Pipeline

Every post goes through the **Hot Pot Detector** before publishing:

1. **Blocklist** -- Banned terms and phrases
2. **Tragedy radar** -- Active tragedies, mass shootings, disasters
3. **Partisan lean** -- Detects one-sided political framing
4. **Toxicity** -- Personal attacks, slurs, cruelty
5. **Content quality** -- Factual grounding, source verification

Verdicts: `SAFE` (auto-post), `REVIEW` (human queue), `REJECT` (blocked).

Engagement posts add two more layers before safety: **Research** (Sonnet verifies facts) and **Fact-check** (Sonnet validates generated content against research).
