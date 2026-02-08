# Repo Breakout Plan

Break apart into proper repos for GitHub. This will make it easier to manage, share, and deploy each component independently.

---

## 1. absurdityindex.org (main website)

**Repo:** `github.com/AbsurdityIndex/absurdityindex.org`

A satirical commentary site about real congressional legislation. Pairs real bills from Congress.gov with satirical "sensible" alternatives, scored on an editorial Absurdity Index (1-10). Built with Astro, deployed on Cloudflare Pages.

**What stays:**

- `src/components/bills/`, `src/components/layout/`, `src/components/omnibus/`, `src/components/satirical/`, `src/components/ui/` — all site UI components
- `src/data/bills/`, `src/data/representatives/`, `src/data/rules/` — content collections
- `src/content.config.ts` — Astro content schema
- `src/layouts/` — BaseLayout, BillLayout, FeedLayout
- `src/pages/` — all non-votechain pages (bills/, not-bills/, sponsors/, category/, api/, etc.)
- `src/styles/` — Tailwind CSS theme
- `src/utils/` — site utility functions
- `scripts/` — fetch-bills, validate-bills, check-no-innerhtml, check-no-unicode-icons, generate-icons, release-check, scan-secrets
- `functions/_middleware.js`, `functions/api/today.json.js`, `functions/api/visitors.json.js` — Cloudflare Functions (US-only gate, non-votechain API)
- `public/` — static assets (fonts, images, embed.js, robots.txt)
- `tests/billTransforms.test.js`, `tests/directorySlugs.test.js` — existing site tests
- `astro.config.mjs`, `tsconfig.json`, `eslint.config.js`, `package.json`
- Standard docs: README, CHANGELOG, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, SUPPORT, LICENSE, RELEASING
- `PLAN-bill-evolution-schema.md` — site-specific planning doc

**What leaves:**

