# AGENTS.md — Cloudflare Pages Functions

This file provides guidance to AI coding assistants working in the `functions/` directory.

## Overview

Edge middleware and API endpoints running on Cloudflare Pages alongside the static Astro site. These execute on Cloudflare's Workers runtime at the edge, NOT in Node.js.

## Tech Stack

- **Runtime:** Cloudflare Workers (V8 isolate) — **NOT Node.js**
- **Language:** Plain JavaScript (`.js` files, no TypeScript, no build step)
- **Routing:** File-based — Cloudflare Pages automatically maps `functions/` file paths to URL routes

## Important: Runtime Constraints

Cloudflare Workers is a V8 isolate environment. The following are **NOT available**:

- `fs`, `path`, `os`, `process`, or any Node.js built-in modules
- `__dirname`, `__filename`
- `require()` (only ES module `import` is supported)
- Long-running processes or persistent connections

Use the Workers-specific APIs:

- `context.request.cf` for Cloudflare request properties (country, colo, etc.)
- `context.next()` to pass to the next handler
- `context.env` for environment variables / secrets
- Standard Web APIs (`Request`, `Response`, `Headers`, `URL`, `fetch`)

## Files

| File | Route | Purpose |
|------|-------|---------|
| `_middleware.js` | All requests | US-only geo-restriction, security headers, www→root redirect |
| `api/today.json.js` | `/api/today.json` | Daily featured content endpoint |
| `api/visitors.json.js` | `/api/visitors.json` | Visitor analytics endpoint |

## Middleware Details (`_middleware.js`)

The middleware runs on **every request** and handles three concerns:

1. **Canonical host redirect:** `www.absurdityindex.org` → `absurdityindex.org` (301 redirect)
2. **US geo-restriction:** Blocks non-US visitors with a themed 403 page. Allows US + territories (PR, GU, VI, AS, MP). Requests with no country info pass through (local dev, bots)
3. **Security headers:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.

**Security headers are set here, not in `public/_headers`**, because the `_headers` file is unreliable when requests pass through Functions middleware.

## Key Patterns

- Export `onRequest(context)` — this is the Cloudflare Pages Functions convention
- Return `new Response(body, { status, headers })` — standard Web API pattern
- Use `context.request.cf?.country` for geo data (may be undefined in local dev)
- All API endpoints return JSON with appropriate `Content-Type` headers
- The middleware wraps `context.next()` responses to inject security headers
