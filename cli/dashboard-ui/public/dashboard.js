// ── State ──
let currentTab = 'cycles';
let tabLoading = {};
let capabilities = {
  canFetchTweets: false,
  canGenerate: false,
  canWrite: false,
  canRefreshMetrics: false,
  canStartDaemon: false,
  canPost: false,
  dryRun: false,
  siteUrl: 'https://absurdityindex.org',
  engageAuthorCooldownHours: 12,
  maxEngagementsPerDay: 100,
};
let selectedOpp = null;
let selectedAction = 'quote';
let generateES = null; // active EventSource for generate-draft
let oppData = []; // cached opportunity list
let oppFilters = loadOppFilters();
let feedData = []; // cached feed items
let feedFilters = loadFeedFilters();
let tweetEmbedResizeHandler = null;
let embedInteractive = false;
let daemonState = { running: false, startedAt: null, stoppedAt: null, lastError: null, options: null };
let ctxMenu = { open: false, idx: null, x: 0, y: 0 };
let cyclesRefreshTimer = null;
let lastCyclesRenderKey = null;
let cyclesShowUnfinished = (() => {
  try { return localStorage.getItem('ai-dashboard-cycles-show-unfinished') === '1'; } catch { return false; }
})();

const TAB_META = {
  cycles: { title: 'Cycles' },
  opportunities: { title: 'Inbox' },
  feed: { title: 'Feed' },
  posts: { title: 'Posts' },
  safety: { title: 'Safety' },
  costs: { title: 'Spend' },
  intel: { title: 'Intel' },
};

function isTextInput(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
}

function isHelpOpen() {
  const el = document.getElementById('help-overlay');
  return el && !el.classList.contains('hidden');
}

function isComposeOpen() {
  const el = document.getElementById('compose-overlay');
  return el && !el.classList.contains('hidden');
}

function toggleHelp(show) {
  const el = document.getElementById('help-overlay');
  if (!el) return;
  const shouldShow = typeof show === 'boolean' ? show : el.classList.contains('hidden');
  if (shouldShow) { el.classList.remove('hidden'); el.classList.add('flex'); }
  else { el.classList.add('hidden'); el.classList.remove('flex'); }
}

function toggleCompose(show) {
  const el = document.getElementById('compose-overlay');
  if (!el) return;
  const shouldShow = typeof show === 'boolean' ? show : el.classList.contains('hidden');
  if (shouldShow) {
    el.classList.remove('hidden'); el.classList.add('flex');
    const banner = document.getElementById('compose-banner');
    if (banner) { banner.classList.add('hidden'); banner.textContent = ''; }
    const ta = document.getElementById('compose-text');
    const target = document.getElementById('compose-target');
    if (ta) ta.value = '';
    if (target) target.value = '';
    setupComposeUi();
    setTimeout(() => document.getElementById('compose-text')?.focus(), 0);
  } else {
    el.classList.add('hidden'); el.classList.remove('flex');
  }
}

function toggleCyclesUnfinished() {
  cyclesShowUnfinished = !cyclesShowUnfinished;
  try { localStorage.setItem('ai-dashboard-cycles-show-unfinished', cyclesShowUnfinished ? '1' : '0'); } catch {}
  // Force a rerender even if data hasn't changed.
  lastCyclesRenderKey = null;
  if (currentTab === 'cycles') renderCycles().catch(() => {});
}

function toast(msg, kind) {
  const root = document.getElementById('toast-root');
  if (!root || !msg) return;
  const colors = {
    info: 'border-slate-700/40 text-slate-200',
    success: 'border-emerald-500/30 text-emerald-200',
    warning: 'border-amber-500/30 text-amber-200',
    error: 'border-red-500/30 text-red-200',
  };
  const el = document.createElement('div');
  el.className = 'toast surface rounded-xl px-3 py-2 text-xs font-medium border ' + (colors[kind] || colors.info);
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 220); }, 2400);
}

function applyCapabilities(c) {
  capabilities = { ...capabilities, ...(c || {}) };

  const modePill = document.getElementById('mode-pill');
  if (modePill) {
    modePill.classList.remove('hidden');
    const isDry = !!capabilities.dryRun;
    modePill.textContent = isDry ? 'DRY RUN' : 'LIVE';
    modePill.className = 'text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ' +
      (isDry ? 'border-amber-500/30 text-amber-200 bg-amber-500/10' : 'border-emerald-500/30 text-emerald-200 bg-emerald-500/10');
  }

  const capsEl = document.getElementById('capabilities-pill');
  if (capsEl) {
    capsEl.classList.remove('hidden');
    capsEl.innerHTML =
      pillDot(capabilities.canFetchTweets, 'Tweets') +
      pillDot(capabilities.canGenerate, 'Generate') +
      pillDot(capabilities.canPost, capabilities.dryRun ? 'Post (dry)' : 'Post');
  }

  // Compose controls depend on dry-run + write/post capability.
  updateComposeButtons();
  updateDaemonControls();
}

function pillDot(ok, label) {
  const cls = ok ? 'bg-emerald-400' : 'bg-slate-600';
  const txt = ok ? 'text-slate-200' : 'text-slate-500';
  return '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-700/30 bg-navy-950/30 ' + txt + '">' +
    '<span class="w-1.5 h-1.5 rounded-full ' + cls + '"></span>' +
    '<span>' + esc(label) + '</span>' +
  '</span>';
}

function updateComposeButtons() {
  const btn = document.getElementById('btn-compose-post');
  if (btn) {
    const label = capabilities.dryRun ? 'Save draft' : 'Post';
    btn.textContent = label;
    btn.disabled = !capabilities.canPost;
    btn.classList.toggle('opacity-50', !capabilities.canPost);
    btn.classList.toggle('cursor-not-allowed', !capabilities.canPost);
  }

  const hint = document.getElementById('compose-hint');
  if (hint) {
    hint.textContent = capabilities.dryRun
      ? 'Dry run saves locally (no post to X)'
      : (capabilities.canPost ? '' : 'Posting disabled (configure X write credentials)');
  }
}

function setupComposeUi() {
  updateComposeButtons();

  const mode = document.getElementById('compose-mode');
  const wrap = document.getElementById('compose-target-wrap');
  const ta = document.getElementById('compose-text');
  const target = document.getElementById('compose-target');

  function syncModeUi() {
    const v = mode?.value || 'tweet';
    const needsTarget = (v === 'reply' || v === 'quote');
    if (wrap) wrap.classList.toggle('hidden', !needsTarget);
    updateComposeCount();
  }

  if (mode && !mode.dataset.bound) {
    mode.dataset.bound = '1';
    mode.addEventListener('change', syncModeUi);
  }

  if (ta && !ta.dataset.bound) {
    ta.dataset.bound = '1';
    ta.addEventListener('input', updateComposeCount);
  }

  if (target && !target.dataset.bound) {
    target.dataset.bound = '1';
    target.addEventListener('input', updateComposeCount);
  }

  syncModeUi();
  updateComposeCount();
}

function extractTweetId(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const m = s.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return m?.[1] || s;
}

function updateComposeCount() {
  const mode = document.getElementById('compose-mode')?.value || 'tweet';
  const max = mode === 'quote' ? 256 : 280;
  const ta = document.getElementById('compose-text');
  const countEl = document.getElementById('compose-count');
  const btn = document.getElementById('btn-compose-post');
  if (!ta || !countEl) return;
  const len = ta.value.length;
  countEl.textContent = len + '/' + max;
  const tooLong = len > max;
  countEl.classList.toggle('char-over', tooLong);
  if (btn) btn.disabled = tooLong || !ta.value.trim() || !capabilities.canPost;
}

function showComposeBanner(msg, color) {
  const el = document.getElementById('compose-banner');
  if (!el) return;
  const colors = {
    green: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200',
    red: 'bg-red-500/10 border border-red-500/20 text-red-200',
    yellow: 'bg-amber-500/10 border border-amber-500/20 text-amber-200',
  };
  el.className = 'rounded-xl px-3 py-2 text-xs mb-3 ' + (colors[color] || colors.yellow);
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function submitCompose() {
  const mode = document.getElementById('compose-mode')?.value || 'tweet';
  const ta = document.getElementById('compose-text');
  const targetRaw = document.getElementById('compose-target')?.value || '';
  const btn = document.getElementById('btn-compose-post');
  if (!ta) return;

  const content = ta.value.trim();
  const targetTweetId = (mode === 'reply' || mode === 'quote') ? extractTweetId(targetRaw) : '';
  if (!content) { showComposeBanner('Content is required', 'yellow'); return; }
  if ((mode === 'reply' || mode === 'quote') && !targetTweetId) { showComposeBanner('Target tweet is required', 'yellow'); return; }

  if (btn) {
    btn.disabled = true;
    btn.textContent = capabilities.dryRun ? 'Saving...' : 'Posting...';
  }

  try {
    const r = await fetch('/api/post-compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, content, targetTweetId }),
    });
    const data = await r.json().catch(() => ({}));

    if (data.safetyRejected) {
      showComposeBanner('Safety rejected: ' + (data.safetyReason || 'Unknown'), 'red');
      toast('Safety rejected', 'error');
      return;
    }

    if (!r.ok || !data.success) {
      showComposeBanner(data.error || 'Failed to post', 'red');
      toast('Compose failed', 'error');
      return;
    }

    if (data.dryRun) {
      toast('Draft saved', 'success');
      showComposeBanner('Dry run saved a draft locally. Nothing was posted to X.', 'green');
    } else {
      toast('Posted to X', 'success');
      showComposeBanner(data.tweetUrl ? ('Posted: ' + data.tweetUrl) : 'Posted', 'green');
    }

    // Refresh posts tab and overview immediately
    loadTab('posts');
    loadTab(currentTab);
    setTimeout(() => toggleCompose(false), 900);
  } catch (err) {
    showComposeBanner('Network error: ' + (err?.message || 'unknown'), 'red');
    toast('Network error', 'error');
  } finally {
    updateComposeButtons();
    updateComposeCount();
  }
}

// Load capabilities on boot
fetch('/api/capabilities')
  .then(r => r.ok ? r.json() : null)
  .then(c => applyCapabilities(c))
  .catch(() => {});

async function loadDaemonStatus() {
  const data = await fetchJson('/api/daemon-status');
  if (!data) return;
  daemonState = { ...daemonState, ...(data || {}) };
  updateDaemonControls();
}

// Daemon status on boot + polling (kept light; state changes are relatively rare)
loadDaemonStatus();
setInterval(loadDaemonStatus, 5000);

// ── Tab switching ──
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('tab-active'); b.classList.add('text-slate-400'); });
  const btn = document.querySelector('[data-tab="' + tab + '"]');
  if (btn) { btn.classList.add('tab-active'); btn.classList.remove('text-slate-400'); }
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  currentTab = tab;
  try { localStorage.setItem('ai-dashboard-tab', tab); } catch {}
  const title = TAB_META[tab]?.title || tab;
  setText('page-title', title);
  loadTab(tab);
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

	// Keyboard shortcuts
	document.addEventListener('keydown', (e) => {
	  if (isTextInput(e.target)) return;
	  if (e.key === '?') { toggleHelp(true); return; }
	  if (e.key === 'c' || e.key === 'C') { toggleCompose(true); return; }
	  if (e.key === 'Escape') {
	    if (isHelpOpen()) { toggleHelp(false); return; }
	    if (isComposeOpen()) { toggleCompose(false); return; }
	    if (isContextMenuOpen()) { closeContextMenu(); return; }
	    closeDetailPanel();
	    return;
	  }
  if (e.key === 'r' || e.key === 'R') { loadTab(currentTab); return; }
  const tabs = ['cycles', 'opportunities', 'feed', 'posts', 'safety', 'costs', 'intel'];
  const idx = parseInt(e.key) - 1;
  if (idx >= 0 && idx < tabs.length) switchTab(tabs[idx]);

  // Inbox navigation + actions
  if (currentTab === 'opportunities') {
    if (e.key === 'j' || e.key === 'ArrowDown') { moveOppSelection(1); return; }
    if (e.key === 'k' || e.key === 'ArrowUp') { moveOppSelection(-1); return; }
    if (e.key === 'Enter') { if (selectedOpp) renderDetailPanel(selectedOpp); return; }
    if (e.key === 'g' || e.key === 'G') { startGenerate(); return; }
    if (e.key === 'p' || e.key === 'P') { postEngagement(); return; }
    if (e.key === 's' || e.key === 'S') { setOppStatus('skipped'); return; }
    if (e.key === 't' || e.key === 'T') { setOppStatus('tracked'); return; }
  }
});

