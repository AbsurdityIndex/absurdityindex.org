const COUNTER_KEY = 'total_views';
const MAX_SAFE_COUNT = Number.MAX_SAFE_INTEGER;

const BOT_USER_AGENT_PATTERN =
  /\b(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|preview)\b/i;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function getAllowHeaders() {
  return {
    Allow: 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
  };
}

function parseCount(rawValue) {
  if (rawValue === null || rawValue === undefined) return 0;
  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, MAX_SAFE_COUNT);
}

function shouldCountVisit(request) {
  const userAgent = request.headers.get('user-agent') || '';
  if (BOT_USER_AGENT_PATTERN.test(userAgent)) {
    return false;
  }
  return true;
}

async function readCounter(kvNamespace) {
  const raw = await kvNamespace.get(COUNTER_KEY);
  return parseCount(raw);
}

async function incrementCounter(kvNamespace) {
  const current = await readCounter(kvNamespace);
  const next = Math.min(current + 1, MAX_SAFE_COUNT);
  await kvNamespace.put(COUNTER_KEY, String(next));
  return next;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getAllowHeaders(),
    });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: getAllowHeaders(),
    });
  }

  const kvNamespace = env?.VISITOR_COUNTER;
  if (!kvNamespace || typeof kvNamespace.get !== 'function' || typeof kvNamespace.put !== 'function') {
    return jsonResponse(
      {
        enabled: false,
        counted: false,
        totalViews: null,
        message: 'VISITOR_COUNTER KV binding is not configured.',
      },
      200
    );
  }

  if (request.method === 'GET') {
    const totalViews = await readCounter(kvNamespace);
    return jsonResponse({
      enabled: true,
      counted: false,
      totalViews,
    });
  }

  if (!shouldCountVisit(request)) {
    const totalViews = await readCounter(kvNamespace);
    return jsonResponse({
      enabled: true,
      counted: false,
      totalViews,
    });
  }

  const totalViews = await incrementCounter(kvNamespace);
  return jsonResponse({
    enabled: true,
    counted: true,
    totalViews,
  });
}
