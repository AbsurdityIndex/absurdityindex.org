export function getDashboardHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en" class="bg-[#0f172a]">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Absurdity Index — Engagement Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            navy: { 800: '#1e293b', 900: '#0f172a', 950: '#020617' },
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Caslon+Text:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; }
    .tab-active { border-bottom: 2px solid #eab308; color: #facc15; }
    .score-bar { transition: width 0.3s ease; }
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
    .expand-content { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
    .expand-content.open { max-height: 600px; }
  </style>
</head>
<body class="bg-navy-900 text-gray-200 min-h-screen font-sans">
  <!-- Header -->
  <header class="border-b border-gray-700/50 px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-xl font-serif font-bold text-cream-100">Absurdity Index</h1>
      <span class="text-sm text-gray-400 font-mono">engagement dashboard</span>
    </div>
    <div id="live-indicator" class="flex items-center gap-2 text-sm">
      <span class="w-2 h-2 rounded-full bg-emerald-400 pulse-dot"></span>
      <span class="text-gray-400">LIVE</span>
    </div>
  </header>

  <!-- Stat Cards -->
  <section class="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-5">
    <div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30">
      <div class="text-xs text-gray-400 uppercase tracking-wide">Posts Today</div>
      <div id="stat-posts" class="text-2xl font-bold text-cream-100 mt-1">—</div>
    </div>
    <div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30">
      <div class="text-xs text-gray-400 uppercase tracking-wide">Engagements</div>
      <div id="stat-engagements" class="text-2xl font-bold text-emerald-400 mt-1">—</div>
    </div>
    <div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30">
      <div class="text-xs text-gray-400 uppercase tracking-wide">Safety Reject %</div>
      <div id="stat-safety" class="text-2xl font-bold text-amber-400 mt-1">—</div>
    </div>
    <div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30">
      <div class="text-xs text-gray-400 uppercase tracking-wide">Cost Today</div>
      <div id="stat-cost" class="text-2xl font-bold text-gold-400 mt-1">—</div>
    </div>
  </section>

  <!-- Tab Bar -->
  <nav class="px-6 flex gap-1 border-b border-gray-700/50">
    <button class="tab-btn tab-active px-4 py-2.5 text-sm font-medium hover:text-gold-400 transition-colors" data-tab="cycles">Cycles</button>
    <button class="tab-btn px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gold-400 transition-colors" data-tab="opportunities">Opportunities</button>
    <button class="tab-btn px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gold-400 transition-colors" data-tab="posts">Posts</button>
    <button class="tab-btn px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gold-400 transition-colors" data-tab="safety">Safety</button>
    <button class="tab-btn px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gold-400 transition-colors" data-tab="costs">Costs</button>
  </nav>

  <!-- Tab Content -->
  <main class="px-6 py-5 max-h-[calc(100vh-260px)] overflow-y-auto">
    <!-- Cycles Tab -->
    <div id="tab-cycles" class="tab-content">
      <div id="cycles-list" class="space-y-3">
        <div class="text-gray-500 text-sm">Loading cycles...</div>
      </div>
    </div>

    <!-- Opportunities Tab -->
    <div id="tab-opportunities" class="tab-content hidden">
      <div class="flex gap-3 mb-4 items-center">
        <select id="opp-status-filter" class="bg-navy-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
          <option value="all">All statuses</option>
          <option value="tracked">Tracked</option>
          <option value="engaged">Engaged</option>
          <option value="skipped">Skipped</option>
          <option value="expired">Expired</option>
        </select>
        <label class="text-sm text-gray-400">Min score:
          <input id="opp-min-score" type="range" min="0" max="100" value="0" class="ml-2 align-middle">
          <span id="opp-min-score-val" class="ml-1 font-mono text-xs text-gold-400">0</span>
        </label>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 uppercase border-b border-gray-700/50">
              <th class="pb-2 pr-3 cursor-pointer hover:text-gold-400" data-sort="score">Score</th>
              <th class="pb-2 pr-3">Breakdown</th>
              <th class="pb-2 pr-3">Author</th>
              <th class="pb-2 pr-3">Tweet</th>
              <th class="pb-2 pr-3">Status</th>
              <th class="pb-2 pr-3">Bill</th>
              <th class="pb-2">Action</th>
            </tr>
          </thead>
          <tbody id="opp-table-body" class="divide-y divide-gray-700/30"></tbody>
        </table>
      </div>
    </div>

    <!-- Posts Tab -->
    <div id="tab-posts" class="tab-content hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 uppercase border-b border-gray-700/50">
              <th class="pb-2 pr-3">Status</th>
              <th class="pb-2 pr-3">Type</th>
              <th class="pb-2 pr-3">Content</th>
              <th class="pb-2 pr-3">Safety</th>
              <th class="pb-2 pr-3">Metrics</th>
              <th class="pb-2">Time</th>
            </tr>
          </thead>
          <tbody id="posts-table-body" class="divide-y divide-gray-700/30"></tbody>
        </table>
      </div>
    </div>

    <!-- Safety Tab -->
    <div id="tab-safety" class="tab-content hidden">
      <div id="safety-summary" class="grid grid-cols-3 gap-4 mb-5">
        <div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30">
          <div class="text-xs text-gray-400 uppercase">Total Checks</div>
          <div id="safety-total" class="text-xl font-bold text-cream-100 mt-1">—</div>
        </div>
        <div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30">
          <div class="text-xs text-gray-400 uppercase">Rejected</div>
          <div id="safety-rejected" class="text-xl font-bold text-red-400 mt-1">—</div>
        </div>
        <div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30">
          <div class="text-xs text-gray-400 uppercase">Reject Rate</div>
          <div id="safety-rate" class="text-xl font-bold text-amber-400 mt-1">—</div>
        </div>
      </div>
      <div id="safety-log" class="space-y-3"></div>
    </div>

    <!-- Costs Tab -->
    <div id="tab-costs" class="tab-content hidden">
      <div id="cost-summary" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5"></div>
      <div class="grid md:grid-cols-2 gap-5">
        <div>
          <h3 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">By Model</h3>
          <div id="cost-by-model" class="space-y-2"></div>
        </div>
        <div>
          <h3 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">By Purpose</h3>
          <div id="cost-by-purpose" class="space-y-2"></div>
        </div>
      </div>
      <h3 class="text-sm font-semibold text-gray-300 mb-3 mt-6 uppercase tracking-wide">Recent Generations</h3>
      <div id="cost-recent" class="space-y-2"></div>
    </div>
  </main>

  <script>
    // ── State ──
    let currentTab = 'cycles';
    let cachedData = {};

    // ── Tab switching ──
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.remove('tab-active');
          b.classList.add('text-gray-400');
        });
        btn.classList.add('tab-active');
        btn.classList.remove('text-gray-400');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        const tab = btn.dataset.tab;
        document.getElementById('tab-' + tab).classList.remove('hidden');
        currentTab = tab;
        loadTabData(tab);
      });
    });

    // ── SSE Connection ──
    let evtSource;
    function connectSSE() {
      evtSource = new EventSource('/api/events');
      evtSource.addEventListener('overview', (e) => {
        const data = JSON.parse(e.data);
        updateOverview(data);
      });
      evtSource.addEventListener('new-cycle', () => {
        if (currentTab === 'cycles') loadTabData('cycles');
      });
      evtSource.addEventListener('new-post', () => {
        if (currentTab === 'posts') loadTabData('posts');
      });
      evtSource.addEventListener('new-opportunity', () => {
        if (currentTab === 'opportunities') loadTabData('opportunities');
      });
      evtSource.onerror = () => {
        document.querySelector('#live-indicator span:first-child').classList.replace('bg-emerald-400', 'bg-red-400');
        document.querySelector('#live-indicator span:last-child').textContent = 'RECONNECTING';
        setTimeout(() => {
          document.querySelector('#live-indicator span:first-child').classList.replace('bg-red-400', 'bg-emerald-400');
          document.querySelector('#live-indicator span:last-child').textContent = 'LIVE';
        }, 6000);
      };
    }
    connectSSE();

    // Polling fallback
    setInterval(async () => {
      try {
        const res = await fetch('/api/overview');
        if (res.ok) updateOverview(await res.json());
      } catch {}
    }, 15000);

    // ── Overview updater ──
    function updateOverview(data) {
      document.getElementById('stat-posts').textContent = data.postsToday;
      document.getElementById('stat-engagements').textContent = data.engagementsToday;
      document.getElementById('stat-safety').textContent = (data.safetyRejectRate * 100).toFixed(1) + '%';
      document.getElementById('stat-cost').textContent = '$' + (data.costTodayCents / 100).toFixed(2);
      cachedData.overview = data;
    }

    // ── Tab data loaders ──
    async function loadTabData(tab) {
      switch (tab) {
        case 'cycles': return loadCycles();
        case 'opportunities': return loadOpportunities();
        case 'posts': return loadPosts();
        case 'safety': return loadSafety();
        case 'costs': return loadCosts();
      }
    }

    async function loadCycles() {
      const res = await fetch('/api/cycles?limit=50');
      const cycles = await res.json();
      const container = document.getElementById('cycles-list');
      if (cycles.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-sm">No cycles recorded yet. Start the watch daemon to see data.</div>';
        return;
      }
      container.innerHTML = cycles.map(c => {
        const typeBadge = {
          original: 'bg-fuchsia-500/20 text-fuchsia-300',
          quote: 'bg-blue-500/20 text-blue-300',
          reply: 'bg-emerald-500/20 text-emerald-300',
        }[c.cycle_type] || 'bg-gray-500/20 text-gray-300';

        const duration = c.duration_ms ? (c.duration_ms / 1000).toFixed(1) + 's' : 'running...';
        const hasError = c.error ? '<span class="text-red-400 text-xs ml-2">ERROR</span>' : '';

        return '<div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30 fade-in">' +
          '<div class="flex items-center gap-3 mb-2">' +
            '<span class="font-mono text-sm text-gray-400">#' + c.cycle_index + '</span>' +
            '<span class="px-2 py-0.5 rounded text-xs font-medium ' + typeBadge + '">' + c.cycle_type.toUpperCase() + '</span>' +
            '<span class="text-xs text-gray-500">' + duration + '</span>' +
            hasError +
            '<span class="ml-auto text-xs text-gray-500">' + formatTime(c.started_at) + '</span>' +
          '</div>' +
          (c.cycle_type === 'original' ?
            '<div class="text-sm">' +
              (c.topic ? '<span class="text-gray-300">Topic: <span class="text-fuchsia-300">' + esc(c.topic) + '</span></span>' : '') +
              (c.posted ? ' <span class="text-emerald-400 ml-2">Posted</span>' : ' <span class="text-gray-500 ml-2">Not posted</span>') +
            '</div>'
          :
            '<div class="flex gap-4 text-sm">' +
              '<span class="text-gray-400">Scanned: <span class="text-cyan-300">' + c.scanned + '</span></span>' +
              '<span class="text-gray-400">Engaged: <span class="text-emerald-300">' + c.engaged + '</span></span>' +
              '<span class="text-gray-400">Tracked: <span class="text-yellow-300">' + c.tracked + '</span></span>' +
              '<span class="text-gray-400">Expired: <span class="text-gray-500">' + c.expired + '</span></span>' +
            '</div>'
          ) +
          (c.error ? '<div class="mt-2 text-xs text-red-400 font-mono bg-red-500/10 rounded p-2">' + esc(c.error) + '</div>' : '') +
        '</div>';
      }).join('');
    }

    async function loadOpportunities() {
      const status = document.getElementById('opp-status-filter').value;
      const minScore = parseInt(document.getElementById('opp-min-score').value);
      const res = await fetch('/api/opportunities?limit=100&status=' + status);
      const opps = await res.json();
      const filtered = opps.filter(o => o.score >= minScore);
      const tbody = document.getElementById('opp-table-body');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-4 text-gray-500 text-center">No opportunities found</td></tr>';
        return;
      }
      tbody.innerHTML = filtered.map(o => {
        const scoreColor = o.score >= 70 ? 'text-emerald-400' : o.score >= 40 ? 'text-yellow-400' : 'text-gray-500';
        const statusBadge = {
          tracked: 'bg-blue-500/20 text-blue-300',
          engaged: 'bg-emerald-500/20 text-emerald-300',
          skipped: 'bg-gray-500/20 text-gray-400',
          expired: 'bg-red-500/20 text-red-300',
        }[o.status] || 'bg-gray-500/20 text-gray-400';

        return '<tr class="hover:bg-navy-950/30">' +
          '<td class="py-2.5 pr-3 font-mono font-bold ' + scoreColor + '">' + o.score + '</td>' +
          '<td class="py-2.5 pr-3">' + scoreBreakdown(o.viral_score, o.relevance_score, o.timing_score, o.engageability_score) + '</td>' +
          '<td class="py-2.5 pr-3 text-cyan-300 whitespace-nowrap">@' + esc(o.author_username || o.author_id) + '</td>' +
          '<td class="py-2.5 pr-3 max-w-xs truncate text-gray-300">' + esc(o.text?.slice(0, 100) || '') + '</td>' +
          '<td class="py-2.5 pr-3"><span class="px-2 py-0.5 rounded text-xs ' + statusBadge + '">' + o.status + '</span></td>' +
          '<td class="py-2.5 pr-3 text-fuchsia-300 text-xs font-mono">' + (o.matched_bill_slug || '—') + '</td>' +
          '<td class="py-2.5 text-xs text-gray-400">' + (o.recommended_action || '—') + '</td>' +
        '</tr>';
      }).join('');
    }

    // Wire up opportunity filters
    document.getElementById('opp-status-filter').addEventListener('change', () => loadOpportunities());
    document.getElementById('opp-min-score').addEventListener('input', (e) => {
      document.getElementById('opp-min-score-val').textContent = e.target.value;
      loadOpportunities();
    });

    async function loadPosts() {
      const res = await fetch('/api/posts?limit=50');
      const posts = await res.json();
      const tbody = document.getElementById('posts-table-body');
      if (posts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-gray-500 text-center">No posts yet</td></tr>';
        return;
      }
      tbody.innerHTML = posts.map(p => {
        const statusBadge = {
          posted: 'bg-emerald-500/20 text-emerald-300',
          draft: 'bg-gray-500/20 text-gray-400',
          queued: 'bg-blue-500/20 text-blue-300',
          review: 'bg-yellow-500/20 text-yellow-300',
          rejected: 'bg-red-500/20 text-red-300',
          failed: 'bg-red-500/20 text-red-400',
        }[p.status] || 'bg-gray-500/20 text-gray-400';

        const verdictBadge = {
          SAFE: 'bg-emerald-500/20 text-emerald-300',
          REVIEW: 'bg-yellow-500/20 text-yellow-300',
          REJECT: 'bg-red-500/20 text-red-300',
        }[p.safety_verdict] || 'bg-gray-500/20 text-gray-400';

        const layers = parseLayers(p.safety_layers);
        const metrics = p.analytics_likes != null ?
          p.analytics_likes + ' / ' + p.analytics_retweets + ' / ' + p.analytics_replies :
          '—';

        const rowId = 'post-' + p.id;
        return '<tr class="hover:bg-navy-950/30 cursor-pointer" onclick="toggleExpand(\\'' + rowId + '\\')">' +
          '<td class="py-2.5 pr-3"><span class="px-2 py-0.5 rounded text-xs ' + statusBadge + '">' + p.status + '</span></td>' +
          '<td class="py-2.5 pr-3 text-xs text-gray-400 font-mono">' + esc(p.prompt_type) + '</td>' +
          '<td class="py-2.5 pr-3 max-w-md truncate text-gray-300">' + esc(p.content?.slice(0, 80) || '') + '</td>' +
          '<td class="py-2.5 pr-3">' +
            '<span class="font-mono text-xs mr-1">' + p.safety_score + '</span>' +
            '<span class="px-1.5 py-0.5 rounded text-xs ' + verdictBadge + '">' + p.safety_verdict + '</span>' +
          '</td>' +
          '<td class="py-2.5 pr-3 text-xs text-gray-400 font-mono">' + metrics + '</td>' +
          '<td class="py-2.5 text-xs text-gray-500">' + formatTime(p.created_at) + '</td>' +
        '</tr>' +
        '<tr id="' + rowId + '" class="hidden">' +
          '<td colspan="6" class="pb-4 pt-1 px-3">' +
            '<div class="bg-navy-950 rounded p-3 text-xs space-y-2">' +
              '<div class="text-gray-300 whitespace-pre-wrap font-mono">' + esc(p.content || '') + '</div>' +
              (layers ? '<div class="mt-2">' + renderLayerBars(layers) + '</div>' : '') +
              (p.parent_tweet_id ? '<div class="text-gray-500">Source: <a href="https://x.com/i/status/' + p.parent_tweet_id + '" target="_blank" class="text-cyan-400 hover:underline">' + p.parent_tweet_id + '</a></div>' : '') +
              (p.tweet_id ? '<div class="text-gray-500">Posted: <a href="https://x.com/i/status/' + p.tweet_id + '" target="_blank" class="text-cyan-400 hover:underline">' + p.tweet_id + '</a></div>' : '') +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    async function loadSafety() {
      const [overviewRes, logRes] = await Promise.all([
        fetch('/api/overview'),
        fetch('/api/safety?limit=50'),
      ]);
      const overview = await overviewRes.json();
      const entries = await logRes.json();

      document.getElementById('safety-total').textContent = overview.safetyTotal;
      document.getElementById('safety-rejected').textContent = overview.safetyRejected;
      document.getElementById('safety-rate').textContent = (overview.safetyRejectRate * 100).toFixed(1) + '%';

      const container = document.getElementById('safety-log');
      if (entries.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-sm">No safety checks recorded yet.</div>';
        return;
      }
      container.innerHTML = entries.map(e => {
        const verdictColor = { SAFE: 'text-emerald-400', REVIEW: 'text-yellow-400', REJECT: 'text-red-400' }[e.verdict] || 'text-gray-400';
        const layers = parseLayers(e.layers);
        return '<div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30">' +
          '<div class="flex items-center gap-3 mb-2">' +
            '<span class="font-mono font-bold ' + verdictColor + '">' + e.verdict + '</span>' +
            '<span class="font-mono text-sm text-gray-400">score: ' + e.score + '</span>' +
            '<span class="ml-auto text-xs text-gray-500">' + formatTime(e.created_at) + '</span>' +
          '</div>' +
          '<div class="text-sm text-gray-400 mb-2 truncate">' + esc(e.content?.slice(0, 120) || '') + '</div>' +
          (layers ? renderLayerBars(layers) : '') +
        '</div>';
      }).join('');
    }

    async function loadCosts() {
      const res = await fetch('/api/costs?days=7');
      const data = await res.json();

      document.getElementById('cost-summary').innerHTML =
        costCard('Total (7d)', '$' + (data.totalCostCents / 100).toFixed(2), 'text-gold-400') +
        costCard('API Calls', data.totalCalls, 'text-cyan-300') +
        costCard('Batch Savings', '$' + (data.batchSavings.savedCents / 100).toFixed(2), 'text-emerald-400') +
        costCard('Batch Calls', data.batchSavings.batchCalls, 'text-blue-300');

      document.getElementById('cost-by-model').innerHTML = Object.entries(data.byModel)
        .sort((a, b) => b[1].costCents - a[1].costCents)
        .map(([model, v]) =>
          '<div class="bg-navy-800 rounded p-3 border border-gray-700/30 flex justify-between">' +
            '<span class="font-mono text-sm text-gray-300">' + esc(model) + '</span>' +
            '<span class="text-sm"><span class="text-gold-400">$' + (v.costCents / 100).toFixed(2) + '</span> <span class="text-gray-500">(' + v.calls + ' calls)</span></span>' +
          '</div>'
        ).join('') || '<div class="text-gray-500 text-sm">No generation data</div>';

      document.getElementById('cost-by-purpose').innerHTML = Object.entries(data.byPurpose)
        .sort((a, b) => b[1].costCents - a[1].costCents)
        .map(([purpose, v]) =>
          '<div class="bg-navy-800 rounded p-3 border border-gray-700/30 flex justify-between">' +
            '<span class="font-mono text-sm text-gray-300">' + esc(purpose) + '</span>' +
            '<span class="text-sm"><span class="text-gold-400">$' + (v.costCents / 100).toFixed(2) + '</span> <span class="text-gray-500">(' + v.calls + ' calls)</span></span>' +
          '</div>'
        ).join('') || '<div class="text-gray-500 text-sm">No generation data</div>';

      document.getElementById('cost-recent').innerHTML = (data.recent || []).map(g =>
        '<div class="bg-navy-800 rounded p-2 border border-gray-700/30 flex items-center gap-3 text-xs">' +
          '<span class="font-mono text-gray-400">' + esc(g.model) + '</span>' +
          '<span class="text-gray-300">' + esc(g.purpose) + '</span>' +
          '<span class="text-gold-400 ml-auto">$' + (g.cost_cents / 100).toFixed(3) + '</span>' +
          '<span class="text-gray-500">' + formatTime(g.created_at) + '</span>' +
        '</div>'
      ).join('') || '<div class="text-gray-500 text-sm">No recent generations</div>';
    }

    // ── Utilities ──
    function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function formatTime(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso + 'Z');
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' +
               d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } catch { return iso; }
    }

    function scoreBreakdown(viral, relevance, timing, engageability) {
      const max = 25;
      return '<div class="flex gap-0.5 items-end h-4" title="V:' + viral + ' R:' + relevance + ' T:' + timing + ' E:' + engageability + '">' +
        bar(viral, max, 'bg-rose-400') +
        bar(relevance, max, 'bg-blue-400') +
        bar(timing, max, 'bg-amber-400') +
        bar(engageability, max, 'bg-emerald-400') +
      '</div>';
    }

    function bar(val, max, color) {
      const pct = Math.min(100, (val / max) * 100);
      return '<div class="w-3 rounded-t score-bar ' + color + '" style="height:' + Math.max(2, pct) + '%"></div>';
    }

    function parseLayers(layersStr) {
      if (!layersStr) return null;
      try { return JSON.parse(layersStr); } catch { return null; }
    }

    function renderLayerBars(layers) {
      return '<div class="space-y-1">' + Object.entries(layers).map(([name, score]) => {
        const pct = Math.min(100, Math.max(0, score));
        const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
        return '<div class="flex items-center gap-2">' +
          '<span class="text-xs text-gray-400 w-28 truncate">' + esc(name) + '</span>' +
          '<div class="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">' +
            '<div class="h-full rounded-full score-bar ' + color + '" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<span class="text-xs font-mono text-gray-400 w-8 text-right">' + score + '</span>' +
        '</div>';
      }).join('') + '</div>';
    }

    function costCard(label, value, color) {
      return '<div class="bg-navy-800 rounded-lg p-4 border border-gray-700/30">' +
        '<div class="text-xs text-gray-400 uppercase">' + label + '</div>' +
        '<div class="text-xl font-bold ' + color + ' mt-1">' + value + '</div>' +
      '</div>';
    }

    function toggleExpand(id) {
      const row = document.getElementById(id);
      if (row) row.classList.toggle('hidden');
    }

    // ── Initial load ──
    loadTabData('cycles');
  </script>
</body>
</html>`;
}
