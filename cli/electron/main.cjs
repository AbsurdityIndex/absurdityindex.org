/* eslint-disable no-console */
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');

const { app, BrowserWindow, shell, globalShortcut, screen, dialog } = require('electron');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('-')) return fallback;
  return next;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function intArg(name, fallback) {
  const raw = argValue(name, null);
  if (raw == null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  if (raw === '1' || raw.toLowerCase() === 'true') return true;
  if (raw === '0' || raw.toLowerCase() === 'false') return false;
  return fallback;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function choosePort(preferredPort) {
  // Try a small range so we don't fight other local dev servers.
  for (let p = preferredPort; p < preferredPort + 20; p += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p)) return p;
  }
  return preferredPort;
}

async function waitForServer(url, { timeoutMs = 12_000 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Node 20+ has global fetch.
      // eslint-disable-next-line no-undef
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (r.ok) return true;
    } catch {
      // ignore
    }
    if (Date.now() - start > timeoutMs) return false;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 200));
  }
}

function cliRoot() {
  // cli/electron/main.cjs -> cli/
  return path.resolve(__dirname, '..');
}

function logPath() {
  const dir = path.join(cliRoot(), 'data');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, 'dashboard-app.log');
}

function electronLogPath() {
  const dir = path.join(cliRoot(), 'data');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, 'dashboard-electron-main.log');
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(electronLogPath(), line); } catch {}
  // Keep stdout logging too (useful when running in a foreground terminal).
  console.log(msg);
}

function spawnDashboard({ port, dryRun }) {
  const root = cliRoot();
  const distEntry = path.join(root, 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) {
    throw new Error(`Missing ${distEntry}. Run: npm run build --prefix cli`);
  }

  const args = [
    distEntry,
    'engage',
    'dashboard',
    '--port',
    String(port),
  ];
  if (dryRun) args.push('--dry-run');

  const out = fs.openSync(logPath(), 'a');
  const child = spawn('node', args, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', out, out],
    detached: process.platform !== 'win32',
  });

  return child;
}

let backend = null;
let mainWindow = null;
let activePort = null;

// Ensure re-launching the app focuses the existing window instead of creating a headless
// second instance (common "Dock icon but no window" confusion on macOS).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  try { app.quit(); } catch {}
} else {
  app.on('second-instance', () => {
    try {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        return;
      }
    } catch {
      // ignore
    }
    // If no window exists for some reason, clicking the Dock icon should recreate it.
    app.emit('activate');
  });
}

async function createWindow({ port, alwaysOnTop, width, height }) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const wa = display.workArea;
  const x = Math.round(wa.x + Math.max(0, wa.width - width) / 2);
  const y = Math.round(wa.y + Math.max(0, wa.height - height) / 2);

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#060F1E',
    show: true,
    x,
    y,
    title: 'Absurdity Index — Engagement Dashboard',
    autoHideMenuBar: true,
    alwaysOnTop,
    // Use a standard title bar by default so the window is obviously draggable.
    // If we later want a chrome-less "widget" mode, we can add a flag and implement
    // a custom draggable region in CSS via -webkit-app-region.
    titleBarStyle: 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the system browser.
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.webContents.on('will-navigate', (e, url) => {
    // Prevent leaving the app (e.g. clicking external links).
    const allowed = url.startsWith(`http://127.0.0.1:${port}`) || url.startsWith(`http://localhost:${port}`);
    if (!allowed) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Load a fast local "boot" page so the window shows immediately even if the backend
  // is slow to start. Then navigate to the real URL.
  try {
    const bootHtml = `
      <!doctype html>
      <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Loading…</title>
      <style>
        :root{color-scheme:dark}
        body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
          background:radial-gradient(900px 700px at 12% -10%, rgba(197,165,114,.14), transparent 55%),
                     radial-gradient(900px 700px at 90% 10%, rgba(59,130,246,.10), transparent 60%),
                     #060F1E;
          font:13px/1.4 -apple-system,BlinkMacSystemFont,Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
          color:rgba(226,232,240,.86)}
        .card{max-width:520px;padding:18px 18px;border-radius:14px;
          background:rgba(18,31,54,.55);border:1px solid rgba(148,163,184,.12);
          box-shadow:0 1px 0 rgba(255,255,255,.04) inset, 0 24px 60px rgba(0,0,0,.45);
          backdrop-filter:blur(10px)}
        .title{font-weight:700;color:#FAF7F0;font-family:ui-serif,Georgia,serif;letter-spacing:-.01em}
        .muted{color:rgba(148,163,184,.90);margin-top:6px}
        .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;color:rgba(226,232,240,.86)}
      </style></head>
      <body><div class="card">
        <div class="title">Starting Engagement Dashboard…</div>
        <div class="muted">Connecting to:</div>
        <div class="mono">http://127.0.0.1:${port}/</div>
        <div class="muted" style="margin-top:10px">If this hangs, check logs in:</div>
        <div class="mono">${logPath()}</div>
      </div></body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(bootHtml)}`);
  } catch {
    // ignore
  }

  try {
    await win.loadURL(`http://127.0.0.1:${port}/`);
  } catch (err) {
    log(`Failed to load dashboard URL: ${err && err.stack ? err.stack : String(err)}`);
    try {
      const failHtml = `
        <!doctype html>
        <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>Failed to Load</title>
        <style>
          :root{color-scheme:dark}
          body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
            background:#060F1E;font:13px/1.45 -apple-system,BlinkMacSystemFont,Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
            color:rgba(226,232,240,.86)}
          .card{max-width:720px;padding:18px;border-radius:14px;background:rgba(18,31,54,.55);
            border:1px solid rgba(148,163,184,.12)}
          .title{font-weight:700;color:#FAF7F0;font-family:ui-serif,Georgia,serif}
          .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;color:rgba(226,232,240,.86)}
          .muted{color:rgba(148,163,184,.90);margin-top:8px}
        </style></head>
        <body><div class="card">
          <div class="title">Dashboard Failed to Load</div>
          <div class="muted">Tried:</div>
          <div class="mono">http://127.0.0.1:${port}/</div>
          <div class="muted">See logs:</div>
          <div class="mono">${logPath()}</div>
          <div class="mono">${electronLogPath()}</div>
          <div class="muted">If you see a better-sqlite3 binding error, rebuild it in <span class="mono">cli/</span>:</div>
          <div class="mono">pnpm rebuild better-sqlite3</div>
        </div></body></html>`;
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(failHtml)}`);
    } catch {
      // ignore
    }
  }

  try { win.show(); } catch {}
  try { win.focus(); } catch {}
  try { app.focus({ steal: true }); } catch {}

  log(`Window ready on http://127.0.0.1:${port}/ (bounds=${JSON.stringify(win.getBounds())})`);

  // Toggle always-on-top.
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next);
  });

  return win;
}

