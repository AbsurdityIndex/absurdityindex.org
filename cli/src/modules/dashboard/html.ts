export function getDashboardHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en" class="bg-[#0f172a]">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Absurdity Index — Engagement Dashboard</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#127963;</text></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            navy: { 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' },
            gold: { 400: '#facc15', 500: '#eab308' },
            cream: { 100: '#fef9ef', 200: '#fdf3dc' },
          },
          fontFamily: {
            serif: ['Libre Caslon Text', 'Georgia', 'serif'],
            sans: ['Inter', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'Menlo', 'monospace'],
          },
        },
      },
    };
  </script>
  <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Caslon+Text:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; }
    .tab-active { border-bottom: 2px solid #eab308; color: #facc15; }
    .score-bar { transition: width 0.4s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn 0.25s ease-out; }
    @keyframes pulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .pulse-dot { animation: pulseDot 2s ease-in-out infinite; }
    .detail-row { display: none; }
    .detail-row.open { display: table-row; }
    .row-clickable:hover { background: rgba(2, 6, 23, 0.3); }
    .row-clickable { cursor: pointer; }
    .tweet-embed { max-width: 550px; }
    .tweet-embed .twitter-tweet { margin: 0 !important; }
    .loading-shimmer { background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    /* Custom scrollbar */
    main::-webkit-scrollbar, .opp-scroll::-webkit-scrollbar { width: 6px; }
    main::-webkit-scrollbar-track, .opp-scroll::-webkit-scrollbar-track { background: transparent; }
    main::-webkit-scrollbar-thumb, .opp-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    main::-webkit-scrollbar-thumb:hover, .opp-scroll::-webkit-scrollbar-thumb:hover { background: #475569; }
    /* Range input styling */
    input[type="range"] { -webkit-appearance: none; background: #334155; height: 4px; border-radius: 2px; outline: none; }
    input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #eab308; cursor: pointer; }
    /* Split pane */
    .split-pane { display: flex; gap: 0; height: 100%; overflow: hidden; }
    .opp-list { width: 100%; height: 100%; transition: width 0.25s ease; overflow-y: auto; overscroll-behavior: contain; }
    .opp-list.split { width: 50%; border-right: 1px solid rgba(51, 65, 85, 0.4); }
    .opp-detail { width: 0; height: 100%; overflow: hidden; transition: width 0.25s ease, opacity 0.2s ease; opacity: 0; }
    .opp-detail.open { width: 50%; opacity: 1; overflow-y: auto; overscroll-behavior: contain; }
    /* Twitter embed inside detail pane */
    .opp-detail .twitter-tweet { margin: 0 !important; }
    .opp-detail .twitter-tweet iframe { border-radius: 12px !important; }
    .opp-card { cursor: pointer; transition: all 0.15s ease; }
    .opp-card:hover { background: rgba(30, 41, 59, 0.8); }
    .opp-card.selected { background: rgba(30, 41, 59, 0.9); border-left: 3px solid #eab308; }
    /* Pipeline steps */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { animation: spin 1s linear infinite; display: inline-block; }
    /* Char counter */
    .char-over { color: #ef4444 !important; }
    /* Action toggle */
    .action-btn { transition: all 0.15s ease; }
    .action-btn.active { background: rgba(234, 179, 8, 0.15); color: #facc15; border-color: rgba(234, 179, 8, 0.3); }
  </style>
</head>
<body class="bg-navy-900 text-gray-300 min-h-screen font-sans flex flex-col">
  <!-- Header -->
  <header class="border-b border-gray-700/40 px-6 py-3 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-3">
      <h1 class="text-lg font-serif font-bold text-cream-100 tracking-tight">Absurdity Index</h1>
      <span class="text-xs text-gray-500 font-mono tracking-wider uppercase">Dashboard</span>
    </div>
    <div class="flex items-center gap-4">
      <span id="last-update" class="text-xs text-gray-600 font-mono"></span>
      <div id="live-indicator" class="flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"></span>
        <span class="text-xs text-gray-500 font-mono uppercase tracking-wider">Live</span>
      </div>
    </div>
  </header>

  <!-- Stat Cards -->
  <section class="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4 shrink-0">
    <div class="bg-navy-800/80 rounded-lg p-3.5 border border-gray-700/25 hover:border-gray-600/40 transition-colors">
      <div class="flex items-baseline justify-between">
        <span class="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Posts Today</span>
        <span id="stat-posts-total" class="text-[10px] text-gray-600 font-mono"></span>
      </div>
      <div id="stat-posts" class="text-2xl font-bold text-cream-100 mt-0.5 font-mono tabular-nums">--</div>
    </div>
    <div class="bg-navy-800/80 rounded-lg p-3.5 border border-gray-700/25 hover:border-gray-600/40 transition-colors">
      <div class="flex items-baseline justify-between">
        <span class="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Engagements</span>
        <span id="stat-tracked" class="text-[10px] text-gray-600 font-mono"></span>
      </div>
      <div id="stat-engagements" class="text-2xl font-bold text-emerald-400 mt-0.5 font-mono tabular-nums">--</div>
    </div>
    <div class="bg-navy-800/80 rounded-lg p-3.5 border border-gray-700/25 hover:border-gray-600/40 transition-colors">
      <div class="flex items-baseline justify-between">
        <span class="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Safety Reject</span>
        <span id="stat-safety-detail" class="text-[10px] text-gray-600 font-mono"></span>
      </div>
      <div id="stat-safety" class="text-2xl font-bold text-amber-400 mt-0.5 font-mono tabular-nums">--</div>
    </div>
    <div class="bg-navy-800/80 rounded-lg p-3.5 border border-gray-700/25 hover:border-gray-600/40 transition-colors">
      <div class="flex items-baseline justify-between">
        <span class="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Cost Today</span>
        <span id="stat-cost-week" class="text-[10px] text-gray-600 font-mono"></span>
      </div>
      <div id="stat-cost" class="text-2xl font-bold text-gold-400 mt-0.5 font-mono tabular-nums">--</div>
    </div>
  </section>

  <!-- Tab Bar -->
  <nav class="px-6 flex gap-0.5 border-b border-gray-700/40 shrink-0">
    <button class="tab-btn tab-active px-3.5 py-2 text-sm font-medium hover:text-gold-400 transition-colors flex items-center gap-1.5" data-tab="cycles" title="Press 1">
      Cycles <span id="badge-cycles" class="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full font-mono min-w-[20px] text-center">--</span>
    </button>
    <button class="tab-btn px-3.5 py-2 text-sm font-medium text-gray-500 hover:text-gold-400 transition-colors flex items-center gap-1.5" data-tab="opportunities" title="Press 2">
      Opportunities <span id="badge-opportunities" class="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full font-mono min-w-[20px] text-center">--</span>
    </button>
    <button class="tab-btn px-3.5 py-2 text-sm font-medium text-gray-500 hover:text-gold-400 transition-colors flex items-center gap-1.5" data-tab="posts" title="Press 3">
      Posts <span id="badge-posts" class="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full font-mono min-w-[20px] text-center">--</span>
    </button>
    <button class="tab-btn px-3.5 py-2 text-sm font-medium text-gray-500 hover:text-gold-400 transition-colors flex items-center gap-1.5" data-tab="safety" title="Press 4">
      Safety <span id="badge-safety" class="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full font-mono min-w-[20px] text-center">--</span>
    </button>
    <button class="tab-btn px-3.5 py-2 text-sm font-medium text-gray-500 hover:text-gold-400 transition-colors flex items-center gap-1.5" data-tab="costs" title="Press 5">
      Costs <span id="badge-costs" class="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full font-mono min-w-[20px] text-center">--</span>
    </button>
  </nav>

  <!-- Tab Content -->
  <main class="px-6 py-4 flex-1 overflow-hidden">
    <div id="tab-cycles" class="tab-content overflow-y-auto h-full"></div>
    <div id="tab-opportunities" class="tab-content hidden h-full"></div>
    <div id="tab-posts" class="tab-content overflow-y-auto h-full hidden"></div>
    <div id="tab-safety" class="tab-content overflow-y-auto h-full hidden"></div>
    <div id="tab-costs" class="tab-content overflow-y-auto h-full hidden"></div>
  </main>

  <!-- Footer -->
  <footer class="border-t border-gray-700/25 px-6 py-1.5 text-[10px] text-gray-600 font-mono flex justify-between shrink-0">
    <span>absurdityindex.org</span>
    <span>Press 1-5 to switch tabs &middot; Esc to close panel &middot; Click opportunity to engage</span>
  </footer>

<script>
// ── State ──
let currentTab = 'cycles';
let tabLoading = {};
let capabilities = { canFetchTweets: false, canGenerate: false, canPost: false, dryRun: false };
let selectedOpp = null;
let selectedAction = 'quote';
let generateES = null; // active EventSource for generate-draft
let oppData = []; // cached opportunity list

// Load capabilities on boot
fetch('/api/capabilities').then(r => r.json()).then(c => { capabilities = c; }).catch(() => {});

// ── Tab switching ──
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('tab-active'); b.classList.add('text-gray-500'); });
  const btn = document.querySelector('[data-tab="' + tab + '"]');
  if (btn) { btn.classList.add('tab-active'); btn.classList.remove('text-gray-500'); }
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  currentTab = tab;
  loadTab(tab);
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'Escape') { closeDetailPanel(); return; }
  const tabs = ['cycles', 'opportunities', 'posts', 'safety', 'costs'];
  const idx = parseInt(e.key) - 1;
  if (idx >= 0 && idx < tabs.length) switchTab(tabs[idx]);
});

// ── SSE ──
function connectSSE() {
  const es = new EventSource('/api/events');
  es.addEventListener('overview', (e) => updateOverview(JSON.parse(e.data)));
  es.addEventListener('new-cycle', () => { if (currentTab === 'cycles') loadTab('cycles'); });
  es.addEventListener('new-post', () => { if (currentTab === 'posts') loadTab('posts'); });
  es.addEventListener('new-opportunity', () => { if (currentTab === 'opportunities') loadTab('opportunities'); });
  es.onerror = () => {
    setLive(false);
    setTimeout(() => setLive(true), 6000);
  };
}
connectSSE();

function setLive(live) {
  const dot = document.querySelector('#live-indicator span:first-child');
  const label = document.querySelector('#live-indicator span:last-child');
  if (live) { dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot'; label.textContent = 'Live'; }
  else { dot.className = 'w-1.5 h-1.5 rounded-full bg-red-400'; label.textContent = 'Reconnecting'; }
}

// Polling fallback — also auto-refreshes active tab
setInterval(async () => {
  try {
    const r = await fetch('/api/overview');
    if (r.ok) updateOverview(await r.json());
  } catch {}
}, 15000);

// Auto-refresh active tab every 30s
setInterval(() => loadTab(currentTab), 30000);

// ── Overview ──
function updateOverview(d) {
  setText('stat-posts', d.postsToday);
  setText('stat-posts-total', d.postsTotal + ' total');
  setText('stat-engagements', d.engagementsToday);
  setText('stat-tracked', d.opportunities?.tracked + ' tracked');
  setText('stat-safety', (d.safetyRejectRate * 100).toFixed(0) + '%');
  setText('stat-safety-detail', d.safetyRejected + '/' + d.safetyTotal + ' (7d)');
  setText('stat-cost', formatCost(d.costTodayCents));
  setText('stat-cost-week', formatCost(d.costWeekCents) + ' /7d');
  setText('last-update', timeShort(new Date()));
  // Badges
  if (d.counts) {
    setText('badge-cycles', d.counts.cycles || '0');
    setText('badge-opportunities', d.counts.opportunities || '0');
    setText('badge-posts', d.counts.posts || '0');
    setText('badge-safety', d.counts.safety || '0');
    setText('badge-costs', d.counts.generations || '0');
  }
}

// ── Tab loader ──
async function loadTab(tab) {
  if (tabLoading[tab]) return;
  tabLoading[tab] = true;
  const openBefore = getOpenRows();
  try {
    switch (tab) {
      case 'cycles': await renderCycles(); break;
      case 'opportunities': await renderOpportunities(); break;
      case 'posts': await renderPosts(); break;
      case 'safety': await renderSafety(); break;
      case 'costs': await renderCosts(); break;
    }
  } finally {
    tabLoading[tab] = false;
    restoreOpenRows(openBefore);
  }
}

// ── Cycles ──
async function renderCycles() {
  const el = document.getElementById('tab-cycles');
  const data = await fetchJson('/api/cycles?limit=50');
  if (!data || data.length === 0) {
    el.innerHTML = emptyState('No daemon cycles recorded yet',
      'Start the watch daemon to begin recording cycle data:<br>' +
      '<code class="text-xs bg-navy-950 px-2 py-1 rounded mt-2 inline-block text-gold-400">absurdity-index engage watch</code>');
    return;
  }
  el.innerHTML = '<div class="space-y-2">' + data.map(c => {
    const badge = typeBadge(c.cycle_type);
    const dur = c.duration_ms != null ? (c.duration_ms / 1000).toFixed(1) + 's' : '<span class="loading-shimmer rounded px-3 py-0.5 text-transparent text-xs">run</span>';
    const err = c.error ? '<div class="mt-2 text-xs text-red-400/90 font-mono bg-red-500/10 rounded px-2.5 py-1.5 leading-relaxed">' + esc(c.error) + '</div>' : '';
    let body;
    if (c.cycle_type === 'original') {
      body = '<div class="flex items-center gap-3 text-sm mt-1">' +
        (c.topic ? '<span class="text-gray-400">Topic: <span class="text-fuchsia-300">' + esc(c.topic) + '</span></span>' : '<span class="text-gray-600">No topic</span>') +
        (c.posted ? '<span class="bg-emerald-500/15 text-emerald-400 text-xs px-1.5 py-0.5 rounded">Posted</span>' : '<span class="text-gray-600 text-xs">Not posted</span>') +
      '</div>';
    } else {
      body = '<div class="flex gap-5 text-sm mt-1">' +
        stat('Scanned', c.scanned, 'text-cyan-400') +
        stat('Engaged', c.engaged, 'text-emerald-400') +
        stat('Tracked', c.tracked, 'text-yellow-400') +
        stat('Expired', c.expired, 'text-gray-500') +
      '</div>';
    }
    return '<div class="bg-navy-800/60 rounded-lg px-4 py-3 border border-gray-700/20 fade-in">' +
      '<div class="flex items-center gap-2.5">' +
        '<span class="font-mono text-xs text-gray-500">#' + c.cycle_index + '</span>' +
        badge +
        '<span class="text-xs text-gray-500 font-mono">' + dur + '</span>' +
        (c.error ? '<span class="bg-red-500/15 text-red-400 text-[10px] px-1.5 py-0.5 rounded uppercase font-medium">Error</span>' : '') +
        '<span class="ml-auto text-xs text-gray-600" title="' + (c.started_at || '') + '">' + ago(c.started_at) + '</span>' +
      '</div>' +
      body + err +
    '</div>';
  }).join('') + '</div>';
}

// ── Opportunities (split-pane) ──
let oppFilterTimeout;
async function renderOpportunities() {
  const el = document.getElementById('tab-opportunities');
  if (!el.querySelector('.split-pane')) {
    el.innerHTML =
      '<div class="opp-filters flex flex-wrap gap-3 mb-3 items-center">' +
        '<select id="opp-status" class="bg-navy-800 border border-gray-700/40 rounded-md px-2.5 py-1.5 text-xs text-gray-300 focus:border-gold-500 focus:outline-none">' +
          '<option value="all">All statuses</option><option value="tracked">Tracked</option><option value="engaged">Engaged</option><option value="skipped">Skipped</option><option value="expired">Expired</option>' +
        '</select>' +
        '<label class="text-xs text-gray-500 flex items-center gap-2">Min score' +
          '<input id="opp-score" type="range" min="0" max="100" value="0" class="w-24">' +
          '<span id="opp-score-val" class="font-mono text-gold-400 w-5 text-right">0</span>' +
        '</label>' +
      '</div>' +
      '<div class="split-pane" style="height:calc(100% - 44px)">' +
        '<div id="opp-list" class="opp-list opp-scroll pr-2"></div>' +
        '<div id="opp-detail" class="opp-detail opp-scroll pl-4"></div>' +
      '</div>';
    document.getElementById('opp-status').addEventListener('change', () => renderOppList());
    document.getElementById('opp-score').addEventListener('input', (e) => {
      document.getElementById('opp-score-val').textContent = e.target.value;
      clearTimeout(oppFilterTimeout);
      oppFilterTimeout = setTimeout(() => renderOppList(), 150);
    });
  }
  await renderOppList();
}

async function renderOppList() {
  const status = document.getElementById('opp-status')?.value ?? 'all';
  const minScore = parseInt(document.getElementById('opp-score')?.value) || 0;
  const data = await fetchJson('/api/opportunities?limit=100&status=' + status);
  oppData = (data || []).filter(o => o.score >= minScore);
  const list = document.getElementById('opp-list');
  if (!list) return;
  if (oppData.length === 0) {
    list.innerHTML = emptyState('No opportunities match filters', 'Try lowering the minimum score or changing the status filter.');
    return;
  }
  list.innerHTML = '<div class="space-y-1.5">' + oppData.map((o, i) => {
    const sc = o.score >= 70 ? 'text-emerald-400' : o.score >= 40 ? 'text-yellow-400' : 'text-gray-500';
    const sel = selectedOpp && selectedOpp.tweet_id === o.tweet_id ? ' selected' : '';
    return '<div class="opp-card rounded-lg px-3 py-2.5 border border-gray-700/20 bg-navy-800/40' + sel + '" data-idx="' + i + '" onclick="selectOpportunity(' + i + ')">' +
      '<div class="flex items-center gap-2 mb-1">' +
        '<span class="font-mono font-bold text-sm ' + sc + '">' + o.score + '</span>' +
        '<span class="text-cyan-400 text-xs font-medium">@' + esc(o.author_username || o.author_id) + '</span>' +
        statusBadge(o.status) +
        '<span class="ml-auto text-[10px] text-gray-600">' + ago(o.first_seen) + '</span>' +
      '</div>' +
      '<div class="text-xs text-gray-400 leading-relaxed line-clamp-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(o.text || '') + '</div>' +
      '<div class="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500 font-mono">' +
        '<span title="Likes">' + fmtK(o.likes) + ' \\u2764</span>' +
        '<span title="Retweets">' + fmtK(o.retweets) + ' \\uD83D\\uDD01</span>' +
        '<span title="Replies">' + fmtK(o.replies) + ' \\uD83D\\uDCAC</span>' +
        (o.matched_bill_slug ? '<span class="text-fuchsia-400">' + esc(o.matched_bill_slug) + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function selectOpportunity(idx) {
  const opp = oppData[idx];
  if (!opp) return;
  selectedOpp = opp;
  selectedAction = opp.recommended_action === 'reply' ? 'reply' : 'quote';

  // Close any active generate stream
  if (generateES) { generateES.close(); generateES = null; }

  // Highlight selected card
  document.querySelectorAll('.opp-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector('.opp-card[data-idx="' + idx + '"]');
  if (card) card.classList.add('selected');

  // Open split pane
  document.getElementById('opp-list').classList.add('split');
  const detail = document.getElementById('opp-detail');
  detail.classList.add('open');

  renderDetailPanel(opp);
}

function closeDetailPanel() {
  selectedOpp = null;
  if (generateES) { generateES.close(); generateES = null; }
  document.getElementById('opp-list')?.classList.remove('split');
  const detail = document.getElementById('opp-detail');
  if (detail) { detail.classList.remove('open'); }
  document.querySelectorAll('.opp-card').forEach(c => c.classList.remove('selected'));
}

function renderDetailPanel(opp) {
  const detail = document.getElementById('opp-detail');
  if (!detail) return;

  const canGen = capabilities.canGenerate;
  const canPost = capabilities.canPost || capabilities.dryRun;
  const genTitle = canGen ? 'Generate Draft' : 'Configure API keys to enable';
  const postTitle = canPost ? (capabilities.dryRun ? 'Post to X (Dry Run)' : 'Post to X') : 'Configure API keys to enable';

  detail.innerHTML =
    '<div class="fade-in space-y-4">' +
      // Header
      '<div class="flex items-center justify-between">' +
        '<span class="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Engagement</span>' +
        '<div class="flex items-center gap-2">' +
          (opp.tweet_id ? '<a href="https://x.com/i/status/' + opp.tweet_id + '" target="_blank" rel="noopener" class="text-[10px] text-cyan-400 hover:underline">View on X \\u2192</a>' : '') +
          '<button onclick="closeDetailPanel()" class="text-gray-500 hover:text-gray-300 text-xs px-1">\\u2715</button>' +
        '</div>' +
      '</div>' +

      // Tweet embed (real embed with fallback card)
      '<div id="tweet-embed-container">' +
        // Fallback card shown immediately while embed loads
        '<div id="tweet-fallback-card" class="bg-navy-950/80 rounded-lg p-3.5 border border-gray-700/30">' +
          '<div class="flex items-center gap-2 mb-2">' +
            '<div class="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center text-xs font-bold text-gray-400">' +
              esc((opp.author_username || opp.author_id || '?')[0].toUpperCase()) +
            '</div>' +
            '<div>' +
              '<div class="text-sm font-medium text-cream-100">@' + esc(opp.author_username || opp.author_id) + '</div>' +
              '<div class="text-[10px] text-gray-600">' + ago(opp.first_seen) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">' + linkify(esc(opp.text || '')) + '</div>' +
          '<div class="flex items-center gap-4 mt-2.5 text-xs text-gray-500 font-mono">' +
            '<span>' + fmtK(opp.likes) + ' likes</span>' +
            '<span>' + fmtK(opp.retweets) + ' RTs</span>' +
            '<span>' + fmtK(opp.replies) + ' replies</span>' +
            '<span>' + fmtK(opp.impressions) + ' impr</span>' +
          '</div>' +
        '</div>' +
        // Real embed will be injected here
        '<div id="tweet-embed-target"></div>' +
      '</div>' +
      '<div id="quoted-tweet-card"></div>' +

      // Score breakdown
      '<div class="space-y-1.5">' +
        '<div class="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Score Breakdown</div>' +
        '<div class="grid grid-cols-2 gap-x-4 gap-y-1">' +
          scoreBar('Viral', opp.viral_score, 30, 'bg-rose-400') +
          scoreBar('Relevance', opp.relevance_score, 30, 'bg-blue-400') +
          scoreBar('Timing', opp.timing_score, 20, 'bg-amber-400') +
          scoreBar('Engage', opp.engageability_score, 20, 'bg-emerald-400') +
        '</div>' +
        (opp.matched_bill_slug ? '<div class="text-xs text-gray-500 mt-1">Bill: <span class="text-fuchsia-400">' + esc(opp.matched_bill_slug) + '</span></div>' : '') +
        (opp.matched_keywords ? '<div class="text-xs text-gray-500">Keywords: <span class="text-gray-400">' + esc(opp.matched_keywords) + '</span></div>' : '') +
      '</div>' +

      // Action toggle
      '<div>' +
        '<div class="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Action</div>' +
        '<div class="flex gap-1">' +
          '<button class="action-btn text-xs px-3 py-1.5 rounded border border-gray-700/40' + (selectedAction === 'quote' ? ' active' : '') + '" onclick="setAction(\\'quote\\')">Quote</button>' +
          '<button class="action-btn text-xs px-3 py-1.5 rounded border border-gray-700/40' + (selectedAction === 'reply' ? ' active' : '') + '" onclick="setAction(\\'reply\\')">Reply</button>' +
        '</div>' +
      '</div>' +

      // Generate
      '<div>' +
        '<button id="btn-generate" onclick="startGenerate()" class="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ' +
          (canGen ? 'bg-gold-500/15 text-gold-400 border border-gold-500/30 hover:bg-gold-500/25' : 'bg-gray-700/30 text-gray-500 border border-gray-700/30 cursor-not-allowed') +
        '" ' + (canGen ? '' : 'disabled') + ' title="' + genTitle + '">' +
          '\\u26A1 Generate Draft' +
        '</button>' +
        '<div id="pipeline-steps" class="mt-2 space-y-1 hidden"></div>' +
      '</div>' +

      // Draft textarea
      '<div id="draft-section" class="hidden">' +
        '<div class="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Draft</div>' +
        '<textarea id="draft-textarea" rows="4" class="w-full bg-navy-950 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-gray-200 resize-y focus:border-gold-500/50 focus:outline-none font-sans leading-relaxed" placeholder="Generated draft will appear here..."></textarea>' +
        '<div class="flex justify-between mt-1">' +
          '<div id="draft-research" class="text-[10px] text-gray-600 truncate max-w-[70%]"></div>' +
          '<span id="char-count" class="text-[10px] font-mono text-gray-500">0/280</span>' +
        '</div>' +
      '</div>' +

      // Post button
      '<div id="post-section" class="hidden">' +
        '<button id="btn-post" onclick="postEngagement()" class="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ' +
          (canPost ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25' : 'bg-gray-700/30 text-gray-500 border border-gray-700/30 cursor-not-allowed') +
        '" ' + (canPost ? '' : 'disabled') + ' title="' + postTitle + '">' +
          (capabilities.dryRun ? '\\uD83D\\uDE80 Post to X (Dry Run)' : '\\uD83D\\uDE80 Post to X') +
        '</button>' +
      '</div>' +

      // Status banner
      '<div id="post-banner" class="hidden rounded-lg px-3 py-2 text-xs"></div>' +
    '</div>';

  // Set up char counter on textarea
  const ta = document.getElementById('draft-textarea');
  if (ta) {
    ta.addEventListener('input', updateCharCount);
  }

  // Embed real tweet if possible
  if (opp.tweet_id) {
    embedTweet(opp.tweet_id);
  }

  // Fetch live tweet context for quoted/replied-to tweets
  if (capabilities.canFetchTweets && opp.tweet_id) {
    fetchLiveTweetContext(opp.tweet_id);
  }
}

function embedTweet(tweetId) {
  const target = document.getElementById('tweet-embed-target');
  const fallback = document.getElementById('tweet-fallback-card');
  if (!target || !tweetId) return;

  // Wait for Twitter widgets.js to load
  function tryEmbed() {
    if (window.twttr && twttr.widgets && twttr.widgets.createTweet) {
      twttr.widgets.createTweet(tweetId, target, {
        theme: 'dark',
        conversation: 'none',
        dnt: true,
        align: 'center',
      }).then((el) => {
        if (el && fallback) {
          // Real embed loaded — hide fallback
          fallback.style.display = 'none';
        }
      }).catch(() => {
        // Embed failed — fallback stays visible
      });
    } else {
      // widgets.js not loaded yet, retry in 500ms (up to 5 attempts)
      if (!tryEmbed._attempts) tryEmbed._attempts = 0;
      if (tryEmbed._attempts++ < 5) {
        setTimeout(tryEmbed, 500);
      }
    }
  }
  tryEmbed();
}

function linkify(text) {
  return text
    .replace(/(https?:\\/\\/\\S+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">$1</a>')
    .replace(/@(\\w+)/g, '<a href="https://x.com/$1" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">@$1</a>');
}

async function fetchLiveTweetContext(tweetId) {
  try {
    const r = await fetch('/api/tweet-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetId }),
    });
    if (!r.ok) return;
    const ctx = await r.json();
    if (ctx.quotedTweet) {
      const qt = ctx.quotedTweet;
      document.getElementById('quoted-tweet-card').innerHTML =
        '<div class="bg-navy-950/60 rounded-lg p-3 border border-gray-700/20 ml-4 mt-1">' +
          '<div class="text-[10px] text-gray-500 mb-1">Quoted tweet</div>' +
          '<div class="flex items-center gap-1.5 mb-1">' +
            '<span class="text-xs font-medium text-cream-100">@' + esc(qt.author.username) + '</span>' +
          '</div>' +
          '<div class="text-xs text-gray-400 leading-relaxed">' + linkify(esc(qt.text)) + '</div>' +
        '</div>';
    }
    if (ctx.repliedToTweet) {
      const rt = ctx.repliedToTweet;
      document.getElementById('quoted-tweet-card').innerHTML =
        '<div class="bg-navy-950/60 rounded-lg p-3 border border-gray-700/20 ml-4 mt-1">' +
          '<div class="text-[10px] text-gray-500 mb-1">Replying to</div>' +
          '<div class="flex items-center gap-1.5 mb-1">' +
            '<span class="text-xs font-medium text-cream-100">@' + esc(rt.author.username) + '</span>' +
          '</div>' +
          '<div class="text-xs text-gray-400 leading-relaxed">' + linkify(esc(rt.text)) + '</div>' +
        '</div>';
    }
  } catch { /* non-fatal */ }
}

function setAction(action) {
  selectedAction = action;
  document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.action-btn');
  if (action === 'quote' && btns[0]) btns[0].classList.add('active');
  if (action === 'reply' && btns[1]) btns[1].classList.add('active');
  // Clear draft when switching action type
  const ta = document.getElementById('draft-textarea');
  if (ta) { ta.value = ''; updateCharCount(); }
  document.getElementById('draft-section')?.classList.add('hidden');
  document.getElementById('post-section')?.classList.add('hidden');
  document.getElementById('post-banner')?.classList.add('hidden');
}

function startGenerate() {
  if (!selectedOpp || !capabilities.canGenerate) return;

  // Close previous stream
  if (generateES) { generateES.close(); generateES = null; }

  const stepsEl = document.getElementById('pipeline-steps');
  const btn = document.getElementById('btn-generate');
  stepsEl.classList.remove('hidden');
  stepsEl.innerHTML = '';
  btn.disabled = true;
  btn.textContent = 'Generating...';

  document.getElementById('draft-section')?.classList.add('hidden');
  document.getElementById('post-section')?.classList.add('hidden');
  document.getElementById('post-banner')?.classList.add('hidden');

  const steps = {};
  const stepOrder = ['fetch', 'research', 'generate', 'fact-check', 'safety'];

  generateES = new EventSource('/api/generate-draft?tweetId=' + encodeURIComponent(selectedOpp.tweet_id) + '&action=' + selectedAction);

  generateES.addEventListener('step', (e) => {
    const data = JSON.parse(e.data);
    steps[data.step] = data;
    renderPipelineSteps(stepsEl, stepOrder, steps);
  });

  generateES.addEventListener('result', (e) => {
    const data = JSON.parse(e.data);
    generateES.close();
    generateES = null;
    btn.disabled = false;
    btn.textContent = '\\u26A1 Generate Draft';

    if (data.skipReason) {
      showBanner('post-banner', data.skipReason, 'yellow');
      return;
    }

    if (data.content) {
      const ta = document.getElementById('draft-textarea');
      ta.value = data.content;
      document.getElementById('draft-section').classList.remove('hidden');
      document.getElementById('post-section').classList.remove('hidden');
      updateCharCount();

      if (data.researchSummary) {
        document.getElementById('draft-research').textContent = data.researchSummary;
      }

      // Check safety result
      if (data.safetyResult && data.safetyResult.verdict === 'REJECT') {
        showBanner('post-banner', 'Safety REJECTED: ' + (data.safetyResult.reasons || []).join(', '), 'red');
        document.getElementById('btn-post').disabled = true;
        const ta2 = document.getElementById('draft-textarea');
        ta2.readOnly = true;
        ta2.classList.add('opacity-60');
      }

      if (data.factCheckVerdict === 'FLAG' && data.factCheckIssues && data.factCheckIssues.length > 0) {
        showBanner('post-banner', 'Fact-check flagged: ' + data.factCheckIssues.map(i => i.claim).join('; '), 'yellow');
      }
    }
  });

  generateES.addEventListener('error', (e) => {
    let msg = 'Generation failed';
    try { msg = JSON.parse(e.data).message; } catch {}
    generateES.close();
    generateES = null;
    btn.disabled = false;
    btn.textContent = '\\u26A1 Generate Draft';
    showBanner('post-banner', msg, 'red');
  });

  generateES.onerror = () => {
    generateES.close();
    generateES = null;
    btn.disabled = false;
    btn.textContent = '\\u26A1 Generate Draft';
  };
}

function renderPipelineSteps(el, order, steps) {
  el.innerHTML = order.map(name => {
    const s = steps[name];
    if (!s) return '<div class="flex items-center gap-2 text-xs text-gray-600"><span class="w-4 text-center">\\u25CB</span><span>' + name + '</span></div>';
    const icons = { running: '<span class="spinner w-3 h-3 text-gold-400">\\u25E0</span>', complete: '<span class="text-emerald-400">\\u2713</span>', failed: '<span class="text-red-400">\\u2717</span>', skipped: '<span class="text-gray-500">\\u2212</span>' };
    const colors = { running: 'text-gold-400', complete: 'text-emerald-400', failed: 'text-red-400', skipped: 'text-gray-500' };
    return '<div class="flex items-center gap-2 text-xs ' + (colors[s.status] || 'text-gray-500') + '">' +
      '<span class="w-4 text-center">' + (icons[s.status] || '\\u25CB') + '</span>' +
      '<span>' + name + '</span>' +
      (s.detail ? '<span class="text-gray-600 ml-auto text-[10px] truncate max-w-[50%]">' + esc(s.detail) + '</span>' : '') +
    '</div>';
  }).join('');
}

function updateCharCount() {
  const ta = document.getElementById('draft-textarea');
  const counter = document.getElementById('char-count');
  if (!ta || !counter) return;
  const len = ta.value.length;
  const max = selectedAction === 'quote' ? 256 : 280; // quotes use ~24 chars for URL
  counter.textContent = len + '/' + max;
  if (len > max) {
    counter.classList.add('char-over');
    document.getElementById('btn-post')?.setAttribute('disabled', '');
  } else {
    counter.classList.remove('char-over');
    if (len > 0 && (capabilities.canPost || capabilities.dryRun)) {
      document.getElementById('btn-post')?.removeAttribute('disabled');
    }
  }
}

async function postEngagement() {
  const ta = document.getElementById('draft-textarea');
  const btn = document.getElementById('btn-post');
  if (!ta || !selectedOpp || !ta.value.trim()) return;

  btn.disabled = true;
  btn.textContent = 'Posting...';

  try {
    const r = await fetch('/api/post-engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tweetId: selectedOpp.tweet_id,
        content: ta.value.trim(),
        action: selectedAction,
      }),
    });
    const data = await r.json();

    if (data.safetyRejected) {
      showBanner('post-banner', 'Safety REJECTED: ' + (data.safetyReason || 'Unknown'), 'red');
      btn.disabled = false;
      btn.textContent = capabilities.dryRun ? '\\uD83D\\uDE80 Post to X (Dry Run)' : '\\uD83D\\uDE80 Post to X';
      return;
    }

    if (data.success) {
      const msg = data.dryRun
        ? 'Dry run successful — content was not actually posted'
        : 'Posted! ' + (data.tweetUrl ? '<a href="' + data.tweetUrl + '" target="_blank" rel="noopener" class="underline">View tweet</a>' : '');
      showBanner('post-banner', msg, 'green');
      btn.textContent = 'Posted!';

      // Update the list item badge
      if (selectedOpp) {
        const cards = document.querySelectorAll('.opp-card');
        cards.forEach(c => {
          if (oppData[c.dataset.idx]?.tweet_id === selectedOpp.tweet_id) {
            const badge = c.querySelector('[class*="bg-blue-500"]');
            if (badge) { badge.textContent = 'engaged'; badge.className = 'px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400'; }
          }
        });
      }
    } else {
      showBanner('post-banner', 'Failed: ' + (data.error || 'Unknown error'), 'red');
      btn.disabled = false;
      btn.textContent = capabilities.dryRun ? '\\uD83D\\uDE80 Post to X (Dry Run)' : '\\uD83D\\uDE80 Post to X';
    }
  } catch (err) {
    showBanner('post-banner', 'Network error: ' + err.message, 'red');
    btn.disabled = false;
    btn.textContent = capabilities.dryRun ? '\\uD83D\\uDE80 Post to X (Dry Run)' : '\\uD83D\\uDE80 Post to X';
  }
}

function showBanner(id, msg, color) {
  const el = document.getElementById(id);
  if (!el) return;
  const colors = {
    green: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400',
    red: 'bg-red-500/10 border border-red-500/20 text-red-400',
    yellow: 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400',
  };
  el.className = 'rounded-lg px-3 py-2 text-xs ' + (colors[color] || colors.yellow);
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

// ── Posts ──
async function renderPosts() {
  const el = document.getElementById('tab-posts');
  const data = await fetchJson('/api/posts?limit=50');
  if (!data || data.length === 0) {
    el.innerHTML = emptyState('No posts generated yet', 'Posts appear here after the daemon generates content.');
    return;
  }
  el.innerHTML = '<table class="w-full text-sm"><thead><tr class="text-left text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700/30">' +
    '<th class="pb-2 pr-2 w-16">Status</th><th class="pb-2 pr-2 w-24">Type</th><th class="pb-2 pr-2">Content</th>' +
    '<th class="pb-2 pr-2 w-20">Safety</th><th class="pb-2 w-16 text-right">When</th>' +
  '</tr></thead><tbody>' + data.map((p, i) => {
    const sb = statusBadge(p.status);
    const vb = verdictBadge(p.safety_verdict);
    const rid = 'post-' + i;
    return '<tr class="row-clickable border-b border-gray-700/15" onclick="toggle(\\'' + rid + '\\')">' +
      '<td class="py-2 pr-2">' + sb + '</td>' +
      '<td class="py-2 pr-2 text-xs text-gray-500 font-mono">' + esc(p.prompt_type) + '</td>' +
      '<td class="py-2 pr-2 text-gray-400 text-xs"><div class="truncate max-w-lg">' + esc(p.content || '') + '</div></td>' +
      '<td class="py-2 pr-2"><span class="font-mono text-xs text-gray-500 mr-1">' + p.safety_score + '</span>' + vb + '</td>' +
      '<td class="py-2 text-right text-xs text-gray-600" title="' + (p.created_at || '') + '">' + ago(p.created_at) + '</td>' +
    '</tr>' +
    '<tr id="' + rid + '" class="detail-row"><td colspan="5" class="pb-3 pt-1"><div class="bg-navy-950/60 rounded-lg p-3.5 text-xs space-y-3 fade-in">' +
      '<div class="text-gray-200 whitespace-pre-wrap leading-relaxed text-sm">' + esc(p.content || '') + '</div>' +
      renderLayers(p.safety_layers) +
      '<div class="flex flex-wrap gap-x-4 gap-y-1 text-gray-500 text-xs pt-1 border-t border-gray-700/25">' +
        (p.trend_topic ? '<span>Topic: <span class="text-fuchsia-400">' + esc(p.trend_topic) + '</span></span>' : '') +
        (p.bill_slug ? '<span>Bill: <span class="text-fuchsia-400">' + esc(p.bill_slug) + '</span></span>' : '') +
        (p.parent_tweet_id ? '<span>Source: <a href="https://x.com/i/status/' + p.parent_tweet_id + '" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">' + p.parent_tweet_id + '</a></span>' : '') +
        (p.tweet_id ? '<span>Posted: <a href="https://x.com/i/status/' + p.tweet_id + '" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">' + p.tweet_id + '</a></span>' : '') +
        metricsLine(p) +
      '</div>' +
    '</div></td></tr>';
  }).join('') + '</tbody></table>';
}

// ── Safety ──
async function renderSafety() {
  const el = document.getElementById('tab-safety');
  const [overview, entries] = await Promise.all([fetchJson('/api/overview'), fetchJson('/api/safety?limit=50')]);
  const o = overview || {};
  const summaryHtml = '<div class="grid grid-cols-3 gap-3 mb-5">' +
    statCard('Total Checks', o.safetyTotal ?? 0, 'text-cream-100') +
    statCard('Rejected', o.safetyRejected ?? 0, 'text-red-400') +
    statCard('Reject Rate', ((o.safetyRejectRate || 0) * 100).toFixed(0) + '%', 'text-amber-400') +
  '</div>';
  if (!entries || entries.length === 0) {
    el.innerHTML = summaryHtml + emptyState('No safety checks recorded', 'Safety data appears after the HotPot detector runs during post generation.');
    return;
  }
  el.innerHTML = summaryHtml + '<div class="space-y-2">' + entries.map(e => {
    const vc = { SAFE: 'text-emerald-400', REVIEW: 'text-yellow-400', REJECT: 'text-red-400' }[e.verdict] || 'text-gray-400';
    return '<div class="bg-navy-800/60 rounded-lg px-4 py-3 border border-gray-700/20 fade-in">' +
      '<div class="flex items-center gap-2.5 mb-1.5">' +
        '<span class="font-mono text-xs font-bold ' + vc + '">' + e.verdict + '</span>' +
        '<span class="font-mono text-xs text-gray-500">score: ' + e.score + '</span>' +
        '<span class="ml-auto text-xs text-gray-600" title="' + (e.created_at || '') + '">' + ago(e.created_at) + '</span>' +
      '</div>' +
      '<div class="text-xs text-gray-400 mb-2 leading-relaxed">' + esc((e.content || '').slice(0, 200)) + (e.content?.length > 200 ? '...' : '') + '</div>' +
      renderLayers(e.layers) +
    '</div>';
  }).join('') + '</div>';
}

// ── Costs ──
async function renderCosts() {
  const el = document.getElementById('tab-costs');
  const data = await fetchJson('/api/costs?days=7');
  if (!data) { el.innerHTML = emptyState('No cost data', 'Cost data appears after Claude API calls are made.'); return; }

  const summaryHtml = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">' +
    statCard('Total (7d)', formatCost(data.totalCostCents), 'text-gold-400') +
    statCard('API Calls', data.totalCalls, 'text-cyan-400') +
    statCard('Batch Savings', formatCost(data.batchSavings.savedCents), 'text-emerald-400') +
    statCard('Batch Calls', data.batchSavings.batchCalls, 'text-blue-400') +
  '</div>';

  const modelHtml = Object.entries(data.byModel || {}).sort((a,b) => b[1].costCents - a[1].costCents).map(([m, v]) =>
    '<div class="flex items-center justify-between bg-navy-800/60 rounded px-3 py-2 border border-gray-700/20">' +
      '<span class="font-mono text-xs text-gray-300 truncate">' + esc(m) + '</span>' +
      '<span class="text-xs whitespace-nowrap ml-2"><span class="text-gold-400 font-mono">' + formatCost(v.costCents) + '</span> <span class="text-gray-600">(' + v.calls + ')</span></span>' +
    '</div>'
  ).join('') || '<div class="text-xs text-gray-600">No data</div>';

  const purposeHtml = Object.entries(data.byPurpose || {}).sort((a,b) => b[1].costCents - a[1].costCents).map(([p, v]) =>
    '<div class="flex items-center justify-between bg-navy-800/60 rounded px-3 py-2 border border-gray-700/20">' +
      '<span class="font-mono text-xs text-gray-300 truncate">' + esc(p) + '</span>' +
      '<span class="text-xs whitespace-nowrap ml-2"><span class="text-gold-400 font-mono">' + formatCost(v.costCents) + '</span> <span class="text-gray-600">(' + v.calls + ')</span></span>' +
    '</div>'
  ).join('') || '<div class="text-xs text-gray-600">No data</div>';

  const recentHtml = (data.recent || []).map(g =>
    '<div class="flex items-center gap-3 bg-navy-800/40 rounded px-3 py-1.5 border border-gray-700/15 text-xs">' +
      '<span class="font-mono text-gray-500 truncate w-44">' + esc(g.model) + '</span>' +
      '<span class="text-gray-400 truncate flex-1">' + esc(g.purpose) + '</span>' +
      '<span class="text-gold-400 font-mono whitespace-nowrap">' + formatCost(g.cost_cents) + '</span>' +
      '<span class="text-gray-600 whitespace-nowrap" title="' + (g.created_at || '') + '">' + ago(g.created_at) + '</span>' +
    '</div>'
  ).join('') || '<div class="text-xs text-gray-600">No recent data</div>';

  el.innerHTML = summaryHtml +
    '<div class="grid lg:grid-cols-2 gap-4 mb-5">' +
      '<div><h3 class="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">By Model</h3><div class="space-y-1">' + modelHtml + '</div></div>' +
      '<div><h3 class="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">By Purpose</h3><div class="space-y-1">' + purposeHtml + '</div></div>' +
    '</div>' +
    '<h3 class="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">Recent Generations</h3>' +
    '<div class="space-y-1">' + recentHtml + '</div>';
}

// ── Utilities ──
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val ?? ''; }
function toggle(id) {
  const r = document.getElementById(id);
  if (!r) return;
  r.classList.toggle('open');
  if (r.classList.contains('open')) {
    const embed = r.querySelector('.tweet-embed:not(.tweet-loaded)');
    if (embed && window.twttr && twttr.widgets) {
      embed.classList.add('tweet-loaded');
      const tweetId = embed.getAttribute('data-tweet-id');
      embed.innerHTML = '';
      twttr.widgets.createTweet(tweetId, embed, { theme: 'dark', conversation: 'none', width: 500 });
    }
  }
}
function getOpenRows() { return Array.from(document.querySelectorAll('.detail-row.open')).map(r => r.id); }
function restoreOpenRows(ids) { ids.forEach(id => { const r = document.getElementById(id); if (r) r.classList.add('open'); }); }

async function fetchJson(url) {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
}

function ago(iso) {
  if (!iso) return '';
  try {
    const ms = Date.now() - new Date(iso + (iso.includes('Z') || iso.includes('+') ? '' : 'Z')).getTime();
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

function timeShort(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatCost(cents) {
  if (cents == null || cents === 0) return '$0.00';
  if (cents < 1) return '$' + (cents / 100).toFixed(4);
  if (cents < 10) return '$' + (cents / 100).toFixed(3);
  return '$' + (cents / 100).toFixed(2);
}

function fmtK(n) {
  if (n == null) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function typeBadge(type) {
  const map = {
    original: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20',
    quote: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
    reply: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  };
  const cls = map[type] || 'bg-gray-500/15 text-gray-400 border-gray-500/20';
  return '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium border ' + cls + '">' + (type || '').toUpperCase() + '</span>';
}

function statusBadge(status) {
  const map = {
    posted: 'bg-emerald-500/15 text-emerald-400', tracked: 'bg-blue-500/15 text-blue-400',
    engaged: 'bg-emerald-500/15 text-emerald-400', draft: 'bg-gray-500/15 text-gray-400',
    queued: 'bg-blue-500/15 text-blue-400', review: 'bg-yellow-500/15 text-yellow-400',
    rejected: 'bg-red-500/15 text-red-400', failed: 'bg-red-500/15 text-red-400',
    skipped: 'bg-gray-500/15 text-gray-500', expired: 'bg-gray-500/15 text-gray-600',
  };
  const cls = map[status] || 'bg-gray-500/15 text-gray-400';
  return '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium ' + cls + '">' + (status || '') + '</span>';
}

function verdictBadge(v) {
  const map = { SAFE: 'bg-emerald-500/15 text-emerald-400', REVIEW: 'bg-yellow-500/15 text-yellow-400', REJECT: 'bg-red-500/15 text-red-400' };
  const cls = map[v] || 'bg-gray-500/15 text-gray-400';
  return '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium ' + cls + '">' + (v || '') + '</span>';
}

function stat(label, val, color) {
  return '<span class="text-gray-500 text-xs">' + label + ' <span class="font-mono ' + color + '">' + (val ?? 0) + '</span></span>';
}

function scoreBar(label, val, max, color) {
  const pct = Math.min(100, Math.max(0, (val / max) * 100));
  return '<div>' +
    '<div class="flex justify-between mb-0.5"><span class="text-[10px] text-gray-500">' + label + '</span><span class="text-[10px] font-mono text-gray-500">' + val + '</span></div>' +
    '<div class="h-1.5 bg-gray-700/50 rounded-full overflow-hidden"><div class="h-full rounded-full score-bar ' + color + '" style="width:' + pct + '%"></div></div>' +
  '</div>';
}

function renderLayers(layersStr) {
  if (!layersStr) return '';
  let layers;
  try { layers = JSON.parse(layersStr); } catch { return ''; }
  return '<div class="space-y-1 pt-1">' + Object.entries(layers).map(([name, score]) => {
    const pct = Math.min(100, Math.max(0, score));
    const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
    return '<div class="flex items-center gap-2">' +
      '<span class="text-[10px] text-gray-500 w-24 truncate">' + esc(name) + '</span>' +
      '<div class="flex-1 h-1.5 bg-gray-700/50 rounded-full overflow-hidden"><div class="h-full rounded-full score-bar ' + color + '" style="width:' + pct + '%"></div></div>' +
      '<span class="text-[10px] font-mono text-gray-500 w-6 text-right">' + score + '</span>' +
    '</div>';
  }).join('') + '</div>';
}

function metricsLine(p) {
  if (p.analytics_likes == null) return '';
  return '<span>Metrics: <span class="text-gray-300">' + fmtK(p.analytics_likes) + ' likes / ' + fmtK(p.analytics_retweets) + ' RTs / ' + fmtK(p.analytics_replies) + ' replies</span></span>';
}

function statCard(label, value, color) {
  return '<div class="bg-navy-800/60 rounded-lg p-3 border border-gray-700/20">' +
    '<div class="text-[10px] text-gray-500 uppercase tracking-wider">' + label + '</div>' +
    '<div class="text-lg font-bold ' + color + ' mt-0.5 font-mono tabular-nums">' + value + '</div>' +
  '</div>';
}

function emptyState(title, desc) {
  return '<div class="flex flex-col items-center justify-center py-16 text-center">' +
    '<div class="w-10 h-10 rounded-full bg-navy-800 border border-gray-700/30 flex items-center justify-center mb-3">' +
      '<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>' +
    '</div>' +
    '<div class="text-sm text-gray-400 font-medium mb-1">' + title + '</div>' +
    '<div class="text-xs text-gray-600 max-w-sm leading-relaxed">' + desc + '</div>' +
  '</div>';
}

// ── Boot ──
loadTab('cycles');
</script>
</body>
</html>`;
}
