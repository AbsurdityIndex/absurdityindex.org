function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet(context) {
  const siteKey = context.env?.PUBLIC_TURNSTILE_SITE_KEY;
  const enabled = Boolean(
    siteKey && context.env?.TURNSTILE_SECRET_KEY && context.env?.POC_ACCESS_COOKIE_SECRET,
  );

  if (!enabled) return jsonResponse({ enabled: false }, 200);

  return jsonResponse(
    {
      enabled: true,
      site_key: siteKey,
    },
    200,
  );
}
