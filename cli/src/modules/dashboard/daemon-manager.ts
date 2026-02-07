import type Database from 'better-sqlite3';
import type { XReadClient, XWriteClient } from '../x-api/client.js';
import type { ClaudeClient } from '../claude/client.js';
import type { Config } from '../../config.js';
import { startWatchDaemon, type WatchOptions } from '../engage/watch-daemon.js';

export interface DashboardDaemonStatus {
  running: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  lastError: string | null;
  options: WatchOptions | null;
}

export interface DashboardDaemonManager {
  status(): DashboardDaemonStatus;
  start(opts?: Partial<WatchOptions>): { ok: boolean; status: DashboardDaemonStatus; error?: string };
  stop(): { ok: boolean; status: DashboardDaemonStatus; error?: string };
}

export interface CreateDashboardDaemonManagerDeps {
  db?: Database.Database;
  xReader?: XReadClient;
  xWriter?: XWriteClient;
  claude?: ClaudeClient;
  config?: Config;
  dryRun: boolean;
}

export function createDashboardDaemonManager(deps: CreateDashboardDaemonManagerDeps): DashboardDaemonManager {
  let daemon: { stop: () => void } | null = null;
  let startedAt: string | null = null;
  let stoppedAt: string | null = null;
  let lastError: string | null = null;
  let options: WatchOptions | null = null;

  const status = (): DashboardDaemonStatus => ({
    running: !!daemon,
    startedAt,
    stoppedAt,
    lastError,
    options,
  });

  const start = (override?: Partial<WatchOptions>) => {
    if (daemon) return { ok: false, status: status(), error: 'Daemon already running' };
    if (!deps.db) return { ok: false, status: status(), error: 'Write DB not configured' };
    if (!deps.config) return { ok: false, status: status(), error: 'Config not available' };
    if (!deps.xReader) return { ok: false, status: status(), error: 'X reader not configured' };
    if (!deps.claude) return { ok: false, status: status(), error: 'Claude not configured' };

    const next: WatchOptions = {
      interval: override?.interval ?? deps.config.engageScanIntervalMinutes,
      maxEngagementsPerDay: override?.maxEngagementsPerDay ?? deps.config.maxEngagementsPerDay,
      minOpportunityScore: override?.minOpportunityScore ?? deps.config.engageMinScore,
      trackThreshold: override?.trackThreshold ?? deps.config.engageTrackThreshold,
      dryRun: override?.dryRun ?? deps.dryRun,
    };

    if (!next.dryRun && !deps.xWriter) {
      return { ok: false, status: status(), error: 'X writer not configured (required for live mode)' };
    }

    try {
      daemon = startWatchDaemon(
        {
          db: deps.db,
          xClient: deps.xReader,
          xWriter: deps.xWriter,
          claude: deps.claude,
          config: deps.config,
        },
        next,
      );
      options = next;
      startedAt = new Date().toISOString();
      stoppedAt = null;
      lastError = null;
      return { ok: true, status: status() };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      daemon = null;
      return { ok: false, status: status(), error: lastError };
    }
  };

  const stop = () => {
    if (!daemon) return { ok: false, status: status(), error: 'Daemon is not running' };
    try {
      daemon.stop();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Still clear daemon so UI can attempt a restart.
    } finally {
      daemon = null;
      stoppedAt = new Date().toISOString();
    }
    return { ok: true, status: status() };
  };

  return { status, start, stop };
}

