import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { ClaudeClient } from '../modules/claude/client.js';
import { XReadClient, XWriteClient } from '../modules/x-api/client.js';
import { fetchTweetContext, extractTweetId } from '../modules/x-api/tweet-context.js';
import { cleanContent, billUrl } from '../utils/format.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { createGenerationModel } from '../modules/state/models/generations.js';
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
    .argument('<tweet-id>', 'Tweet ID or URL to quote')
    .option('--dry-run', 'Generate but don\'t post')
    .action(async (tweetIdOrUrl: string, opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);

      const tweetId = extractTweetId(tweetIdOrUrl);
      const xClient = new XReadClient(config);
      const claude = new ClaudeClient(config);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);
      const generations = createGenerationModel(db);

      // [0] FETCH — Unpack full tweet tree
      const fetchSpinner = ora('Fetching tweet context...').start();
      const tweetContext = await fetchTweetContext(xClient, tweetId);

      if (!tweetContext) {
        fetchSpinner.fail('Could not fetch tweet');
        return;
      }

      fetchSpinner.succeed(`Tweet by @${tweetContext.tweet.author.username} (${tweetContext.type})`);
      if (tweetContext.quotedTweet) {
        console.log(chalk.dim(`  Quotes @${tweetContext.quotedTweet.author.username}: "${tweetContext.quotedTweet.text.slice(0, 80)}..."`));
      }
      if (tweetContext.repliedToTweet) {
        console.log(chalk.dim(`  Replies to @${tweetContext.repliedToTweet.author.username}: "${tweetContext.repliedToTweet.text.slice(0, 80)}..."`));
      }

      // [1] RESEARCH — Sonnet analyzes full context
      const researchSpinner = ora('Researching context (Sonnet)...').start();
      const research = await claude.research(tweetContext);

      generations.record({
        purpose: 'research',
        model: research.model,
        inputTokens: research.inputTokens,
        outputTokens: research.outputTokens,
      });

      if (!research.result.shouldEngage) {
        researchSpinner.warn(`Skip: ${research.result.skipReason ?? 'Not suitable for engagement'}`);
        return;
      }

      researchSpinner.succeed(`Research: ${research.result.verifiableFacts.length} verified facts, ${research.result.avoidClaims.length} avoid-claims`);
      console.log(chalk.dim(`  Angle: ${research.result.angle}`));

      // [2] GENERATE — Opus creates content with research grounding
      const genSpinner = ora('Generating quote-tweet (Opus)...').start();
      const genResult = await claude.generate('quote-dunk', {
        tweetContext,
        researchResult: research.result,
        quoteTweetText: tweetContext.tweet.text,
        quoteTweetAuthor: tweetContext.tweet.author.username,
      });
      const content = cleanContent(genResult.content);

      generations.record({
        purpose: 'content',
        model: genResult.model,
        inputTokens: genResult.inputTokens,
        outputTokens: genResult.outputTokens,
      });

      if (content === 'SKIP') {
        genSpinner.warn('Opus says SKIP — this tweet shouldn\'t be dunked on');
        return;
      }

      genSpinner.succeed('Content generated');

      // [3] FACT-CHECK — Sonnet validates generated content
      const fcSpinner = ora('Fact-checking (Sonnet)...').start();
      const factCheck = await claude.factCheck(content, tweetContext, research.result);

      generations.record({
        purpose: 'fact-check',
        model: factCheck.model,
        inputTokens: factCheck.inputTokens,
        outputTokens: factCheck.outputTokens,
      });

      let finalContent = content;
      if (factCheck.result.verdict === 'REJECT') {
        fcSpinner.fail(chalk.red('Fact-check REJECTED'));
        for (const issue of factCheck.result.issues) {
          console.log(chalk.red(`  [${issue.problem}] "${issue.claim}" — ${issue.suggestion}`));
        }
        return;
      }

      if (factCheck.result.verdict === 'FLAG') {
        fcSpinner.warn(`Fact-check flagged ${factCheck.result.issues.length} issue(s) — using cleaned version`);
        for (const issue of factCheck.result.issues) {
          console.log(chalk.yellow(`  [${issue.problem}] "${issue.claim}" — ${issue.suggestion}`));
        }
        if (factCheck.result.cleanedContent) {
          finalContent = factCheck.result.cleanedContent;
        }
      } else {
        fcSpinner.succeed('Fact-check passed');
      }

      // [4] SAFETY — Existing hot-pot detector
      const safety = await runHotPotDetector({ content: finalContent, claude, config });
      if (safety.verdict === 'REJECT') {
        console.log(chalk.red(`Safety REJECTED: ${safety.reasons.join(', ')}`));
        return;
      }

      // Display result
      console.log(chalk.cyan('\n' + '─'.repeat(50)));
      console.log(chalk.dim('Original:'), tweetContext.tweet.text.slice(0, 100));
      console.log(chalk.bold('Quote:'), finalContent);
      console.log(chalk.cyan('─'.repeat(50)));

      if (!config.dryRun) {
        const xWriter = new XWriteClient(config);
        const postResult = await xWriter.quote(finalContent, tweetId);
        if (postResult.success) {
          const post = posts.create({
            content: finalContent,
            prompt_type: 'quote-dunk',
            safety_score: safety.score,
            safety_verdict: safety.verdict,
            status: 'posted',
            parent_tweet_id: tweetId,
          });
          console.log(chalk.green(`Quote-tweeted via API! ${postResult.tweetUrl}`));

          // Post CTA reply with link (non-fatal)
          if (postResult.tweetId) {
            try {
              const replyText = `More at ${config.siteUrl}`;
              const replyResult = await xWriter.reply(replyText, postResult.tweetId);
              if (replyResult.success) {
                posts.updateReplyTweetId(post.id, replyResult.tweetId!);
                console.log(chalk.dim('  CTA reply posted'));
              }
            } catch {
              // Non-fatal — main quote tweet already posted
            }
          }
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
    .description('Interactive engagement dashboard with generate + post')
    .option('--port <port>', 'HTTP port', '3847')
    .option('--dry-run', 'Generate drafts but don\'t actually post')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);

      const port = parseInt(opts.port, 10) || 3847;
      const dryRun = opts.dryRun ?? false;

      // Write DB for posting engagements (only if not read-only mode)
      // We still allow DB writes in dry-run mode (draft recording, triage actions),
      // but we never post to X when dryRun=true.
      const writeDb = getDb(config.dbPath);

      // Read-only DB for queries (opened after migrations so new columns are visible)
      const Database = (await import('better-sqlite3')).default;
      const readDb = new Database(config.dbPath, { readonly: true });
      readDb.pragma('journal_mode = WAL');

      // Initialize API clients (gracefully degrade if keys missing)
      let xReader: XReadClient | undefined;
      let xWriter: XWriteClient | undefined;
      let claude: ClaudeClient | undefined;

      try { xReader = new XReadClient(config); } catch { /* no bearer token */ }
      try { xWriter = new XWriteClient(config); } catch { /* no OAuth keys */ }
      try { claude = new ClaudeClient(config); } catch { /* no Anthropic key */ }

      // Load bills for context matching
      const { loadBills } = await import('../modules/bills/loader.js');
      const bills = loadBills(config.billsDir);

      const { stop } = startDashboardServer({
        port,
        db: readDb,
        writeDb,
        xReader,
        xWriter,
        claude,
        config,
        bills,
        dryRun,
      });

      console.log(chalk.bold('\n  Absurdity Index Engagement Dashboard'));
      console.log(chalk.dim('  ─'.repeat(25)));
      console.log(`  URL:      ${chalk.cyan(`http://127.0.0.1:${port}`)}`);
      console.log(`  Mode:     ${dryRun ? chalk.yellow('DRY RUN') : chalk.green('LIVE')}`);
      console.log(`  Tweets:   ${xReader ? chalk.green('connected') : chalk.yellow('read-only (no bearer token)')}`);
      console.log(`  Generate: ${claude ? chalk.green('connected') : chalk.yellow('disabled (no API key)')}`);
      console.log(`  Post:     ${xWriter && !dryRun ? chalk.green('connected') : chalk.yellow('disabled')}`);
      console.log(`  Bills:    ${chalk.cyan(String(bills.length))} loaded`);
      console.log(chalk.dim('  Press Ctrl+C to stop\n'));

      process.on('SIGINT', () => {
        console.log(chalk.dim('\n  Shutting down dashboard...'));
        stop();
        readDb.close();
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    });
}
