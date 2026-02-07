import { createServer, type Server } from 'node:http';
import type Database from 'better-sqlite3';
import { getDashboardHtml } from './html.js';
import { handleApi, handleSSE, handlePostApi, handleGenerateSSE, type FullApiDeps } from './api.js';
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

export function startDashboardServer(options: DashboardServerOptions): { server: Server; stop: () => void } {
  const { port, db } = options;
  const html = getDashboardHtml();

  const fullDeps: FullApiDeps = {
    db,
    writeDb: options.writeDb,
    xReader: options.xReader,
    xWriter: options.xWriter,
    claude: options.claude,
    config: options.config,
    bills: options.bills ?? [],
    dryRun: options.dryRun ?? false,
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
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
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
        canPost: !!options.xWriter && !!options.writeDb,
        dryRun: options.dryRun ?? false,
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
      handleApi({ db }, pathname, url, req, res);
      return;
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