// ── SSE ──
function connectSSE() {
  const es = new EventSource('/api/events');
  es.addEventListener('overview', (e) => updateOverview(JSON.parse(e.data)));
  es.addEventListener('new-cycle', () => { if (currentTab === 'cycles') loadTab('cycles'); });
  es.addEventListener('new-post', () => { if (currentTab === 'posts') loadTab('posts'); });
  es.addEventListener('new-opportunity', () => { if (currentTab === 'opportunities') loadTab('opportunities'); });
  es.addEventListener('new-feed', () => { if (currentTab === 'feed') loadTab('feed'); });
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

function updateDaemonControls() {
  const statusEl = document.getElementById('daemon-status');
  const btn = document.getElementById('btn-daemon-toggle');
  if (statusEl) {
    const running = !!daemonState.running;
    const label = running
      ? ('Running · ' + ((daemonState.options && daemonState.options.interval) ? (daemonState.options.interval + 'm') : ''))
      : 'Stopped';
    statusEl.textContent = label.trim().replace(/ · $/, '');
  }
  if (btn) {
    const running = !!daemonState.running;
    const can = !!capabilities.canStartDaemon;
    btn.textContent = running ? 'Stop' : 'Start';
    btn.disabled = !can && !running;
    btn.classList.toggle('opacity-50', (!can && !running));
    btn.classList.toggle('cursor-not-allowed', (!can && !running));
  }
}

async function toggleDaemon() {
  const running = !!daemonState.running;
  if (!running && !capabilities.canStartDaemon) {
    toast('Daemon not available (configure Tweets + Generate, and enable writes)', 'warning');
    return;
  }

  try {
    const url = running ? '/api/daemon-stop' : '/api/daemon-start';
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.success === false) {
      toast(data.error || 'Daemon action failed', 'error');
      return;
    }
    daemonState = data.status || daemonState;
    updateDaemonControls();
    toast(running ? 'Daemon stopped' : 'Daemon started', 'success');
    // Refresh cycles immediately
    if (currentTab === 'cycles') loadTab('cycles');
  } catch (err) {
    toast('Daemon error: ' + (err?.message || 'network'), 'error');
  }
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
    if (document.getElementById('badge-feed')) {
      setText('badge-feed', d.counts.feed || '0');
    }
    setText('badge-posts', d.counts.posts || '0');
    setText('badge-safety', d.counts.safety || '0');
    setText('badge-costs', d.counts.generations || '0');
    if (document.getElementById('badge-intel')) {
      setText('badge-intel', d.counts.trends != null ? String(d.counts.trends) : '0');
    }
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
      case 'feed': await renderFeed(); break;
      case 'posts': await renderPosts(); break;
      case 'safety': await renderSafety(); break;
      case 'costs': await renderCosts(); break;
      case 'intel': await renderIntel(); break;
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
      '<div class="mt-3 flex items-center justify-center gap-2">' +
        '<button class="ghost-btn" type="button" onclick="toggleDaemon()">Start daemon</button>' +
        '<span class="text-[10px] text-slate-600 font-mono">or run</span>' +
        '<code class="text-xs bg-navy-950 px-2 py-1 rounded inline-block text-gold-400">absurdity-index engage watch</code>' +
      '</div>');
    return;
  }

  const daemonRunning = !!daemonState.running;
  const unfinished = data.filter(c => !c.completed_at && !c.error);
  const current = daemonRunning ? (unfinished[0] || null) : null;

  // Fast refresh only while the daemon is running and we expect phases/counters to change.
  if (cyclesRefreshTimer) { clearTimeout(cyclesRefreshTimer); cyclesRefreshTimer = null; }
  if (currentTab === 'cycles' && daemonRunning && current) {
    cyclesRefreshTimer = setTimeout(() => {
      if (currentTab === 'cycles') renderCycles().catch(() => {});
    }, 1600);
  }

  // Prevent "flashing" from polling by skipping DOM writes when nothing changed.
  const renderKey = JSON.stringify({
    daemonRunning,
    currentId: current ? current.id : null,
    showUnfinished: cyclesShowUnfinished,
    cycles: data.map(c => [
      c.id, c.cycle_index, c.cycle_type,
      c.phase || '',
      c.scanned || 0, c.engaged || 0, c.tracked || 0, c.expired || 0, c.posted || 0,
      c.topic || '', c.error || '',
      c.started_at || '', c.completed_at || '', c.duration_ms || 0,
    ]),
  });
  if (renderKey === lastCyclesRenderKey) return;
  lastCyclesRenderKey = renderKey;

  const daemonDot = daemonRunning
    ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"></span>'
    : '<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>';
  const daemonLabel = daemonRunning ? 'Running' : 'Stopped';
  const daemonMeta = daemonState.options && daemonState.options.interval ? (daemonState.options.interval + 'm interval') : '';

  const unfinishedCount = daemonRunning ? Math.max(0, unfinished.length - (current ? 1 : 0)) : unfinished.length;
  const toggleBtn = unfinishedCount > 0
    ? ('<button class="ghost-btn" type="button" onclick="toggleCyclesUnfinished()">' +
        esc(cyclesShowUnfinished ? ('Hide unfinished (' + unfinishedCount + ')') : ('Show unfinished (' + unfinishedCount + ')')) +
      '</button>')
    : '';

  const currentLine = (() => {
    if (!daemonRunning || !current) return '';
    const badge = typeBadge(current.cycle_type);
    const phase = current.phase ? phaseLabel(current.phase) : 'Starting';
    return (
      '<div class="mt-3 pt-3 border-t border-slate-700/20">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Current</span>' +
          '<span class="font-serif font-semibold text-cream-100 tracking-tight">Cycle ' + esc(String(current.id)) + '</span>' +
          '<span class="font-mono text-[10px] text-slate-600">#' + esc(String(current.cycle_index)) + '</span>' +
          badge +
          cycleStatusPill('running') +
          '<span class="text-[10px] text-slate-500 font-mono">Phase: <span class="text-slate-300">' + esc(phase) + '</span></span>' +
          '<span class="ml-auto text-[10px] text-slate-600 font-mono">' + esc(cycleTiming(current)) + '</span>' +
        '</div>' +
      '</div>'
    );
  })();

  const lastCompleted = (!daemonRunning || !current)
    ? (data.find(c => !!c.completed_at || !!c.error) || null)
    : null;
  const lastLine = (() => {
    if (daemonRunning) return '';
    if (!lastCompleted) return '';
    const badge = typeBadge(lastCompleted.cycle_type);
    const status = lastCompleted.error ? cycleStatusPill('error') : cycleStatusPill('complete');
    return (
      '<div class="mt-3 pt-3 border-t border-slate-700/20">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Last</span>' +
          '<span class="font-serif font-semibold text-cream-100 tracking-tight">Cycle ' + esc(String(lastCompleted.id)) + '</span>' +
          '<span class="font-mono text-[10px] text-slate-600">#' + esc(String(lastCompleted.cycle_index)) + '</span>' +
          badge +
          status +
          '<span class="ml-auto text-[10px] text-slate-600 font-mono">' + esc(cycleTiming(lastCompleted)) + '</span>' +
        '</div>' +
      '</div>'
    );
  })();

  const summary =
    '<div class="surface rounded-xl p-4 mb-3">' +
      '<div class="flex items-start justify-between gap-4">' +
        '<div class="min-w-0">' +
          '<div class="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Cycles</div>' +
          '<div class="mt-1 flex flex-wrap items-center gap-2">' +
            daemonDot +
            '<span class="text-sm font-semibold text-cream-100">Daemon ' + esc(daemonLabel) + '</span>' +
            (daemonMeta ? '<span class="text-[10px] text-slate-500 font-mono">' + esc(daemonMeta) + '</span>' : '') +
            (daemonState.lastError ? '<span class="text-[10px] text-red-300 font-mono">last error: ' + esc(daemonState.lastError) + '</span>' : '') +
          '</div>' +
          ((!daemonRunning && unfinishedCount > 0)
            ? '<div class="mt-2 text-xs text-amber-200/80">Unfinished cycles detected (likely an interrupted run). They are hidden by default.</div>'
            : '') +
        '</div>' +
        toggleBtn +
      '</div>' +
      currentLine +
      lastLine +
    '</div>';

  const cycleCard = (c) => {
    const status = c.error ? 'error' : (c.completed_at ? 'complete' : (daemonRunning ? 'running' : 'unfinished'));
    const badge = typeBadge(c.cycle_type);
    const statusPill = cycleStatusPill(status);
    const phaseText =
      (status === 'running')
        ? (c.phase ? phaseLabel(c.phase) : 'Starting')
        : ((status === 'unfinished')
          ? (c.phase ? phaseLabel(c.phase) : 'No phase recorded')
          : '');
    const phaseHtml = phaseText
      ? ('<span class="text-[10px] text-slate-500 font-mono">Phase: <span class="text-slate-300">' + esc(phaseText) + '</span></span>')
      : '';
    const timing = cycleTiming(c);
    const err = c.error
      ? '<div class="mt-3 text-xs text-red-300/90 font-mono bg-red-500/10 rounded-lg px-3 py-2 leading-relaxed border border-red-500/15">' + esc(c.error) + '</div>'
      : '';

    let body = '';
    if (c.cycle_type === 'original') {
      body =
        '<div class="mt-2 flex flex-wrap items-center gap-3 text-sm">' +
          (c.topic ? '<span class="text-slate-400">Topic: <span class="text-fuchsia-300">' + esc(c.topic) + '</span></span>' : '<span class="text-slate-500">No topic</span>') +
          (c.posted ? '<span class="bg-emerald-500/15 text-emerald-300 text-xs px-2 py-0.5 rounded-full border border-emerald-500/25">Posted</span>' : '<span class="text-slate-500 text-xs">Not posted</span>') +
        '</div>';
    } else {
      const noMatches = !c.error && c.completed_at && Number(c.scanned || 0) === 0;
      body =
        '<div class="mt-2 flex flex-wrap gap-5 text-sm">' +
          stat('Scanned', c.scanned, 'text-cyan-400') +
          stat('Engaged', c.engaged, 'text-emerald-400') +
          stat('Tracked', c.tracked, 'text-yellow-400') +
          stat('Expired', c.expired, 'text-slate-500') +
        '</div>' +
        (noMatches ? '<div class="mt-2 text-xs text-slate-500">No tweets matched your scan queries this cycle.</div>' : '');
    }

    return (
      '<div class="surface rounded-xl px-4 py-3">' +
        '<div class="flex items-start gap-3">' +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              '<span class="font-serif font-semibold text-cream-100 tracking-tight">Cycle ' + esc(String(c.id)) + '</span>' +
              '<span class="font-mono text-[10px] text-slate-600">#' + esc(String(c.cycle_index)) + '</span>' +
              badge +
              statusPill +
              phaseHtml +
            '</div>' +
            body +
            (status === 'unfinished' ? '<div class="mt-2 text-xs text-amber-200/70">Daemon is stopped. This cycle never recorded completion.</div>' : '') +
            err +
          '</div>' +
          '<div class="text-right text-[10px] text-slate-600 font-mono shrink-0">' +
            '<div title="' + esc(String(c.started_at || '')) + '">' + esc(ago(c.started_at)) + '</div>' +
            '<div class="mt-0.5 text-slate-500">' + esc(timing) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  };

  const list = data.filter(c => {
    if (daemonRunning && current && c.id === current.id) return false; // already shown in summary
    if (!daemonRunning && !cyclesShowUnfinished && !c.completed_at && !c.error) return false; // hide unfinished by default
    return true;
  });

  const listHtml = (list.length > 0)
    ? ('<div class="space-y-2">' + list.map(cycleCard).join('') + '</div>')
    : emptyState('No completed cycles yet', daemonRunning ? 'The daemon is running. A cycle will appear here when it completes.' : 'Start the daemon from the left sidebar to begin.');

  el.innerHTML = summary + listHtml;
}

