// ── Cycle Algorithm Map ──
// Visualizes the full watch-daemon algorithm as a flowchart for a specific cycle.

// ── Utilities (inline — no shared module with dashboard.js) ──

function lucide(name, cls) {
  const p = {
    'play': '<polygon points="6 3 20 12 6 21 6 3"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'bar-chart-3': '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    'x-circle': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    'alert-triangle': '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    'git-branch': '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    'send': '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    'layers': '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    'filter': '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'shuffle': '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
    'loader-2': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  };
  return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (p[name] || '') + '</svg>';
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function ago(iso) {
  if (!iso) return '';
  try {
    const raw = String(iso);
    const norm = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const withZone = (norm.includes('Z') || norm.includes('+')) ? norm : (norm + 'Z');
    const t = new Date(withZone).getTime();
    if (!isFinite(t)) return raw;
    const ms = Date.now() - t;
    if (ms < 0) return 'just now';
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    return d + 'd ago';
  } catch { return iso; }
}

async function fetchJson(url) {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
}

function fmtDuration(ms) {
  if (ms == null) return '--';
  if (ms < 1000) return ms + 'ms';
  const s = (ms / 1000).toFixed(1);
  return s + 's';
}

function formatCost(cents) {
  if (cents == null || cents === 0) return '$0.00';
  if (cents < 1) return '$' + (cents / 100).toFixed(4);
  if (cents < 10) return '$' + (cents / 100).toFixed(3);
  return '$' + (cents / 100).toFixed(2);
}

function typeBadge(type) {
  const map = {
    original: 'bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/25',
    quote: 'bg-blue-500/10 text-blue-200 border-blue-500/25',
    reply: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/25',
  };
  const cls = map[type] || 'bg-slate-500/10 text-slate-300 border-slate-500/15';
  return '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ' + cls + '">' + esc((type || '').toUpperCase()) + '</span>';
}

// ── Parse URL ──

function parseParams() {
  const url = new URL(window.location.href);
  return { id: parseInt(url.searchParams.get('id') || '0', 10) };
}

// ── Node status helpers ──

function nodeStatus(phase, nodePhase, cycle) {
  // Determine if a node was reached, active, or skipped based on cycle data
  if (cycle.error && cycle.phase === nodePhase) return 'errored';
  if (cycle.completed_at) return 'active'; // cycle completed = all nodes reached
  // If cycle is still running, check phase ordering
  return 'active';
}

// ── Engagement Cycle Flow ──

function buildEngagementNodes(cycle, detail) {
  const c = cycle;
  const scanned = Number(c.scanned || 0);
  const engaged = Number(c.engaged || 0);
  const tracked = Number(c.tracked || 0);
  const expired = Number(c.expired || 0);
  const hasError = !!c.error;
  const errorPhase = c.phase || '';

  // Determine which phases were reached
  const completed = !!c.completed_at;
  const scanEmpty = scanned === 0 && completed && !hasError;

  // Safety/generation data from detail
  const posts = detail.posts || [];
  const newOpps = detail.newOpportunities || [];
  const reevaled = detail.reevaluatedOpportunities || [];
  const safetyChecks = detail.safetyChecks || [];
  const costSummary = detail.costSummary || { totalCents: 0, calls: 0 };

  const safeCount = safetyChecks.filter(s => s.verdict === 'SAFE').length;
  const rejectCount = safetyChecks.filter(s => s.verdict === 'REJECT').length;
  const reviewCount = safetyChecks.filter(s => s.verdict === 'REVIEW').length;

  const nodes = [];

  // 1. START
  nodes.push({
    id: 'start',
    icon: 'play',
    title: 'Cycle #' + c.id + ' — ' + (c.cycle_type || 'engagement').toUpperCase(),
    summary: 'Cycle initiated',
    description: 'The daemon\'s 10-cycle pattern selected this cycle type. ' +
      (c.cycle_type === 'quote' ? 'Quote cycles (50%) engage via quote-tweets.' : 'Reply cycles (20%) respond directly in threads.'),
    data: [
      { label: 'Index', value: '#' + (c.cycle_index ?? '?') },
      { label: 'Started', value: ago(c.started_at) },
    ],
    status: 'active',
  });

  // 2. SCAN
  const scanStatus = (hasError && errorPhase === 'scan') ? 'errored' : 'active';
  nodes.push({
    id: 'scan',
    icon: 'search',
    title: 'Tweet Scan',
    summary: scanned + ' tweets found',
    description: 'Builds 3 search queries (from 8 predefined, rotated by cycle index) and executes them against the X API. Deduplicates results and filters out retweets.',
    data: [
      { label: 'Scanned', value: String(scanned) },
    ],
    status: scanStatus,
    decision: scanned === 0 && completed ? { yes: 'Tweets found', no: 'None found — skip' } : null,
  });

  // If scan found nothing, grey out everything downstream
  const downstreamInactive = scanEmpty;

  // 3. SCORE
  const engageOpps = newOpps.filter(o => o.status === 'engaged' || o.recommended_action === 'engage');
  const trackOpps = newOpps.filter(o => o.status === 'tracked' || o.recommended_action === 'track');
  const skipOpps = newOpps.filter(o => o.status === 'skipped' || o.status === 'expired' || o.recommended_action === 'skip');
  nodes.push({
    id: 'score',
    icon: 'bar-chart-3',
    title: '4-Component Scoring',
    summary: newOpps.length + ' tweets scored',
    description: 'Each tweet is scored 0-100 across four dimensions: Viral (0-30, likes/retweets/replies), Relevance (0-30, congressional account + keyword + bill mentions), Timing (0-20, freshness + peak hours), Engageability (0-20, rhetoric + dollar amounts). Tragedy mentions are instantly skipped.',
    data: [
      { label: 'Engage', value: String(engageOpps.length), cls: 'text-emerald-300' },
      { label: 'Track', value: String(trackOpps.length), cls: 'text-yellow-300' },
      { label: 'Skip', value: String(skipOpps.length), cls: 'text-slate-400' },
    ],
    status: downstreamInactive ? 'inactive' : 'active',
    decision: newOpps.length > 0 ? { yes: engageOpps.length + ' engage', no: skipOpps.length + ' skip' } : null,
  });

  // 4. BUDGET CHECK
  nodes.push({
    id: 'budget',
    icon: 'filter',
    title: 'Budget Gate',
    summary: 'Daily engagement cap',
    description: 'The daemon enforces a daily cap on engagements (default 100) to avoid appearing spammy. If the cap is reached, all candidates are held until tomorrow.',
    data: [
      { label: 'Engaged today', value: String(engaged) },
    ],
    status: downstreamInactive ? 'inactive' : 'active',
  });

  // 5. ENGAGE PIPELINE
  const pipelineStatus = downstreamInactive ? 'inactive' : ((hasError && (errorPhase === 'engage' || errorPhase === 'compose')) ? 'errored' : 'active');
  nodes.push({
    id: 'pipeline',
    icon: 'zap',
    title: 'Engagement Pipeline',
    summary: engaged + ' engaged, ' + (engageOpps.length - engaged) + ' skipped in pipeline',
    description: 'For each candidate (sorted by score, highest first), the daemon runs a 6-step pipeline. Each step can abort the engagement.',
    data: [
      { label: 'Attempted', value: String(engageOpps.length) },
      { label: 'Engaged', value: String(engaged), cls: 'text-emerald-300' },
    ],
    status: pipelineStatus,
    children: buildPipelineSubNodes(detail, downstreamInactive, hasError, errorPhase),
  });

  // 6. RE-EVALUATE
  nodes.push({
    id: 'reevaluate',
    icon: 'eye',
    title: 'Tracked Tweet Re-evaluation',
    summary: reevaled.length + ' re-evaluated',
    description: 'Refreshes metrics (likes, retweets) from X for up to 20 tracked tweets. Re-scores them — a tweet that was marginal earlier may now be viral enough to engage. Ambiguous scores (40-60) get a Claude evaluation for tie-breaking.',
    data: [
      { label: 'Re-evaluated', value: String(reevaled.length) },
    ],
    status: downstreamInactive ? 'inactive' : 'active',
  });

  // 7. EXPIRE
  nodes.push({
    id: 'expire',
    icon: 'trash-2',
    title: 'Opportunity Expiration',
    summary: expired + ' expired',
    description: 'Tracked tweets older than 24 hours are marked expired. Congressional Twitter moves fast — a day-old tweet is no longer relevant for engagement.',
    data: [
      { label: 'Expired', value: String(expired) },
    ],
    status: downstreamInactive ? 'inactive' : 'active',
  });

  // 8. CLEANUP
  nodes.push({
    id: 'cleanup',
    icon: 'clock',
    title: 'Cooldown Cleanup',
    summary: 'Purge stale cooldowns',
    description: 'Author cooldown records older than 48 hours are purged from the database to prevent unbounded growth.',
    data: [],
    status: downstreamInactive ? 'inactive' : 'active',
  });

  // 9. COMPLETE
  const completeStatus = hasError ? 'errored' : (completed ? 'active' : 'inactive');
  nodes.push({
    id: 'complete',
    icon: hasError ? 'x-circle' : 'check-circle',
    title: 'Cycle #' + c.id + ' ' + (hasError ? 'Failed' : 'Complete'),
    summary: hasError ? ('Error in ' + errorPhase) : fmtDuration(c.duration_ms),
    description: hasError
      ? c.error
      : 'Cycle completed successfully.',
    data: [
      { label: 'Duration', value: fmtDuration(c.duration_ms) },
      { label: 'API Cost', value: formatCost(costSummary.totalCents) },
      { label: 'API Calls', value: String(costSummary.calls) },
    ],
    status: completeStatus,
  });

  return nodes;
}

function buildPipelineSubNodes(detail, inactive, hasError, errorPhase) {
  if (inactive) {
    return [
      { id: 'sub-cooldown', icon: 'clock', title: 'Cooldown Check', summary: 'Author cooldown (12h)', status: 'inactive' },
      { id: 'sub-context', icon: 'message-circle', title: 'Fetch Context', summary: 'Full tweet thread', status: 'inactive' },
      { id: 'sub-research', icon: 'eye', title: 'Research (Sonnet)', summary: 'Analyze tweet context', status: 'inactive' },
      { id: 'sub-generate', icon: 'zap', title: 'Generate (Opus)', summary: 'Satirical content', status: 'inactive' },
      { id: 'sub-factcheck', icon: 'file-text', title: 'Fact-Check (Sonnet)', summary: 'Validate claims', status: 'inactive' },
      { id: 'sub-safety', icon: 'shield', title: 'Safety (Hot Pot)', summary: '5-layer check', status: 'inactive' },
      { id: 'sub-post', icon: 'send', title: 'Post to X', summary: 'Publish tweet', status: 'inactive' },
    ];
  }

  const generations = detail.generations || [];
  const safetyChecks = detail.safetyChecks || [];
  const posts = detail.posts || [];

  // Use generations table if populated, otherwise infer from posts
  const researchCalls = generations.filter(g => g.purpose === 'research' || g.purpose === 'engage-research');
  const generateCalls = generations.filter(g => g.purpose === 'engage' || g.purpose === 'generate' || g.purpose === 'engage-generate');
  const factcheckCalls = generations.filter(g => g.purpose === 'fact-check' || g.purpose === 'engage-factcheck');

  // Fall back to post-embedded safety data when safety_log table is empty
  const postSafety = posts.filter(p => p.safety_verdict);
  const safetyItems = safetyChecks.length > 0 ? safetyChecks : postSafety.map(p => ({ verdict: p.safety_verdict, score: p.safety_score }));

  // Infer generation counts from posts if generations table is empty
  const genCount = generateCalls.length > 0 ? generateCalls.length : posts.length;

  return [
    {
      id: 'sub-cooldown',
      icon: 'clock',
      title: 'Cooldown Check',
      summary: 'Author cooldown (12h)',
      description: 'Checks if this author was engaged recently (default 12h cooldown). Prevents dogpiling on one person.',
      status: 'active',
    },
    {
      id: 'sub-context',
      icon: 'message-circle',
      title: 'Fetch Context',
      summary: 'Full tweet thread',
      description: 'Fetches the full tweet thread from X API (parent tweets, author details, conversation tree) to give Claude full context.',
      status: 'active',
    },
    {
      id: 'sub-research',
      icon: 'eye',
      title: 'Research (Sonnet)',
      summary: researchCalls.length > 0 ? (researchCalls.length + ' call' + (researchCalls.length !== 1 ? 's' : '')) : (posts.length > 0 ? 'Completed' : 'Pending'),
      description: 'Sonnet analyzes the tweet context: verifiable facts, sentiment, whether engagement is appropriate. Can skip if it decides the tweet isn\'t worth engaging.',
      data: researchCalls.length > 0 ? [{ label: 'Calls', value: String(researchCalls.length) }] : [],
      status: 'active',
    },
    {
      id: 'sub-generate',
      icon: 'zap',
      title: 'Generate (Opus)',
      summary: genCount > 0 ? (genCount + ' generation' + (genCount !== 1 ? 's' : '')) : 'Pending',
      description: 'Opus generates the satirical content using the selected prompt type. Returns "SKIP" if nothing good fits.',
      data: genCount > 0 ? [{ label: 'Generated', value: String(genCount), cls: 'text-emerald-300' }] : [],
      status: (hasError && errorPhase === 'compose') ? 'errored' : 'active',
    },
    {
      id: 'sub-factcheck',
      icon: 'file-text',
      title: 'Fact-Check (Sonnet)',
      summary: factcheckCalls.length > 0 ? (factcheckCalls.length + ' check' + (factcheckCalls.length !== 1 ? 's' : '')) : (posts.length > 0 ? 'Completed' : 'Pending'),
      description: 'Sonnet validates the generated content against research findings. Catches unsourced claims, loose associations, fabrications. Can reject outright.',
      data: factcheckCalls.length > 0 ? [{ label: 'Calls', value: String(factcheckCalls.length) }] : [],
      status: 'active',
    },
    {
      id: 'sub-safety',
      icon: 'shield',
      title: 'Safety (Hot Pot)',
      summary: safetyItems.length > 0
        ? (safetyItems.length + ' check' + (safetyItems.length !== 1 ? 's' : '') + ' — ' + safetyItems.map(s => s.verdict).join(', '))
        : 'Pending',
      description: 'Hot Pot Detector: 5-layer safety (blocklist, tragedy radar, partisan lean, toxicity, content quality). Score 0-100.',
      data: safetyItems.length > 0 ? [
        { label: 'Safe', value: String(safetyItems.filter(s => s.verdict === 'SAFE').length), cls: 'text-emerald-300' },
        { label: 'Reject', value: String(safetyItems.filter(s => s.verdict === 'REJECT').length), cls: 'text-red-300' },
        { label: 'Review', value: String(safetyItems.filter(s => s.verdict === 'REVIEW').length), cls: 'text-yellow-300' },
      ] : [],
      status: 'active',
      decision: safetyItems.length > 0 ? {
        safe: String(safetyItems.filter(s => s.verdict === 'SAFE').length),
        reject: String(safetyItems.filter(s => s.verdict === 'REJECT').length),
      } : null,
    },
    {
      id: 'sub-post',
      icon: 'send',
      title: 'Post to X',
      summary: posts.length > 0 ? (posts.length + ' posted') : 'No posts',
      description: 'Posts to X via API. Records the post, sets author cooldown, decrements budget.',
      data: posts.length > 0 ? [{ label: 'Posts', value: String(posts.length), cls: 'text-emerald-300' }] : [],
      status: 'active',
    },
  ];
}

// ── Original Post Cycle Flow ──

function buildOriginalNodes(cycle, detail) {
  const c = cycle;
  const hasError = !!c.error;
  const errorPhase = c.phase || '';
  const completed = !!c.completed_at;
  const posted = Number(c.posted || 0) > 0;
  const topic = c.topic || '';

  const posts = detail.posts || [];
  const generations = detail.generations || [];
  const safetyChecks = detail.safetyChecks || [];
  const costSummary = detail.costSummary || { totalCents: 0, calls: 0 };

  // Infer states
  const hasTopic = !!topic;
  const trendsFailed = completed && !hasTopic && !hasError;

  const nodes = [];

  // 1. START
  nodes.push({
    id: 'start',
    icon: 'play',
    title: 'Original Post Cycle #' + c.id,
    summary: 'Cycle initiated',
    description: 'Every 3rd-ish cycle (30% of the 10-cycle pattern), the daemon creates standalone original content driven by what\'s trending — not responding to a specific tweet.',
    data: [
      { label: 'Index', value: '#' + (c.cycle_index ?? '?') },
      { label: 'Started', value: ago(c.started_at) },
    ],
    status: 'active',
  });

  // 2. FETCH TRENDS
  nodes.push({
    id: 'trends',
    icon: 'trending-up',
    title: 'Trend Discovery',
    summary: hasTopic ? 'Trends fetched' : 'Fetching trends',
    description: 'Fetches trending topics from two sources in parallel: X\'s trending topics API and Congress.gov recent legislative actions. These represent what people are talking about and what Congress is actually doing.',
    data: [],
    status: (hasError && errorPhase === 'fetch-trends') ? 'errored' : 'active',
  });

  // 3. AGGREGATE
  nodes.push({
    id: 'aggregate',
    icon: 'layers',
    title: 'Trend Aggregation',
    summary: 'Merge & deduplicate',
    description: 'Merges trends from both sources, deduplicates by topic similarity, and boosts trends that appear in multiple sources (1.5x volume boost per additional source). Cross-source trends are the best — they mean people are talking about something Congress is actively doing.',
    data: [],
    status: (hasError && errorPhase === 'aggregate') ? 'errored' : (trendsFailed ? 'inactive' : 'active'),
  });

  // 4. SCORE TRENDS
  nodes.push({
    id: 'score-trends',
    icon: 'bar-chart-3',
    title: 'Trend Scoring',
    summary: hasTopic ? ('Top: ' + topic) : 'No trends passed',
    description: 'Each trend is scored 0-100: Relevance (50% weight — how congressional is it?), Timing (30% — peak posting hours?), Volume (20% — how many people are talking?). Only trends scoring \u226540 pass.',
    data: hasTopic ? [{ label: 'Top trend', value: topic, cls: 'text-fuchsia-300' }] : [],
    status: trendsFailed ? 'inactive' : 'active',
    decision: hasTopic ? { yes: 'Trends passed', no: null } : (trendsFailed ? { yes: null, no: 'None passed' } : null),
  });

  const downstreamInactive = trendsFailed;

  // 5. MATCH BILLS
  // We can infer bill match from the post prompt_type or the fact that a post exists
  const matchedBill = posts.length > 0 && posts[0].prompt_type === 'bill-roast' ? 'matched' : 'no match';
  nodes.push({
    id: 'match-bills',
    icon: 'target',
    title: 'Bill Matching',
    summary: matchedBill === 'matched' ? 'Bill matched' : 'No bill match',
    description: 'Attempts to find a real bill from the site catalog that relates to the top trend. Adds specificity — instead of just commenting on "the debt ceiling," we can reference the actual bill. Matching is optional.',
    data: [{ label: 'Result', value: matchedBill === 'matched' ? 'Matched' : 'No match' }],
    status: downstreamInactive ? 'inactive' : 'active',
  });

  // 6. PICK PROMPT
  const promptType = posts.length > 0 ? (posts[0].prompt_type || 'unknown') : 'pending';
  const promptCalls = generations.filter(g => g.purpose === 'prompt-select' || g.purpose === 'original-prompt-select');
  nodes.push({
    id: 'pick-prompt',
    icon: 'shuffle',
    title: 'Prompt Selection',
    summary: promptType !== 'pending' ? promptType : 'Not reached',
    description: 'Claude (Sonnet) analyzes the trend + bill context and picks the best satirical format: bill-roast, trend-jack, cspan-after-dark, pork-barrel-report, or floor-speech. A guard ensures bill-roast is only selected when a bill is present.',
    data: promptType !== 'pending' ? [{ label: 'Type', value: promptType, cls: 'text-fuchsia-300' }] : [],
    status: downstreamInactive ? 'inactive' : 'active',
  });

  // 7. GENERATE
  // Use generations table if available, otherwise infer from posts (dry-run mode doesn't log to generations table)
  const genCalls = generations.filter(g => g.purpose === 'original' || g.purpose === 'generate' || g.purpose === 'original-generate');
  const genFromPosts = genCalls.length === 0 && posts.length > 0;
  const genCount = genFromPosts ? posts.length : genCalls.length;
  const genSummary = genCount > 0
    ? (genCount + ' generation' + (genCount !== 1 ? 's' : ''))
    : (downstreamInactive ? 'Not reached' : (completed ? 'Skipped' : 'Pending'));
  nodes.push({
    id: 'generate',
    icon: 'zap',
    title: 'Content Generation (Opus)',
    summary: genSummary,
    description: 'Claude Opus generates the satirical tweet using the selected prompt template and full context (trend topic, matched bill, site URL). Can return "SKIP" if nothing witty fits.',
    data: genCount > 0 ? [{ label: 'Generated', value: String(genCount), cls: 'text-emerald-300' }] : [],
    status: downstreamInactive ? 'inactive' : ((hasError && errorPhase === 'compose') ? 'errored' : 'active'),
  });

  // 8. SAFETY
  // Use safety_log table if available, otherwise fall back to safety data embedded in posts
  const postSafety = posts.filter(p => p.safety_verdict);
  const useSafetyFromPosts = safetyChecks.length === 0 && postSafety.length > 0;
  const safetyItems = useSafetyFromPosts
    ? postSafety.map(p => ({ verdict: p.safety_verdict, score: p.safety_score }))
    : safetyChecks;
  const safeVerdicts = safetyItems.map(s => s.verdict);
  const verdictSummary = safetyItems.length > 0
    ? safeVerdicts.join(', ')
    : (downstreamInactive ? 'Not reached' : (completed && !posted ? 'Blocked' : (completed ? 'Passed' : 'Pending')));
  nodes.push({
    id: 'safety',
    icon: 'shield',
    title: 'Hot Pot Detector (5 Layers)',
    summary: verdictSummary,
    description: 'Same 5-layer safety pipeline as engagement: blocklist scan, tragedy radar, partisan lean analysis, toxicity check, content quality filter. Score 0-100.',
    data: safetyItems.length > 0 ? [
      { label: 'Score', value: String(safetyItems[0]?.score ?? '--') },
      { label: 'Verdict', value: safeVerdicts[0] || '--', cls: safeVerdicts[0] === 'SAFE' ? 'text-emerald-300' : (safeVerdicts[0] === 'REJECT' ? 'text-red-300' : 'text-yellow-300') },
    ] : [],
    status: downstreamInactive ? 'inactive' : 'active',
    decision: safetyItems.length > 0 ? {
      safe: safeVerdicts.includes('SAFE') ? 'Post' : null,
      review: safeVerdicts.includes('REVIEW') ? 'Hold' : null,
      reject: safeVerdicts.includes('REJECT') ? 'Discard' : null,
    } : null,
  });

  // 9. POST
  nodes.push({
    id: 'post',
    icon: 'send',
    title: 'Post to X',
    summary: posted ? 'Posted' : 'Not posted',
    description: 'Posts the generated content as a standalone tweet via X API. On success, records the post in the database with the trend topic for analytics.',
    data: [
      { label: 'Status', value: posted ? 'Posted' : 'Not posted', cls: posted ? 'text-emerald-300' : 'text-slate-400' },
    ],
    status: downstreamInactive ? 'inactive' : (posted ? 'active' : 'active'),
  });

  // COMPLETE
  nodes.push({
    id: 'complete',
    icon: hasError ? 'x-circle' : 'check-circle',
    title: 'Cycle #' + c.id + ' ' + (hasError ? 'Failed' : 'Complete'),
    summary: hasError ? ('Error in ' + errorPhase) : fmtDuration(c.duration_ms),
    description: hasError ? c.error : 'Cycle completed successfully.',
    data: [
      { label: 'Duration', value: fmtDuration(c.duration_ms) },
      { label: 'API Cost', value: formatCost(costSummary.totalCents) },
      { label: 'API Calls', value: String(costSummary.calls) },
    ],
    status: hasError ? 'errored' : (completed ? 'active' : 'inactive'),
  });

  return nodes;
}

// ── Evidence Rendering ──

function renderScanEvidence(scan) {
  if (!scan) return '';
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-heading">Search Queries</div>';
  html += '<table class="map-evidence-table"><tr><th>Query</th><th>Results</th><th></th></tr>';
  for (const q of (scan.queries || [])) {
    const errBadge = q.error ? ' <span class="map-evidence-badge fail" title="' + esc(q.error) + '">ERR</span>' : '';
    html += '<tr><td style="white-space:normal;max-width:none">' + esc(q.query) + '</td><td>' + q.resultCount + '</td><td>' + errBadge + '</td></tr>';
  }
  html += '</table>';
  html += '<div class="map-evidence-heading" style="margin-top:8px">Dedup Pipeline</div>';
  html += '<div class="map-evidence-pipeline">';
  html += '<span class="pipe-step"><span class="pipe-val">Raw: ' + scan.rawTotal + '</span></span>';
  html += '<span class="pipe-arrow">\u2192</span>';
  html += '<span class="pipe-step"><span class="pipe-val">Dedup: \u2212' + scan.dedupRemoved + '</span></span>';
  html += '<span class="pipe-arrow">\u2192</span>';
  html += '<span class="pipe-step"><span class="pipe-val">RT filter: \u2212' + scan.retweetsFiltered + '</span></span>';
  html += '<span class="pipe-arrow">\u2192</span>';
  html += '<span class="pipe-step"><span class="pipe-val" style="color:rgba(52,211,153,0.85)">Final: ' + scan.finalCount + '</span></span>';
  html += '</div></div>';
  return html;
}

function renderScoreEvidence(score) {
  if (!score || !score.tweets || score.tweets.length === 0) return '';
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-heading">Per-Tweet Scores</div>';
  html += '<table class="map-evidence-table"><tr><th>Author</th><th>Preview</th><th>Score</th><th>V/R/T/E</th><th>Action</th></tr>';
  for (const t of score.tweets) {
    const barW = Math.min(100, t.total);
    const actionCls = t.action === 'engage' ? 'engage' : (t.action === 'track' ? 'track' : 'skip');
    const hasReasons = t.reasons && (t.reasons.viral || t.reasons.relevance || t.reasons.timing || t.reasons.engageability);

    // Build tooltip from component reasons
    let reasonTooltip = '';
    if (hasReasons) {
      const parts = [];
      if (t.reasons.viral?.length) parts.push('V(' + t.viral + '): ' + t.reasons.viral.join(', '));
      if (t.reasons.relevance?.length) parts.push('R(' + t.relevance + '): ' + t.reasons.relevance.join(', '));
      if (t.reasons.timing?.length) parts.push('T(' + t.timing + '): ' + t.reasons.timing.join(', '));
      if (t.reasons.engageability?.length) parts.push('E(' + t.engageability + '): ' + t.reasons.engageability.join(', '));
      reasonTooltip = parts.join(' | ');
    }

    html += '<tr>';
    html += '<td style="white-space:nowrap">@' + esc(t.author) + '</td>';
    html += '<td title="' + esc(t.textPreview) + '" style="max-width:260px">' + esc((t.textPreview || '').slice(0, 60)) + (t.textPreview && t.textPreview.length > 60 ? '...' : '') + '</td>';
    html += '<td>' + t.total + ' <span class="map-evidence-bar" style="width:' + barW + 'px"></span></td>';
    html += '<td title="' + esc(reasonTooltip) + '" style="cursor:help">' + t.viral + '/' + t.relevance + '/' + t.timing + '/' + t.engageability + '</td>';
    html += '<td><span class="map-evidence-badge ' + actionCls + '">' + esc(t.action) + '</span>';
    // Show action reason inline
    if (t.reasons?.action) {
      html += '<div class="score-action-reason">' + esc(t.reasons.action) + '</div>';
    }
    html += '</td>';
    html += '</tr>';

    // Expandable detail row with component breakdowns
    if (hasReasons) {
      html += '<tr class="score-reason-row"><td colspan="5">';
      html += '<div class="score-reasons-grid">';
      if (t.reasons.viral?.length) html += '<span class="score-reason-chip"><b>V</b> ' + esc(t.reasons.viral.join(', ')) + '</span>';
      if (t.reasons.relevance?.length) html += '<span class="score-reason-chip"><b>R</b> ' + esc(t.reasons.relevance.join(', ')) + '</span>';
      if (t.reasons.timing?.length) html += '<span class="score-reason-chip"><b>T</b> ' + esc(t.reasons.timing.join(', ')) + '</span>';
      if (t.reasons.engageability?.length) html += '<span class="score-reason-chip"><b>E</b> ' + esc(t.reasons.engageability.join(', ')) + '</span>';
      html += '</div>';
      html += '</td></tr>';
    }
  }
  html += '</table>';
  if (score.summary) {
    html += '<div style="margin-top:6px;display:flex;gap:8px">';
    html += '<span class="map-evidence-badge engage">Engage: ' + score.summary.engage + '</span>';
    html += '<span class="map-evidence-badge track">Track: ' + score.summary.track + '</span>';
    html += '<span class="map-evidence-badge skip">Skip: ' + score.summary.skip + '</span>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderBudgetEvidence(budget) {
  if (!budget) return '';
  const pct = budget.maxPerDay > 0 ? Math.round((budget.engagedToday / budget.maxPerDay) * 100) : 0;
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-stat"><span class="stat-label">Engaged today</span><span>' + budget.engagedToday + ' / ' + budget.maxPerDay + '</span></div>';
  html += '<div class="map-evidence-progress"><div class="fill" style="width:' + pct + '%"></div></div>';
  html += '<div class="map-evidence-stat"><span class="stat-label">Remaining</span><span>' + budget.remaining + '</span></div>';
  if (budget.capReached) {
    html += '<div style="margin-top:4px"><span class="map-evidence-badge fail">CAP REACHED</span></div>';
  }
  html += '</div>';
  return html;
}

function renderPipelineEvidence(pipeline) {
  if (!pipeline || pipeline.length === 0) return '';
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-heading">Per-Candidate Pipeline</div>';
  for (const p of pipeline) {
    const outCls = p.outcome === 'posted' ? 'posted' : (p.outcome === 'skipped' ? 'skipped' : 'failed');
    html += '<div style="padding:6px 0;border-bottom:1px solid rgba(148,163,184,0.05)">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center">';
    html += '<span>@' + esc(p.author) + ' <span style="color:rgba(148,163,184,0.4)">#' + esc(p.tweetId) + '</span></span>';
    html += '<span class="map-evidence-badge ' + outCls + '">' + esc(p.outcome) + '</span>';
    html += '</div>';
    if (p.steps) {
      html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">';
      const steps = p.steps;
      if (steps.cooldown) {
        html += '<span class="map-evidence-badge ' + (steps.cooldown.passed ? 'pass' : 'fail') + '">Cooldown: ' + (steps.cooldown.passed ? 'OK' : 'Blocked') + '</span>';
      }
      if (steps.safety) {
        html += '<span class="map-evidence-badge ' + (steps.safety.verdict === 'SAFE' ? 'safe' : (steps.safety.verdict === 'REJECT' ? 'reject' : 'review')) + '">Safety: ' + esc(steps.safety.verdict) + ' (' + steps.safety.score + ')</span>';
      }
      if (steps.post) {
        html += '<span class="map-evidence-badge ' + (steps.post.success ? 'posted' : 'failed') + '">Post: ' + (steps.post.success ? (steps.post.dryRun ? 'Dry Run' : 'OK') : 'Failed') + '</span>';
      }
      html += '</div>';
    }
    if (p.skipReason) {
      html += '<div style="color:rgba(148,163,184,0.5);margin-top:2px;font-size:10px">' + esc(p.skipReason) + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderReevaluateEvidence(reevaluate) {
  if (!reevaluate || reevaluate.count === 0) return '';
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-heading">Re-evaluated Tweets (' + reevaluate.count + ')</div>';
  if (reevaluate.tweets && reevaluate.tweets.length > 0) {
    html += '<table class="map-evidence-table"><tr><th>Author</th><th>Old</th><th></th><th>New</th><th>Claude?</th><th>Action</th></tr>';
    for (const t of reevaluate.tweets) {
      const delta = t.newScore - t.oldScore;
      const arrow = delta > 0 ? '\u2191' : (delta < 0 ? '\u2193' : '\u2192');
      const arrowColor = delta > 0 ? 'rgba(52,211,153,0.8)' : (delta < 0 ? 'rgba(239,68,68,0.8)' : 'rgba(148,163,184,0.5)');
      html += '<tr>';
      html += '<td>@' + esc(t.author) + '</td>';
      html += '<td>' + t.oldScore + '</td>';
      html += '<td style="color:' + arrowColor + '">' + arrow + '</td>';
      html += '<td>' + t.newScore + '</td>';
      html += '<td>' + (t.claudeEval ? '<span class="map-evidence-badge pass">Yes</span>' : '<span style="color:rgba(148,163,184,0.35)">\u2014</span>') + '</td>';
      html += '<td><span class="map-evidence-badge ' + (t.action === 'quote' || t.action === 'reply' ? 'engage' : (t.action === 'track' ? 'track' : 'skip')) + '">' + esc(t.action) + '</span></td>';
      html += '</tr>';
    }
    html += '</table>';
  }
  html += '</div>';
  return html;
}

function renderExpireEvidence(expire) {
  if (!expire) return '';
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-stat"><span class="stat-label">Expired</span><span>' + expire.count + ' tweet' + (expire.count !== 1 ? 's' : '') + '</span></div>';
  if (expire.tweetIds && expire.tweetIds.length > 0) {
    html += '<div style="color:rgba(148,163,184,0.4);margin-top:4px;font-size:10px">' + expire.tweetIds.slice(0, 10).map(esc).join(', ') + (expire.tweetIds.length > 10 ? '...' : '') + '</div>';
  }
  html += '</div>';
  return html;
}

function renderCleanupEvidence(cleanup) {
  if (!cleanup) return '';
  return '<div class="map-evidence"><span class="map-evidence-badge pass">Ran</span></div>';
}

// Original cycle evidence renderers

function renderTrendsEvidence(trends) {
  if (!trends) return '';
  let html = '<div class="map-evidence">';
  html += '<div style="display:flex;gap:16px">';
  // X trends column
  html += '<div style="flex:1;min-width:0">';
  html += '<div class="map-evidence-heading">X Trends (' + trends.xCount + ')</div>';
  for (const t of (trends.xTrends || []).slice(0, 8)) {
    html += '<div style="display:flex;justify-content:space-between;padding:2px 0"><span>' + esc(t.topic) + '</span><span style="color:rgba(148,163,184,0.4)">' + (t.volume || 0) + '</span></div>';
  }
  html += '</div>';
  // Congress column
  html += '<div style="flex:1;min-width:0">';
  html += '<div class="map-evidence-heading">Congress Actions (' + trends.congressCount + ')</div>';
  for (const t of (trends.congressActions || []).slice(0, 8)) {
    html += '<div style="padding:2px 0">' + esc(t.topic) + '</div>';
  }
  html += '</div>';
  html += '</div></div>';
  return html;
}

function renderAggregateEvidence(aggregate) {
  if (!aggregate) return '';
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-pipeline">';
  html += '<span class="pipe-step"><span class="pipe-val">Before: ' + aggregate.beforeDedup + '</span></span>';
  html += '<span class="pipe-arrow">\u2192</span>';
  html += '<span class="pipe-step"><span class="pipe-val">After: ' + aggregate.afterDedup + '</span></span>';
  html += '</div>';
  if (aggregate.crossSourceCount > 0) {
    html += '<div style="margin-top:4px"><span class="map-evidence-badge pass">Cross-source: ' + aggregate.crossSourceCount + '</span></div>';
  }
  html += '</div>';
  return html;
}

function renderScoreTrendsEvidence(scoreTrends) {
  if (!scoreTrends) return '';
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-heading">Trend Scores (' + scoreTrends.passedCount + ' passed)</div>';
  html += '<table class="map-evidence-table"><tr><th>Topic</th><th>Score</th><th></th></tr>';
  for (const t of (scoreTrends.scored || [])) {
    const barW = Math.min(100, t.score);
    html += '<tr>';
    html += '<td>' + esc(t.topic) + '</td>';
    html += '<td>' + t.score + ' <span class="map-evidence-bar" style="width:' + barW + 'px"></span></td>';
    html += '<td><span class="map-evidence-badge ' + (t.passed ? 'pass' : 'fail') + '">' + (t.passed ? 'PASS' : 'FAIL') + '</span></td>';
    html += '</tr>';
  }
  html += '</table>';
  html += '</div>';
  return html;
}

function renderMatchBillsEvidence(matchBills) {
  if (!matchBills) return '';
  let html = '<div class="map-evidence">';
  if (matchBills.matchedSlug) {
    html += '<div class="map-evidence-stat"><span class="stat-label">Trend</span><span>' + esc(matchBills.topTrend) + '</span></div>';
    html += '<div class="map-evidence-stat"><span class="stat-label">Matched Bill</span><span style="color:rgba(52,211,153,0.85)">' + esc(matchBills.matchedSlug) + '</span></div>';
    if (matchBills.matchedTitle) {
      html += '<div style="color:rgba(148,163,184,0.5);margin-top:2px;font-size:10px">' + esc(matchBills.matchedTitle) + '</div>';
    }
  } else {
    html += '<span class="map-evidence-badge skip">No bill matched</span>';
  }
  html += '</div>';
  return html;
}

function renderPickPromptEvidence(pickPrompt) {
  if (!pickPrompt) return '';
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-stat"><span class="stat-label">Selected</span><span class="map-evidence-badge pass">' + esc(pickPrompt.selectedType) + '</span></div>';
  if (pickPrompt.guardTriggered) {
    html += '<div style="margin-top:4px"><span class="map-evidence-badge review">Guard triggered \u2192 fallback: ' + esc(pickPrompt.fallbackUsed || '') + '</span></div>';
  }
  html += '</div>';
  return html;
}

function renderGenerateEvidence(generate) {
  if (!generate) return '';
  let html = '<div class="map-evidence">';
  if (generate.skipped) {
    html += '<span class="map-evidence-badge skip">SKIP returned</span>';
  } else {
    html += '<div class="map-evidence-stat"><span class="stat-label">Prompt</span><span>' + esc(generate.promptType) + '</span></div>';
    html += '<div class="map-evidence-stat"><span class="stat-label">Length</span><span>' + (generate.contentLength || 0) + ' chars</span></div>';
    if (generate.contentPreview) {
      html += '<div class="map-evidence-code">' + esc(generate.contentPreview) + (generate.contentLength > 100 ? '...' : '') + '</div>';
    }
  }
  html += '</div>';
  return html;
}

function renderSafetyEvidence(safety) {
  if (!safety) return '';
  const verdictCls = safety.verdict === 'SAFE' ? 'safe' : (safety.verdict === 'REJECT' ? 'reject' : 'review');
  let html = '<div class="map-evidence">';
  html += '<div class="map-evidence-stat"><span class="stat-label">Score</span><span>' + safety.score + ' / 100</span></div>';
  const pct = Math.min(100, safety.score);
  html += '<div class="map-evidence-progress"><div class="fill" style="width:' + pct + '%;background:' + (safety.verdict === 'SAFE' ? 'rgba(52,211,153,0.6)' : (safety.verdict === 'REJECT' ? 'rgba(239,68,68,0.6)' : 'rgba(251,191,36,0.6)')) + '"></div></div>';
  html += '<div class="map-evidence-stat"><span class="stat-label">Verdict</span><span class="map-evidence-badge ' + verdictCls + '">' + esc(safety.verdict) + '</span></div>';
  html += '</div>';
  return html;
}

function renderPostEvidence(post) {
  if (!post) return '';
  let html = '<div class="map-evidence">';
  html += '<span class="map-evidence-badge ' + (post.success ? 'posted' : 'failed') + '">' + (post.success ? 'Success' : 'Failed') + '</span>';
  if (post.dryRun) {
    html += ' <span class="map-evidence-badge review">Dry Run</span>';
  }
  if (post.tweetId) {
    html += ' <span style="color:rgba(148,163,184,0.4)">#' + esc(post.tweetId) + '</span>';
  }
  html += '</div>';
  return html;
}

// Attach evidence to engagement nodes based on trace data
function attachEngagementEvidence(nodes, trace) {
  if (!trace) return;
  for (const node of nodes) {
    switch (node.id) {
      case 'scan': node.evidence = renderScanEvidence(trace.scan); break;
      case 'score': node.evidence = renderScoreEvidence(trace.score); break;
      case 'budget': node.evidence = renderBudgetEvidence(trace.budget); break;
      case 'pipeline': node.evidence = renderPipelineEvidence(trace.pipeline); break;
      case 'reevaluate': node.evidence = renderReevaluateEvidence(trace.reevaluate); break;
      case 'expire': node.evidence = renderExpireEvidence(trace.expire); break;
      case 'cleanup': node.evidence = renderCleanupEvidence(trace.cleanup); break;
    }
    // Sub-nodes in pipeline don't get trace evidence (covered by pipeline parent)
  }
}

// Attach evidence to original cycle nodes based on trace data
function attachOriginalEvidence(nodes, trace) {
  if (!trace) return;
  for (const node of nodes) {
    switch (node.id) {
      case 'trends': node.evidence = renderTrendsEvidence(trace.trends); break;
      case 'aggregate': node.evidence = renderAggregateEvidence(trace.aggregate); break;
      case 'score-trends': node.evidence = renderScoreTrendsEvidence(trace.scoreTrends); break;
      case 'match-bills': node.evidence = renderMatchBillsEvidence(trace.matchBills); break;
      case 'pick-prompt': node.evidence = renderPickPromptEvidence(trace.pickPrompt); break;
      case 'generate': node.evidence = renderGenerateEvidence(trace.generate); break;
      case 'safety': node.evidence = renderSafetyEvidence(trace.safety); break;
      case 'post': node.evidence = renderPostEvidence(trace.post); break;
    }
  }
}

// ── Rendering ──

function renderNodeHtml(node) {
  const statusCls = node.status === 'inactive' ? ' inactive' : (node.status === 'errored' ? ' errored' : ' active');
  const icon = lucide(node.icon || 'circle', 'w-4 h-4 shrink-0');

  // Data badges
  const badges = (node.data || []).map(d => {
    const valCls = d.cls ? (' ' + d.cls) : '';
    return '<span class="map-data-badge"><span class="text-slate-500">' + esc(d.label) + '</span> <span class="' + valCls + '">' + esc(d.value) + '</span></span>';
  }).join(' ');

  const descHtml = node.description
    ? '<div class="text-xs text-slate-400 leading-relaxed">' + esc(node.description) + '</div>'
    : '';

  const inactiveNote = node.status === 'inactive'
    ? '<div class="text-[10px] text-slate-600 font-mono mt-1">This step was not reached</div>'
    : '';

  const errorNote = node.status === 'errored' && node.description
    ? '<div class="mt-2 text-xs text-red-300/90 font-mono bg-red-500/10 rounded-lg px-3 py-2 leading-relaxed border border-red-500/15">' + esc(node.description) + '</div>'
    : '';

  const evidenceHtml = node.evidence || '';

  return (
    '<div class="map-node' + statusCls + '" data-node-id="' + esc(node.id) + '" onclick="toggleMapNode(this)">' +
      '<div class="flex items-start gap-3">' +
        '<div class="mt-0.5 text-slate-400">' + icon + '</div>' +
        '<div class="min-w-0 flex-1">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<span class="text-sm font-semibold text-cream-100">' + esc(node.title) + '</span>' +
            '<span class="text-[10px] text-slate-500 font-mono">' + esc(node.summary || '') + '</span>' +
          '</div>' +
          (badges ? '<div class="flex flex-wrap gap-1.5 mt-1.5">' + badges + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="map-node-body">' +
        (node.status === 'errored' ? errorNote : descHtml) +
        inactiveNote +
        evidenceHtml +
      '</div>' +
    '</div>'
  );
}

function renderDecisionHtml(decision, inactive) {
  if (!decision) return '';

  const diamondCls = inactive ? ' inactive' : '';

  // Build branch labels based on what's provided
  let labels = '';
  if (decision.yes != null || decision.no != null) {
    if (decision.yes) labels += '<span class="map-branch-label yes">' + esc(decision.yes) + '</span>';
    if (decision.no) labels += '<span class="map-branch-label no">' + esc(decision.no) + '</span>';
  }
  if (decision.safe != null || decision.reject != null || decision.review != null) {
    if (decision.safe) labels += '<span class="map-branch-label safe">SAFE ' + esc(decision.safe) + '</span>';
    if (decision.review) labels += '<span class="map-branch-label review">REVIEW ' + esc(decision.review) + '</span>';
    if (decision.reject) labels += '<span class="map-branch-label reject">REJECT ' + esc(decision.reject) + '</span>';
  }

  return (
    '<div class="map-decision">' +
      '<div class="map-diamond' + diamondCls + '"></div>' +
    '</div>' +
    (labels ? '<div class="map-branch">' + labels + '</div>' : '')
  );
}

function renderConnectorHtml(inactive) {
  return '<div class="map-connector' + (inactive ? ' inactive' : '') + '"></div>';
}

function renderSubRail(children) {
  if (!children || children.length === 0) return '';

  let html = '<div class="map-sub-rail mt-3">';
  children.forEach((child, i) => {
    if (i > 0) html += renderConnectorHtml(child.status === 'inactive');
    html += renderNodeHtml(child);

    // Add decision after safety sub-node
    if (child.decision) {
      html += renderDecisionHtml(child.decision, child.status === 'inactive');
    }
  });
  html += '</div>';
  return html;
}

function renderMap(nodes) {
  const container = document.getElementById('cycle-map');
  if (!container) return;

  let html = '';
  nodes.forEach((node, i) => {
    if (i > 0) {
      // Add connector before this node
      html += renderConnectorHtml(node.status === 'inactive');
    }

    html += renderNodeHtml(node);

    // Add children (pipeline sub-steps) inside a rail
    if (node.children) {
      html += renderSubRail(node.children);
    }

    // Add decision diamond after this node
    if (node.decision) {
      html += renderDecisionHtml(node.decision, node.status === 'inactive');
    }
  });

  container.innerHTML = html;
}

// ── Header ──

function renderHeader(cycle) {
  const header = document.getElementById('cycle-header');
  if (!header) return;

  const status = cycle.error ? 'error' : (cycle.completed_at ? 'complete' : 'running');
  const statusPill = {
    error: '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-red-500/10 text-red-300 border-red-500/25">ERROR</span>',
    complete: '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-emerald-500/10 text-emerald-300 border-emerald-500/25">COMPLETE</span>',
    running: '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-blue-500/10 text-blue-300 border-blue-500/25">RUNNING</span>',
  }[status];

  header.innerHTML =
    '<div class="flex items-center justify-between gap-3">' +
      '<div class="min-w-0">' +
        '<div class="flex items-center gap-2 flex-wrap">' +
          '<span class="font-serif font-bold text-lg text-cream-100 tracking-tight">Cycle ' + esc(String(cycle.id)) + '</span>' +
          '<span class="font-mono text-[10px] text-slate-600">#' + esc(String(cycle.cycle_index)) + '</span>' +
          typeBadge(cycle.cycle_type) +
          statusPill +
        '</div>' +
        '<div class="text-xs text-slate-400 mt-1">' +
          '<span title="' + esc(String(cycle.started_at || '')) + '">' + esc(ago(cycle.started_at)) + '</span>' +
          (cycle.duration_ms != null ? ' &middot; ' + esc(fmtDuration(cycle.duration_ms)) : '') +
        '</div>' +
      '</div>' +
      '<div class="text-slate-500">' +
        lucide('git-branch', 'w-6 h-6') +
      '</div>' +
    '</div>';
}

// ── Node interaction ──

window.toggleMapNode = function(el) {
  if (el.classList.contains('inactive')) return;
  el.classList.toggle('expanded');
};

// ── Init ──

async function init() {
  const { id } = parseParams();
  if (!id) {
    document.getElementById('cycle-header').innerHTML =
      '<div class="text-sm text-slate-400">No cycle ID specified. <a href="/" class="text-gold-400 hover:underline">Return to dashboard</a>.</div>';
    return;
  }

  // Show loading state
  document.getElementById('cycle-header').innerHTML =
    '<div class="flex items-center gap-2 text-sm text-slate-400">' +
      '<span class="spinner text-slate-500">' + lucide('loader-2', 'w-4 h-4') + '</span>' +
      'Loading cycle #' + esc(String(id)) + '...' +
    '</div>';

  const data = await fetchJson('/api/cycle-detail?id=' + id);

  if (!data || data.error) {
    document.getElementById('cycle-header').innerHTML =
      '<div class="text-sm text-red-300">' + esc(data?.error || 'Failed to load cycle data') + '. <a href="/" class="text-gold-400 hover:underline">Return to dashboard</a>.</div>';
    return;
  }

  const cycle = data.cycle;
  renderHeader(cycle);

  const isOriginal = cycle.cycle_type === 'original';
  const nodes = isOriginal
    ? buildOriginalNodes(cycle, data)
    : buildEngagementNodes(cycle, data);

  // Attach trace evidence to nodes (if trace data exists)
  if (data.trace) {
    if (isOriginal) {
      attachOriginalEvidence(nodes, data.trace);
    } else {
      attachEngagementEvidence(nodes, data.trace);
    }
  }

  renderMap(nodes);
}

init();
