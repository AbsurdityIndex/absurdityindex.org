/**
 * Cloudflare Pages middleware — restrict access to US visitors only.
 * Cloudflare automatically provides the visitor's country via request.cf.country.
 */
export async function onRequest(context) {
  const country = context.request.cf?.country;

  // Allow requests with no country info (local dev, health checks, bots)
  if (!country) {
    return context.next();
  }

  // Allow US and US territories
  const allowed = new Set([
    'US', // United States
    'PR', // Puerto Rico
    'GU', // Guam
    'VI', // US Virgin Islands
    'AS', // American Samoa
    'MP', // Northern Mariana Islands
  ]);

  if (allowed.has(country)) {
    return context.next();
  }

  // Block with a 403 and a themed response
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access Restricted | Absurdity Index</title>
  <style>
    body { font-family: Georgia, serif; background: #F5F0E8; color: #0A1628; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { max-width: 500px; text-align: center; background: #fff; border: 2px solid #C5A572; border-radius: 8px; padding: 3rem 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    h1 { color: #0A1628; font-size: 1.5rem; margin-bottom: 0.5rem; }
    .seal { font-size: 3rem; margin-bottom: 1rem; }
    p { color: #334155; line-height: 1.6; }
    .small { font-size: 0.8rem; color: #94a3b8; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="seal">🏛️</div>
    <h1>Access Restricted to U.S. Visitors</h1>
    <p>The Absurdity Index is currently available only within the United States and its territories.</p>
    <p>Much like Congress itself, we're not quite ready for an international audience.</p>
    <p class="small">If you believe this is an error, our complaints department is on permanent recess.</p>
  </div>
</body>
</html>`,
    {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}
