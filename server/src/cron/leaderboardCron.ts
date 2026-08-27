import cron from 'node-cron';
import type { Server } from 'socket.io';

import Tournament from '../models/Tournament';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import PushToken from '../models/PushToken';
import ActiveQuizSession from '../models/ActiveQuizSession';
import { buildLeaderboard, rebuildLeaderboardSnapshots } from '../services/leaderboardService';
import {
  processPeriodPayouts,
  retryFailedPayouts,
  sendWeeklyAddressWarnings,
} from '../services/payoutService';
import { finaliseTournament } from '../services/tournamentService';
import { warnStreaksAtRisk } from '../services/streakService';
import { reconcileCoinLedger } from '../services/ledgerReconciliation';
import { sweepStaleMatches } from '../services/pvpService';
import {
  sendLeaderboardReminder,
  sendNewChallengesNotification,
} from '../services/notificationService';
import { previousPeriod } from '../utils/dateRanges';
import { withJobLock } from '../utils/jobLock';
import { logger } from '../utils/logger';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Wrap a cron task with in-process overlap protection, a cross-process lock and
 * error handling. The lock is what makes it safe to run more than one replica.
 */
function job(label: string, lockTtlMs: number, fn: () => Promise<void>): () => void {
  let running = false;
  return () => {
    void (async () => {
      if (running) {
        logger.warn('Cron still running from previous tick — skipping', { job: label });
        return;
      }
      running = true;
      const startedAt = Date.now();

      try {
        const ran = await withJobLock(`cron:${label}`, lockTtlMs, async () => {
          logger.info('Cron starting', { job: label });
          await fn();
          return true;
        });

        if (ran) {
          logger.info('Cron done', { job: label, durationMs: Date.now() - startedAt });
        }
      } catch (err) {
        logger.error('Cron failed', err, { job: label });
      } finally {
        running = false;
      }
    })();
  };
}

const MINUTE = 60_000;

// ─── Cron registration ───────────────────────────────────────────────────────