- `src/votechain-poc/` → votechain repo
- `src/pages/votechain/` → votechain repo
- `src/components/votechain/` → votechain repo
- `functions/api/votechain/` → votechain repo
- `workers/` → votechain repo
- `tests/votechain/` → votechain repo
- `docs/` → votechain repo
- `PRD-*.md`, `PLAN-VOTECHAIN-ASSURANCE.md` → votechain repo
- `cli/` → cli repo
- `tools/x-engage.mjs` → cli repo (MCP tool for X engagement, depends on cli's twitter-api-v2)
- `extension/` → extension repo
- `k8s-monitor/` → k8s-monitor repo
- `X-MARKETING-SESSION.md`, `RALPH-PROMPT.md`, `SESSION-NOTES.md`, `outreach-log-*.json` → cli repo or delete (session artifacts)

---

## 2. votechain

**Repo:** `github.com/AbsurdityIndex/votechain`

Cryptographic voter verification and end-to-end ballot integrity for U.S. elections. Encompasses the VoteChain verification layer, the Election Web Protocol (EWP) ballot integrity layer, a browser-based proof of concept, Cloudflare Worker ledger nodes, and the assurance/audit playbooks.

> **Note:** EWP and POC do NOT need separate repos. EWP is a protocol spec (markdown docs + Astro pages), and the POC is a client-side TypeScript library that implements both VoteChain + EWP concepts. They are deeply intertwined — the POC imports types/crypto shared across both, and the Astro pages reference both protocols. Keeping them together avoids circular dependencies and simplifies the build.

**What moves here:**

- `src/votechain-poc/` (21 modules, ~3,036 lines) — core TypeScript library (crypto, ballot, credential, tally, verify, fraud detection, etc.)
- `src/pages/votechain/` — all VoteChain Astro pages:
  - `index.astro` (landing), `prd.astro`, `ewp.astro`, `architecture.astro`, `credential-integrity.astro`
  - `poc/` — vote, verify, lookup, dashboard, trust, monitor pages
  - `assurance/` — 14 assurance playbook pages
- `src/components/votechain/` — AISummarizer, MermaidClient, VoteChainSubnav
- `functions/api/votechain/poc/` — Cloudflare Functions API (config, replicate, session, unlock)
- `workers/votechain-nodes/` — 3 Cloudflare Worker ledger nodes (federal, state, oversight) + shared Durable Object code
- `tests/votechain/` — 186 vitest tests (11 test files + setup)
- `docs/votechain-architecture.md` — production architecture document
- `docs/votechain-assurance/` — 14 assurance playbooks (threat modeling, pen testing, crypto review, etc.)
- `PRD-VOTER-VERIFICATION-CHAIN.md` — VoteChain protocol spec
- `PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md` — EWP protocol spec
- `PLAN-VOTECHAIN-ASSURANCE.md` — assurance planning doc

**Dependencies to resolve:**

- `@noble/curves` — currently in root package.json; moves to this repo's deps
- VoteChain pages import `BaseLayout`, `Icon`, `Divider` from the main site's components — need to either bundle copies or create a shared UI package
- `vitest.config.ts` and `tests/votechain/setup.ts` — move test infrastructure here

---

## 3. absurdity-index-cli

**Repo:** `github.com/AbsurdityIndex/cli`

Autonomous social media management system for X/Twitter. Generates satirical content about congressional bills using Claude, runs multi-layer safety checks, and posts with branded image cards. Includes a local monitoring dashboard and an Electron desktop app wrapper.

> **Note:** The CLI dashboard (`cli/dashboard-ui/`) is already embedded inside the CLI project — it's built as part of `npm run build` (`astro build --root dashboard-ui && tsc`) and served by the CLI process. There is no reason to separate it. The Electron wrapper (`cli/electron/`) is similarly tightly coupled. This is one repo.

**What moves here:**

- `cli/` — the entire directory as-is:
  - `bin/absurdity-index.mjs` — CLI entry point
  - `src/index.ts`, `src/config.ts` — core CLI
  - `src/commands/` — 13 commands (analytics, auto, discover, draft, engage, login, meme, monitor, post, review, schedule, status, test-safety)
  - `src/modules/` — 14 module directories (bills, cards, claude, dashboard, discovery, engage, memes, posting, safety, scheduler, scoring, state, trending, x-api)
  - `src/utils/` — format, logger, pricing utilities
  - `dashboard-ui/` — Astro dashboard (pages, layouts, styles)
  - `electron/main.cjs` — Electron desktop wrapper
  - `data/` — runtime data (SQLite databases, blocklist, feed sources, outreach state)
  - `package.json`, `tsconfig.json`, `pnpm-lock.yaml` — already self-contained
- `tools/x-engage.mjs` — MCP server tool for X engagement (uses cli's twitter-api-v2 + anthropic deps)
- `X-MARKETING-SESSION.md`, `RALPH-PROMPT.md` — CLI/marketing strategy docs
- `outreach-log-*.json` — outreach session data

**Already self-contained:** Has its own package.json, node_modules, build scripts, and test runner. Minimal work to extract.

---

## 4. absurdity-index-extension

**Repo:** `github.com/AbsurdityIndex/browser-extension`

Chrome/Firefox browser extension that shows Absurdity Index scores on Congress.gov bill pages. Uses Manifest V3.

**What moves here:**

- `extension/` — the entire directory:
  - `manifest.json` — Manifest V3 config
  - `content.js` — content script injected on congress.gov
  - `popup.html`, `popup.js` — extension popup UI
  - `styles.css` — popup styles
  - `icons/` — extension icons
  - `README.md`, `AGENTS.md`, `CLAUDE.md`

**Dependencies:** None. Fully standalone. Fetches data from `absurdityindex.org/api/` at runtime — no build-time coupling to the main site.

---

## 5. k8s-monitor

**Repo:** `github.com/AbsurdityIndex/k8s-monitor`

macOS Kubernetes cluster monitor. Connects to a K8s host via SSH, runs 8 health checks every 60 seconds, sends native macOS notifications, and serves a local web dashboard. Pure Python (stdlib only; optional `rumps` for menubar icon).

**What moves here:**

- `k8s-monitor/` — the entire directory:
  - `monitor.py` — main entry point
  - `checks.py` — 8 K8s health checks (pods, nodes, deployments, events, pvcs, jobs, services, hpas)
  - `models.py`, `alert_store.py`, `dedup.py` — alert data model and dedup
  - `notifier.py` — macOS native notifications
  - `web.py`, `dashboard.html` — local web dashboard
  - `menubar.py` — optional rumps menubar icon
  - `ssh.py` — SSH connection management
  - `launchd/` — macOS launchd service config
  - `README.md`, `AGENTS.md`, `CLAUDE.md`

**Dependencies:** None on the rest of the project. Pure Python, no package.json, no shared code. Clean extraction.

---

## What does NOT need its own repo

| Component | Reason it stays put |
|---|---|
| **EWP** (Election Web Protocol) | It's a protocol spec (2 markdown PRDs + Astro pages). Lives inside the votechain repo as documentation. No standalone code. |
| **POC** (Proof of Concept) | It's the TypeScript implementation of VoteChain + EWP concepts. Deeply coupled — same crypto primitives, shared types, barrel exports. Part of the votechain repo. |
| **CLI Dashboard** | Already embedded in `cli/dashboard-ui/`, built by `cli`'s own `npm run build`, served by the CLI process. Not separable without introducing unnecessary IPC complexity. |
| **Cloudflare Functions** (non-votechain) | `functions/_middleware.js` and `functions/api/today.json.js` / `visitors.json.js` are part of the main site's Cloudflare Pages deployment. Stay with absurdityindex.org. |
| **scripts/** | Site build/validation utilities. Stay with absurdityindex.org. |
| **tools/x-engage.mjs** | MCP server that uses cli's deps (twitter-api-v2, anthropic). Moves with the CLI. |
| **research/** | Contains `absurd-bills-research.md` — site content research. Stays with absurdityindex.org. |

---

## Suggested extraction order

1. **k8s-monitor** — zero dependencies, pure Python, cleanest extraction
2. **extension** — zero dependencies, no build step, just copy the directory
3. **cli** — already has own package.json/node_modules, mostly self-contained; move tools/x-engage.mjs and marketing docs with it
4. **votechain** — most complex; needs to resolve shared UI component imports from main site, move workers + functions + tests + docs, set up own Astro config or build pipeline
5. **absurdityindex.org** — clean up after everything else moves out; remove dead imports, update CI/CD, slim down package.json (drop @noble/curves, vitest poc config, etc.)
