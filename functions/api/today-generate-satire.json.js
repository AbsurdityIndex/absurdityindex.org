/**
 * Manual AI satire generator — call this endpoint directly to force generation.
 * Reads congress data (prompt context) from KV, calls Claude Opus, caches result.
 *
 * Usage: GET /api/today-generate-satire.json?date=2026-02-10
 *
 * The prompt context must already be stored in KV by today.json.js.
 * If no prompt context exists, call /api/today.json first to populate it.
 */

function byDateTimeAsc(a, b) {
  const aTime = a.dateTime ? new Date(a.dateTime).getTime() : Number.MAX_SAFE_INTEGER
  const bTime = b.dateTime ? new Date(b.dateTime).getTime() : Number.MAX_SAFE_INTEGER
  return aTime - bTime
}

function buildClaudePrompt({ today, houseStatus, senateStatus, houseMeetings, senateMeetings, houseVotes, dailyRecord }) {
  const allMeetings = [...houseMeetings.meetings, ...senateMeetings.meetings].sort(byDateTimeAsc)
  const meetingList = allMeetings.slice(0, 12).map((m) => {
    const time = m.time || 'TBA'
    return `- ${time} | [${m.chamber}] ${m.committee}: ${m.title} [focus: ${m.focus}]${m.isClosed ? ' (CLOSED)' : ''}`
  }).join('\n')

  const closedCount = allMeetings.filter((m) => m.isClosed).length
  const totalBills = allMeetings.reduce((s, m) => s + (m.relatedBillCount || 0), 0)
  const totalNoms = allMeetings.reduce((s, m) => s + (m.relatedNominationCount || 0), 0)

  return `You are the editorial satirist for AbsurdityIndex.org's "Today in Congress" page. Your job: turn today's real congressional data into sharp, factually grounded satire.

DATE: ${today.label} (${today.isoDate})

HOUSE STATUS: ${houseStatus.status}
${houseStatus.summary}
${houseVotes.countToday > 0 ? `Roll-call votes today: ${houseVotes.countToday}` : 'No roll-call votes published today.'}

SENATE STATUS: ${senateStatus.status}
${senateStatus.summary}

COMMITTEE MEETINGS (${allMeetings.length} total — ${houseMeetings.count} House, ${senateMeetings.count} Senate):
${meetingList || '(none scheduled)'}

STATS:
- Bills referenced: ${totalBills}
- Nomination items referenced: ${totalNoms}
- Closed sessions: ${closedCount}
- Congressional Record latest issue: ${dailyRecord.issueDateUsed || 'not yet published'}

Write the sections below. Each label must start on its own line.

HEADLINE: A single sentence (max 180 chars) summarizing today's congressional activity with dry editorial wit. Factually accurate. No emoji.

DECK: One punchy sentence (max 200 chars) — the satirical subhead. Think C-SPAN meets John Oliver. No emoji.

HOUSE: One satirical sentence (max 140 chars) summarizing the House's day. Grounded in actual House data above.
SENATE: One satirical sentence (max 140 chars) summarizing the Senate's day. Grounded in actual Senate data above.

BULLET: Power center: [1-2 sentences, max 200 chars total] Where power is flowing today (floor votes vs committees). Ground it in the actual numbers above.
BULLET: Spotlight: [1-2 sentences, max 220 chars total] Spotlight 1-2 specific meetings from the list — pick the most interesting, absurd, or consequential ones.
BULLET: Policy load: [1-2 sentences, max 200 chars total] The policy load (meeting count, bill refs, nomination refs). Use exact numbers from STATS.
BULLET: Transparency: [1-2 sentences, max 200 chars total] Any transparency gaps (closed sessions, missing Congressional Record, quiet vote board). If none, note what IS transparent.

For each committee meeting listed above, write one satirical sentence (max 120 chars). Use the committee name WITHOUT the [House]/[Senate] chamber prefix. Format:
MEETING: [committee name only, no chamber prefix] | [satirical one-liner]

RULES:
- Factually accurate — only reference data provided above. Do not invent meetings, votes, or numbers.
- Dry wit, punches up at process absurdity. Never partisan, never mean to individuals.
- No emoji. No exclamation marks. No "folks" or "buckle up" filler.
- If both chambers are quiet, lean into the absurdity of government doing nothing on the record.`
}

