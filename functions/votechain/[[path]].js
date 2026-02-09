/**
 * Reverse proxy — routes /votechain/* to the standalone VoteChain Pages deployment.
 *
 * The parent middleware (_middleware.js) runs first and handles:
 *   - Geo-blocking (US-only)
 *   - www → root redirect
 *   - Turnstile session gating for /votechain/poc/* paths
 *   - Security headers on every response
 *
 * This function just proxies the request to the upstream deployment.
 * Assets at /votechain/_astro/* are also caught by this route.
 */

const UPSTREAM_HOST = 'votechain-dap.pages.dev'

export async function onRequest(context) {
  const url = new URL(context.request.url)
  url.hostname = UPSTREAM_HOST
  url.port = ''

  return fetch(url.toString(), context.request)
}
