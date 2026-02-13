# Absurdity Index

AI-powered congressional satire. We track real bills from Congress.gov, score them on an editorial Absurdity Index (1–10), and pair them with satirical alternatives that somehow make more sense.

**Live site:** [absurdityindex.org](https://absurdityindex.org)

**Follow along:** [@CartelPirate on X](https://x.com/CartelPirate)

## What's Inside

A static site built with Astro that catalogs real congressional legislation alongside satirical "not-bills." Each real bill gets an absurdity score, a plain-English summary, and a breakdown of what it actually does vs. what its name implies.

- 60 bills tracked (33 real, 23 sensible satire, 4 absurd historical)
- Full-text search via Pagefind
- Embed widget and JSON API for developers
- Dark mode, mobile-friendly, government-parody aesthetic

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 5, MDX, TypeScript |
| Styling | Tailwind CSS v4 |
| Search | Pagefind |
| Edge Functions | Cloudflare Pages Functions |
| Hosting | Cloudflare Pages |
| CI/CD | GitHub Actions + Argo Workflows (self-hosted K8s) |

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Development

```bash
npm install
npm run dev              # Dev server at localhost:4321
npm run build            # Production build + Pagefind search index
npm run preview          # Preview production build
```

### Validation & Quality

```bash
npm run validate         # Validate all bill MDX frontmatter
npm run validate:build   # Validate then build
npm run verify           # Full CI: icons + innerHTML + validate + test + lint + typecheck + format + security + build
npm test                 # Run unit tests
npm run lint             # ESLint
npm run typecheck        # Astro type checking
npm run format:check     # Prettier check
```

### Fetching Bills from Congress.gov

```bash
CONGRESS_GOV_API_KEY=<key> npm run fetch-bills
npm run fetch-bills -- --bill 119/hr/25    # Fetch a specific bill
```

## Content

Bills live in `src/data/bills/` as MDX files. Three types:

- **Real bills** (`real-*.mdx`) — Fetched from Congress.gov with absurdity scores
- **Sensible bills** (`hr-*.mdx`, `s-*.mdx`) — Satirical alternatives that make more sense
- **Absurd bills** (`ra-*.mdx`) — Historical laws that are genuinely absurd

Templates for new bills are in `src/data/bills/_templates/`.

Schema is defined in `src/content.config.ts` (Zod validation with refinements for bill-type requirements).

## Project Structure

```text
├── src/
│   ├── components/      # Astro components (bills, layout, UI)
│   ├── data/bills/      # MDX bill content (60 bills + templates)
│   ├── layouts/         # Base and bill layouts
│   ├── pages/           # Routes and API endpoints
│   └── styles/          # Tailwind v4 theme (global.css)
├── functions/           # Cloudflare Pages Functions (middleware + API)
├── scripts/             # Build-time scripts (fetch, validate, OG images, SEO)
├── tests/               # Unit tests (Node.js test runner)
├── deploy/              # Argo Workflows manifests + release manifest
├── workers/             # Cloudflare Workers
└── public/              # Static assets (icons, OG images, robots.txt)
```

## Deployment

- Hosted on **Cloudflare Pages** at `absurdityindex.org`
- Primary CI: `.github/workflows/pages-deploy.yml` (GitHub Actions)
- Fallback CI: `.woodpecker.yml` + `deploy/argo/` (Argo Workflows on self-hosted K8s)
- Manual: `npx wrangler pages deploy dist --project-name=absurdity-index`

## Related Repos

| Repo | What |
|------|------|
| `absurdity-index-cli` | CLI for auto-posting to X, bill discovery, engagement |
| `votechain` | Cryptographic voter verification protocol + POC |
| `absurdity-index-extension` | Chrome/Firefox extension for Congress.gov |
| `k8s-monitor` | Kubernetes cluster monitor with macOS notifications |

## License

[MIT](./LICENSE)

## Community

- [Contributing](./CONTRIBUTING.md)
- [Support](./SUPPORT.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
- [Changelog](./CHANGELOG.md)
- [Releasing](./RELEASING.md)
