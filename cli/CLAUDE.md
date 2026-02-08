# Absurdity Index CLI

Auto-post satirical congressional content to X. Generates content with Claude, runs multi-layer safety checks, and posts with branded image cards.

## Tech Stack

- **Language:** TypeScript (ES2022, Node16 module resolution)
- **Framework:** Commander.js for CLI, Pino for logging
- **AI:** Anthropic Claude API (Opus for generation, Sonnet for research/fact-check/safety)
- **Database:** SQLite via better-sqlite3
- **Image generation:** Playwright (headless Chromium)
- **Twitter:** twitter-api-v2 (OAuth 1.0a) with Playwright browser fallback
- **Testing:** Vitest
- **Dashboard UI:** Astro 5 + Tailwind CSS v4 (builds to `dist/dashboard-ui/`)

## Commands

```bash
npm install              # Install deps
npm run build            # Build dashboard UI + compile TypeScript
npm run dev              # Run via tsx (no build needed)
npm test                 # Run vitest
npm run test:watch       # Watch mode

# Dev usage
npx tsx src/index.ts post bill --slug real-hr-1234 --dry-run
npx tsx src/index.ts engage dashboard --port 3847
```

## Architecture

```text
src/
  commands/           # CLI command handlers (Commander)
  modules/
    bills/            # Bill loading from MDX frontmatter
    cards/            # Branded image card generation (Playwright)
    claude/           # Claude API client + prompt templates
    dashboard/        # Local monitoring web UI (serves dashboard-ui/)
    discovery/        # Congress.gov bill discovery pipeline
    engage/           # Engagement scanner + generator
    memes/            # Meme/GIF generation (Imgflip, Giphy)
    posting/          # Post-with-reply flow
    safety/           # Hot Pot Detector (multi-layer safety)
    scheduler/        # Cooldowns + scheduling
    scoring/          # Engagement opportunity scoring
    state/            # SQLite DB + models
    trending/         # Trend monitoring
    x-api/            # X API clients (read + write + browser)
  utils/              # Formatting, logging, pricing
data/                 # SQLite DB, browser state, memes (gitignored runtime data)
dashboard-ui/         # Astro app for engagement dashboard (separate build)
```

## Key Patterns

- **Posting flow:** Generate content (URL-free) -> Generate branded image card -> Post tweet with image -> Reply with CTA + source links
- **Safety pipeline (Hot Pot Detector):** Blocklist -> Tragedy radar -> Partisan lean -> Toxicity -> Content quality. Verdicts: `SAFE`, `REVIEW`, `REJECT`
- **Engagement pipeline:** Fetch tweet -> Research (Sonnet) -> Generate (Opus) -> Fact-check (Sonnet) -> Safety -> Post -> CTA reply
- **Evidence standard:** Every factual claim must include a proof link. The prompt templates enforce this via `PromptContext.sourceLinks`

## Environment

Requires `.env` in `cli/` or project root. See `cli/.env.example` for all variables. Key ones:

- `ANTHROPIC_API_KEY` — required for all content generation
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` — X API posting
- `X_BEARER_TOKEN` — X API reading (tweets/trends)
- `CONGRESS_API_KEY` — bill discovery from Congress.gov
- Playwright browsers: `npx playwright install chromium`

## Dashboard UI

The `dashboard-ui/` subdirectory is a separate Astro app that builds static HTML into `dist/dashboard-ui/`. The CLI serves these files when running `engage dashboard`. Dev proxy targets `http://127.0.0.1:3847` for API calls.

```bash
npm run dashboard-ui:dev    # Dev server at localhost:4322
npm run dashboard-ui:build  # Build to dist/dashboard-ui/
```
