import cron from 'node-cron';
import Tournament from '../models/Tournament';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import PushToken from '../models/PushToken';
import { buildLeaderboard } from '../services/leaderboardService';
import {
  processPeriodPayouts,
  retryFailedPayouts,
  sendWeeklyAddressWarnings,
} from '../services/payoutService';
import {
  sendLeaderboardReminder,
  sendNewChallengesNotification,
} from '../services/notificationService';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Wraps a cron task with error handling and overlap protection.
 * If a job is already running it skips the new invocation instead of stacking.
 */
function job(label: string, fn: () => Promise<void>): () => void {
  let running = false;
  return async () => {
    if (running) {
      console.warn(
        `⚠️  [${label}] Still running from previous tick — skipping`,
      );
      return;
    }
    running = true;
    console.log(`⏳ [${label}] Starting...`);
    try {
      await fn();
      console.log(`✅ [${label}] Done`);
    } catch (err) {
      console.error(`❌ [${label}] Failed:`, err);
      // TODO: plug in Sentry or your error tracker here
      // Sentry.captureException(err, { tags: { cron: label } });
    } finally {
      running = false;
    }
  };
}

// ─── Cron registration ───────────────────────────────────────────────────────

export function startLeaderboardCron() {
  const TIMEZONE = 'UTC';

  // Weekly leaderboard + payout — every Monday 00:05
  cron.schedule(
    '5 0 * * 1',
    job('Weekly leaderboard + payout', async () => {
      await buildLeaderboard('weekly');
      await processPeriodPayouts('weekly');
    }),
    { timezone: TIMEZONE },
  );

  // Monthly leaderboard + payout — 1st of month 00:10
  cron.schedule(
    '10 0 1 * *',
    job('Monthly leaderboard + payout', async () => {
      await buildLeaderboard('monthly');
      await processPeriodPayouts('monthly');
    }),
    { timezone: TIMEZONE },
  );

  // All-time leaderboard — daily at 02:00
  cron.schedule(
    '0 2 * * *',
    job('All-time leaderboard', async () => {
      await buildLeaderboard('all');
    }),
    { timezone: TIMEZONE },
  );

  // Retry failed payouts — every 6 hours
  cron.schedule(
    '0 */6 * * *',
    job('Retry failed payouts', async () => {
      await retryFailedPayouts();
    }),
    { timezone: TIMEZONE },
  );

  // Wednesday mid-week address warning — 10:00
  cron.schedule(
    '0 10 * * 3',
    job('Weekly address warnings', async () => {
      await sendWeeklyAddressWarnings();
    }),
    { timezone: TIMEZONE },
  );

  // Sunday evening leaderboard reminder — 18:00
  cron.schedule(
    '0 18 * * 0',
    job('Leaderboard reset reminders', async () => {
      const snapshot = await LeaderboardSnapshot.findOne({
        type: 'weekly',
      }).lean();
      if (!snapshot) {
        console.warn('⚠️  No weekly snapshot found — skipping reminders');
        return;
      }

      const top100 = snapshot.data.slice(0, 100);

      // Fire all notifications concurrently; individual failures don't abort the batch
      await Promise.allSettled(
        top100
          .filter(
            (entry): entry is typeof entry & { userId: string; rank: number } =>
              typeof entry.userId === 'string' &&
              typeof entry.rank === 'number',
          )
          .map((entry) => sendLeaderboardReminder(entry.userId, entry.rank)),
      );
    }),
    { timezone: TIMEZONE },
  );

  // Daily challenges notification — 08:00
  cron.schedule(
    '0 8 * * *',
    job('Daily challenge notifications', async () => {
      const tokens = await PushToken.find({}).select('userId').lean();
      const userIds = tokens.map((t: { userId: any }) => t.userId.toString());
      await sendNewChallengesNotification(userIds);
    }),
    { timezone: TIMEZONE },
  );

  // Tournament status updater — every 5 minutes
  cron.schedule(
    '*/5 * * * *',
    job('Tournament status updater', async () => {
      const now = new Date();
      await Tournament.updateMany(
        { status: 'upcoming', startsAt: { $lte: now } },
        { $set: { status: 'active' } },
      );
      await Tournament.updateMany(
        { status: 'active', endsAt: { $lte: now } },
        { $set: { status: 'finished' } },
      );
    }),
    { timezone: TIMEZONE },
  );
}
