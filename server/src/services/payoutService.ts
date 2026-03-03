import Payout from '../models/Payout';
import PrizePool from '../models/PrizePool';
import AccumulatedPrize from '../models/AccumulatedPrize';
import User from '../models/User';
import Progress from '../models/Progress';
import { buildLeaderboard } from './leaderboardService';
import { sendUSDT } from './nowpaymentsService';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import {
  sendPayoutNotification,
  sendAddressWarningNotifications,
} from './notificationService';

export type PayoutPeriodType = 'weekly' | 'monthly';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get the current period label.
 *   weekly  → "2026-W08"
 *   monthly → "2026-02"
 */
export function getPeriodLabel(type: PayoutPeriodType): string {
  const now = new Date();

  if (type === 'monthly') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  // ISO week number
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86_400_000);
  const week = Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ─── processPeriodPayouts ─────────────────────────────────────────────────────

/**
 * Main payout processor — called by cron at period end.
 * Returns a structured result object so callers can inspect outcomes.
 */
export async function processPeriodPayouts(type: PayoutPeriodType) {
  const periodLabel = getPeriodLabel(type);
  console.log(`💰 Processing ${type} payouts for period: ${periodLabel}`);

  // 1. Fetch prize pool configured by admin
  const pool = await PrizePool.findOne({ type, periodLabel }).lean();
  if (!pool) {
    console.log(
      `⚠️  No prize pool configured for ${type} ${periodLabel} — skipping`,
    );
    return { skipped: true, reason: 'no_prize_pool' };
  }

  if (pool.lockedAt) {
    console.log(`ℹ️  Pool already processed for ${periodLabel}`);
    return { skipped: true, reason: 'already_locked' };
  }

  // 2. Lock pool immediately to prevent double-processing
  await PrizePool.updateOne(
    { _id: pool._id },
    { $set: { lockedAt: new Date() } },
  );

  // 3. Fetch leaderboard snapshot (already built by the cron just before calling us)
  const leaderboard = await buildLeaderboard(
    type === 'weekly' ? 'weekly' : 'monthly',
  );
  const topEntries = leaderboard.slice(0, pool.paidRanks);

  // 4. Load thresholds from settings once — avoids N redundant DB round-trips
  const [minPayout, minAgeDays, minSessions] = await Promise.all([
    getSetting(SETTINGS_KEYS.MIN_PAYOUT_USD, 5),
    getSetting(SETTINGS_KEYS.MIN_ACCOUNT_AGE_DAYS, 7),
    getSetting(SETTINGS_KEYS.MIN_SESSIONS_FOR_PAYOUT, 5),
  ]);

  const minAgeMs = Number(minAgeDays) * 24 * 60 * 60 * 1000;

  const results: {
    userId: string;
    status: string;
    amount?: number;
    reason?: string;
  }[] = [];

  for (const entry of topEntries) {
    const tier = pool.tiers.find((t) => t.rank === entry.rank);
    if (!tier || tier.amount <= 0) {
      results.push({
        userId: entry.userId,
        status: 'skipped',
        reason: 'no_tier',
      });
      continue;
    }

    // Fetch user + progress in parallel to halve DB round-trips per iteration
    const [user, progress] = await Promise.all([
      User.findById(entry.userId).lean(),
      Progress.findOne({ userId: entry.userId }).lean(),
    ]);

    if (!user) continue;

    // ── Eligibility checks ──────────────────────────────────────────────────
    const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();

    if (user.isBanned) {
      results.push({
        userId: entry.userId,
        status: 'skipped',
        reason: 'banned',
      });
      continue;
    }
    if (!user.withdrawalEnabled) {
      results.push({
        userId: entry.userId,
        status: 'skipped',
        reason: 'withdrawal_disabled',
      });
      continue;
    }
    if (!user.usdtAddress) {
      results.push({
        userId: entry.userId,
        status: 'skipped',
        reason: 'no_usdt_address',
      });
      continue;
    }
    if (accountAgeMs < minAgeMs) {
      results.push({
        userId: entry.userId,
        status: 'skipped',
        reason: 'account_too_new',
      });
      continue;
    }
    if ((progress?.totalQuizzes ?? 0) < Number(minSessions)) {
      results.push({
        userId: entry.userId,
        status: 'skipped',
        reason: 'insufficient_sessions',
      });
      continue;
    }

    // ── Accumulation ────────────────────────────────────────────────────────
    let accumulated = await AccumulatedPrize.findOne({ userId: entry.userId });
    if (!accumulated) {
      accumulated = await AccumulatedPrize.create({
        userId: entry.userId,
        pendingUSDT: 0,
        totalEarned: 0,
      });
    }

    accumulated.pendingUSDT += tier.amount;
    accumulated.totalEarned += tier.amount;
    accumulated.lastUpdated = new Date();
    await accumulated.save();

    // Below threshold — record as pending and move on
    if (accumulated.pendingUSDT < Number(minPayout)) {
      await Payout.create({
        userId: entry.userId,
        amount: tier.amount,
        rank: entry.rank,
        period: type,
        periodLabel,
        usdtAddress: user.usdtAddress,
        usdtType: user.usdtType ?? 'TRC20',
        status: 'pending',
        retries: 0,
      });
      results.push({
        userId: entry.userId,
        status: 'accumulated',
        amount: tier.amount,
        reason: `below_threshold (${accumulated.pendingUSDT.toFixed(2)} USDT)`,
      });
      continue;
    }

    // ── Send payout ─────────────────────────────────────────────────────────
    const payoutAmount = accumulated.pendingUSDT;
    const payoutRecord = await Payout.create({
      userId: entry.userId,
      amount: payoutAmount,
      rank: entry.rank,
      period: type,
      periodLabel,
      usdtAddress: user.usdtAddress,
      usdtType: user.usdtType ?? 'TRC20',
      status: 'pending',
      retries: 0,
    });

    let result: Awaited<ReturnType<typeof sendUSDT>>;
    try {
      result = await sendUSDT({
        address: user.usdtAddress,
        usdtType: user.usdtType ?? 'TRC20',
        amount: payoutAmount,
        description: `PulseQuiz ${type} prize — Rank #${entry.rank} — ${periodLabel}`,
      });
    } catch (err) {
      // Unexpected throw from the payment provider — treat as a failed payout
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`❌ sendUSDT threw for user ${entry.userId}:`, err);
      await Payout.updateOne(
        { _id: payoutRecord._id },
        {
          $set: {
            status: 'failed',
            failReason: errorMsg,
            retries: 1,
            lastAttemptAt: new Date(),
          },
        },
      );
      results.push({
        userId: entry.userId,
        status: 'failed',
        reason: errorMsg,
      });
      continue;
    }

    if (result.success) {
      await Payout.updateOne(
        { _id: payoutRecord._id },
        {
          $set: {
            status: 'sent',
            txHash: result.txHash,
            nowpaymentsPaymentId: result.paymentId,
            sentAt: new Date(),
          },
        },
      );

      // Reset accumulated balance only after confirmed send
      accumulated.pendingUSDT = 0;
      await accumulated.save();

      // Fire notification — non-critical, so don't let it blow up the loop
      sendPayoutNotification(entry.userId, payoutAmount).catch((err) =>
        console.error(
          `❌ sendPayoutNotification failed for ${entry.userId}:`,
          err,
        ),
      );

      results.push({
        userId: entry.userId,
        status: 'sent',
        amount: payoutAmount,
      });
    } else {
      await Payout.updateOne(
        { _id: payoutRecord._id },
        {
          $set: {
            status: 'failed',
            failReason: result.error,
            retries: 1,
            lastAttemptAt: new Date(),
          },
        },
      );
      results.push({
        userId: entry.userId,
        status: 'failed',
        reason: result.error,
      });
    }
  }

  console.log(`✅ Payout processing complete for ${periodLabel}:`, results);
  return { periodLabel, results };
}