// ── Opportunities (split-pane) ──
let oppFilterTimeout;
function loadOppFilters() {
  try {
    const raw = localStorage.getItem('ai-dashboard-opp-filters');
    if (!raw) return { status: 'all', minScore: 0, q: '', sort: 'score', starredOnly: false };
    const parsed = JSON.parse(raw);
    return {
      status: parsed.status || 'all',
      minScore: Number.isFinite(parsed.minScore) ? parsed.minScore : 0,
      q: typeof parsed.q === 'string' ? parsed.q : '',
      sort: parsed.sort || 'score',
      starredOnly: !!parsed.starredOnly,
    };
  } catch {
    return { status: 'all', minScore: 0, q: '', sort: 'score', starredOnly: false };
  }
}

function saveOppFilters() {
  try { localStorage.setItem('ai-dashboard-opp-filters', JSON.stringify(oppFilters)); } catch {}
}

function setOppFilter(next) {
  oppFilters = { ...oppFilters, ...next };
  saveOppFilters();
  renderOppList();
}

function applyOppFiltersToUi() {
  const q = document.getElementById('opp-q');
  const score = document.getElementById('opp-score');
  const sort = document.getElementById('opp-sort');
  const scoreVal = document.getElementById('opp-score-val');
  const starOnly = document.getElementById('opp-star-only');
  const statusSel = document.getElementById('opp-status');

  if (q) q.value = oppFilters.q || '';
  if (score) score.value = String(oppFilters.minScore || 0);
  if (scoreVal) scoreVal.textContent = String(oppFilters.minScore || 0);
  if (sort) sort.value = oppFilters.sort || 'score';
  if (statusSel) statusSel.value = oppFilters.status || 'all';
  if (starOnly) starOnly.checked = !!oppFilters.starredOnly;
}

