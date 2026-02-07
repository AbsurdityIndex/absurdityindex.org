import { createServer, type Server } from 'node:http';
import type Database from 'better-sqlite3';
import { getDashboardHtml } from './html.js';
import { handleApi, handleSSE } from './api.js';

export interface DashboardServerOptions {
  port: number;
  db: Database.Database;
}

export function startDashboardServer(options: DashboardServerOptions): { server: Server; stop: () => void } {
  const { port, db } = options;
  const html = getDashboardHtml();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const pathname = url.pathname;

    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (pathname === '/api/events') {
      handleSSE({ db }, req, res);
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
