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
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function methodNotAllowedResponse() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      Allow: Array.from(ALLOWED_METHODS).join(', '),
      'Cache-Control': 'no-store',
    },
  })
}

function notFoundResponse() {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

function buildUpstreamRequest(request, upstreamUrl) {
  const headers = new Headers(request.headers)
  headers.delete('cookie')
  headers.delete('authorization')

  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
  })
}

export async function onRequest(context) {
  const url = new URL(context.request.url)
  if (!url.pathname.startsWith('/votechain')) return notFoundResponse()

  const method = context.request.method.toUpperCase()
  if (!ALLOWED_METHODS.has(method)) return methodNotAllowedResponse()

  const upstreamHost = context.env?.VOTECHAIN_UPSTREAM_HOST || UPSTREAM_HOST
  url.hostname = upstreamHost
  url.port = ''

  return fetch(buildUpstreamRequest(context.request, url.toString()))
}