export function startLeaderboardCron(io?: Server) {
  const TIMEZONE = 'UTC';

  // Weekly leaderboard + payout — Monday 00:05 UTC, settling the week that
  // JUST ENDED. Passing the period explicitly is the whole fix: deriving it
  // from wall-clock here would describe the week that just started.
  cron.schedule(
    '5 0 * * 1',
    job('weekly-payout', 30 * MINUTE, async () => {
      const period = previousPeriod('weekly');
      await buildLeaderboard('weekly', period);
      await processPeriodPayouts('weekly', period);
      // Refresh the live snapshot so the app shows the new (empty) week.
      await buildLeaderboard('weekly');
    }),
    { timezone: TIMEZONE },
  );

  // Monthly leaderboard + payout — 1st of month 00:10 UTC, same rule.
  cron.schedule(
    '10 0 1 * *',
    job('monthly-payout', 30 * MINUTE, async () => {
      const period = previousPeriod('monthly');
      await buildLeaderboard('monthly', period);
      await processPeriodPayouts('monthly', period);
      await buildLeaderboard('monthly');
    }),
    { timezone: TIMEZONE },
  );

  // Live leaderboard refresh — every minute.
  //
  // This replaces the synchronous rebuild that used to run inside every quiz
  // finish request, where its cost grew with total sessions ever played.
  cron.schedule(
    '* * * * *',
    job('leaderboard-refresh', 2 * MINUTE, async () => {
      await rebuildLeaderboardSnapshots();
    }),
    { timezone: TIMEZONE },
  );

  // Retry failed payouts — every 6 hours.
  cron.schedule(
    '0 */6 * * *',
    job('payout-retry', 20 * MINUTE, async () => {
      await retryFailedPayouts();
    }),
    { timezone: TIMEZONE },
  );

  // Nightly ledger reconciliation — wallet balances vs. the transaction log.
  cron.schedule(
    '30 3 * * *',
    job('ledger-reconciliation', 30 * MINUTE, async () => {
      const report = await reconcileCoinLedger();
      if (report.drifted > 0) {
        logger.error('Coin ledger drift detected', undefined, {
          drifted: report.drifted,
          checked: report.checked,
          sample: report.samples.slice(0, 10),
        });
      }
    }),
    { timezone: TIMEZONE },
  );

  // Streak-at-risk nudges — hourly, so the warning lands at a sensible local
  // hour whatever timezone the player is in. The query window keeps it to one
  // nudge per player per day.
  cron.schedule(
    '15 * * * *',
    job('streak-warnings', 10 * MINUTE, async () => {
      await warnStreaksAtRisk();
    }),
    { timezone: TIMEZONE },
  );

  // Wednesday mid-week address warning — 10:00 UTC.
  cron.schedule(
    '0 10 * * 3',
    job('address-warnings', 10 * MINUTE, async () => {
      await sendWeeklyAddressWarnings();
    }),
    { timezone: TIMEZONE },
  );

  // Sunday evening leaderboard reminder — 18:00 UTC.
  cron.schedule(
    '0 18 * * 0',
    job('leaderboard-reminders', 15 * MINUTE, async () => {
      const snapshot = await LeaderboardSnapshot.findOne({ type: 'weekly' }).lean();
      if (!snapshot) {
        logger.warn('No weekly snapshot — skipping reminders');
        return;
      }

      const top100 = snapshot.data.slice(0, 100);
      await Promise.allSettled(
        top100
          .filter(
            (entry): entry is typeof entry & { userId: string; rank: number } =>
              typeof entry.userId === 'string' && typeof entry.rank === 'number',
          )
          .map((entry) => sendLeaderboardReminder(entry.userId, entry.rank)),
      );
    }),
    { timezone: TIMEZONE },
  );

  // Daily challenges notification — 08:00 UTC.
  cron.schedule(
    '0 8 * * *',
    job('challenge-notifications', 15 * MINUTE, async () => {
      const tokens = await PushToken.find({ active: { $ne: false } })
        .select('userId')
        .lean();
      const userIds = [...new Set(tokens.map((t: { userId: any }) => t.userId.toString()))];
      await sendNewChallengesNotification(userIds);
    }),
    { timezone: TIMEZONE },
  );

  // Tournament lifecycle — every 5 minutes.
  cron.schedule(
    '*/5 * * * *',
    job('tournament-status', 5 * MINUTE, async () => {
      const now = new Date();

      await Tournament.updateMany(
        { status: 'upcoming', startsAt: { $lte: now } },
        { $set: { status: 'active' } },
      );

      // Finalise (and pay out) any tournament whose window just closed. This
      // previously just flipped a status flag — entry fees were collected and
      // prizes were never distributed.
      const ending = await Tournament.find({ status: 'active', endsAt: { $lte: now } })
        .select('_id')
        .lean();

      for (const t of ending) {
        try {
          await finaliseTournament(t._id.toString());
        } catch (err) {
          logger.error('Tournament finalisation failed', err, {
            tournamentId: t._id.toString(),
          });
        }
      }
    }),
    { timezone: TIMEZONE },
  );

  // Stale-match sweeper — every 2 minutes.
  //
  // Forfeit timers are in-process `setTimeout` handles, so a deploy mid-match
  // would otherwise leave the match unsettled forever with both players' coins
  // locked. This is the durable backstop.
  if (io) {
    cron.schedule(
      '*/2 * * * *',
      job('pvp-sweeper', 3 * MINUTE, async () => {
        const swept = await sweepStaleMatches(io);
        if (swept > 0) logger.warn('Swept stale PvP matches', { count: swept });
      }),
      { timezone: TIMEZONE },
    );
  }

  // Expired quiz sessions — mark finished so they stop blocking new starts.
  cron.schedule(
    '*/10 * * * *',
    job('expire-quiz-sessions', 5 * MINUTE, async () => {
      const res = await ActiveQuizSession.updateMany(
        { finished: false, expiresAt: { $lte: new Date() } },
        { $set: { finished: true } },
      );
      if (res.modifiedCount) {
        logger.info('Expired stale quiz sessions', { count: res.modifiedCount });
      }
    }),
    { timezone: TIMEZONE },
  );

  logger.info('Cron scheduled', { timezone: TIMEZONE, sweeper: !!io });
}
