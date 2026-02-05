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
```
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
- Hosted on **Cloudflare Pages**
- `functions/_middleware.js` restricts access to US visitors only
- Search powered by **Pagefind** (indexed at build time)

### Browser Extension
`extension/` contains a Chrome extension that shows Absurdity Index scores on Congress.gov bill pages. Uses Manifest V3.

## Content Guidelines

When creating new bill MDX files:
1. Frontmatter must match schema in `content.config.ts`
2. Use appropriate `billType`: `real`, `sensible`, or `absurd`
3. Real bills should include `congressDotGovUrl` and `absurdityIndex` (1-10)
4. Satirical bills use fictional sponsors with pun names (e.g., "Rep. Wifi McRouterface")
5. MDX content uses official-document styling conventions (Section headers, blockquotes for findings)

## Key Patterns

- Bill slugs follow convention: `real-{type}-{number}-{congress}` for real bills, `{type}-{number}` for satirical
- `getCollection('bills')` returns all bills; filter by `billType` as needed
- Icons use the `Icon.astro` component with Lucide icon names
- The `BillLayout.astro` is for simple satirical bills; `pages/bills/[slug].astro` handles real bills with full congressional data

## UI Conventions

### Icons
- **Never use Unicode emoji characters** (e.g., 🐷, 🥇, ✨) in the codebase
- Always use Lucide icons via the `Icon.astro` component for consistent styling
- For client-side JavaScript that renders icons dynamically, use inline SVG strings matching Lucide icon paths
- Add new icons to `src/components/ui/Icon.astro` when needed
- Apply appropriate Tailwind color classes to icons (e.g., `class="text-gold-500"`)
