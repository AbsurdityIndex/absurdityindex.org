# Absurdity Index — absurdityindex.org

The main website for **Absurdity Index** (`absurdityindex.org`), a satirical commentary site about real congressional legislation. Built with Astro 5, MDX, and Tailwind CSS v4.

## Repo Structure

| Directory | What | Tech |
|-----------|------|------|
| `src/` | Astro site source — pages, components, layouts, content | Astro 5, MDX, Tailwind CSS v4 |
| `functions/` | Cloudflare Pages Functions (middleware + API) | JS (Cloudflare Workers runtime) |
| `scripts/` | Build-time scripts (fetch bills, validate, release check) | Node.js |
| `tests/` | Site unit tests | Node.js test runner |

## Related Repos

| Repo | What |
|------|------|
| `absurdity-index-cli` | CLI for auto-posting to X, bill discovery, engagement |
| `votechain` | Cryptographic voter verification protocol + POC |
| `absurdity-index-extension` | Chrome/Firefox extension for Congress.gov |
| `k8s-monitor` | Kubernetes cluster monitor with macOS notifications |

## Quick Commands

```bash
npm run dev              # Dev server at localhost:4321
npm run build            # Build site + Pagefind search index
npm run preview          # Preview production build
npm run validate         # Validate all bill MDX frontmatter
npm run validate:build   # Validate then build (CI flow)
npm run verify           # Full CI: validate + security + build + tests
```

## Content: Bills

Bills live in `src/data/bills/*.mdx`. Three types: `real`, `sensible`, `absurd`.

**Critical rules:**

- Use `votes:` (plural), NEVER `vote:`
- Use plain dates (`2025-01-01`), NEVER ISO timestamps
- Always copy from templates in `src/data/bills/_templates/`
- Real bills require: `sponsorParty`, `sponsorState`, `congressNumber`, `absurdityIndex`, `congressDotGovUrl`
- `billEvolution` stages must be unique per bill

Schema is in `src/content.config.ts` (Zod validation with refinements for bill-type requirements).

## Styling

- Tailwind CSS v4 with custom theme in `src/styles/global.css`
- Government-parody palette: navy, gold, cream, parchment
- Fonts: Libre Caslon Text (serif), Inter (sans), JetBrains Mono (mono)
- Dark mode via `html.dark` class
- Never use Unicode emoji — use Lucide icons via `Icon.astro`

## Deployment

- Hosted on **Cloudflare Pages** at `absurdityindex.org`
- Push to `main` auto-deploys via Argo Workflows on self-hosted K8s (polls every 60s)
- Manual: `npx wrangler pages deploy dist --project-name=absurdity-index`
- CI pipeline defined in `.woodpecker.yml`

## Evidence Standard

**Every factual claim MUST include a proof link** — no exceptions. Use authoritative sources: congress.gov, law.cornell.edu, .gov press releases, clerk.house.gov roll calls. If a source cannot be found, do NOT make the claim.