// ─── retryFailedPayouts ───────────────────────────────────────────────────────

/**
 * Retry failed payouts — called by cron every 6 hours.
 * Caps at 3 total attempts (retries < 3 means we haven't hit the cap yet).
 */
export async function retryFailedPayouts() {
  const MAX_RETRIES = 3;
  const failed = await Payout.find({
    status: 'failed',
    retries: { $lt: MAX_RETRIES },
  }).lean();

  if (!failed.length) {
    console.log('ℹ️  No failed payouts to retry');
    return;
  }

  console.log(`🔄 Retrying ${failed.length} failed payout(s)...`);

  await Promise.allSettled(
    failed.map(async (payout) => {
      try {
        const user = await User.findById(payout.userId).lean();
        if (!user || !user.usdtAddress || user.isBanned) return;

        const result = await sendUSDT({
          address: user.usdtAddress,
          usdtType: user.usdtType ?? 'TRC20',
          amount: payout.amount,
          description: `PulseQuiz retry payout — ${payout.periodLabel}`,
        });

        await Payout.updateOne(
          { _id: payout._id },
          {
            $set: {
              status: result.success ? 'sent' : 'failed',
              ...(result.txHash ? { txHash: result.txHash } : {}),
              ...(result.success ? {} : { failReason: result.error }),
              retries: payout.retries + 1,
              lastAttemptAt: new Date(),
              ...(result.success ? { sentAt: new Date() } : {}),
            },
          },
        );

        if (result.success) {
          sendPayoutNotification(payout.userId.toString(), payout.amount).catch(
            (err) =>
              console.error(
                `❌ sendPayoutNotification failed for ${payout.userId}:`,
                err,
              ),
          );
        }
      } catch (err) {
        console.error(`❌ Retry threw for payout ${payout._id}:`, err);
        // Increment retries even on unexpected throws so we don't loop forever
        await Payout.updateOne(
          { _id: payout._id },
          {
            $set: {
              failReason: err instanceof Error ? err.message : String(err),
              retries: payout.retries + 1,
              lastAttemptAt: new Date(),
            },
          },
        ).catch(() => {});
      }
    }),
  );
}

// ─── sendWeeklyAddressWarnings ───────────────────────────────────────────────

/**
 * Send mid-week address confirmation warnings to ranked users.
 */
export async function sendWeeklyAddressWarnings() {
  const pool = await PrizePool.findOne({ type: 'weekly' })
    .sort({ createdAt: -1 })
    .lean();
  if (!pool) return;

  const leaderboard = await buildLeaderboard('weekly');
  const topN = leaderboard.slice(0, pool.paidRanks);

  await Promise.allSettled(
    topN.map((entry) =>
      sendAddressWarningNotifications(entry.userId, entry.rank),
    ),
  );
}
