# Build & Validation Scripts

Node.js scripts for bill fetching, content validation, and release management. Run from the project root via `npm run` commands.

## Scripts

| Script | npm command | Purpose |
|--------|-------------|---------|
| `fetch-bills.mjs` | `npm run fetch-bills` | Fetch bills from Congress.gov API, optionally generate AI summaries |
| `validate-bills.mjs` | `npm run validate` | Validate all bill MDX frontmatter against schema rules |
| `scan-secrets.mjs` | `npm run security:scan-secrets` | Scan repo for accidentally committed secrets |
| `release-check.mjs` | `npm run release:check` | Pre-release checklist verification |
| `generate-theme-song.mjs` | (manual) | Generate satirical theme songs for bills |

## Key Script Details

### `fetch-bills.mjs`
```bash
CONGRESS_GOV_API_KEY=<key> npm run fetch-bills
npm run fetch-bills -- --bill 119/hr/25        # Specific bill
npm run fetch-bills -- --update                # Overwrite existing
npm run fetch-bills -- --no-ai                 # Skip AI summaries
```
Requires `CONGRESS_GOV_API_KEY`. Optionally uses `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` for AI summaries.

### `validate-bills.mjs`
Validates all `src/data/bills/*.mdx` files for:
- Required fields (title, billNumber, status, sponsor, summary, etc.)
- Bill-type-specific requirements (real bills need `sponsorParty`, `congressNumber`, etc.)
- No duplicate `billEvolution` stages
- Correct field names (`votes:` not `vote:`)
- Plain date format (not ISO timestamps)

Exit codes: `0` = pass, `1` = errors found. Use `--strict-warnings` to fail on warnings too.

### `scan-secrets.mjs`
Scans the repo for patterns matching API keys, tokens, and other secrets. Used in CI via `npm run security:ci`.

## Conventions

- All scripts are ES modules (`.mjs` extension)
- Scripts read from `src/data/bills/` and write to the same directory
- No TypeScript — plain Node.js for portability and speed
- Templates in `src/data/bills/_templates/` are `.md` files (not processed by Astro)
