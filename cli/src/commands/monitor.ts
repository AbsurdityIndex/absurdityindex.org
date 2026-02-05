import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger, getLogger } from '../utils/logger.js';
import { XReadClient } from '../modules/x-api/client.js';
import { fetchXTrends } from '../modules/trending/x-trends.js';
import { fetchCongressActions } from '../modules/trending/congress-watch.js';
import { fetchRssFeeds } from '../modules/trending/rss-feeds.js';
import { aggregateTrends } from '../modules/trending/aggregator.js';
import { getDb } from '../modules/state/db.js';
import { createTrendModel } from '../modules/state/models/trends.js';
import { schedule, stopAll } from '../modules/scheduler/cron.js';
import { scoreTrend } from '../modules/scoring/composite-scorer.js';

export function registerMonitorCommand(program: Command): void {
  const monitor = program.command('monitor').description('Trend monitoring');

  monitor
    .command('start')
    .description('Start trend monitoring daemon')
    .option('--interval <minutes>', 'Check interval in minutes', '15')
    .option('--dry-run', 'Monitor but don\'t save to database')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      const log = createLogger(config.logLevel);
      const db = opts.dryRun ? null : getDb(config.dbPath);
      const trends = db ? createTrendModel(db) : null;

      console.log(chalk.bold('🔍 Trend Monitor Started'));
      console.log(chalk.dim(`Checking every ${opts.interval} minutes. Press Ctrl+C to stop.\n`));

      const runScan = async () => {
        const spinner = ora('Scanning trends...').start();

        try {
          const xClient = new XReadClient(config);

          // Fetch from all sources
          const [xTrends, congressTrends, rssTrends] = await Promise.all([
            fetchXTrends(xClient),
            fetchCongressActions(config),
            fetchRssFeeds(config.dataDir),
          ]);

          // Aggregate and deduplicate
          const aggregated = aggregateTrends(xTrends, congressTrends, rssTrends);

          // Score and save
          const scored = aggregated.map(t => ({
            ...t,
            score: scoreTrend(t, config),
          }));

          const topTrends = scored.sort((a, b) => b.score - a.score).slice(0, 20);

          spinner.succeed(`Found ${aggregated.length} trends (${topTrends.length} relevant)`);

          // Display top trends
          for (const t of topTrends.slice(0, 10)) {
            const sourceIcons = t.sources.map(s =>
              s === 'x-trends' ? '𝕏' : s === 'congress-watch' ? '🏛️' : '📰'
            ).join('');
            console.log(`  ${chalk.cyan(t.score.toString().padStart(3))} ${sourceIcons} ${t.topic}`);
          }

          // Save to database
          if (trends) {
            for (const t of topTrends) {
              trends.upsert(t.topic, t.sources.join(','), t.totalVolume, t.score);
            }
          }
        } catch (err) {
          spinner.fail('Scan failed');
          log.error({ err }, 'Monitor scan failed');
        }
      };

      // Run immediately
      await runScan();

      // Schedule recurring
      const cronExpr = `*/${opts.interval} * * * *`;
      schedule('trend-monitor', cronExpr, runScan);

      // Keep alive
      process.on('SIGINT', () => {
        console.log(chalk.dim('\nStopping monitor...'));
        stopAll();
        process.exit(0);
      });

      // Block (the cron scheduler runs in the background)
      await new Promise(() => {}); // Never resolves
    });

  monitor
    .command('once')
    .description('Run a single trend scan')
    .option('--dry-run', 'Don\'t save results')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);
      const xClient = new XReadClient(config);
      const spinner = ora('Scanning trends...').start();

      const [xTrends, congressTrends, rssTrends] = await Promise.all([
        fetchXTrends(xClient),
        fetchCongressActions(config),
        fetchRssFeeds(config.dataDir),
      ]);

      const aggregated = aggregateTrends(xTrends, congressTrends, rssTrends);
      spinner.succeed(`Found ${aggregated.length} trends`);

      for (const t of aggregated.slice(0, 20)) {
        const score = scoreTrend(t, config);
        console.log(`  ${chalk.cyan(score.toString().padStart(3))} [${t.sources.join(',')}] ${t.topic}`);
      }
    });
}
