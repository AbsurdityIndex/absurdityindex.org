# AGENTS.md — Build & Validation Scripts

This file provides guidance to AI coding assistants working in the `scripts/` directory.

## Overview

Node.js scripts for bill fetching, content validation, security scanning, and release management. Run from the project root via `npm run` commands.

## Tech Stack

- **Language:** Plain JavaScript (ES modules, `.mjs` extension)
- **Runtime:** Node.js >= 20
- **No TypeScript** — these are intentionally plain JS for portability and fast startup

## Scripts

| Script | npm command | Purpose |
|--------|-------------|---------|
| `fetch-bills.mjs` | `npm run fetch-bills` | Fetch bills from Congress.gov API, optionally generate AI summaries |
| `validate-bills.mjs` | `npm run validate` | Validate all bill MDX frontmatter against schema rules |
| `scan-secrets.mjs` | `npm run security:scan-secrets` | Scan repo for accidentally committed secrets/API keys |
| `release-check.mjs` | `npm run release:check` | Pre-release checklist verification |
| `generate-theme-song.mjs` | *(manual)* | Generate satirical theme songs for bills using AI |

## Script Details

### `fetch-bills.mjs`

Fetches bill data from the Congress.gov API and writes MDX files to `src/data/bills/`.

```bash
CONGRESS_GOV_API_KEY=<key> npm run fetch-bills           # Fetch default bill list
npm run fetch-bills -- --bill 119/hr/25                   # Fetch a specific bill
npm run fetch-bills -- --update                           # Overwrite existing files
npm run fetch-bills -- --no-ai                            # Skip AI summary generation
```

Requires `CONGRESS_GOV_API_KEY`. Optionally uses `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` for AI-generated summaries.

### `validate-bills.mjs`

Validates all `src/data/bills/*.mdx` files. Checks:

- All required fields present (title, billNumber, status, sponsor, summary, etc.)
- Bill-type-specific requirements (real bills need `sponsorParty`, `congressNumber`, `absurdityIndex`, `congressDotGovUrl`)
- Satirical bill requirements (votes structure with yeas/nays/passed)
- No duplicate `billEvolution` stages within a bill
- Correct field names (`votes:` not `vote:`)
- Plain date format (`2025-01-01`, not `2025-01-01T12:00:00`)

**Exit codes:** `0` = pass (no errors, warnings OK), `1` = errors found.

Use `--strict-warnings` (via `npm run validate:ci`) to also fail on warnings.

### `scan-secrets.mjs`

Scans the repo for patterns matching API keys, tokens, passwords, and other secrets. Used in CI via `npm run security:ci`.

### `release-check.mjs`

Pre-release verification: checks changelog, version consistency, build output, and other release prerequisites.

## Key Patterns

- Scripts read from and write to `src/data/bills/`
- Templates in `src/data/bills/_templates/` are `.md` files (not `.mdx`) so they aren't processed by Astro
- All scripts use top-level `await` and ES module imports
- Scripts use `process.exit(1)` on validation failure for CI integration
- The validation script mirrors (but does not import) the Zod schema from `src/content.config.ts` — if you change schema rules, update both
