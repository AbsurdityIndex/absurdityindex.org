# Absurdity Index

AI-powered congressional satire. We track real bills from Congress.gov, score them on an editorial Absurdity Index (1-10), and pair them with satirical alternatives that somehow make more sense.

**Live site:** [absurdityindex.org](https://absurdityindex.org)

**Follow along:** [@CartelPirate on X](https://x.com/CartelPirate)

## What's Inside

### The Site

A static site built with Astro that catalogs real congressional legislation alongside satirical "not-bills." Each real bill gets an absurdity score, a plain-English summary, and a breakdown of what it actually does vs. what its name implies.

- 39 bills tracked (29 real, 6 sensible satire, 4 absurd historical)
- Full-text search via Pagefind
- Embed widget and JSON API for developers
- Dark mode, mobile-friendly, government-parody aesthetic

### The CLI

An autonomous social media management system for X/Twitter. Generates satirical content about congressional bills, runs it through a 5-layer safety system, and posts it — all driven by Claude.

```text
cli/
├── commands/     # post, draft, engage, monitor, review, schedule, analytics, status
├── modules/
│   ├── content/  # Claude-powered content generation with 7 prompt types
│   ├── safety/   # "Hot Pot Detector" — blocklist, partisan lean, toxicity, quality
│   ├── x-api/    # Twitter API client + Playwright browser automation
│   ├── trends/   # RSS + X API trend aggregation and scoring
│   ├── engage/   # Congressional tweet scanning + quote-tweet engine
│   ├── scheduler/# Queue management and cooldown tracking
│   └── state/    # SQLite database for posts, analytics, safety logs
```

### The Ralph Loop

The CLI is designed to run as a [Ralph Loop](https://ghuntley.com/ralph/) — an iterative AI development pattern where Claude Code receives the same prompt repeatedly and sees its own prior work. See [`RALPH-PROMPT.md`](./RALPH-PROMPT.md) for the full autonomous prompt.

Each iteration, Claude:

1. Checks account status (posts today, queue, trends, engagement opportunities)
2. Decides what to do based on a priority framework
3. Generates content, runs safety checks, posts or drafts
4. Signals completion with a promise tag

### Browser Extension

A Chrome extension (`extension/`) that overlays Absurdity Index scores on Congress.gov bill pages. Manifest V3.

### K8s Monitor

A Python menubar app (`k8s-monitor/`) that monitors the self-hosted CI/CD pipeline running on Kubernetes with Argo Workflows.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Site | Astro 5, MDX, Tailwind CSS v4 |
| Search | Pagefind |
| CLI | TypeScript, Commander.js, better-sqlite3 |
| AI | Claude (Anthropic SDK) for content generation + safety |
| Social | X/Twitter API v2 + Playwright for browser automation |
| Hosting | Cloudflare Pages |
| CI/CD | Argo Workflows on self-hosted Kubernetes |

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Site Development

```bash
npm install
npm run dev           # Dev server at localhost:4321
npm run build         # Production build + search indexing
npm run preview       # Preview production build
```

### CLI Setup

```bash
cd cli
npm install
cp .env.example .env  # Fill in your API keys
```

Required environment variables (see `cli/.env.example`):

- `X_BEARER_TOKEN` — X API bearer token (read-only operations)
- `ANTHROPIC_API_KEY` — Claude API key (content generation + safety)
- Browser auth — Run `npx tsx src/index.ts login` to authenticate for posting

Optional:

- `CONGRESS_API_KEY` — Congress.gov API (for fetching new bills)

### CLI Usage

```bash
# From the cli/ directory
npx tsx src/index.ts status              # Full state snapshot
npx tsx src/index.ts post bill --slug real-hr-25 --type bill-roast --dry-run
npx tsx src/index.ts monitor once        # Scan trends
npx tsx src/index.ts engage scan         # Find engagement opportunities
npx tsx src/index.ts analytics summary   # View performance metrics
```

### Fetching Bills from Congress.gov

```bash
# From the project root
CONGRESS_GOV_API_KEY=<key> npm run fetch-bills
npm run fetch-bills -- --bill 119/hr/25  # Fetch a specific bill
npm run fetch-bills -- --bill=119/hr/25  # Equivalent inline form
npm run validate                          # Validate all bill MDX files
npm run validate:ci                       # CI gate (warnings fail in strict mode)
```

### CI/Quality Commands

```bash
npm run verify
npm run validate:ci
npm run security:ci
npm run build
npm run build --prefix cli
npm test --prefix cli
```

### Deploy Commands

```bash
# Test stack deploys
node scripts/check-release-manifest.mjs --verify-remote
VOTECHAIN_PAGES_PROJECT=votechain-test VOTECHAIN_DEPLOY_BRANCH=main node scripts/deploy-votechain-from-manifest.mjs
npx wrangler pages deploy dist/ --project-name absurdity-index-test --branch main --commit-hash $(git rev-parse HEAD)

# Production deploys
node scripts/deploy-votechain-from-manifest.mjs
npx wrangler pages deploy dist/ --project-name absurdity-index --branch main --commit-hash $(git rev-parse HEAD)
```

## Content

Bills live in `src/data/bills/` as MDX files. Three types:

- **Real bills** (`real-*.mdx`) — Fetched from Congress.gov with absurdity scores
- **Sensible bills** (`hr-*.mdx`, `s-*.mdx`) — Satirical alternatives that make more sense
- **Absurd bills** (`ra-*.mdx`) — Historical laws that are genuinely absurd

Templates for new bills are in `src/data/bills/_templates/`.

## Safety System

The CLI's "Hot Pot Detector" runs every generated post through 5 checks before it can go live:

| Check | Score Range | What It Catches |
|-------|------------|-----------------|
| Blocklist | 0 or 100 | Slurs, threats, banned terms |
| Tragedy Radar | 0–30 | References to recent tragedies |
| Partisan Lean | 0–25 | Content favoring one party |
| Toxicity | 0–25 | Mean-spirited or inflammatory tone |
| Content Quality | 0–20 | Low-effort or unfunny content |

Verdicts: **SAFE** (0-20) posts automatically, **REVIEW** (20-40) goes to human queue, **REJECT** (40-100) is blocked.

## Project Structure

```text
├── src/
│   ├── components/   # Astro components (bills, layout, UI)
│   ├── data/bills/   # MDX bill content
│   ├── layouts/      # Base and bill layouts
│   ├── pages/        # Routes, API endpoints
│   └── styles/       # Tailwind v4 theme
├── cli/              # Autonomous social media CLI
├── extension/        # Chrome extension for Congress.gov
├── k8s-monitor/      # Kubernetes CI/CD monitor
├── scripts/          # Bill fetching and validation
├── RALPH-PROMPT.md   # Autonomous Ralph Loop prompt
└── AGENTS.md         # Architecture reference
```

## License

[MIT](./LICENSE)

## Community

- [Contributing](./CONTRIBUTING.md)
- [Support](./SUPPORT.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
- [Changelog](./CHANGELOG.md)
- [Releasing](./RELEASING.md)
