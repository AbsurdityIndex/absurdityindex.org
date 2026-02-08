# Cloudflare Pages Functions

Edge middleware and API endpoints that run on Cloudflare's Workers runtime alongside the static Astro site.

## Tech Stack

- **Runtime:** Cloudflare Workers (V8 isolate, NOT Node.js)
- **Language:** Plain JavaScript (`.js` files, no build step)
- **Routing:** File-based — Cloudflare Pages auto-maps `functions/` paths to URL routes

## Files

| File | Route | Purpose |
|------|-------|---------|
| `_middleware.js` | All requests | US-only geo-restriction + security headers + www→root redirect |
| `api/today.json.js` | `/api/today.json` | Daily featured content endpoint |
| `api/visitors.json.js` | `/api/visitors.json` | Visitor analytics endpoint |
| `api/votechain/poc/config.js` | `/api/votechain/poc/config` | Turnstile config for POC gate |
| `api/votechain/poc/session.js` | `/api/votechain/poc/session` | Session cookie verification |
| `api/votechain/poc/unlock.js` | `/api/votechain/poc/unlock` | Turnstile token verification + cookie issuance |
| `api/votechain/poc/replicate.js` | `/api/votechain/poc/replicate` | Server-side proxy for VCL event replication to Workers nodes (holds write tokens) |

## Middleware (`_middleware.js`)

Runs on every request. Three responsibilities:

1. **Canonical host redirect:** `www.absurdityindex.org` → `absurdityindex.org` (301)
2. **US geo-restriction:** Blocks non-US visitors with a themed 403 page. Allows US + territories (PR, GU, VI, AS, MP). Passes through requests with no country info (local dev, health checks)
3. **Security headers:** Sets CSP, HSTS, X-Frame-Options, etc. This is the authoritative header layer (not `_headers` file)

## Important Notes

- These are **Cloudflare Workers**, not Node.js — no `fs`, `path`, `process`, or Node built-ins
- Access Cloudflare-specific APIs via `context.request.cf` (e.g., `cf.country` for geo)
- The `onRequest(context)` export pattern is required for Cloudflare Pages Functions
- Security headers are defined in `_middleware.js`, not in `public/_headers`, because the `_headers` file is unreliable when requests pass through Functions
- CSP allows: `script-src 'self' 'unsafe-inline'` + Cloudflare Insights; `font-src` from Google Fonts
