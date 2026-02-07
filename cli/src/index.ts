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
import { registerStatusCommand } from './commands/status.js';
import { registerDiscoverCommand } from './commands/discover.js';
import { registerMemeCommand } from './commands/meme.js';

const program = new Command();

program
  .name('absurdity-index')
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
registerStatusCommand(program);
registerDiscoverCommand(program);
registerMemeCommand(program);

export function run(): void {
  program.parse();
}

// Direct execution (when run via tsx, not via bin entry point)
const isBinEntry = process.argv[1]?.endsWith('absurdity-index.mjs');
if (!isBinEntry) {
  run();
}
