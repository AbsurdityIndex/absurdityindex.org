import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { createAnalyticsModel } from '../modules/state/models/analytics.js';
import { createSafetyLogModel } from '../modules/state/models/safety-log.js';
import { XReadClient } from '../modules/x-api/client.js';

export function registerAnalyticsCommand(program: Command): void {
  const analytics = program.command('analytics').description('View post performance');

  analytics
    .command('summary')
    .description('View overall performance summary')
    .action(async () => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const analyticsModel = createAnalyticsModel(db);
      const posts = createPostModel(db);
      const safetyLog = createSafetyLogModel(db);

      console.log(chalk.bold('\nAbsurdity Index Analytics\n'));

      // Summary stats
      const summary = analyticsModel.getSummary();
      console.log(chalk.bold('Overview:'));
      console.log(`  Total posts: ${chalk.cyan(summary.totalPosts)}`);
      console.log(`  Total likes: ${chalk.cyan(summary.totalLikes)}`);
      console.log(`  Total retweets: ${chalk.cyan(summary.totalRetweets)}`);
      console.log(`  Total replies: ${chalk.cyan(summary.totalReplies)}`);
      console.log(`  Total quotes: ${chalk.cyan(summary.totalQuotes)}`);
      console.log(`  Avg engagement: ${chalk.cyan(summary.avgEngagement.toFixed(1))}`);

      // Safety stats
      const safetyStats = safetyLog.getRejectRate();
      console.log(chalk.bold('\nSafety:'));
      console.log(`  Total checks: ${chalk.cyan(safetyStats.total)}`);
      console.log(`  Rejected: ${chalk.red(safetyStats.rejected)}`);
      console.log(`  Reject rate: ${chalk.yellow((safetyStats.rate * 100).toFixed(1) + '%')}`);

      // Top posts
      const topPosts = analyticsModel.getTopPosts(5);
      if (topPosts.length > 0) {
        console.log(chalk.bold('\nTop Posts:'));
        for (const post of topPosts) {
          console.log(`  L ${post.likes} RT ${post.retweets} R ${post.replies} Q ${post.quotes} - ${post.content.slice(0, 80)}...`);
        }
      }

      // Recent posts
      const recent = posts.getRecent(5);
      if (recent.length > 0) {
        console.log(chalk.bold('\nRecent Posts:'));
        for (const post of recent) {
          const statusTag = post.status === 'posted' ? 'POSTED' : post.status === 'rejected' ? 'REJECTED' : 'DRAFT';
          console.log(`  [${statusTag}] [${post.prompt_type}] ${post.content.slice(0, 80)}...`);
        }
      }
    });

  analytics
    .command('refresh')
    .description('Fetch latest metrics from X for posted tweets')
    .action(async () => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);
      const analyticsModel = createAnalyticsModel(db);
      const xClient = new XReadClient(config);

      const posted = posts.getByStatus('posted', 50);
      const spinner = ora(`Refreshing metrics for ${posted.length} posts...`).start();

      let updated = 0;
      for (const post of posted) {
        if (!post.tweet_id) continue;
        const metrics = await xClient.getTweetMetrics(post.tweet_id);
        if (metrics) {
          analyticsModel.record(post.id, metrics);
          updated++;
        }
      }

      spinner.succeed(`Updated metrics for ${updated} posts`);
    });
}