async function renderOpportunities() {
  const el = document.getElementById('tab-opportunities');
  if (!el.querySelector('#opp-root')) {
    el.innerHTML =
        '<div id="opp-root" class="h-full flex flex-col gap-3">' +
        '<div class="surface rounded-xl p-3">' +
          '<div class="flex flex-col lg:flex-row gap-3 lg:items-center">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<label class="text-xs text-slate-400 flex items-center gap-2">' +
                '<span class="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Status</span>' +
                '<select id="opp-status" class="bg-navy-950/40 border border-slate-700/30 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-500/40">' +
                  '<option value="all">All</option>' +
                  '<option value="tracked">Tracked</option>' +
                  '<option value="engaged">Engaged</option>' +
                  '<option value="skipped">Discarded</option>' +
                  '<option value="expired">Expired</option>' +
                '</select>' +
              '</label>' +
              '<label class="text-xs text-slate-400 inline-flex items-center gap-2 bg-navy-950/20 border border-slate-700/30 rounded-lg px-2.5 py-2">' +
                '<input id="opp-star-only" type="checkbox" class="accent-gold-500" />' +
                '<span class="inline-flex items-center gap-1.5">' + lucide('star', 'w-3 h-3') + 'Starred only</span>' +
              '</label>' +
            '</div>' +
            '<div class="flex-1 flex items-center gap-2 min-w-0">' +
              '<div class="relative flex-1 min-w-[180px]">' +
                '<div class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500">' + lucide('search', 'w-4 h-4') + '</div>' +
                '<input id="opp-q" type="text" class="w-full bg-navy-950/40 border border-slate-700/30 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-gold-500/40" placeholder="Search author, text, bill..." />' +
              '</div>' +
              '<select id="opp-sort" class="bg-navy-950/40 border border-slate-700/30 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-500/40">' +
                '<option value="score">Sort: Score</option>' +
                '<option value="recent">Sort: Recent</option>' +
                '<option value="quotes">Sort: Quotes</option>' +
              '</select>' +
              '<button id="opp-clear" class="ghost-btn" type="button" title="Clear search">' + lucide('x', 'w-4 h-4') + '</button>' +
            '</div>' +
            '<label class="text-xs text-slate-400 flex items-center gap-2 shrink-0">Min score' +
              '<input id="opp-score" type="range" min="0" max="100" value="0" class="w-28">' +
              '<span id="opp-score-val" class="font-mono text-gold-400 w-6 text-right tabular-nums">0</span>' +
            '</label>' +
          '</div>' +
          '<div class="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">' +
            '<span id="opp-count">--</span>' +
            '<span class="text-slate-600">Tip: click a card or use J/K</span>' +
          '</div>' +
        '</div>' +
        '<div class="surface rounded-xl flex-1 min-h-0 overflow-hidden">' +
          '<div class="split-pane h-full">' +
            '<div id="opp-list" class="opp-list opp-scroll p-3"></div>' +
            '<div id="opp-detail" class="opp-detail opp-scroll p-4"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const statusSel = document.getElementById('opp-status');
    if (statusSel) statusSel.addEventListener('change', () => setOppFilter({ status: statusSel.value || 'all' }));

    const starOnly = document.getElementById('opp-star-only');
    if (starOnly) starOnly.addEventListener('change', () => setOppFilter({ starredOnly: !!starOnly.checked }));

    const q = document.getElementById('opp-q');
    if (q) q.addEventListener('input', () => {
      clearTimeout(oppFilterTimeout);
      oppFilterTimeout = setTimeout(() => setOppFilter({ q: q.value }), 120);
    });

    const clearBtn = document.getElementById('opp-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => setOppFilter({ q: '' }));

    const sort = document.getElementById('opp-sort');
    if (sort) sort.addEventListener('change', () => setOppFilter({ sort: sort.value }));

    const score = document.getElementById('opp-score');
    if (score) score.addEventListener('input', () => {
      const v = parseInt(score.value, 10) || 0;
      document.getElementById('opp-score-val').textContent = String(v);
      clearTimeout(oppFilterTimeout);
      oppFilterTimeout = setTimeout(() => setOppFilter({ minScore: v }), 120);
    });

    applyOppFiltersToUi();
  }
  await renderOppList();
}

async function renderOppList() {
  applyOppFiltersToUi();
  const status = oppFilters.status || 'all';
  const minScore = parseInt(String(oppFilters.minScore || 0), 10) || 0;
  const q = String(oppFilters.q || '').trim().toLowerCase();
  const sort = oppFilters.sort || 'score';
  const starredOnly = !!oppFilters.starredOnly;

  const data = await fetchJson('/api/opportunities?limit=150&status=' + encodeURIComponent(status));
  oppData = (data || [])
    .filter(o => (!starredOnly) || (o.starred === 1 || o.starred === true))
    .filter(o => (o.score || 0) >= minScore)
    .filter(o => {
      if (!q) return true;
      const hay = [
        o.author_username || o.author_id || '',
        o.text || '',
        o.matched_bill_slug || '',
        o.matched_keywords || '',
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

  if (sort === 'recent') {
    oppData.sort((a, b) => (parseSqliteTimeToMs(b.first_seen) ?? 0) - (parseSqliteTimeToMs(a.first_seen) ?? 0));
  } else if (sort === 'quotes') {
    oppData.sort((a, b) => (b.quotes || 0) - (a.quotes || 0));
  } else {
    oppData.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  const list = document.getElementById('opp-list');
  if (!list) return;
  setText('opp-count', oppData.length + ' result' + (oppData.length === 1 ? '' : 's'));
  if (oppData.length === 0) {
    list.innerHTML = emptyState('No opportunities match filters', 'Try lowering the minimum score or changing the status filter.');
    return;
  }

  const selectedId = selectedOpp?.tweet_id;
  list.innerHTML = '<div class="space-y-2">' + oppData.map((o, i) => {
    const sc = o.score >= 70 ? 'text-emerald-300' : o.score >= 40 ? 'text-amber-300' : 'text-slate-400';
    const sel = selectedId && selectedId === o.tweet_id ? ' selected' : '';
    const starred = (o.starred === 1 || o.starred === true);
    const reco = recommendedBadge(o.recommended_action);
    const author = esc(o.author_username || o.author_id || 'unknown');
    const text = esc(o.text || '');
    const bill = o.matched_bill_slug ? '<span class="text-fuchsia-300 truncate" title="' + esc(o.matched_bill_slug) + '">' + esc(o.matched_bill_slug) + '</span>' : '';
    const starIcon = starred ? '<span class="text-gold-400" title="Starred">' + lucide('star', 'w-3.5 h-3.5') + '</span>' : '';
    const menuBtn =
      '<button type="button" class="p-1.5 rounded-lg border border-slate-700/25 bg-navy-950/20 text-slate-400 hover:text-cream-100 hover:bg-navy-800/40" ' +
        'onclick="openOppMenuFromBtn(event,' + i + ')" title="Actions">' +
        lucide('more-vertical', 'w-4 h-4') +
      '</button>';
    return '<div class="opp-card rounded-xl px-3.5 py-3 border ' + (starred ? 'border-gold-500/25 bg-gold-500/5' : 'border-slate-700/15 bg-navy-950/10') + sel + '" data-idx="' + i + '" onclick="selectOpportunity(' + i + ')" oncontextmenu="openOppContext(event,' + i + ')">' +
      '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-lg surface-2 flex items-center justify-center font-mono font-bold tabular-nums ' + sc + '">' + (o.score ?? 0) + '</div>' +
        '<div class="min-w-0 flex-1">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="text-sm font-semibold text-slate-200 truncate">@' + author + '</span>' +
            starIcon +
            statusBadge(o.status) +
            reco +
            '<div class="ml-auto flex items-center gap-2 shrink-0">' +
              '<span class="text-[10px] text-slate-500 font-mono">' + ago(o.first_seen) + '</span>' +
              menuBtn +
            '</div>' +
          '</div>' +
          '<div class="text-xs text-slate-300/90 leading-relaxed mt-1" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + text + '</div>' +
          '<div class="flex items-center gap-3 mt-2 text-[10px] text-slate-400 font-mono">' +
            '<span title="Likes" class="inline-flex items-center gap-1">' + lucide('heart', 'w-3 h-3') + fmtK(o.likes) + '</span>' +
            '<span title="Retweets" class="inline-flex items-center gap-1">' + lucide('repeat-2', 'w-3 h-3') + fmtK(o.retweets) + '</span>' +
            '<span title="Replies" class="inline-flex items-center gap-1">' + lucide('message-circle', 'w-3 h-3') + fmtK(o.replies) + '</span>' +
            '<span title="Quotes" class="inline-flex items-center gap-1">' + lucide('message-square', 'w-3 h-3') + fmtK(o.quotes || 0) + '</span>' +
            bill +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function moveOppSelection(delta) {
  if (!oppData || oppData.length === 0) return;
  let idx = selectedOpp ? oppData.findIndex(o => o.tweet_id === selectedOpp.tweet_id) : -1;
  if (idx === -1) idx = delta > 0 ? -1 : oppData.length;
  const next = Math.max(0, Math.min(oppData.length - 1, idx + delta));
  selectOpportunity(next);
  const card = document.querySelector('.opp-card[data-idx="' + next + '"]');
  if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
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
  if (tweetEmbedResizeHandler) {
    window.removeEventListener('message', tweetEmbedResizeHandler);
    tweetEmbedResizeHandler = null;
  }
  document.getElementById('opp-list')?.classList.remove('split');
  const detail = document.getElementById('opp-detail');
  if (detail) { detail.classList.remove('open'); }
  document.querySelectorAll('.opp-card').forEach(c => c.classList.remove('selected'));
}

function renderDetailPanel(opp) {
  const detail = document.getElementById('opp-detail');
  if (!detail) return;

  const canGen = !!capabilities.canGenerate;
  const canPost = !!capabilities.canPost;
  const canWrite = !!capabilities.canWrite;
  const canRefresh = !!capabilities.canRefreshMetrics;
  const isStarred = (opp.starred === 1 || opp.starred === true);

  const genTitle = canGen ? 'Generate Draft' : 'Configure API keys to enable generation';
  const postLabel = capabilities.dryRun ? 'Save Draft (Dry Run)' : 'Post to X';
  const postTitle = canPost ? postLabel : (capabilities.dryRun ? 'Write DB not configured' : 'Configure API keys to enable posting');

  detail.innerHTML =
    '<div class="fade-in space-y-4 max-w-4xl mx-auto pb-8">' +
      // Header
      '<div class="flex items-start justify-between gap-3">' +
        '<div class="min-w-0">' +
          '<div class="flex items-center gap-2">' +
            '<span class="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Opportunity</span>' +
            '<span id="detail-status-badge">' + statusBadge(opp.status) + '</span>' +
            recommendedBadge(opp.recommended_action) +
          '</div>' +
          '<div class="mt-1 flex items-baseline gap-2 min-w-0">' +
            '<div class="text-base font-semibold text-cream-100 truncate">@' + esc(opp.author_username || opp.author_id || 'unknown') + '</div>' +
            '<div class="text-[10px] text-slate-500 font-mono shrink-0">' + ago(opp.first_seen) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center justify-end gap-2 shrink-0">' +
          (opp.tweet_id ? '<a href="https://x.com/i/status/' + opp.tweet_id + '" target="_blank" rel="noopener" class="ghost-btn inline-flex items-center gap-1.5" title="Open on X">' + lucide('external-link', 'w-4 h-4') + 'Open</a>' : '') +
          (opp.tweet_id ? '<button class="ghost-btn inline-flex items-center gap-1.5" onclick="copyOppLink()" type="button" title="Copy link">' + lucide('copy', 'w-4 h-4') + 'Copy</button>' : '') +
          '<button class="ghost-btn inline-flex items-center gap-1.5' + (canRefresh ? '' : ' opacity-50 cursor-not-allowed') + '" onclick="refreshOppMetrics()" type="button" ' + (canRefresh ? '' : 'disabled') + ' title="Refresh metrics">' + lucide('refresh-cw', 'w-4 h-4') + 'Refresh</button>' +
          '<button class="ghost-btn inline-flex items-center gap-1.5' + (canWrite ? '' : ' opacity-50 cursor-not-allowed') + '" onclick="setOppStar(' + (!isStarred) + ')" type="button" ' + (canWrite ? '' : 'disabled') + ' title="' + (isStarred ? 'Unstar' : 'Star') + '">' + lucide('star', 'w-4 h-4') + (isStarred ? 'Starred' : 'Star') + '</button>' +
          '<button class="ghost-btn inline-flex items-center gap-1.5' + (canWrite ? '' : ' opacity-50 cursor-not-allowed') + '" onclick="setOppStatus(\'tracked\')" type="button" ' + (canWrite ? '' : 'disabled') + ' title="Mark tracked">' + lucide('bookmark', 'w-4 h-4') + 'Track</button>' +
          '<button class="ghost-btn inline-flex items-center gap-1.5' + (canWrite ? '' : ' opacity-50 cursor-not-allowed') + '" onclick="setOppStatus(\'skipped\')" type="button" ' + (canWrite ? '' : 'disabled') + ' title="Discard from inbox">' + lucide('ban', 'w-4 h-4') + 'Discard</button>' +
          '<button class="ghost-btn" onclick="closeDetailPanel()" type="button" title="Close">' + lucide('x', 'w-4 h-4') + '</button>' +
        '</div>' +
      '</div>' +

      // Signals + author stats
      '<div class="grid grid-cols-1 xl:grid-cols-2 gap-3">' +
        '<div class="surface rounded-xl p-3 space-y-2">' +
          '<div class="flex items-center justify-between">' +
            '<div class="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Signals</div>' +
            '<div class="text-[10px] text-slate-500 font-mono">Score <span class="text-slate-200 tabular-nums">' + (opp.score ?? 0) + '</span>/100</div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-x-4 gap-y-2">' +
            scoreBar('Viral', opp.viral_score, 30, 'bg-rose-400') +
            scoreBar('Relevance', opp.relevance_score, 30, 'bg-blue-400') +
            scoreBar('Timing', opp.timing_score, 20, 'bg-amber-400') +
            scoreBar('Engage', opp.engageability_score, 20, 'bg-emerald-400') +
          '</div>' +
          (opp.matched_bill_slug ? '<div class="text-xs text-slate-400">Bill: <span class="text-fuchsia-300">' + esc(opp.matched_bill_slug) + '</span></div>' : '') +
          (opp.matched_keywords ? '<div class="text-xs text-slate-500">Keywords: <span class="text-slate-300">' + esc(opp.matched_keywords) + '</span></div>' : '') +
        '</div>' +
        '<div class="surface rounded-xl p-3">' +
          '<div class="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Author</div>' +
          '<div id="author-stats" class="mt-2 text-xs text-slate-300">Loading...</div>' +
        '</div>' +
      '</div>' +

      // Tweet embed + context
      '<div class="surface rounded-xl p-3">' +
        '<div id="tweet-embed-container" class="relative">' +
          '<div class="tweet-frame">' +
            '<div class="embed-overlay"></div>' +
            '<div class="flex items-center justify-between px-1 pb-2">' +
              '<div class="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Source</div>' +
              '<button id="btn-embed-mode" class="ghost-btn inline-flex items-center gap-1.5" onclick="toggleEmbedInteract()" type="button" title="Toggle embed interaction">' +
                '<span id="btn-embed-mode-label">Interact</span>' +
              '</button>' +
            '</div>' +
            '<div class="relative">' +
              '<div id="tweet-embed-target"></div>' +
              '<button id="tweet-embed-shield" type="button" onclick="setEmbedInteract(true)" title="Enable embed interaction">' +
                '<span class="pill">Scroll mode · click to interact</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div id="tweet-fallback-card" class="surface-2 rounded-xl p-3 mt-2" style="display:none">' +
            '<div class="flex items-center gap-2 mb-2">' +
              '<div class="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center text-xs font-bold text-slate-300">' +
                esc((opp.author_username || opp.author_id || '?')[0].toUpperCase()) +
              '</div>' +
              '<div class="min-w-0">' +
                '<div class="text-sm font-medium text-cream-100 truncate">@' + esc(opp.author_username || opp.author_id) + '</div>' +
                '<div class="text-[10px] text-slate-500 font-mono">' + ago(opp.first_seen) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">' + linkify(esc(opp.text || '')) + '</div>' +
            '<div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-xs text-slate-400 font-mono">' +
              '<span><span id="detail-likes" class="text-slate-200 tabular-nums">' + fmtK(opp.likes) + '</span> likes</span>' +
              '<span><span id="detail-retweets" class="text-slate-200 tabular-nums">' + fmtK(opp.retweets) + '</span> RTs</span>' +
              '<span><span id="detail-replies" class="text-slate-200 tabular-nums">' + fmtK(opp.replies) + '</span> replies</span>' +
              '<span><span id="detail-quotes" class="text-slate-200 tabular-nums">' + fmtK(opp.quotes || 0) + '</span> quotes</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="quoted-tweet-card" class="mt-3"></div>' +
      '</div>' +

      // Assistant
      '<div class="surface rounded-xl p-3 space-y-3">' +
        '<div class="flex items-center justify-between">' +
          '<div class="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Assistant</div>' +
          '<div class="text-[10px] text-slate-500 font-mono">' + (canGen ? 'connected' : 'disabled') + '</div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="flex rounded-lg overflow-hidden border border-slate-700/30 shrink-0">' +
            '<button class="action-btn text-xs px-3 py-1.5 inline-flex items-center gap-1' + (selectedAction === 'quote' ? ' active' : '') + '" onclick="setAction(\'quote\')" type="button">' + lucide('message-square', 'w-3 h-3') + 'Quote</button>' +
            '<button class="action-btn text-xs px-3 py-1.5 inline-flex items-center gap-1' + (selectedAction === 'reply' ? ' active' : '') + '" onclick="setAction(\'reply\')" type="button">' + lucide('reply', 'w-3 h-3') + 'Reply</button>' +
          '</div>' +
          '<button id="btn-generate" onclick="startGenerate()" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 ' +
            (canGen ? 'bg-gold-500/15 text-gold-400 border border-gold-500/30 hover:bg-gold-500/25' : 'bg-slate-700/15 text-slate-500 border border-slate-700/20 cursor-not-allowed') +
          '" ' + (canGen ? '' : 'disabled') + ' title="' + genTitle + '">' +
            lucide('zap', 'w-3.5 h-3.5') + 'Generate' +
          '</button>' +
        '</div>' +
        '<div>' +
          '<div class="text-[10px] text-slate-400 uppercase tracking-wider font-mono mb-1">Guidance (optional)</div>' +
          '<textarea id="gen-hint" rows="2" class="w-full bg-navy-950/40 border border-slate-700/30 rounded-xl px-3 py-2 text-sm text-slate-200 resize-y focus:border-gold-500/40 focus:outline-none leading-relaxed" placeholder="Steer tone, facts, or angle. Example: focus on process hypocrisy; avoid dunking on individuals."></textarea>' +
        '</div>' +
        '<div id="pipeline-steps" class="space-y-1 hidden"></div>' +
      '</div>' +

      // Draft textarea
      '<div id="draft-section" class="hidden surface rounded-xl p-3">' +
        '<div class="flex items-center justify-between mb-1.5">' +
          '<div class="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Draft</div>' +
          '<button class="ghost-btn inline-flex items-center gap-1.5" onclick="copyDraft()" type="button" title="Copy draft">' + lucide('copy', 'w-4 h-4') + 'Copy</button>' +
        '</div>' +
        '<textarea id="draft-textarea" rows="4" class="w-full bg-navy-950/40 border border-slate-700/30 rounded-xl px-3 py-2 text-sm text-slate-200 resize-none overflow-hidden focus:border-gold-500/40 focus:outline-none font-sans leading-relaxed" placeholder="Generated draft will appear here..."></textarea>' +
        '<div class="flex justify-between mt-1">' +
          '<div id="draft-research" class="text-[10px] text-slate-500 font-mono truncate max-w-[70%]"></div>' +
          '<span id="char-count" class="text-[10px] font-mono text-slate-400">0/280</span>' +
        '</div>' +
      '</div>' +

      // Post button
      '<div id="post-section" class="hidden">' +
        '<button id="btn-post" onclick="postEngagement()" class="w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ' +
          (canPost ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/25' : 'bg-slate-700/15 text-slate-500 border border-slate-700/20 cursor-not-allowed') +
        '" ' + (canPost ? '' : 'disabled') + ' title="' + postTitle + '">' +
          '<span class="inline-flex items-center gap-1.5">' + lucide('send', 'w-4 h-4') + esc(postLabel) + '</span>' +
        '</button>' +
      '</div>' +

      // Status banner
      '<div id="post-banner" class="hidden rounded-xl px-3 py-2 text-xs"></div>' +
    '</div>';

  // Draft textarea: keep parent scrolling usable even when the cursor is over the textarea.
  const ta = document.getElementById('draft-textarea');
  if (ta) {
    ta.addEventListener('input', updateCharCount);
    ta.addEventListener('wheel', (e) => {
      const container = document.getElementById('opp-detail');
      if (!container) return;
      container.scrollTop += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    setTimeout(() => autoGrowTextarea(ta), 0);
  }

  // Default: keep scrolling usable. User can enable embed interaction explicitly.
  setEmbedInteract(false);

  // Embed real tweet if possible
  if (opp.tweet_id) {
    embedTweet(opp.tweet_id);
  }

  // Fetch live tweet context for quoted/replied-to tweets
  if (capabilities.canFetchTweets && opp.tweet_id) {
    fetchLiveTweetContext(opp.tweet_id);
  }

  // Author stats
  loadAuthorStats(opp.author_id);
}

async function loadAuthorStats(authorId) {
  const el = document.getElementById('author-stats');
  if (!el || !authorId) return;
  const data = await fetchJson('/api/author-stats?authorId=' + encodeURIComponent(authorId));
  if (!data || data.error) { el.textContent = 'No author stats'; return; }

  const by = data.byStatus || {};
  const tracked = by.tracked || 0;
  const engaged = by.engaged || 0;
  const skipped = by.skipped || 0;
  const expired = by.expired || 0;

  const cooldown = (data.cooldownHours != null) ? data.cooldownHours : capabilities.engageAuthorCooldownHours;
  const canEngage = data.canEngage;
  const last = data.lastEngaged ? ago(data.lastEngaged) : 'never';

  let cooldownHtml = '<span class="text-slate-500">unknown</span>';
  if (canEngage === true) {
    cooldownHtml = '<span class="text-emerald-200">eligible</span>';
  } else if (canEngage === false) {
    let extra = '';
    const lastMs = parseSqliteTimeToMs(data.lastEngaged);
    if (lastMs != null && cooldown != null) {
      const remaining = (cooldown * 60 * 60 * 1000) - (Date.now() - lastMs);
      if (remaining > 0) extra = ' <span class="text-slate-500">(' + esc(fmtDuration(remaining)) + ' left)</span>';
    }
    cooldownHtml = '<span class="text-amber-200">on cooldown</span>' + extra;
  }

  el.innerHTML =
    '<div class="flex flex-wrap gap-x-4 gap-y-1">' +
      '<span class="text-slate-500">Engaged: <span class="text-slate-200 font-mono tabular-nums">' + engaged + '</span></span>' +
      '<span class="text-slate-500">Tracked: <span class="text-slate-200 font-mono tabular-nums">' + tracked + '</span></span>' +
      '<span class="text-slate-500">Skipped: <span class="text-slate-200 font-mono tabular-nums">' + skipped + '</span></span>' +
      '<span class="text-slate-500">Expired: <span class="text-slate-200 font-mono tabular-nums">' + expired + '</span></span>' +
    '</div>' +
    '<div class="mt-2 text-slate-500">Last engaged: <span class="text-slate-200">' + esc(last) + '</span></div>' +
    '<div class="mt-0.5 text-slate-500">Cooldown (' + esc(String(cooldown || '')) + 'h): ' + cooldownHtml + '</div>';
}

function oppUrl(tweetId) {
  return tweetId ? ('https://x.com/i/status/' + tweetId) : '';
}

async function copyOppLink() {
  if (!selectedOpp?.tweet_id) return;
  const url = oppUrl(selectedOpp.tweet_id);
  try {
    await navigator.clipboard.writeText(url);
    toast('Copied link', 'success');
  } catch {
    toast('Copy failed', 'error');
  }
}

async function copyDraft() {
  const ta = document.getElementById('draft-textarea');
  if (!ta || !ta.value) return;
  try {
    await navigator.clipboard.writeText(ta.value);
    toast('Copied draft', 'success');
  } catch {
    toast('Copy failed', 'error');
  }
}

async function setOppStatus(status, tweetId) {
  const id = tweetId || selectedOpp?.tweet_id;
  if (!id) return;
  if (!capabilities.canWrite) { toast('Writes disabled', 'warning'); return; }
  try {
    const r = await fetch('/api/opportunity-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetId: id, status }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      toast(data.error || 'Failed to update status', 'error');
      return;
    }
    // Update cached rows
    const row = oppData.find(o => o.tweet_id === id);
    if (row) row.status = status;
    if (selectedOpp && selectedOpp.tweet_id === id) {
      selectedOpp.status = status;
      const badgeEl = document.getElementById('detail-status-badge');
      if (badgeEl) badgeEl.innerHTML = statusBadge(status);
    }
    toast('Marked ' + status, 'success');
    await renderOppList();
    // If it dropped out of the filtered list, close panel.
    if (selectedOpp && !oppData.find(o => o.tweet_id === selectedOpp.tweet_id)) closeDetailPanel();
  } catch (err) {
    toast('Failed: ' + (err?.message || 'network'), 'error');
  }
}

async function setOppStar(starred, tweetId) {
  const id = tweetId || selectedOpp?.tweet_id;
  if (!id) return;
  if (!capabilities.canWrite) { toast('Writes disabled', 'warning'); return; }
  try {
    const r = await fetch('/api/opportunity-star', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetId: id, starred: !!starred }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      toast(data.error || 'Failed to update star', 'error');
      return;
    }
    const row = oppData.find(o => o.tweet_id === id);
    if (row) row.starred = starred ? 1 : 0;
    if (selectedOpp && selectedOpp.tweet_id === id) selectedOpp.starred = starred ? 1 : 0;
    toast(starred ? 'Starred' : 'Unstarred', 'success');
    await renderOppList();
    // Re-render detail panel header state
    if (selectedOpp && selectedOpp.tweet_id === id) renderDetailPanel(selectedOpp);
  } catch (err) {
    toast('Failed: ' + (err?.message || 'network'), 'error');
  }
}

function isContextMenuOpen() {
  const el = document.getElementById('context-menu');
  return !!ctxMenu.open && !!el && !el.classList.contains('hidden');
}

function closeContextMenu() {
  const el = document.getElementById('context-menu');
  if (!el) return;
  el.classList.add('hidden');
  ctxMenu.open = false;
  ctxMenu.idx = null;
}

function openOppContext(e, idx) {
  try { e.preventDefault(); } catch {}
  openContextMenuForOpp(idx, e.clientX, e.clientY);
  return false;
}

function openOppMenuFromBtn(e, idx) {
  try { e.preventDefault(); e.stopPropagation(); } catch {}
  openContextMenuForOpp(idx, e.clientX, e.clientY);
}

function openContextMenuForOpp(idx, x, y) {
  const opp = oppData?.[idx];
  if (!opp) return;

  const el = document.getElementById('context-menu');
  if (!el) return;

  ctxMenu.open = true;
  ctxMenu.idx = idx;
  ctxMenu.x = x;
  ctxMenu.y = y;

  // Bind once
  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    document.addEventListener('click', () => { if (isContextMenuOpen()) closeContextMenu(); });
    window.addEventListener('resize', () => closeContextMenu());
    document.addEventListener('scroll', () => closeContextMenu(), true);

    const btnStar = document.getElementById('ctx-star');
    const btnTrack = document.getElementById('ctx-track');
    const btnDiscard = document.getElementById('ctx-discard');
    const btnRefresh = document.getElementById('ctx-refresh');
    const btnCopy = document.getElementById('ctx-copy');
    const btnOpen = document.getElementById('ctx-open');

    if (btnStar) btnStar.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const o = oppData?.[ctxMenu.idx];
      if (o) await setOppStar(!(o.starred === 1 || o.starred === true), o.tweet_id);
      closeContextMenu();
    });
    if (btnTrack) btnTrack.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const o = oppData?.[ctxMenu.idx];
      if (o) await setOppStatus('tracked', o.tweet_id);
      closeContextMenu();
    });
    if (btnDiscard) btnDiscard.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const o = oppData?.[ctxMenu.idx];
      if (o) await setOppStatus('skipped', o.tweet_id);
      closeContextMenu();
    });
    if (btnRefresh) btnRefresh.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const o = oppData?.[ctxMenu.idx];
      if (o) {
        // Temporarily treat as selected for refresh UI updates
        const prev = selectedOpp;
        selectedOpp = o;
        await refreshOppMetrics();
        selectedOpp = prev;
      }
      closeContextMenu();
    });
    if (btnCopy) btnCopy.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const o = oppData?.[ctxMenu.idx];
      if (o?.tweet_id) {
        try { await navigator.clipboard.writeText(oppUrl(o.tweet_id)); toast('Copied link', 'success'); }
        catch { toast('Copy failed', 'error'); }
      }
      closeContextMenu();
    });
    if (btnOpen) btnOpen.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const o = oppData?.[ctxMenu.idx];
      if (o?.tweet_id) window.open(oppUrl(o.tweet_id), '_blank', 'noopener');
      closeContextMenu();
    });
  }

  // Update labels based on current opp
  const isStarred = (opp.starred === 1 || opp.starred === true);
  const btnStar = document.getElementById('ctx-star');
  if (btnStar) btnStar.textContent = isStarred ? 'Unstar' : 'Star';

  // Position within viewport
  el.classList.remove('hidden');
  const pad = 10;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x;
  let top = y;
  if (left + rect.width + pad > vw) left = Math.max(pad, vw - rect.width - pad);
  if (top + rect.height + pad > vh) top = Math.max(pad, vh - rect.height - pad);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

