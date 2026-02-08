# AGENTS.md — CLI

This file provides guidance to AI coding assistants working in the `cli/` directory.

## Overview

The Absurdity Index CLI auto-posts satirical congressional content to X (Twitter). It generates content with Claude, runs multi-layer safety checks, and posts with branded image cards.

## Tech Stack

- **Language:** TypeScript (ES2022, Node16 module resolution, strict mode)
- **CLI framework:** Commander.js
- **AI:** Anthropic Claude API (`@anthropic-ai/sdk`) — Opus for generation, Sonnet for research/fact-check/safety
- **Database:** SQLite via `better-sqlite3`
- **Image generation:** Playwright (headless Chromium for branded cards)
- **Twitter:** `twitter-api-v2` (OAuth 1.0a) with Playwright browser fallback
- **Logging:** Pino + pino-pretty
- **Testing:** Vitest
- **Dashboard UI:** Astro 5 + Tailwind CSS v4 (separate sub-app in `dashboard-ui/`)

## Development Commands

```bash
npm install                # Install dependencies
npm run build              # Build dashboard UI + compile TypeScript
npm run dev                # Run via tsx (no build step needed)
npm test                   # Run tests (vitest)
npm run test:watch         # Watch mode

# Dev usage examples
npx tsx src/index.ts post bill --slug real-hr-1234 --dry-run
npx tsx src/index.ts engage dashboard --port 3847

# Dashboard UI development
npm run dashboard-ui:dev   # Astro dev server at localhost:4322
npm run dashboard-ui:build # Build static files to dist/dashboard-ui/
```

## Architecture

```text
src/
  commands/           # CLI command handlers (Commander subcommands)
  modules/
    bills/            # Bill loading from MDX frontmatter (gray-matter)
    cards/            # Branded image card generation (Playwright screenshots)
    claude/           # Claude API client + prompt templates
    dashboard/        # Local monitoring web UI (serves built dashboard-ui/)
    discovery/        # Congress.gov bill discovery pipeline
    engage/           # Engagement scanner + reply generator
    memes/            # Meme/GIF generation (Imgflip, Giphy APIs)
    posting/          # Post-with-reply flow (tweet + CTA reply)
    safety/           # Hot Pot Detector (multi-layer content safety)
    scheduler/        # Cooldowns + post scheduling
    scoring/          # Engagement opportunity scoring
    state/            # SQLite DB schema + models
    trending/         # X trend monitoring via API
    x-api/            # X API clients (read via bearer, write via OAuth, browser fallback)
  utils/              # Formatting, logging, pricing helpers
  config.ts           # Environment + configuration loading
  index.ts            # Entry point (Commander program setup)
data/                 # Runtime data: SQLite DB, browser state, memes (gitignored)
dashboard-ui/         # Astro sub-app for engagement dashboard
```

## Key Patterns

### Posting Flow

Generate content (URL-free) → Generate branded image card (or meme) → Post tweet with image → Reply to own tweet with CTA + source links.

### Safety Pipeline (Hot Pot Detector)

Every post passes through five checks before publishing:

1. **Blocklist** — Banned terms and phrases
2. **Tragedy radar** — Active tragedies, mass shootings, disasters
3. **Partisan lean** — Detects one-sided political framing
4. **Toxicity** — Personal attacks, slurs, cruelty
5. **Content quality** — Factual grounding, source verification

Verdicts: `SAFE` (auto-post), `REVIEW` (human queue), `REJECT` (blocked).

### Engagement Pipeline

Fetch tweet context → Research (Sonnet verifies facts) → Generate reply (Opus) → Fact-check (Sonnet validates against research) → Safety check → Post → CTA reply with links.

### Evidence Standard

Every factual claim must include a proof link. Prompt templates enforce this via `PromptContext.sourceLinks`. If a source cannot be found, the claim must not be made.

## Environment Variables

Requires `.env` in `cli/` or the project root (see `cli/.env.example`):

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Content generation + safety checks |
| `X_API_KEY` | For API posting | OAuth 1.0a app key |
| `X_API_SECRET` | For API posting | OAuth 1.0a app secret |
| `X_ACCESS_TOKEN` | For API posting | OAuth 1.0a user token |
| `X_ACCESS_SECRET` | For API posting | OAuth 1.0a user secret |
| `X_BEARER_TOKEN` | For reading | Bearer token for tweets/trends |
| `CONGRESS_API_KEY` | For discovery | Congress.gov API key |

If X API credentials are missing, posting falls back to browser automation (requires `absurdity-index login` first).

## Dashboard UI

The `dashboard-ui/` subdirectory is a standalone Astro app. It builds static HTML/JS/CSS into `dist/dashboard-ui/`. The CLI's dashboard server (`modules/dashboard/`) serves these static files and provides `/api` endpoints. During development, the Astro dev server proxies API calls to `http://127.0.0.1:3847`.
