import type Database from 'better-sqlite3';
import { createCooldownModel } from '../state/models/cooldowns.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger();

/**
 * Topic cooldown manager - prevents posting about the same topic too frequently.
 */
export function createCooldownManager(db: Database.Database) {
  const model = createCooldownModel(db);

  return {
    /**
     * Check if a topic is on cooldown.
     */
    canPost(topic: string, cooldownHours = 24): boolean {
      const onCooldown = model.isOnCooldown(topic, cooldownHours);
      if (onCooldown) {
        log.debug({ topic }, 'Topic on cooldown');
      }
      return !onCooldown;
    },

    /**
     * Record that we posted about a topic.
     */
    recordPost(topic: string): void {
      model.record(topic);
    },

    /**
     * Get how many times we've posted about a topic.
     */
    getUseCount(topic: string): number {
      return model.getUseCount(topic);
    },

    /**
     * Clean up old cooldowns.
     */
    cleanup(): number {
      return model.clearExpired();
    },
  };
}
