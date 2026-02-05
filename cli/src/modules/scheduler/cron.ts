import cron from 'node-cron';
import { getLogger } from '../../utils/logger.js';

const log = getLogger();

export interface ScheduledTask {
  name: string;
  task: cron.ScheduledTask;
  expression: string;
}

const activeTasks: ScheduledTask[] = [];

/**
 * Schedule a recurring task with node-cron.
 */
export function schedule(name: string, expression: string, fn: () => Promise<void>): ScheduledTask {
  const task = cron.schedule(expression, async () => {
    log.debug({ name }, 'Cron task starting');
    try {
      await fn();
    } catch (err) {
      log.error({ name, err }, 'Cron task failed');
    }
  });

  const scheduled = { name, task, expression };
  activeTasks.push(scheduled);
  log.info({ name, expression }, 'Cron task scheduled');
  return scheduled;
}

/**
 * Stop all scheduled tasks.
 */
export function stopAll(): void {
  for (const t of activeTasks) {
    t.task.stop();
    log.info({ name: t.name }, 'Cron task stopped');
  }
  activeTasks.length = 0;
}

/**
 * List active cron tasks.
 */
export function listTasks(): ScheduledTask[] {
  return [...activeTasks];
}
