import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel, type PostStatus } from '../modules/state/models/posts.js';
import { BrowserPoster } from '../modules/x-api/browser-poster.js';

export function registerReviewCommand(program: Command): void {
  const review = program.command('review').description('Review and manage pending posts');

  review
    .command('list')
    .description('List posts pending review')
    .option('--status <status>', 'Filter by status (draft, review, queued, rejected)', 'review')
    .option('--limit <n>', 'Number of posts to show', '20')
    .action(async (opts) => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);

      const items = posts.getByStatus(opts.status as PostStatus, parseInt(opts.limit, 10));

      if (items.length === 0) {
        console.log(chalk.dim(`No posts with status "${opts.status}"`));
        return;
      }

      console.log(chalk.bold(`\n${items.length} posts (status: ${opts.status}):\n`));

      for (const post of items) {
        const safetyColor = post.safety_verdict === 'SAFE' ? chalk.green
          : post.safety_verdict === 'REVIEW' ? chalk.yellow
          : chalk.red;

        console.log(chalk.cyan(`#${post.id}`) + ` [${safetyColor(post.safety_verdict)} ${post.safety_score}] ${chalk.dim(post.prompt_type)}`);
        console.log(`  ${post.content.slice(0, 120)}${post.content.length > 120 ? '...' : ''}`);
        if (post.bill_slug) console.log(chalk.dim(`  Bill: ${post.bill_slug}`));
        if (post.trend_topic) console.log(chalk.dim(`  Trend: ${post.trend_topic}`));
        console.log(chalk.dim(`  Created: ${post.created_at}`));
        console.log();
      }
    });

  review
    .command('approve')
    .description('Approve a post for publishing')
    .argument('<id>', 'Post ID to approve')
    .option('--post-now', 'Post immediately instead of queuing')
    .option('--dry-run', 'Simulate')
    .action(async (id: string, opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);

      const post = posts.getById(parseInt(id, 10));
      if (!post) {
        console.log(chalk.red(`Post #${id} not found`));
        return;
      }

      if (opts.postNow && !config.dryRun) {
        const poster = new BrowserPoster(config);
        try {
          const result = await poster.postTweet(post.content);
          if (result.success) {
            posts.markPosted(post.id, 'browser');
            console.log(chalk.green('Posted via browser!'));
          }
        } finally {
          await poster.close();
        }
      } else {
        posts.updateStatus(post.id, 'queued');
        console.log(chalk.green(`Post #${id} approved and queued`));
      }
    });

  review
    .command('reject')
    .description('Reject a post')
    .argument('<id>', 'Post ID to reject')
    .action(async (id: string) => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);

      posts.updateStatus(parseInt(id, 10), 'rejected');
      console.log(chalk.yellow(`Post #${id} rejected`));
    });
}
