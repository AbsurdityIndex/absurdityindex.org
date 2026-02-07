import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { ClaudeClient } from '../modules/claude/client.js';
import { XReadClient, XWriteClient } from '../modules/x-api/client.js';
import { cleanContent } from '../utils/format.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { createOpportunityModel } from '../modules/state/models/opportunities.js';
import { runHotPotDetector } from '../modules/safety/hot-pot-detector.js';
import { startWatchDaemon } from '../modules/engage/watch-daemon.js';
import { startDashboardServer } from '../modules/dashboard/server.js';

export function registerEngageCommand(program: Command): void {
  const engage = program.command('engage').description('Engagement tools (quote-tweet, reply, watch)');

  engage
    .command('scan')
    .description('Scan for engagement opportunities')
    .option('--dry-run', 'Don\'t post, just show opportunities')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);
      const xClient = new XReadClient(config);

      const spinner = ora('Scanning congressional tweets...').start();

      // Search for recent congressional tweets
      const queries = [
        'from:HouseFloor OR from:SenateFloor',
        '"passed the House" OR "passed the Senate"',
        '"introduced a bill" OR "floor vote"',
      ];

      const opportunities: Array<{ text: string; author: string; id: string }> = [];

      for (const query of queries) {
        const { tweets, authors } = await xClient.searchTweetsExpanded(query, 10);
        for (const tweet of tweets) {
          // Skip retweets — engaging with them is confusing and off-target
          if (tweet.text.startsWith('RT @')) continue;
          opportunities.push({
            text: tweet.text,
            author: authors.get(tweet.author_id ?? '') ?? tweet.author_id ?? 'unknown',
            id: tweet.id,
          });
        }
      }

      spinner.succeed(`Found ${opportunities.length} engagement opportunities`);

      for (const opp of opportunities.slice(0, 10)) {
        console.log(chalk.cyan('\n' + '─'.repeat(50)));
        console.log(chalk.bold(`@${opp.author}:`));
        console.log(opp.text);
        console.log(chalk.dim(`Tweet ID: ${opp.id}`));
      }
    });

  engage
    .command('quote')
    .description('Quote-tweet a specific tweet')
    .argument('<tweet-id>', 'Tweet ID to quote')
    .option('--dry-run', 'Generate but don\'t post')
    .action(async (tweetId: string, opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);

      const xClient = new XReadClient(config);
      const claude = new ClaudeClient(config);

      const spinner = ora('Generating quote-tweet...').start();

      // Fetch original tweet
      const original = await xClient.singleTweet(tweetId);

      if (!original) {
        spinner.fail('Could not fetch original tweet');
        return;
      }

      const result = await claude.generate('quote-dunk', {
        quoteTweetText: original.text,
        quoteTweetAuthor: original.author_id ?? 'Congressional account',
      });

      const content = cleanContent(result.content);

      if (content === 'SKIP') {
        spinner.warn('Claude says SKIP — this tweet shouldn\'t be dunked on');
        return;
      }

      spinner.succeed('Quote-tweet generated');

      // Safety check
      const safety = await runHotPotDetector({ content, claude, config });
      if (safety.verdict === 'REJECT') {
        console.log(chalk.red(`Safety REJECTED: ${safety.reasons.join(', ')}`));
        return;
      }

      console.log(chalk.cyan('\n' + '─'.repeat(50)));
      console.log(chalk.dim('Original:'), original.text.slice(0, 100));
      console.log(chalk.bold('Quote:'), content);
      console.log(chalk.cyan('─'.repeat(50)));

      if (!config.dryRun) {
        const db = getDb(config.dbPath);
        const posts = createPostModel(db);
        const xWriter = new XWriteClient(config);
        const result = await xWriter.quote(content, tweetId);
        if (result.success) {
          posts.create({
            content,
            prompt_type: 'quote-dunk',
            safety_score: safety.score,
            safety_verdict: safety.verdict,
            status: 'posted',
            parent_tweet_id: tweetId,
          });
          console.log(chalk.green(`Quote-tweeted via API! ${result.tweetUrl}`));
        } else {
          console.log(chalk.red('Failed to post quote tweet'));
        }
      } else {
        console.log(chalk.yellow('[DRY RUN]'));
      }
    });

  engage
    .command('watch')
    .description('Continuous engagement scanner daemon')
    .option('--interval <min>', 'Scan interval in minutes', '10')
    .option('--max-engagements-per-day <n>', 'Daily engagement cap', '6')
    .option('--min-opportunity-score <n>', 'Auto-engage threshold', '70')
    .option('--track-threshold <n>', 'Track threshold', '30')
    .option('--dry-run', 'Scan/evaluate but never post')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);

      const interval = parseFloat(opts.interval) || config.engageScanIntervalMinutes;
      const maxEngagementsPerDay = parseInt(opts.maxEngagementsPerDay, 10) || config.maxEngagementsPerDay;
      const minOpportunityScore = parseInt(opts.minOpportunityScore, 10) || config.engageMinScore;
      const trackThreshold = parseInt(opts.trackThreshold, 10) || config.engageTrackThreshold;

      const db = getDb(config.dbPath);
      const xClient = new XReadClient(config);
      const xWriter = new XWriteClient(config);
      const claude = new ClaudeClient(config);

      console.log(chalk.bold('\n  Absurdity Index Engagement Scanner'));
      console.log(chalk.dim('  ─'.repeat(25)));
      console.log(`  Interval:      ${chalk.cyan(`${interval} min`)}`);
      console.log(`  Max/day:       ${chalk.cyan(String(maxEngagementsPerDay))}`);
      console.log(`  Engage score:  ${chalk.green(`>= ${minOpportunityScore}`)}`);
      console.log(`  Track score:   ${chalk.yellow(`>= ${trackThreshold}`)}`);
      console.log(`  Mode:          ${opts.dryRun ? chalk.yellow('DRY RUN') : chalk.green('LIVE')}`);
      console.log(chalk.dim('  ─'.repeat(25)));
      console.log(chalk.dim('  Press Ctrl+C to stop\n'));

      const daemon = startWatchDaemon(
        { db, xClient, xWriter, claude, config },
        {
          interval,
          maxEngagementsPerDay,
          minOpportunityScore,
          trackThreshold,
          dryRun: opts.dryRun ?? false,
        },
      );

      // Clean shutdown on Ctrl+C
      process.on('SIGINT', () => {
        console.log(chalk.dim('\n  Shutting down...'));
        daemon.stop();
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    });

  engage
    .command('status')
    .description('Show tracked opportunities and engagement stats')
    .action(async () => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const opportunities = createOpportunityModel(db);
      const posts = createPostModel(db);

      const stats = opportunities.getStats();
      const tracked = opportunities.getTracked(10);
      const recentEngaged = opportunities.getRecentEngaged(5);
      const postsToday = posts.countToday();

      console.log(chalk.bold('\n  Engagement Dashboard'));
      console.log(chalk.dim('  ─'.repeat(25)));

      // Stats overview
      console.log(`  Tracked:       ${chalk.yellow(String(stats.tracked))}`);
      console.log(`  Engaged today: ${chalk.green(String(stats.engaged_today))} / ${config.maxEngagementsPerDay}`);
      console.log(`  Posts today:   ${chalk.cyan(String(postsToday))} / ${config.maxPostsPerDay}`);
      console.log(`  Expired:       ${chalk.dim(String(stats.expired))}`);
      console.log(`  Skipped:       ${chalk.dim(String(stats.skipped))}`);

      // Top tracked opportunities
      if (tracked.length > 0) {
        console.log(chalk.bold('\n  Top Tracked Opportunities'));
        console.log(chalk.dim('  ─'.repeat(25)));

        for (const opp of tracked) {
          const scoreColor = opp.score >= 70 ? chalk.green : opp.score >= 40 ? chalk.yellow : chalk.dim;
          console.log(
            `  ${scoreColor(`[${opp.score}]`)} ` +
            `${chalk.cyan(`@${opp.author_username ?? opp.author_id}`)} ` +
            `${chalk.dim(`(${opp.recommended_action})`)}`
          );
          console.log(`    ${opp.text.slice(0, 100)}${opp.text.length > 100 ? '...' : ''}`);
          console.log(
            chalk.dim(`    ❤ ${opp.likes}  🔁 ${opp.retweets}  💬 ${opp.replies}`) +
            (opp.matched_bill_slug ? chalk.magenta(`  📋 ${opp.matched_bill_slug}`) : '')
          );
        }
      }

      // Recent engagements
      if (recentEngaged.length > 0) {
        console.log(chalk.bold('\n  Recent Engagements'));
        console.log(chalk.dim('  ─'.repeat(25)));

        for (const opp of recentEngaged) {
          console.log(
            `  ${chalk.green('[engaged]')} ` +
            `${chalk.cyan(`@${opp.author_username ?? opp.author_id}`)} ` +
            `${chalk.dim(`(score: ${opp.score})`)}`
          );
          console.log(`    ${opp.text.slice(0, 80)}...`);
        }
      }

      console.log('');
    });

  engage
    .command('dashboard')
    .description('Local engagement monitoring dashboard')
    .option('--port <port>', 'HTTP port', '3847')
    .action(async (opts) => {
      const config = loadConfig();
      createLogger(config.logLevel);

      const port = parseInt(opts.port, 10) || 3847;

      // Open DB read-only — dashboard never writes
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(config.dbPath, { readonly: true });
      db.pragma('journal_mode = WAL');

      const { stop } = startDashboardServer({ port, db });

      console.log(chalk.bold('\n  Absurdity Index Engagement Dashboard'));
      console.log(chalk.dim('  ─'.repeat(25)));
      console.log(`  URL: ${chalk.cyan(`http://127.0.0.1:${port}`)}`);
      console.log(chalk.dim('  Press Ctrl+C to stop\n'));

      process.on('SIGINT', () => {
        console.log(chalk.dim('\n  Shutting down dashboard...'));
        stop();
        db.close();
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    });
}