function killBackend() {
  if (!backend) return;
  try {
    if (process.platform === 'win32') {
      backend.kill();
    } else {
      // Kill the whole process group if detached.
      process.kill(-backend.pid, 'SIGTERM');
    }
  } catch {
    // ignore
  }
  backend = null;
}

app.on('window-all-closed', () => {
  // On macOS, we still quit (this is a single-purpose app).
  app.quit();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  killBackend();
});

(process => {
  process.on('uncaughtException', (err) => log(`uncaughtException: ${err && err.stack ? err.stack : String(err)}`));
  process.on('unhandledRejection', (err) => log(`unhandledRejection: ${err && err.stack ? err.stack : String(err)}`));
})(process);

(async () => {
  const preferredPort = intArg('--port', parseInt(process.env.DASHBOARD_PORT || '3847', 10) || 3847);
  const port = await choosePort(preferredPort);
  activePort = port;

  const dryRunEnv = boolEnv('DASHBOARD_DRY_RUN', true);
  const dryRun = hasArg('--live') ? false : (hasArg('--dry-run') ? true : dryRunEnv);

  // Default OFF. Only enable by explicit CLI flag so it never "mysteriously" stays on top.
  const alwaysOnTop = hasArg('--no-always-on-top') ? false : hasArg('--always-on-top');

  const width = intArg('--width', parseInt(process.env.DASHBOARD_WIDTH || '1320', 10) || 1320);
  const height = intArg('--height', parseInt(process.env.DASHBOARD_HEIGHT || '860', 10) || 860);

  await app.whenReady();

  log(`Launching backend (port=${port}, dryRun=${dryRun}, alwaysOnTop=${alwaysOnTop}, width=${width}, height=${height})`);
  backend = spawnDashboard({ port, dryRun });

  const ok = await waitForServer(`http://127.0.0.1:${port}/api/overview`);
  if (!ok) {
    const msg = `Dashboard backend did not start in time. See ${logPath()}`;
    console.error(msg);
    log(msg);
    try {
      dialog.showErrorBox(
        'Engagement Dashboard Failed to Start',
        [
          `The dashboard server did not respond on: http://127.0.0.1:${port}/api/overview`,
          '',
          'Logs:',
          `- ${logPath()}`,
          `- ${electronLogPath()}`,
          '',
          'Tip: If you see a better-sqlite3 binding error, run:',
          '  pnpm -C cli rebuild better-sqlite3',
        ].join('\n')
      );
    } catch {
      // ignore
    }
    killBackend();
    app.quit();
    return;
  }

  mainWindow = await createWindow({ port, alwaysOnTop, width, height });
})();

app.on('activate', async () => {
  log('activate: requested window show');
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  // If the user clicks the Dock icon after all windows were closed (or if a window
  // was never shown for some reason), recreate it.
  const preferredPort = intArg('--port', parseInt(process.env.DASHBOARD_PORT || '3847', 10) || 3847);
  const port = activePort ?? preferredPort;
  const alwaysOnTop = hasArg('--no-always-on-top') ? false : hasArg('--always-on-top');
  const width = intArg('--width', parseInt(process.env.DASHBOARD_WIDTH || '1320', 10) || 1320);
  const height = intArg('--height', parseInt(process.env.DASHBOARD_HEIGHT || '860', 10) || 860);
  mainWindow = await createWindow({ port, alwaysOnTop, width, height });
});
