import { onRequestGet } from '../../../functions/api/today.json.js';

/**
 * Static fallback for hosts that do not execute Cloudflare Pages Functions.
 *
 * - In `astro dev`, this endpoint runs live per request.
 * - In static builds, Astro prerenders this as `/api/today-fallback.json`.
 */
export async function GET() {
  return onRequestGet(
    {},
    {
      apiKey: import.meta.env.CONGRESS_GOV_API_KEY || process.env.CONGRESS_GOV_API_KEY,
    },
  );
}