function parseClaudeResponse(text) {
  if (!text) return null
  const headlineMatch = text.match(/^HEADLINE:\s*(.+)$/m)
  const deckMatch = text.match(/^DECK:\s*(.+)$/m)
  const houseMatch = text.match(/^HOUSE:\s*(.+)$/m)
  const senateMatch = text.match(/^SENATE:\s*(.+)$/m)
  const bulletMatches = [...text.matchAll(/^BULLET:\s*(.+)$/gm)]
  const meetingMatches = [...text.matchAll(/^MEETING:\s*(.+?)\s*\|\s*(.+)$/gm)]
  if (!headlineMatch || !deckMatch || bulletMatches.length < 2) return null
  const meetingNotes = {}
  for (const m of meetingMatches) {
    meetingNotes[m[1].trim()] = m[2].trim()
  }
  return {
    headline: headlineMatch[1].trim(),
    deck: deckMatch[1].trim(),
    houseLine: houseMatch ? houseMatch[1].trim() : null,
    senateLine: senateMatch ? senateMatch[1].trim() : null,
    bullets: bulletMatches.map((m) => m[1].trim()),
    meetingNotes,
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export async function onRequestGet(context) {
  const { env, request } = context
  const kv = env?.TODAY_SATIRE
  const anthropicKey = env?.ANTHROPIC_API_KEY

  if (!kv || typeof kv.get !== 'function' || !anthropicKey) {
    return jsonResponse({ status: 'skipped', reason: 'missing-bindings' })
  }

  const url = new URL(request.url)
  const dateKey = url.searchParams.get('date')
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return jsonResponse({ status: 'skipped', reason: 'invalid-date' }, 400)
  }

  // Already cached?
  try {
    const raw = await kv.get(`satire:${dateKey}`)
    if (raw) return jsonResponse({ status: 'cached' })
  } catch { /* continue */ }

  // Read prompt context stored by today.json.js
  let congressData
  try {
    const raw = await kv.get(`prompt-ctx:${dateKey}`)
    if (!raw) return jsonResponse({ status: 'skipped', reason: 'no-prompt-context' })
    congressData = JSON.parse(raw)
  } catch {
    return jsonResponse({ status: 'skipped', reason: 'parse-error' })
  }

  // Acquire lock
  const lockKey = `satire-lock:${dateKey}`
  try {
    const existing = await kv.get(lockKey)
    if (existing) return jsonResponse({ status: 'skipped', reason: 'lock-contention' })
    await kv.put(lockKey, '1', { expirationTtl: 60 })
  } catch {
    return jsonResponse({ status: 'skipped', reason: 'lock-error' })
  }

  try {
    const prompt = buildClaudePrompt(congressData)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25_000)
    let responseText
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        return jsonResponse({ status: 'failed', reason: `api-${response.status}`, detail: errBody.slice(0, 200) })
      }
      const data = await response.json()
      responseText = data.content?.[0]?.text || null
    } finally {
      clearTimeout(timeoutId)
    }

    const parsed = parseClaudeResponse(responseText)
    if (!parsed) {
      return jsonResponse({ status: 'failed', reason: 'parse-failed', preview: responseText?.slice(0, 200) })
    }

    const satireGeneratedAt = new Date().toISOString()
    await kv.put(`satire:${dateKey}`, JSON.stringify({ ...parsed, satireGeneratedAt }), { expirationTtl: 48 * 60 * 60 })
    return jsonResponse({ status: 'generated', satireGeneratedAt })
  } catch (err) {
    return jsonResponse({ status: 'failed', reason: err instanceof Error ? err.message : 'unknown' })
  } finally {
    try { await kv.delete(lockKey) } catch { /* best-effort */ }
  }
}