async function refreshOppMetrics() {
  if (!selectedOpp) return;
  if (!capabilities.canRefreshMetrics) { toast('Metrics refresh disabled', 'warning'); return; }
  try {
    const r = await fetch('/api/opportunity-refresh-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetId: selectedOpp.tweet_id }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      toast(data.error || 'Failed to refresh metrics', 'error');
      return;
    }
    const m = data.metrics || {};
    selectedOpp.likes = m.likes ?? selectedOpp.likes;
    selectedOpp.retweets = m.retweets ?? selectedOpp.retweets;
    selectedOpp.replies = m.replies ?? selectedOpp.replies;
    selectedOpp.quotes = m.quotes ?? selectedOpp.quotes;
    setText('detail-likes', fmtK(selectedOpp.likes));
    setText('detail-retweets', fmtK(selectedOpp.retweets));
    setText('detail-replies', fmtK(selectedOpp.replies));
    setText('detail-quotes', fmtK(selectedOpp.quotes || 0));
    toast('Metrics refreshed', 'success');
    await renderOppList();
  } catch (err) {
    toast('Failed: ' + (err?.message || 'network'), 'error');
  }
}

function embedTweet(tweetId) {
  const target = document.getElementById('tweet-embed-target');
  const fallback = document.getElementById('tweet-fallback-card');
  if (!target || !tweetId) return;

  // Clear previous embed + listeners
  target.innerHTML = '';
  if (tweetEmbedResizeHandler) {
    window.removeEventListener('message', tweetEmbedResizeHandler);
    tweetEmbedResizeHandler = null;
  }

  function showFallback() {
    if (fallback) fallback.style.display = '';
  }

  // Use direct iframe embed — far more reliable than widgets.js
  const iframe = document.createElement('iframe');
  iframe.src = 'https://platform.twitter.com/embed/Tweet.html?dnt=true&theme=dark&id=' + encodeURIComponent(tweetId);
  // The embed page itself is ~550px wide; if we stretch the iframe to 100% it leaves a big blank area (often white).
  iframe.style.cssText = 'width:100%;max-width:550px;margin:0 auto;border:none;border-radius:12px;background:transparent;display:block;color-scheme:dark;overflow:hidden;pointer-events:none;';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox');

  // Auto-resize: listen for height messages from the embed iframe
  tweetEmbedResizeHandler = (e) => {
    if (e.source === iframe.contentWindow && e.data && e.data['twttr.embed']) {
      const payload = e.data['twttr.embed'];
      const params0 = (payload && payload.params && payload.params[0]) ? payload.params[0] : null;
      const height = payload.method === 'twttr.private.resize' ? params0?.height : null;
      const width = payload.method === 'twttr.private.resize' ? params0?.width : null;
      if (height) iframe.style.height = height + 'px';
      // Tighten width if Twitter reports a smaller rendered width (prevents the "white gutter").
      if (width) iframe.style.maxWidth = Math.min(550, width) + 'px';
    }
  };
  window.addEventListener('message', tweetEmbedResizeHandler);

  // Start with a reasonable initial height
  iframe.style.height = '250px';

  // Fallback if iframe fails to load within 6s
  const timeout = setTimeout(showFallback, 6000);
  iframe.onload = () => {
    clearTimeout(timeout);
    // Give the embed a moment to render and send resize message
    setTimeout(() => {
      if (iframe.offsetHeight < 50) showFallback();
    }, 2000);
  };
  iframe.onerror = () => { clearTimeout(timeout); showFallback(); };

  target.appendChild(iframe);
}

function setEmbedInteract(on) {
  embedInteractive = !!on;
  const target = document.getElementById('tweet-embed-target');
  if (target) target.classList.toggle('embed-interactive', embedInteractive);

  const label = document.getElementById('btn-embed-mode-label');
  if (label) label.textContent = embedInteractive ? 'Scroll' : 'Interact';

  // Ensure the current iframe matches mode (useful when toggling without re-embed).
  const iframe = target?.querySelector('iframe');
  if (iframe) iframe.style.pointerEvents = embedInteractive ? 'auto' : 'none';
}

function toggleEmbedInteract() {
  setEmbedInteract(!embedInteractive);
}

