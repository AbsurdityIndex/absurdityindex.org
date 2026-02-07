import { createServer, type Server, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { getDashboardHtml } from './html.js';
import { handleApi, handleSSE, handlePostApi, handleGenerateSSE, type FullApiDeps } from './api.js';
import { createDashboardDaemonManager } from './daemon-manager.js';
import type { XReadClient, XWriteClient } from '../x-api/client.js';
import type { ClaudeClient } from '../claude/client.js';
import type { Config } from '../../config.js';
import type { LoadedBill } from '../bills/loader.js';

export interface DashboardServerOptions {
  port: number;
  db: Database.Database;
  writeDb?: Database.Database;
  xReader?: XReadClient;
  xWriter?: XWriteClient;
  claude?: ClaudeClient;
  config?: Config;
  bills?: LoadedBill[];
  dryRun?: boolean;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function findDashboardUiDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Running compiled JS: cli/dist/modules/dashboard/server.js -> cli/dist/dashboard-ui
    path.resolve(here, '../../dashboard-ui'),
    // Running TS via tsx: cli/src/modules/dashboard/server.ts -> cli/dist/dashboard-ui
    path.resolve(here, '../../../dist/dashboard-ui'),
  ];

  for (const dir of candidates) {
    try {
      const indexPath = path.join(dir, 'index.html');
      if (fs.existsSync(indexPath)) return dir;
    } catch {
      // ignore
    }
  }

  return null;
}

function serveFile(res: ServerResponse, filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? 'application/octet-stream';
    const cacheControl = filePath.includes(`${path.sep}_astro${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-store';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
    });
    res.end(fs.readFileSync(filePath));
    return true;
  } catch {
    return false;
  }
}

export function startDashboardServer(options: DashboardServerOptions): { server: Server; stop: () => void } {
  const { port, db } = options;
  const uiDir = findDashboardUiDir();
  const htmlFallback = uiDir ? null : getDashboardHtml();

  const daemon = createDashboardDaemonManager({
    db: options.writeDb,
    xReader: options.xReader,
    xWriter: options.xWriter,
    claude: options.claude,
    config: options.config,
    dryRun: options.dryRun ?? false,
  });

  const fullDeps: FullApiDeps = {
    db,
    writeDb: options.writeDb,
    xReader: options.xReader,
    xWriter: options.xWriter,
    claude: options.claude,
    config: options.config,
    bills: options.bills ?? [],
    dryRun: options.dryRun ?? false,
    daemon,
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (pathname === '/') {
      if (uiDir) {
        if (serveFile(res, path.join(uiDir, 'index.html'))) return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlFallback ?? getDashboardHtml());
      return;
    }

    if (pathname === '/api/events') {
      handleSSE({ db }, req, res);
      return;
    }

    if (pathname === '/api/generate-draft') {
      handleGenerateSSE(fullDeps, url, req, res);
      return;
    }

    if (pathname === '/api/capabilities') {
      const caps = {
        canFetchTweets: !!options.xReader,
        canGenerate: !!options.claude,
        canWrite: !!options.writeDb,
        canRefreshMetrics: !!options.xReader && !!options.writeDb,
        canStartDaemon: !!options.writeDb && !!options.xReader && !!options.claude && ((options.dryRun ?? false) ? true : !!options.xWriter),
        canPost: (options.dryRun ?? false) ? !!options.writeDb : (!!options.xWriter && !!options.writeDb),
        dryRun: options.dryRun ?? false,
        siteUrl: options.config?.siteUrl ?? 'https://absurdityindex.org',
        engageAuthorCooldownHours: options.config?.engageAuthorCooldownHours ?? 12,
        maxEngagementsPerDay: options.config?.maxEngagementsPerDay ?? 100,
      };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(caps));
      return;
    }

    if (req.method === 'POST' && pathname.startsWith('/api/')) {
      handlePostApi(fullDeps, pathname, req, res);
      return;
    }

    if (pathname.startsWith('/api/')) {
      handleApi({ db, config: options.config, daemon }, pathname, url, req, res);
      return;
    }

    // Static dashboard UI assets (built via Astro)
    if (uiDir) {
      // Prevent path traversal and decode URL safely
      const decoded = (() => {
        try { return decodeURIComponent(pathname); } catch { return pathname; }
      })();
      const rel = decoded.replace(/^\/+/, '');
      const normalized = path.normalize(rel);
      if (!normalized.startsWith('..') && !path.isAbsolute(normalized)) {
        const fullPath = path.resolve(uiDir, normalized);
        const ok = fullPath === uiDir || fullPath.startsWith(uiDir + path.sep);
        if (ok && serveFile(res, fullPath)) return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.listen(port, '127.0.0.1');

  return {
    server,
    stop: () => {
      server.close();
    },
  };
}
