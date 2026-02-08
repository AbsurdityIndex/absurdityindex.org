# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**Absurdity Index** (`absurdityindex.org`) is a satirical commentary site about real congressional legislation. It pairs real bills from Congress.gov with satirical "sensible" alternatives, scored on an editorial Absurdity Index (1-10).

## Development Commands

```bash
npm run dev           # Start dev server at localhost:4321
npm run build         # Build production site + run Pagefind search indexing
npm run preview       # Preview production build locally
npm run fetch-bills   # Fetch bills from Congress.gov API (requires CONGRESS_GOV_API_KEY)
npm run validate      # Validate all bill MDX files for required fields
npm run validate:build # Run validation, then build (recommended for CI)
```

### Fetch Bills Script Options

```bash
CONGRESS_GOV_API_KEY=<key> npm run fetch-bills           # Fetch default bill list
npm run fetch-bills -- --bill 119/hr/25                   # Fetch specific bill
npm run fetch-bills -- --update                           # Overwrite existing files
npm run fetch-bills -- --no-ai                            # Skip AI summarization
```

Required env vars (see `.env.example`):

- `CONGRESS_GOV_API_KEY` - Required for fetching bills
- `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` - Optional for AI summaries

## Architecture

### Content Collections (Astro)

Bills and rules are managed via Astro's content collections with schemas defined in `src/content.config.ts`:

- **bills** (`src/data/bills/*.mdx`) - Three bill types:
  - `real` - Actual congressional bills fetched from Congress.gov
  - `sensible` - Satirical bills written as reasonable alternatives
  - `absurd` - Intentionally absurd satirical bills
- **rules** (`src/data/rules/*.mdx`) - Congressional rules packages

The `under-consideration.ts` file contains a curated list of real bills not yet converted to full MDX entries.

### Component Organization

```text
src/components/
├── bills/       # BillCard, BillHeader, AbsurdityMeter, VoteBreakdown, etc.
├── layout/      # Header, Footer, MobileMenu
├── omnibus/     # Omnibus bill-specific (spending charts, riders, divisions)
├── satirical/   # CommitteeStamp, RunningTicker, QuorumCounter
└── ui/          # Reusable: SearchBar, FilterPanel, Pagination, Icon, etc.
```

### Page Structure

Dynamic routes use Astro's bracket syntax:

- `/bills/[slug].astro` - Real bills (filtered by `billType === 'real'`)
- `/not-bills/[slug].astro` - Satirical bills
- `/sponsors/[slug].astro`, `/category/[category].astro`, etc.

API endpoints in `src/pages/api/` return JSON for bills, stats, etc.

### Styling

- **Tailwind CSS v4** with custom theme tokens in `src/styles/global.css`
- Government-parody palette: navy, gold, cream, parchment
- Typography: Libre Caslon Text (serif), Inter (sans), JetBrains Mono (mono)
- `.bill-content` class provides official-document styling for MDX content
- Dark mode support via `html.dark` class

### Deployment

- Hosted on **Cloudflare Pages** at `absurdityindex.org`
- `functions/_middleware.js` restricts access to US visitors only
- Search powered by **Pagefind** (indexed at build time)

#### Automated CI/CD (Push to Deploy)

Pushing to `main` triggers an automatic build and deploy within ~60 seconds. The pipeline runs on a self-hosted Kubernetes cluster using **Argo Workflows**, triggered by a polling CronJob.

**How it works:**

1. `absurdity-index-poller` CronJob (runs every 60s in `argo` namespace) polls the GitHub API for new commits on `main`
2. On new commit, it submits an Argo Workflow using the `deploy-absurdity-index` WorkflowTemplate
3. The workflow runs three steps: `clone-repo` → `build` (`npm ci && npm run build`) → `deploy` (`wrangler pages deploy`)
4. Commit SHA state is tracked in the `absurdity-index-poller-state` ConfigMap to avoid duplicate deploys

**K8s resources (all in `argo` namespace on host defined by `K8S_HOST` in `.env`):**

| Resource | Name | Purpose |
|----------|------|---------|
| CronJob | `absurdity-index-poller` | Polls GitHub API every minute for new commits |
| WorkflowTemplate | `deploy-absurdity-index` | 3-step clone → build → deploy workflow |
| ConfigMap | `absurdity-index-poller-state` | Stores last-seen commit SHA |
| Secret | `github-pat` | GitHub token for repo access |
| Secret | `cloudflare-api-token` | Cloudflare Pages deploy token |

**Cloudflare account ID** is configured via `CLOUDFLARE_ACCOUNT_ID` in `.env` and referenced in the WorkflowTemplate.