function linkify(text) {
  return text
    .replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">$1</a>')
    .replace(/@(\w+)/g, '<a href="https://x.com/$1" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">@$1</a>');
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
        '<div class="surface-2 rounded-xl p-3 ml-4">' +
          '<div class="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1">Quoted tweet</div>' +
          '<div class="flex items-center gap-1.5 mb-1">' +
            '<span class="text-xs font-medium text-cream-100">@' + esc(qt.author.username) + '</span>' +
          '</div>' +
          '<div class="text-xs text-slate-300 leading-relaxed">' + linkify(esc(qt.text)) + '</div>' +
        '</div>';
    }
    if (ctx.repliedToTweet) {
      const rt = ctx.repliedToTweet;
      document.getElementById('quoted-tweet-card').innerHTML =
        '<div class="surface-2 rounded-xl p-3 ml-4">' +
          '<div class="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1">Replying to</div>' +
          '<div class="flex items-center gap-1.5 mb-1">' +
            '<span class="text-xs font-medium text-cream-100">@' + esc(rt.author.username) + '</span>' +
          '</div>' +
          '<div class="text-xs text-slate-300 leading-relaxed">' + linkify(esc(rt.text)) + '</div>' +
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
  btn.innerHTML = lucide('loader-2', 'w-3.5 h-3.5 spinner') + 'Generating...';

  document.getElementById('draft-section')?.classList.add('hidden');
  document.getElementById('post-section')?.classList.add('hidden');
  document.getElementById('post-banner')?.classList.add('hidden');

  const steps = {};
  const stepOrder = ['fetch', 'research', 'generate', 'fact-check', 'safety'];

  const hint = (document.getElementById('gen-hint')?.value || '').trim();
  const hintParam = hint ? ('&hint=' + encodeURIComponent(hint)) : '';
  generateES = new EventSource('/api/generate-draft?tweetId=' + encodeURIComponent(selectedOpp.tweet_id) + '&action=' + selectedAction + hintParam);

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
    btn.innerHTML = lucide('zap', 'w-3.5 h-3.5') + 'Generate';

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
      toast('Draft ready', 'success');

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
    btn.innerHTML = lucide('zap', 'w-3.5 h-3.5') + 'Generate';
    showBanner('post-banner', msg, 'red');
  });

  generateES.onerror = () => {
    generateES.close();
    generateES = null;
    btn.disabled = false;
    btn.innerHTML = lucide('zap', 'w-3.5 h-3.5') + 'Generate';
  };
}

function renderPipelineSteps(el, order, steps) {
  el.innerHTML = order.map(name => {
    const s = steps[name];
    if (!s) return '<div class="flex items-center gap-2 text-xs text-slate-500"><span class="w-4 text-center">' + lucide('circle', 'w-3 h-3 text-slate-600') + '</span><span>' + name + '</span></div>';
    const icons = { running: '<span class="spinner text-gold-400">' + lucide('loader-2', 'w-3.5 h-3.5') + '</span>', complete: '<span class="text-emerald-300">' + lucide('check', 'w-3.5 h-3.5') + '</span>', failed: '<span class="text-red-300">' + lucide('x', 'w-3.5 h-3.5') + '</span>', skipped: '<span class="text-slate-500">' + lucide('minus', 'w-3.5 h-3.5') + '</span>' };
    const colors = { running: 'text-gold-400', complete: 'text-emerald-300', failed: 'text-red-300', skipped: 'text-slate-500' };
    return '<div class="flex items-center gap-2 text-xs ' + (colors[s.status] || 'text-slate-500') + '">' +
      '<span class="w-4 text-center">' + (icons[s.status] || lucide('circle', 'w-3 h-3 text-slate-600')) + '</span>' +
      '<span>' + name + '</span>' +
      (s.detail ? '<span class="text-slate-500 ml-auto text-[10px] truncate max-w-[50%]">' + esc(s.detail) + '</span>' : '') +
    '</div>';
  }).join('');
}

function autoGrowTextarea(ta) {
  if (!ta) return;
  // Avoid collapsing when the element isn't rendered (e.g. hidden).
  if (ta.scrollHeight <= 0) return;
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 2) + 'px';
}

function updateCharCount() {
  const ta = document.getElementById('draft-textarea');
  const counter = document.getElementById('char-count');
  if (!ta || !counter) return;
  autoGrowTextarea(ta);
  const len = ta.value.length;
  const max = selectedAction === 'quote' ? 256 : 280; // quotes use ~24 chars for URL
  counter.textContent = len + '/' + max;
  if (len > max) {
    counter.classList.add('char-over');
    document.getElementById('btn-post')?.setAttribute('disabled', '');
  } else {
    counter.classList.remove('char-over');
    if (len > 0 && capabilities.canPost) {
      document.getElementById('btn-post')?.removeAttribute('disabled');
    }
  }
}

function parseSqliteTimeToMs(raw) {
  if (!raw) return null;
  const s = String(raw);
  const norm = s.includes('T') ? s : s.replace(' ', 'T');
  const withZone = (norm.includes('Z') || norm.includes('+')) ? norm : (norm + 'Z');
  const t = new Date(withZone).getTime();
  return isFinite(t) ? t : null;
}

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h <= 0) return Math.max(1, m) + 'm';
  const mm = m % 60;
  if (mm === 0) return h + 'h';
  return h + 'h ' + mm + 'm';
}

async function postEngagement() {
  const ta = document.getElementById('draft-textarea');
  const btn = document.getElementById('btn-post');
  if (!ta || !selectedOpp || !ta.value.trim()) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="inline-flex items-center gap-1.5">' + lucide('loader-2', 'w-4 h-4 spinner') + (capabilities.dryRun ? 'Saving...' : 'Posting...') + '</span>';

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
      btn.innerHTML = '<span class="inline-flex items-center gap-1.5">' + lucide('send', 'w-4 h-4') + (capabilities.dryRun ? 'Save Draft (Dry Run)' : 'Post to X') + '</span>';
      toast('Safety rejected', 'error');
      return;
    }

    if (data.success) {
      if (data.dryRun) {
        showBanner('post-banner', 'Dry run saved a draft locally. Nothing was posted to X.', 'green');
        btn.disabled = false;
        btn.innerHTML = '<span class="inline-flex items-center gap-1.5">' + lucide('send', 'w-4 h-4') + 'Save Draft (Dry Run)' + '</span>';
        toast('Draft saved', 'success');
      } else {
        const msg = 'Posted! ' + (data.tweetUrl ? '<a href="' + data.tweetUrl + '" target="_blank" rel="noopener" class="underline">View tweet</a>' : '');
        showBanner('post-banner', msg, 'green');
        btn.innerHTML = '<span class="inline-flex items-center gap-1.5">' + lucide('check', 'w-4 h-4') + 'Posted' + '</span>';
        toast('Posted to X', 'success');

        // Update local state + list
        if (selectedOpp) {
          selectedOpp.status = 'engaged';
          const badgeEl = document.getElementById('detail-status-badge');
          if (badgeEl) badgeEl.innerHTML = statusBadge('engaged');
          await renderOppList();
        }
      }
    } else {
      showBanner('post-banner', 'Failed: ' + (data.error || 'Unknown error'), 'red');
      btn.disabled = false;
      btn.innerHTML = '<span class="inline-flex items-center gap-1.5">' + lucide('send', 'w-4 h-4') + (capabilities.dryRun ? 'Save Draft (Dry Run)' : 'Post to X') + '</span>';
      toast('Post failed', 'error');
    }
  } catch (err) {
    showBanner('post-banner', 'Network error: ' + err.message, 'red');
    btn.disabled = false;
    btn.innerHTML = '<span class="inline-flex items-center gap-1.5">' + lucide('send', 'w-4 h-4') + (capabilities.dryRun ? 'Save Draft (Dry Run)' : 'Post to X') + '</span>';
    toast('Network error', 'error');
  }
}

