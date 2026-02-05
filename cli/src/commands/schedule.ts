import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { createQueue } from '../modules/scheduler/queue.js';

export function registerScheduleCommand(program: Command): void {
  const sched = program.command('schedule').description('Manage the post queue');

  sched
    .command('list')
    .description('View the current post queue')
    .action(async () => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const queue = createQueue(db);

      const queued = queue.peek(20);
      if (queued.length === 0) {
        console.log(chalk.dim('Queue is empty'));
        return;
      }

      console.log(chalk.bold(`\n📋 Post Queue (${queue.size()} total):\n`));
      for (const post of queued) {
        console.log(
          chalk.cyan(`#${post.id}`) +
          ` [${post.prompt_type}] ${post.content.slice(0, 100)}${post.content.length > 100 ? '...' : ''}`
        );
      }
    });

  sched
    .command('add')
    .description('Add a draft to the queue')
    .argument('<id>', 'Post ID to queue')
    .action(async (id: string) => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const queue = createQueue(db);

      queue.enqueue(parseInt(id, 10));
      console.log(chalk.green(`Post #${id} added to queue`));
    });

  sched
    .command('remove')
    .description('Remove a post from the queue')
    .argument('<id>', 'Post ID to dequeue')
    .action(async (id: string) => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);

      posts.updateStatus(parseInt(id, 10), 'draft');
      console.log(chalk.yellow(`Post #${id} removed from queue (back to draft)`));
    });

  sched
    .command('clear')
    .description('Clear the entire queue')
    .action(async () => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const queue = createQueue(db);

      const count = queue.clear();
      console.log(chalk.yellow(`Cleared ${count} posts from queue`));
    });

  sched
    .command('next')
    .description('Show the next post that would be published')
    .action(async () => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const queue = createQueue(db);

      const next = queue.dequeue();
      if (!next) {
        console.log(chalk.dim('Queue is empty'));
        return;
      }

      console.log(chalk.bold('Next up:'));
      console.log(`  #${next.id} [${next.prompt_type}]`);
      console.log(`  ${next.content}`);
      console.log(chalk.dim(`  Safety: ${next.safety_verdict} (${next.safety_score})`));
    });
}