**No public DNS or webhooks required** — the poller makes outbound-only calls to GitHub API (polling) and Cloudflare API (deploying). The entire CI infrastructure stays behind the firewall.

#### Manual Deploy to Production

```bash
npm run build                                          # Build site + Pagefind index
npx wrangler pages deploy dist --project-name=absurdity-index   # Deploy to Cloudflare
```

The deploy command will output a preview URL (e.g., `https://abc123.absurdity-index.pages.dev`) and automatically promote to production domains (`absurdityindex.org`, `www.absurdityindex.org`).

#### Environment Variables

- **Build-time secrets** (API keys) are only used by `scripts/fetch-bills.mjs` and are NOT bundled into the static site
- The `.env` file is gitignored and never deployed
- Safe to verify: `grep -r "API_KEY" dist/` should return no matches

### Browser Extension

`extension/` contains a Chrome extension that shows Absurdity Index scores on Congress.gov bill pages. Uses Manifest V3.

## Content Guidelines

### Creating New Bills

**Always use templates** located at `src/data/bills/_templates/`:

- `sensible-bill.template.md` - for satirical fictional bills
- `real-bill.template.md` - for real Congress.gov bills
- `absurd-bill.template.md` - for historical absurd laws

**Steps to create a new bill:**

1. Copy the appropriate template from `src/data/bills/_templates/`
2. Rename to the bill ID with `.mdx` extension (e.g., `hr-999.mdx` or `real-hr-1234.mdx`)
3. Fill in all fields (templates have comments explaining each)
4. Run `npm run build` to validate against schema

### Critical Schema Rules

| Rule | Correct | Wrong |
|------|---------|-------|
| Vote field name | `votes:` (plural) | `vote:` (singular) |
| Date format | `2025-01-01` | `2025-01-01T12:00:00` |
| Bill evolution stages | Each stage unique | Duplicate stages |

### Bill Type Requirements

| Field | sensible | absurd | real |
|-------|----------|--------|------|
| `votes` | Required | Required | Optional |
| `sponsorParty` | N/A | N/A | **Required** |
| `sponsorState` | N/A | N/A | **Required** |
| `congressNumber` | N/A | N/A | **Required** |
| `absurdityIndex` | N/A | N/A | **Required** (1-10) |
| `congressDotGovUrl` | N/A | N/A | **Required** |
| `realSource` | N/A | Optional | N/A |

### Bill Naming Conventions

- **Sensible bills:** `hr-XXX.mdx` or `s-XXX.mdx`
- **Absurd bills:** `ra-XXX.mdx` (R.A. = Real Absurd)
- **Real bills:** `real-{type}-{number}.mdx` or `real-{type}-{number}-{congress}.mdx`
  - Examples: `real-hr-25.mdx`, `real-s-686.mdx`, `real-hres-5-119.mdx`

### Content Conventions

1. **Real bills** should include `congressDotGovUrl` linking to Congress.gov
2. **Satirical bills** use fictional sponsors with pun names (e.g., "Rep. Wifi McRouterface")
3. MDX content uses official-document styling (Section headers, blockquotes for findings)
4. Bill evolution stages track pork spending through legislative process
5. Each `porkItem` needs `description`, `amount`, `addedBy`, and `category`

### Validation Script

Run `npm run validate` to check all bills for required UI component fields:

**Validates:**

- All required fields present (title, billNumber, status, sponsor, summary, etc.)
- Real bill requirements (congressNumber, sponsorParty, absurdityIndex, etc.)
- Satirical bill requirements (votes structure)
- No duplicate `billEvolution` stages
- Correct field names (`votes:` not `vote:`)
- Date format (plain dates, not ISO timestamps)

**Exit codes:**

- `0` = Pass (no errors, warnings OK)
- `1` = Fail (errors found)

## Key Patterns

- Bill slugs follow convention: `real-{type}-{number}-{congress}` for real bills, `{type}-{number}` for satirical
- `getCollection('bills')` returns all bills; filter by `billType` as needed
- Icons use the `Icon.astro` component with Lucide icon names
- The `BillLayout.astro` is for simple satirical bills; `pages/bills/[slug].astro` handles real bills with full congressional data

## UI Conventions

### Icons

- **Never use Unicode emoji characters or Unicode symbol icons** (for example: pig/medal/sparkles emoji, warning triangles, checkmarks, stars) in the codebase
- Always use Lucide icons via the `Icon.astro` component for consistent styling
- For client-side JavaScript that renders icons dynamically, use inline SVG strings matching Lucide icon paths
- Add new icons to `src/components/ui/Icon.astro` when needed
- Apply appropriate Tailwind color classes to icons (e.g., `class="text-gold-500"`)
