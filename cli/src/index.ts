import { Command } from 'commander';
import { registerPostCommand } from './commands/post.js';
import { registerDraftCommand } from './commands/draft.js';
import { registerTestSafetyCommand } from './commands/test-safety.js';
import { registerEngageCommand } from './commands/engage.js';
import { registerReviewCommand } from './commands/review.js';
import { registerMonitorCommand } from './commands/monitor.js';
import { registerAutoCommand } from './commands/auto.js';
import { registerAnalyticsCommand } from './commands/analytics.js';
import { registerScheduleCommand } from './commands/schedule.js';
import { registerLoginCommand } from './commands/login.js';

const program = new Command();

program
  .name('not-congress')
  .description('Auto-post satirical congressional content to X')
  .version('0.1.0');

// Register all commands
registerPostCommand(program);
registerDraftCommand(program);
registerTestSafetyCommand(program);
registerEngageCommand(program);
registerReviewCommand(program);
registerMonitorCommand(program);
registerAutoCommand(program);
registerAnalyticsCommand(program);
registerScheduleCommand(program);
registerLoginCommand(program);

export function run(): void {
  program.parse();
}

// Direct execution (when run via tsx, not via bin entry point)
const isBinEntry = process.argv[1]?.endsWith('not-congress.mjs');
if (!isBinEntry) {
  run();
}
