/**
 * Reverse proxy — routes /api/votechain/* to the standalone VoteChain Pages deployment.
 *
 * Hardened behavior:
 *   - Only explicit endpoint allowlist entries are proxied
 *   - Cookie and Authorization headers are removed before forwarding
 *
 * The parent middleware applies security headers to the response.
 */

const UPSTREAM_HOST = 'votechain-dap.pages.dev'
const POC_ACCESS_COOKIE_NAME = 'vc_poc_access'
const ALLOWED_PROXY_ROUTES = new Map([
  ['/api/votechain/poc/replicate', new Set(['POST', 'OPTIONS'])],
])

function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function methodNotAllowedResponse(allowedMethods) {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      Allow: Array.from(allowedMethods).join(', '),
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

function getCookieValue(cookieHeader, cookieName) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key === cookieName && value) return value
  }
  return null
}

function buildUpstreamRequest(request, upstreamUrl, pathname) {
  const headers = new Headers(request.headers)
  const cookieHeader = request.headers.get('cookie')
  const pocCookieValue = getCookieValue(cookieHeader, POC_ACCESS_COOKIE_NAME)

  headers.delete('cookie')
  headers.delete('authorization')
  if (pathname === '/api/votechain/poc/replicate' && pocCookieValue) {
    headers.set('cookie', `${POC_ACCESS_COOKIE_NAME}=${pocCookieValue}`)
  }

  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
  })
}

export async function onRequest(context) {
  const url = new URL(context.request.url)
  const pathname = normalizePathname(url.pathname)
  const allowedMethods = ALLOWED_PROXY_ROUTES.get(pathname)
  if (!allowedMethods) return notFoundResponse()

  const method = context.request.method.toUpperCase()
  if (!allowedMethods.has(method)) return methodNotAllowedResponse(allowedMethods)

  const upstreamHost = context.env?.VOTECHAIN_UPSTREAM_HOST || UPSTREAM_HOST
  url.hostname = upstreamHost
  url.port = ''

  return fetch(buildUpstreamRequest(context.request, url.toString(), pathname))
}