function showBanner(id, msg, color) {
  const el = document.getElementById(id);
  if (!el) return;
  const colors = {
    green: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200',
    red: 'bg-red-500/10 border border-red-500/20 text-red-200',
    yellow: 'bg-amber-500/10 border border-amber-500/20 text-amber-200',
  };
  el.className = 'rounded-xl px-3 py-2 text-xs ' + (colors[color] || colors.yellow);
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

// ── Feed (X Mentions/Notifications) ──
let feedFilterTimeout;
function loadFeedFilters() {
  try {
    const raw = localStorage.getItem('ai-dashboard-feed-filters');
    if (!raw) return { status: 'new', q: '', kind: 'all', starredOnly: false };
    const parsed = JSON.parse(raw);
    return {
      status: parsed.status || 'new',
      q: typeof parsed.q === 'string' ? parsed.q : '',
      kind: parsed.kind || 'all',
      starredOnly: !!parsed.starredOnly,
    };
  } catch {
    return { status: 'new', q: '', kind: 'all', starredOnly: false };
  }
}

function saveFeedFilters() {
  try { localStorage.setItem('ai-dashboard-feed-filters', JSON.stringify(feedFilters)); } catch {}
}

function setFeedFilter(next) {
  feedFilters = { ...feedFilters, ...next };
  saveFeedFilters();
  renderFeedList();
}

function applyFeedFiltersToUi() {
  const q = document.getElementById('feed-q');
  const status = document.getElementById('feed-status');
  const kind = document.getElementById('feed-kind');
  const starOnly = document.getElementById('feed-star-only');
  if (q) q.value = feedFilters.q || '';
  if (status) status.value = feedFilters.status || 'new';
  if (kind) kind.value = feedFilters.kind || 'all';
  if (starOnly) starOnly.checked = !!feedFilters.starredOnly;
}

function openComposeFor(mode, tweetId) {
  toggleCompose(true);
  const modeSel = document.getElementById('compose-mode');
  if (modeSel) modeSel.value = mode;
  setupComposeUi();
  const target = document.getElementById('compose-target');
  if (target) target.value = tweetId || '';
  updateComposeCount();
  setTimeout(() => document.getElementById('compose-text')?.focus(), 0);
}

async function refreshFeed() {
  if (!capabilities.canFetchTweets || !capabilities.canWrite) {
    toast('Feed refresh requires Tweets + Writes', 'warning');
    return;
  }
  toast('Refreshing feed...', 'info');
  try {
    const r = await fetch('/api/feed-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      toast(data.error || 'Feed refresh failed', 'error');
      return;
    }
    toast('Feed refreshed (' + (data.upserted ?? 0) + ')', 'success');
    if (currentTab === 'feed') await renderFeedList();
    // Pull new badge counts
    loadTab(currentTab);
  } catch (err) {
    toast('Feed refresh failed: ' + (err?.message || 'network'), 'error');
  }
}

async function renderFeed() {
  const el = document.getElementById('tab-feed');
  if (!el) return;

  if (!el.querySelector('#feed-root')) {
    el.innerHTML =
      '<div id="feed-root" class="h-full flex flex-col gap-3">' +
        '<div class="surface rounded-xl p-3">' +
          '<div class="flex flex-col lg:flex-row gap-3 lg:items-center">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<label class="text-xs text-slate-400 flex items-center gap-2">' +
                '<span class="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Kind</span>' +
                '<select id="feed-kind" class="bg-navy-950/40 border border-slate-700/30 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-500/40">' +
                  '<option value="all">All</option>' +
                  '<option value="mention">Mentions</option>' +
                  '<option value="reply">Replies</option>' +
                  '<option value="quote">Quotes</option>' +
                '</select>' +
              '</label>' +
              '<label class="text-xs text-slate-400 flex items-center gap-2">' +
                '<span class="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Status</span>' +
                '<select id="feed-status" class="bg-navy-950/40 border border-slate-700/30 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-500/40">' +
                  '<option value="new">New</option>' +
                  '<option value="archived">Archived</option>' +
                  '<option value="replied">Replied</option>' +
                  '<option value="discarded">Discarded</option>' +
                  '<option value="all">All</option>' +
                '</select>' +
              '</label>' +
              '<label class="text-xs text-slate-400 inline-flex items-center gap-2 bg-navy-950/20 border border-slate-700/30 rounded-lg px-2.5 py-2">' +
                '<input id="feed-star-only" type="checkbox" class="accent-gold-500" />' +
                '<span class="inline-flex items-center gap-1.5">' + lucide('star', 'w-3 h-3') + 'Starred only</span>' +
              '</label>' +
            '</div>' +
            '<div class="flex-1 flex items-center gap-2 min-w-0">' +
              '<div class="relative flex-1 min-w-[220px]">' +
                '<div class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500">' + lucide('search', 'w-4 h-4') + '</div>' +
                '<input id="feed-q" type="text" class="w-full bg-navy-950/40 border border-slate-700/30 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-gold-500/40" placeholder="Search author or text..." />' +
              '</div>' +
              '<button class="ghost-btn" type="button" onclick="refreshFeed()" title="Pull latest mentions from X">Refresh</button>' +
              '<button id="feed-clear" class="ghost-btn" type="button" title="Clear search">' + lucide('x', 'w-4 h-4') + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">' +
            '<span id="feed-count">--</span>' +
            '<span class="text-slate-600">Tip: Reply/Quote without opening X</span>' +
          '</div>' +
        '</div>' +
        '<div class="surface rounded-xl flex-1 min-h-0 overflow-hidden">' +
          '<div id="feed-list" class="opp-scroll p-3 h-full overflow-y-auto"></div>' +
        '</div>' +
      '</div>';

    const kind = document.getElementById('feed-kind');
    if (kind) kind.addEventListener('change', () => setFeedFilter({ kind: kind.value || 'all' }));
    const status = document.getElementById('feed-status');
    if (status) status.addEventListener('change', () => setFeedFilter({ status: status.value || 'new' }));
    const starOnly = document.getElementById('feed-star-only');
    if (starOnly) starOnly.addEventListener('change', () => setFeedFilter({ starredOnly: !!starOnly.checked }));
    const q = document.getElementById('feed-q');
    if (q) q.addEventListener('input', () => {
      clearTimeout(feedFilterTimeout);
      feedFilterTimeout = setTimeout(() => setFeedFilter({ q: q.value }), 120);
    });
    const clearBtn = document.getElementById('feed-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => setFeedFilter({ q: '' }));

    applyFeedFiltersToUi();
  }

  await renderFeedList();
}

function feedKindBadge(kind) {
  const map = {
    mention: 'bg-blue-500/10 text-blue-200 border-blue-500/25',
    reply: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/25',
    quote: 'bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/25',
  };
  const cls = map[kind] || 'bg-slate-500/10 text-slate-300 border-slate-500/15';
  return '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ' + cls + '">' + esc(kind || '') + '</span>';
}

async function setFeedStar(tweetId, starred) {
  try {
    const r = await fetch('/api/feed-item-star', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetId, starred: !!starred }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      toast(data.error || 'Star failed', 'error');
      return;
    }
    toast(starred ? 'Starred' : 'Unstarred', 'success');
    await renderFeedList();
    loadTab(currentTab);
  } catch (err) {
    toast('Star failed: ' + (err?.message || 'network'), 'error');
  }
}

async function discardFeedItem(tweetId) {
  try {
    const r = await fetch('/api/feed-item-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetId, discarded: true }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      toast(data.error || 'Discard failed', 'error');
      return;
    }
    toast('Discarded', 'success');
    await renderFeedList();
    loadTab(currentTab);
  } catch (err) {
    toast('Discard failed: ' + (err?.message || 'network'), 'error');
  }
}

async function renderFeedList() {
  applyFeedFiltersToUi();
  const status = feedFilters.status || 'new';
  const kind = feedFilters.kind || 'all';
  const q = String(feedFilters.q || '').trim().toLowerCase();
  const starredOnly = !!feedFilters.starredOnly;

  const includeDiscarded = status === 'discarded';
  const url =
    '/api/feed?limit=200' +
    '&kind=' + encodeURIComponent(kind) +
    '&status=' + encodeURIComponent(status) +
    '&includeDiscarded=' + (includeDiscarded ? '1' : '0');

  const data = await fetchJson(url);
  feedData = (data || [])
    .filter(i => (!starredOnly) || (i.starred === 1 || i.starred === true))
    .filter(i => {
      if (!q) return true;
      const hay = [
        i.author_username || i.author_id || '',
        i.text || '',
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

  const list = document.getElementById('feed-list');
  if (!list) return;

  setText('feed-count', feedData.length + ' item' + (feedData.length === 1 ? '' : 's'));

  if (feedData.length === 0) {
    list.innerHTML = emptyState('Nothing here (yet)', 'Click Refresh to pull mentions. Ensure X_USERNAME is set in cli/.env.');
    return;
  }

  list.innerHTML = '<div class="space-y-2">' + feedData.map((i) => {
    const author = esc(i.author_username || i.author_id || 'unknown');
    const starred = (i.starred === 1 || i.starred === true);
    const starBtn = '<button class="ghost-btn" type="button" onclick="setFeedStar(\'' + i.tweet_id + '\',' + (!starred) + ')" title="' + (starred ? 'Unstar' : 'Star') + '">' + lucide('star', 'w-4 h-4') + '</button>';
    const discardBtn = '<button class="ghost-btn" type="button" onclick="discardFeedItem(\'' + i.tweet_id + '\')" title="Discard">' + lucide('ban', 'w-4 h-4') + '</button>';
    const replyBtn = '<button class="ghost-btn" type="button" onclick="openComposeFor(\'reply\',\'' + i.tweet_id + '\')" title="Reply">' + lucide('reply', 'w-4 h-4') + '</button>';
    const quoteBtn = '<button class="ghost-btn" type="button" onclick="openComposeFor(\'quote\',\'' + i.tweet_id + '\')" title="Quote">' + lucide('message-square', 'w-4 h-4') + '</button>';
    return '<div class="opp-card rounded-xl px-3.5 py-3 border ' + (starred ? 'border-gold-500/25 bg-gold-500/5' : 'border-slate-700/15 bg-navy-950/10') + '">' +
      '<div class="flex items-start gap-3">' +
        '<div class="min-w-0 flex-1">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="text-sm font-semibold text-slate-200 truncate">@' + author + '</span>' +
            feedKindBadge(i.kind) +
            (i.status ? statusBadge(i.status) : '') +
            '<span class="ml-auto text-[10px] text-slate-500 font-mono shrink-0">' + ago(i.created_at || i.last_seen) + '</span>' +
          '</div>' +
          '<div class="text-xs text-slate-300/90 leading-relaxed mt-1 whitespace-pre-wrap">' + linkify(esc(i.text || '')) + '</div>' +
          '<div class="flex items-center gap-3 mt-2 text-[10px] text-slate-400 font-mono">' +
            '<span title="Likes" class="inline-flex items-center gap-1">' + lucide('heart', 'w-3 h-3') + fmtK(i.likes || 0) + '</span>' +
            '<span title="Retweets" class="inline-flex items-center gap-1">' + lucide('repeat-2', 'w-3 h-3') + fmtK(i.retweets || 0) + '</span>' +
            '<span title="Replies" class="inline-flex items-center gap-1">' + lucide('message-circle', 'w-3 h-3') + fmtK(i.replies || 0) + '</span>' +
            '<span title="Quotes" class="inline-flex items-center gap-1">' + lucide('message-square', 'w-3 h-3') + fmtK(i.quotes || 0) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1 shrink-0">' +
          replyBtn +
          quoteBtn +
          starBtn +
          discardBtn +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

// ── Posts ──
async function renderPosts() {
  const el = document.getElementById('tab-posts');
  const data = await fetchJson('/api/posts?limit=50');
  if (!data || data.length === 0) {
    el.innerHTML = emptyState('No posts generated yet', 'Posts appear here after the daemon generates content.');
    return;
  }

  const canRefresh = !!capabilities.canRefreshMetrics;
  const header =
    '<div class="flex items-center justify-between mb-3">' +
      '<div class="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Recent posts</div>' +
      '<div class="flex items-center gap-2">' +
        '<button class="ghost-btn' + (canRefresh ? '' : ' opacity-50 cursor-not-allowed') + '" type="button" onclick="refreshPostMetrics()" ' + (canRefresh ? '' : 'disabled') + ' title="Fetch latest metrics from X">Refresh metrics</button>' +
      '</div>' +
    '</div>';

  el.innerHTML = header + '<table class="w-full text-sm"><thead><tr class="text-left text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700/30">' +
    '<th class="pb-2 pr-2 w-16">Status</th><th class="pb-2 pr-2 w-24">Kind</th><th class="pb-2 pr-2">Content</th>' +
    '<th class="pb-2 pr-2 w-20">Safety</th><th class="pb-2 w-16 text-right">When</th>' +
  '</tr></thead><tbody>' + data.map((p, i) => {
    const sb = statusBadge(p.status);
    const vb = verdictBadge(p.safety_verdict);
    const kind = (p.x_post_type === 'quote') ? 'quote' : (p.x_post_type === 'reply') ? 'reply' : 'original';
    const kindCell = typeBadge(kind) + '<div class="text-[10px] text-gray-600 font-mono mt-1 truncate">' + esc(p.prompt_type) + '</div>';
    const rid = 'post-' + i;
    return '<tr class="row-clickable border-b border-gray-700/15" onclick="toggle(\'' + rid + '\')">' +
      '<td class="py-2 pr-2">' + sb + '</td>' +
      '<td class="py-2 pr-2 text-xs text-gray-500">' + kindCell + '</td>' +
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

async function refreshPostMetrics() {
  if (!capabilities.canRefreshMetrics) { toast('Metrics refresh disabled', 'warning'); return; }
  toast('Refreshing post metrics...', 'info');
  try {
    const r = await fetch('/api/posts-refresh-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 60 }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      toast(data.error || 'Metrics refresh failed', 'error');
      return;
    }
    toast('Metrics updated (' + data.updated + '/' + data.scanned + ')', 'success');
    if (currentTab === 'posts') await renderPosts();
  } catch (err) {
    toast('Metrics refresh failed: ' + (err?.message || 'network'), 'error');
  }
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
    statCard('Batch Cost', formatCost(data.batch?.batchCostCents || 0), 'text-emerald-400') +
    statCard('Batch Calls', data.batch?.batchCalls || 0, 'text-blue-400') +
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

// ── Intel (Trends + Hot Users) ──
async function renderIntel() {
  const el = document.getElementById('tab-intel');
  if (!el) return;

  const [trends, hot] = await Promise.all([
    fetchJson('/api/trends?limit=25'),
    fetchJson('/api/hot-users?limit=25'),
  ]);

  const hasTrends = Array.isArray(trends) && trends.length > 0;
  const hasHot = Array.isArray(hot) && hot.length > 0;

  const trendsHeader =
    '<div class="flex items-center justify-between mb-2">' +
      '<h3 class="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Trends</h3>' +
      '<button class="ghost-btn" type="button" onclick="refreshTrends()">Refresh</button>' +
    '</div>';

  const trendsList = hasTrends
    ? '<div class="space-y-2">' + trends.slice(0, 20).map(t => {
        const vol = t.volume != null ? fmtK(t.volume) : '0';
        const score = (t.relevance_score != null) ? Number(t.relevance_score).toFixed(0) : '0';
        const src = esc(t.source || '');
        const topic = esc(t.topic || '');
        const when = t.last_seen ? ago(t.last_seen) : '';
        return '<div class="bg-navy-800/60 rounded-lg px-4 py-3 border border-gray-700/20 fade-in">' +
          '<div class="flex items-center gap-3">' +
            '<span class="font-mono text-xs text-slate-500 w-10 text-right tabular-nums">' + score + '</span>' +
            '<div class="min-w-0 flex-1">' +
              '<div class="text-sm text-slate-200 truncate">' + topic + '</div>' +
              '<div class="text-[10px] text-slate-500 font-mono mt-1">' + esc(src) + ' · vol ' + esc(vol) + (when ? (' · ' + esc(when)) : '') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>'
    : emptyState('No trends yet', 'Run a trend refresh to pull current topics from X and other sources.');

  const hotHeader =
    '<div class="flex items-center justify-between mb-2 mt-6">' +
      '<h3 class="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Hot Users (7d)</h3>' +
      '<div class="text-[10px] text-slate-600 font-mono">based on inbox engagement</div>' +
    '</div>';

  const hotList = hasHot
    ? '<div class="space-y-2">' + hot.slice(0, 20).map(u => {
        const user = esc(u.author_username || u.author_id || 'unknown');
        const url = 'https://x.com/' + user.replace(/^@/, '');
        const heat = (u.heat != null) ? Number(u.heat).toFixed(0) : '0';
        return '<div class="bg-navy-800/60 rounded-lg px-4 py-3 border border-gray-700/20 fade-in">' +
          '<div class="flex items-center gap-3">' +
            '<span class="font-mono text-xs text-slate-500 w-10 text-right tabular-nums">' + heat + '</span>' +
            '<div class="min-w-0 flex-1">' +
              '<div class="flex items-center gap-2">' +
                '<a href="' + url + '" target="_blank" rel="noopener" class="text-sm font-semibold text-slate-200 hover:underline truncate">@' + user + '</a>' +
                '<span class="text-[10px] text-slate-500 font-mono">' + (u.opportunities ?? 0) + ' opps</span>' +
              '</div>' +
              '<div class="text-[10px] text-slate-500 font-mono mt-1">' +
                fmtK(u.likes || 0) + ' likes · ' +
                fmtK(u.retweets || 0) + ' RT · ' +
                fmtK(u.replies || 0) + ' replies · ' +
                fmtK(u.quotes || 0) + ' quotes' +
              '</div>' +
            '</div>' +
            '<span class="text-[10px] text-slate-600 font-mono shrink-0">' + (u.last_seen ? ago(u.last_seen) : '') + '</span>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>'
    : emptyState('No hot users yet', 'Hot users appear after the inbox has data.');

  el.innerHTML =
    '<div class="surface rounded-xl p-4 fade-in">' +
      trendsHeader +
      trendsList +
      hotHeader +
      hotList +
    '</div>';
}

async function refreshTrends() {
  if (!capabilities.canFetchTweets || !capabilities.canWrite) {
    toast('Trends refresh requires Tweets + Writes', 'warning');
    return;
  }
  toast('Refreshing trends...', 'info');
  try {
    const r = await fetch('/api/trends-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      toast(data.error || 'Trend refresh failed', 'error');
      return;
    }
    toast('Trends refreshed', 'success');
    if (currentTab === 'intel') await renderIntel();
  } catch (err) {
    toast('Trend refresh failed: ' + (err?.message || 'network'), 'error');
  }
}

// ── Lucide Icons ──
function lucide(name, cls) {
  const p = {
    'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    'repeat-2': '<path d="m2 9 3-3 3 3"/><path d="M13 18H7a2 2 0 0 1-2-2V6"/><path d="m22 15-3 3-3-3"/><path d="M11 6h6a2 2 0 0 1 2 2v10"/>',
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'copy': '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    'refresh-cw': '<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>',
    'bookmark': '<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    'ban': '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    'bar-chart-3': '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'alert-triangle': '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'more-vertical': '<path d="M12 12h.01"/><path d="M12 5h.01"/><path d="M12 19h.01"/>',
    'star': '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.1 4.251a.59.59 0 0 0 .444.323l4.69.682a.53.53 0 0 1 .294.904l-3.394 3.307a.59.59 0 0 0-.17.522l.801 4.671a.53.53 0 0 1-.77.56l-4.2-2.208a.59.59 0 0 0-.54 0l-4.2 2.208a.53.53 0 0 1-.77-.56l.801-4.671a.59.59 0 0 0-.17-.522L2.197 8.455a.53.53 0 0 1 .294-.904l4.69-.682a.59.59 0 0 0 .444-.323z"/>',
    'zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    'send': '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    'circle': '<circle cx="12" cy="12" r="10"/>',
    'loader-2': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'minus': '<path d="M5 12h14"/>',
    'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'reply': '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  };
  return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (p[name] || '') + '</svg>';
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
    if (embed) {
      embed.classList.add('tweet-loaded');
      const tweetId = embed.getAttribute('data-tweet-id');
      if (tweetId) {
        embed.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.src = 'https://platform.twitter.com/embed/Tweet.html?dnt=true&theme=dark&id=' + encodeURIComponent(tweetId);
        iframe.style.cssText = 'width:100%;max-width:550px;margin:0 auto;height:250px;border:none;border-radius:12px;background:transparent;display:block;color-scheme:dark;';
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox');
        embed.appendChild(iframe);
      }
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
    original: 'bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/25',
    quote: 'bg-blue-500/10 text-blue-200 border-blue-500/25',
    reply: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/25',
  };
  const cls = map[type] || 'bg-slate-500/10 text-slate-300 border-slate-500/15';
  return '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ' + cls + '">' + esc((type || '').toUpperCase()) + '</span>';
}

function phaseLabel(phase) {
  const map = {
    starting: 'Starting',
    compose: 'Composing',
    scan: 'Scanning tweets',
    score: 'Scoring opportunities',
    upsert: 'Updating inbox',
    engage: 'Engaging',
    reevaluate: 'Re-evaluating tracked',
    expire: 'Expiring tracked',
    cleanup: 'Cleanup',
    complete: 'Complete',
    error: 'Error',
  };
  if (!phase) return '';
  return map[phase] || String(phase);
}

function cycleStatusPill(status) {
  if (status === 'error') {
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border bg-red-500/10 text-red-200 border-red-500/25">' +
      '<span class="-ml-0.5">' + lucide('x', 'w-3 h-3') + '</span>' +
      '<span>Error</span>' +
    '</span>';
  }
  if (status === 'running') {
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border bg-gold-500/10 text-gold-300 border-gold-500/25">' +
      '<span class="-ml-0.5">' + lucide('loader-2', 'w-3 h-3 spinner') + '</span>' +
      '<span>In progress</span>' +
    '</span>';
  }
  if (status === 'unfinished') {
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border bg-amber-500/10 text-amber-200 border-amber-500/25">' +
      '<span class="-ml-0.5">' + lucide('alert-triangle', 'w-3 h-3') + '</span>' +
      '<span>Unfinished</span>' +
    '</span>';
  }
  return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border bg-emerald-500/10 text-emerald-200 border-emerald-500/25">' +
    '<span class="-ml-0.5">' + lucide('check', 'w-3 h-3') + '</span>' +
    '<span>Completed</span>' +
  '</span>';
}

function parseIsoish(iso) {
  if (!iso) return null;
  try {
    const raw = String(iso);
    const norm = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const withZone = (norm.includes('Z') || norm.includes('+')) ? norm : (norm + 'Z');
    const t = new Date(withZone).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

function fmtDurationMs(ms) {
  if (ms == null) return '--';
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '--';
  const s = n / 1000;
  if (s < 60) return (s < 10 ? s.toFixed(1) : s.toFixed(0)) + 's';
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  if (m < 60) return m + 'm ' + rs + 's';
  const h = Math.floor(m / 60);
  const rm = Math.round(m % 60);
  return h + 'h ' + rm + 'm';
}

function cycleTiming(c) {
  if (!c) return '--';
  if (c.duration_ms != null) return 'Duration ' + fmtDurationMs(c.duration_ms);
  const started = parseIsoish(c.started_at);
  if (c.completed_at) {
    const completed = parseIsoish(c.completed_at);
    if (started != null && completed != null) return 'Duration ' + fmtDurationMs(completed - started);
    return 'Completed';
  }
  if (started != null) return 'Elapsed ' + fmtDurationMs(Date.now() - started);
  return 'In progress';
}

function statusBadge(status) {
  const map = {
    posted: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/25',
    tracked: 'bg-blue-500/10 text-blue-200 border-blue-500/25',
    engaged: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/25',
    draft: 'bg-slate-500/10 text-slate-300 border-slate-500/15',
    queued: 'bg-blue-500/10 text-blue-200 border-blue-500/25',
    review: 'bg-amber-500/10 text-amber-200 border-amber-500/25',
    rejected: 'bg-red-500/10 text-red-200 border-red-500/25',
    failed: 'bg-red-500/10 text-red-200 border-red-500/25',
    skipped: 'bg-slate-500/10 text-slate-300 border-slate-500/15',
    expired: 'bg-slate-500/10 text-slate-400 border-slate-500/10',
  };
  const cls = map[status] || 'bg-slate-500/10 text-slate-300 border-slate-500/15';
  return '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ' + cls + '">' + esc(status || '') + '</span>';
}

function recommendedBadge(action) {
  const map = {
    quote: { cls: 'bg-blue-500/10 text-blue-200 border-blue-500/25', label: 'quote', icon: 'message-square' },
    reply: { cls: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/25', label: 'reply', icon: 'reply' },
    track: { cls: 'bg-gold-500/10 text-gold-400 border-gold-500/25', label: 'track', icon: 'bookmark' },
    skip: { cls: 'bg-slate-500/10 text-slate-400 border-slate-500/15', label: 'skip', icon: 'ban' },
  };
  const v = map[action] || { cls: 'bg-slate-500/10 text-slate-300 border-slate-500/15', label: action || 'n/a', icon: 'minus' };
  return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ' + v.cls + '" title="Recommended action: ' + esc(v.label) + '">' +
    '<span class="-ml-0.5">' + lucide(v.icon, 'w-3 h-3') + '</span>' +
    '<span>' + esc(v.label) + '</span>' +
  '</span>';
}

function verdictBadge(v) {
  const map = {
    SAFE: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/25',
    REVIEW: 'bg-amber-500/10 text-amber-200 border-amber-500/25',
    REJECT: 'bg-red-500/10 text-red-200 border-red-500/25',
  };
  const cls = map[v] || 'bg-slate-500/10 text-slate-300 border-slate-500/15';
  return '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ' + cls + '">' + esc(v || '') + '</span>';
}

function stat(label, val, color) {
  return '<span class="text-slate-500 text-xs">' + esc(label) + ' <span class="font-mono tabular-nums ' + color + '">' + (val ?? 0) + '</span></span>';
}

function scoreBar(label, val, max, color) {
  const pct = Math.min(100, Math.max(0, (val / max) * 100));
  return '<div>' +
    '<div class="flex justify-between mb-0.5"><span class="text-[10px] text-slate-500">' + esc(label) + '</span><span class="text-[10px] font-mono tabular-nums text-slate-500">' + (val ?? 0) + '</span></div>' +
    '<div class="h-1.5 bg-slate-700/35 rounded-full overflow-hidden"><div class="h-full rounded-full score-bar ' + color + '" style="width:' + pct + '%"></div></div>' +
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
      '<span class="text-[10px] text-slate-500 w-24 truncate">' + esc(name) + '</span>' +
      '<div class="flex-1 h-1.5 bg-slate-700/35 rounded-full overflow-hidden"><div class="h-full rounded-full score-bar ' + color + '" style="width:' + pct + '%"></div></div>' +
      '<span class="text-[10px] font-mono tabular-nums text-slate-500 w-6 text-right">' + score + '</span>' +
    '</div>';
  }).join('') + '</div>';
}

function metricsLine(p) {
  if (p.analytics_likes == null) return '';
  const q = (p.analytics_quotes != null) ? (' / ' + fmtK(p.analytics_quotes) + ' quotes') : '';
  return '<span>Metrics: <span class="text-slate-200">' +
    fmtK(p.analytics_likes) + ' likes / ' +
    fmtK(p.analytics_retweets) + ' RTs / ' +
    fmtK(p.analytics_replies) + ' replies' +
    q +
  '</span></span>';
}

function statCard(label, value, color) {
  return '<div class="surface rounded-xl p-3">' +
    '<div class="text-[10px] text-slate-500 uppercase tracking-wider font-mono">' + esc(label) + '</div>' +
    '<div class="text-lg font-bold ' + color + ' mt-0.5 font-mono tabular-nums">' + value + '</div>' +
  '</div>';
}

function emptyState(title, desc) {
  return '<div class="flex flex-col items-center justify-center py-16 text-center">' +
    '<div class="w-10 h-10 rounded-full bg-navy-950/40 border border-slate-700/25 flex items-center justify-center mb-3">' +
      '<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>' +
    '</div>' +
    '<div class="text-sm text-slate-200 font-semibold mb-1">' + esc(title) + '</div>' +
    '<div class="text-xs text-slate-500 max-w-sm leading-relaxed">' + desc + '</div>' +
  '</div>';
}

// ── Boot ──
(() => {
  let saved = null;
  try { saved = localStorage.getItem('ai-dashboard-tab'); } catch {}
  const initial = (saved && TAB_META[saved]) ? saved : 'cycles';
  switchTab(initial);
})();
