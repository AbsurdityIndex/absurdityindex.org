import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { createAnalyticsModel } from '../modules/state/models/analytics.js';
import { createSafetyLogModel } from '../modules/state/models/safety-log.js';
import { createOpportunityModel } from '../modules/state/models/opportunities.js';
import { createQueue } from '../modules/scheduler/queue.js';
import { loadBills } from '../modules/bills/loader.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Full state snapshot — posts, queue, safety, engagement, bills')
    .option('--json', 'Output as JSON (for machine consumption)')
    .action(async (opts) => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);
      const analyticsModel = createAnalyticsModel(db);
      const safetyLog = createSafetyLogModel(db);
      const opportunities = createOpportunityModel(db);
      const queue = createQueue(db);
      const bills = loadBills(config.billsDir);

      const now = new Date();
      const hour = now.getHours();
      const isPeakHours = hour >= config.peakHoursStart && hour <= config.peakHoursEnd;

      // Gather all state
      const postsToday = posts.countToday();
      const queueSize = queue.size();
      const reviewPosts = posts.getByStatus('review');
      const draftPosts = posts.getByStatus('draft');
      const recentPosts = posts.getRecent(10);
      const recentPosted = recentPosts.filter(p => p.status === 'posted');
      const recentRejected = recentPosts.filter(p => p.status === 'rejected');
      const summary = analyticsModel.getSummary();
      const topPosts = analyticsModel.getTopPosts(3);
      const safetyStats = safetyLog.getRejectRate(7);
      const oppStats = opportunities.getStats();
      const trackedOpps = opportunities.getTracked(5);

      // Prompt type distribution (last 20 posts)
      const promptTypeCounts: Record<string, number> = {};
      for (const p of recentPosts) {
        promptTypeCounts[p.prompt_type] = (promptTypeCounts[p.prompt_type] ?? 0) + 1;
      }

      // Bill coverage (which bills have been posted about recently)
      const recentBillSlugs = new Set(
        recentPosts.filter(p => p.bill_slug).map(p => p.bill_slug)
      );

      // Bills available (not on cooldown — approximation: not posted recently)
      const availableBills = bills.filter(b => !recentBillSlugs.has(b.slug));
      const highAbsurdityAvailable = availableBills.filter(b => (b.absurdityIndex ?? 0) >= 6);

      if (opts.json) {
        const data = {
          timestamp: now.toISOString(),
          isPeakHours,
          currentHour: hour,
          posts: {
            today: postsToday,
            dailyCap: config.maxPostsPerDay,
            remaining: Math.max(0, config.maxPostsPerDay - postsToday),
            queueSize,
            reviewPending: reviewPosts.length,
            drafts: draftPosts.length,
          },
          recent: recentPosts.map(p => ({
            id: p.id,
            status: p.status,
            promptType: p.prompt_type,
            billSlug: p.bill_slug,
            trendTopic: p.trend_topic,
            safetyVerdict: p.safety_verdict,
            safetyScore: p.safety_score,
            contentPreview: p.content.slice(0, 140),
            createdAt: p.created_at,
          })),
          analytics: {
            totalPosts: summary.totalPosts,
            totalLikes: summary.totalLikes,
            totalRetweets: summary.totalRetweets,
            totalReplies: summary.totalReplies,
            avgEngagement: summary.avgEngagement,
            topPosts: topPosts.map(p => ({
              id: p.id,
              promptType: p.prompt_type,
              likes: p.likes,
              retweets: p.retweets,
              replies: p.replies,
              contentPreview: p.content.slice(0, 140),
            })),
          },
          safety: {
            checksLast7Days: safetyStats.total,
            rejected: safetyStats.rejected,
            rejectRate: safetyStats.rate,
          },
          engagement: {
            tracked: oppStats.tracked,
            engagedToday: oppStats.engaged_today,
            maxPerDay: config.maxEngagementsPerDay,
            topOpportunities: trackedOpps.map(o => ({
              author: o.author_username ?? o.author_id,
              score: o.score,
              action: o.recommended_action,
              matchedBill: o.matched_bill_slug,
              textPreview: o.text.slice(0, 100),
            })),
          },
          promptTypeDistribution: promptTypeCounts,
          bills: {
            total: bills.length,
            available: availableBills.length,
            highAbsurdityAvailable: highAbsurdityAvailable.length,
            recentlyUsed: [...recentBillSlugs],
          },
        };
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      // Human-readable output
      console.log(chalk.bold('\n  Absurdity Index — Full Status'));
      console.log(chalk.dim('  ═'.repeat(25)));

      // Time & capacity
      console.log(chalk.bold('\n  Capacity'));
      console.log(`  Time:          ${chalk.cyan(`${hour}:00`)} ${isPeakHours ? chalk.green('(peak hours)') : chalk.dim('(off-peak)')}`);
      console.log(`  Posts today:   ${chalk.cyan(String(postsToday))} / ${config.maxPostsPerDay} ${postsToday >= config.maxPostsPerDay ? chalk.red('(CAPPED)') : chalk.green(`(${config.maxPostsPerDay - postsToday} remaining)`)}`);
      console.log(`  Queue:         ${chalk.yellow(String(queueSize))} queued`);
      console.log(`  Review:        ${chalk.yellow(String(reviewPosts.length))} pending review`);
      console.log(`  Drafts:        ${chalk.dim(String(draftPosts.length))} drafts`);

      // Recent activity
      if (recentPosted.length > 0) {
        console.log(chalk.bold('\n  Recent Posts'));
        for (const p of recentPosted.slice(0, 5)) {
          console.log(`  ${chalk.green('posted')} [${chalk.dim(p.prompt_type)}] ${p.content.slice(0, 80)}...`);
          if (p.bill_slug) console.log(chalk.dim(`         bill: ${p.bill_slug}`));
          if (p.trend_topic) console.log(chalk.dim(`         trend: ${p.trend_topic}`));
        }
      }

      if (recentRejected.length > 0) {
        console.log(chalk.bold('\n  Recent Rejections'));
        for (const p of recentRejected.slice(0, 3)) {
          console.log(`  ${chalk.red('rejected')} [${p.prompt_type}] score:${p.safety_score} — ${p.content.slice(0, 60)}...`);
        }
      }

      // Analytics
      if (summary.totalPosts > 0) {
        console.log(chalk.bold('\n  Analytics'));
        console.log(`  Total posted:  ${chalk.cyan(String(summary.totalPosts))}`);
        console.log(`  Likes:         ${chalk.cyan(String(summary.totalLikes))}`);
        console.log(`  Retweets:      ${chalk.cyan(String(summary.totalRetweets))}`);
        console.log(`  Replies:       ${chalk.cyan(String(summary.totalReplies))}`);
        console.log(`  Avg engage:    ${chalk.cyan(summary.avgEngagement.toFixed(1))}`);

        if (topPosts.length > 0) {
          console.log(chalk.bold('\n  Top Performers'));
          for (const p of topPosts) {
            const eng = p.likes + p.retweets * 2 + p.replies * 3;
            console.log(`  ${chalk.green(String(eng).padStart(4))} [${p.prompt_type}] ${p.content.slice(0, 70)}...`);
          }
        }
      }

      // Safety
      console.log(chalk.bold('\n  Safety (7d)'));
      console.log(`  Checks:        ${chalk.cyan(String(safetyStats.total))}`);
      console.log(`  Rejected:      ${chalk.red(String(safetyStats.rejected))}`);
      console.log(`  Reject rate:   ${safetyStats.rate > 0.3 ? chalk.red : chalk.green}(${(safetyStats.rate * 100).toFixed(1)}%)`);

      // Prompt type mix
      if (Object.keys(promptTypeCounts).length > 0) {
        console.log(chalk.bold('\n  Prompt Type Mix (last 10)'));
        for (const [type, count] of Object.entries(promptTypeCounts).sort((a, b) => b[1] - a[1])) {
          console.log(`  ${chalk.dim(String(count).padStart(3))}x ${type}`);
        }
      }

      // Engagement
      console.log(chalk.bold('\n  Engagement'));
      console.log(`  Tracked opps:  ${chalk.yellow(String(oppStats.tracked))}`);
      console.log(`  Engaged today: ${chalk.green(String(oppStats.engaged_today))} / ${config.maxEngagementsPerDay}`);

      if (trackedOpps.length > 0) {
        console.log(chalk.bold('\n  Top Opportunities'));
        for (const o of trackedOpps.slice(0, 3)) {
          console.log(`  ${chalk.cyan(`[${o.score}]`)} @${o.author_username ?? o.author_id} — ${o.recommended_action}`);
          console.log(chalk.dim(`    ${o.text.slice(0, 80)}...`));
        }
      }

      // Bills
      console.log(chalk.bold('\n  Bills'));
      console.log(`  Total:         ${chalk.cyan(String(bills.length))}`);
      console.log(`  Available:     ${chalk.green(String(availableBills.length))} (not recently used)`);
      console.log(`  High absurd:   ${chalk.yellow(String(highAbsurdityAvailable.length))} (score >= 6, available)`);

      console.log('');
    });
}
