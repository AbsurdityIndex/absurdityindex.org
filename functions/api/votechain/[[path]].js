/**
 * Reverse proxy — routes /api/votechain/* to the standalone VoteChain Pages deployment.
 *
 * Proxied endpoints:
 *   POST /api/votechain/poc/unlock      — Turnstile verification → session cookie
 *   GET  /api/votechain/poc/session     — Session status check
 *   GET  /api/votechain/poc/config      — Client feature flags
 *   POST /api/votechain/poc/replicate   — Forward VCL events to Workers
 *
 * The parent middleware applies security headers to the response.
 * Set-Cookie headers from the upstream pass through — the browser sets them
 * for absurdityindex.org since that's the origin the browser sees.
 */

const UPSTREAM_HOST = 'votechain-dap.pages.dev'

export async function onRequest(context) {
  const url = new URL(context.request.url)
  url.hostname = UPSTREAM_HOST
  url.port = ''

  return fetch(url.toString(), context.request)
}
