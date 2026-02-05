import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { ClaudeClient } from '../modules/claude/client.js';
import { XReadClient } from '../modules/x-api/client.js';
import { BrowserPoster } from '../modules/x-api/browser-poster.js';
import { cleanContent } from '../utils/format.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { runHotPotDetector } from '../modules/safety/hot-pot-detector.js';

export function registerEngageCommand(program: Command): void {
  const engage = program.command('engage').description('Engagement tools (quote-tweet, reply)');

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
        const tweets = await xClient.searchTweets(query, 5);
        for (const tweet of tweets) {
          opportunities.push({
            text: tweet.text,
            author: tweet.author_id ?? 'unknown',
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
      const tweets = await xClient.searchTweets(`id:${tweetId}`, 1);
      const original = tweets[0];

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
        const tweetUrl = `https://x.com/i/status/${tweetId}`;
        const poster = new BrowserPoster(config);
        try {
          const result = await poster.quoteTweet(content, tweetUrl);
          if (result.success) {
            posts.create({
              content,
              prompt_type: 'quote-dunk',
              safety_score: safety.score,
              safety_verdict: safety.verdict,
              status: 'posted',
              parent_tweet_id: tweetId,
            });
            console.log(chalk.green('Quote-tweeted via browser!'));
          }
        } finally {
          await poster.close();
        }
      } else {
        console.log(chalk.yellow('[DRY RUN]'));
      }
    });
}
