/**
 * Satire Cron Worker — triggers daily AI satire generation for "Today in Congress".
 *
 * Schedule: 04:00 UTC (11:00 PM ET / midnight EDT) daily
 *
 * Generates satire for TOMORROW so content is ready when visitors arrive in the morning.
 *
 * Flow:
 *   1. Compute tomorrow's date in Eastern Time
 *   2. Call /api/today.json?refresh=1&date=YYYY-MM-DD to fetch congress data for tomorrow
 *   3. Call /api/today-generate-satire.json?date=YYYY-MM-DD to generate AI satire
 *   4. Re-fetch /api/today.json?refresh=1&date=YYYY-MM-DD to cache the full response with satire
 *
 * The satire endpoint checks its own KV cache, so repeat calls are no-ops.
 */

const SITE_URL = 'https://absurdityindex.org'

function getTomorrowEtDateKey() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

async function generateSatire(dateKey) {
  // Step 1: Hit today.json with target date to fetch congress data and store prompt context in KV
  const todayRes = await fetch(`${SITE_URL}/api/today.json?refresh=1&date=${dateKey}`, {
    headers: { 'User-Agent': 'satire-cron-worker/1.0' },
  })
  if (!todayRes.ok) {
    console.log(`today.json returned ${todayRes.status}`)
    return { step: 'today.json', status: todayRes.status }
  }

  // Step 2: Trigger AI satire generation (reads prompt context from KV, calls Claude, caches result)
  const satireRes = await fetch(`${SITE_URL}/api/today-generate-satire.json?date=${dateKey}`, {
    headers: { 'User-Agent': 'satire-cron-worker/1.0' },
  })
  const result = await satireRes.json()
  console.log(`Satire generation for ${dateKey}:`, JSON.stringify(result))

  // Step 3: Re-fetch today.json so the cached response includes the new AI satire
  try {
    await fetch(`${SITE_URL}/api/today.json?refresh=1&date=${dateKey}`, {
      headers: { 'User-Agent': 'satire-cron-worker/1.0' },
    })
  } catch {}

  return result
}

export default {
  async scheduled(event, env, ctx) {
    const dateKey = getTomorrowEtDateKey()
    const result = await generateSatire(dateKey)
    console.log(`Cron complete for ${dateKey}:`, JSON.stringify(result))
  },

  // HTTP handler for manual testing: GET /?date=YYYY-MM-DD (defaults to tomorrow)
  async fetch(request) {
    const url = new URL(request.url)
    const dateKey = url.searchParams.get('date') || getTomorrowEtDateKey()
    const result = await generateSatire(dateKey)
    return new Response(JSON.stringify({ dateKey, ...result }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}
