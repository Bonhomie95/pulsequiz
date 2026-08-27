import Payout from '../models/Payout';
import PrizePool from '../models/PrizePool';
import AccumulatedPrize from '../models/AccumulatedPrize';
import User from '../models/User';
import Progress from '../models/Progress';
import FlaggedAccount from '../models/FlaggedAccount';
import { buildLeaderboard } from './leaderboardService';
import { sendUSDT } from './nowpaymentsService';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import {
  currentPeriodLabel,
  periodContaining,
  previousPeriod,
  type Period,
  type PeriodType,
} from '../utils/dateRanges';
import {
  sendPayoutNotification,
  sendAddressWarningNotifications,
} from './notificationService';
import { logger } from '../utils/logger';

export type PayoutPeriodType = PeriodType;

/**
 * How long a payout address must have been stable before it can receive money.
 *
 * A stolen session token could otherwise change the address and collect the
 * next payout before the real owner noticed. The hold gives the notification
 * we send on change time to reach them.
 */
const ADDRESS_HOLD_MS = Number(process.env.PAYOUT_ADDRESS_HOLD_HOURS || 72) * 60 * 60 * 1000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Current period label — for live "this week's pool" reads.
 *
 * NOTE: payout processing must NOT use this. A period-end job runs after the
 * period has rolled over, so it needs `previousPeriod`.
 */
export function getPeriodLabel(type: PayoutPeriodType): string {
  return currentPeriodLabel(type);
}

export type SkipReason =
  | 'no_tier'
  | 'banned'
  | 'deleted'
  | 'withdrawal_disabled'
  | 'no_usdt_address'
  | 'address_recently_changed'
  | 'account_too_new'
  | 'insufficient_sessions'
  | 'flagged_for_review';

export interface EligibilityResult {
  eligible: boolean;
  reason?: SkipReason;
  /** Human-readable, safe to show the user on the wallet screen. */
  message?: string;
}

/**
 * Whether a user may receive a payout right now.
 *
 * Exported so the wallet screen can show the same checklist the cron applies —
 * previously a user was silently skipped with no way to find out why.
 */
export async function checkPayoutEligibility(userId: string): Promise<EligibilityResult> {
  const [user, progress, minAgeDays, minSessions] = await Promise.all([
    User.findById(userId).lean(),
    Progress.findOne({ userId }).lean(),
    getSetting(SETTINGS_KEYS.MIN_ACCOUNT_AGE_DAYS, 7),
    getSetting(SETTINGS_KEYS.MIN_SESSIONS_FOR_PAYOUT, 5),
  ]);

  if (!user) return { eligible: false, reason: 'deleted', message: 'Account not found.' };
  if (user.deletedAt) return { eligible: false, reason: 'deleted', message: 'Account deleted.' };
  if (user.isBanned) {
    return { eligible: false, reason: 'banned', message: 'Account is banned.' };
  }
  if (!user.usdtAddress) {
    return {
      eligible: false,
      reason: 'no_usdt_address',
      message: 'Add a USDT wallet address in Settings.',
    };
  }
  if (!user.withdrawalEnabled) {
    return {
      eligible: false,
      reason: 'withdrawal_disabled',
      message: 'Withdrawals are disabled on this account.',
    };
  }

  if (
    user.usdtAddressChangedAt &&
    Date.now() - new Date(user.usdtAddressChangedAt).getTime() < ADDRESS_HOLD_MS
  ) {
    const hoursLeft = Math.ceil(
      (ADDRESS_HOLD_MS - (Date.now() - new Date(user.usdtAddressChangedAt).getTime())) /
        (60 * 60 * 1000),
    );
    return {
      eligible: false,
      reason: 'address_recently_changed',
      message: `Your wallet address was changed recently. Payouts resume in ${hoursLeft}h.`,
    };
  }

  const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
  if (accountAgeMs < Number(minAgeDays) * 24 * 60 * 60 * 1000) {
    return {
      eligible: false,
      reason: 'account_too_new',
      message: `Accounts must be at least ${minAgeDays} days old to receive prizes.`,
    };
  }

  if ((progress?.totalQuizzes ?? 0) < Number(minSessions)) {
    return {
      eligible: false,
      reason: 'insufficient_sessions',
      message: `Play at least ${minSessions} quizzes to qualify for prizes.`,
    };
  }

  // Anti-cheat previously wrote flags that nothing ever acted on. An open flag
  // now holds the payout for manual review rather than paying out and hoping.
  const flagged = await FlaggedAccount.findOne({ userId, resolved: false }).lean();
  if (flagged) {
    return {
      eligible: false,
      reason: 'flagged_for_review',
      message: 'Your account is under review. Contact support if this persists.',
    };
  }

  return { eligible: true };
}

// ─── processPeriodPayouts ─────────────────────────────────────────────────────

export interface PayoutRunResult {
  skipped?: boolean;
  reason?: string;
  periodLabel?: string;
  results?: { userId: string; status: string; amount?: number; reason?: string }[];
}

/**
 * Process payouts for a completed period.
 *
 * `period` defaults to the period that just ended — which is what a period-end
 * cron needs. The previous implementation derived the label from wall-clock at
 * call time, so the Monday-00:05 job looked up a prize pool for the week that
 * had just started and ranked five minutes of play.
 */
export async function processPeriodPayouts(
  type: PayoutPeriodType,
  period?: Period,
): Promise<PayoutRunResult> {
  const target = period ?? previousPeriod(type);
  const periodLabel = target.label;

  logger.info('Processing period payouts', {
    type,
    periodLabel,
    from: target.start.toISOString(),
    to: target.end.toISOString(),
  });

  // 1. Prize pool configured by an admin for the period that just ended.
  const pool = await PrizePool.findOne({ type, periodLabel }).lean();
  if (!pool) {
    logger.warn('No prize pool configured — skipping payout run', { type, periodLabel });
    return { skipped: true, reason: 'no_prize_pool', periodLabel };
  }

  // 2. Claim the pool so a concurrent or repeated run can't double-pay.
  const claimed = await PrizePool.findOneAndUpdate(
    { _id: pool._id, lockedAt: null },
    { $set: { lockedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();

  if (!claimed) {
    logger.info('Prize pool already processed', { periodLabel });
    return { skipped: true, reason: 'already_locked', periodLabel };
  }

  // 3. Rank the period that ended, not the one in progress.
  const leaderboard = await buildLeaderboard(type, target);
  const topEntries = leaderboard.slice(0, pool.paidRanks);

  const minPayout = Number(await getSetting(SETTINGS_KEYS.MIN_PAYOUT_USD, 5));

  const results: PayoutRunResult['results'] = [];

  for (const entry of topEntries) {
    const tier = pool.tiers.find((t) => t.rank === entry.rank);
    if (!tier || tier.amount <= 0) {
      results.push({ userId: entry.userId, status: 'skipped', reason: 'no_tier' });
      continue;
    }

    const eligibility = await checkPayoutEligibility(entry.userId);
    if (!eligibility.eligible) {
      results.push({
        userId: entry.userId,
        status: 'skipped',
        reason: eligibility.reason,
      });
      continue;
    }

    const user = await User.findById(entry.userId).lean();
    if (!user?.usdtAddress) continue;

    // ── Accumulate ──────────────────────────────────────────────────────────
    // Atomic so a retry of this run can't double-accumulate.
    const accumulated = await AccumulatedPrize.findOneAndUpdate(
      { userId: entry.userId },
      {
        $inc: { pendingUSDT: tier.amount, totalEarned: tier.amount },
        $set: { lastUpdated: new Date() },
      },
      { upsert: true, returnDocument: 'after' },
    );

    // The unique index on (period, periodLabel, userId) makes the payout row
    // itself idempotent — a re-run for the same period throws instead of
    // creating a second record.
    const idempotencyKey = `${type}:${periodLabel}:${entry.userId}`;

    let payoutRecord;
    try {
      payoutRecord = await Payout.create({
        userId: entry.userId,
        amount: accumulated!.pendingUSDT,
        rank: entry.rank,
        period: type,
        periodLabel,
        usdtAddress: user.usdtAddress,
        usdtType: user.usdtType ?? 'TRC20',
        status: 'pending',
        retries: 0,
        idempotencyKey,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        results.push({ userId: entry.userId, status: 'skipped', reason: 'already_paid_this_period' });
        continue;
      }
      throw err;
    }

    // Below threshold — hold it and roll into the next period.
    if (accumulated!.pendingUSDT < minPayout) {
      await Payout.updateOne(
        { _id: payoutRecord._id },
        { $set: { status: 'pending', failReason: 'below_minimum_threshold' } },
      );
      results.push({
        userId: entry.userId,
        status: 'accumulated',
        amount: tier.amount,
        reason: `below_threshold (${accumulated!.pendingUSDT.toFixed(2)} USDT)`,
      });
      continue;
    }

    // ── Send ────────────────────────────────────────────────────────────────
    const payoutAmount = accumulated!.pendingUSDT;

    const result = await sendUSDT({
      address: user.usdtAddress,
      usdtType: user.usdtType ?? 'TRC20',
      amount: payoutAmount,
      description: `PulseQuiz ${type} prize — Rank #${entry.rank} — ${periodLabel}`,
      reference: idempotencyKey,
    });

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

      // Only clear the debt once the provider confirmed it accepted the transfer.
      await AccumulatedPrize.updateOne(
        { userId: entry.userId },
        { $inc: { pendingUSDT: -payoutAmount }, $set: { lastUpdated: new Date() } },
      );

      sendPayoutNotification(entry.userId, payoutAmount).catch((err) =>
        logger.error('Payout notification failed', err, { userId: entry.userId }),
      );

      results.push({ userId: entry.userId, status: 'sent', amount: payoutAmount });
    } else {
      await Payout.updateOne(
        { _id: payoutRecord._id },
        {
          $set: {
            status: 'failed',
            failReason: result.error,
            // An indeterminate outcome must never be auto-retried; park it at
            // the retry cap so a human reconciles it.
            retries: result.indeterminate ? 99 : 1,
            lastAttemptAt: new Date(),
          },
        },
      );

      if (result.indeterminate) {
        logger.error('Payout outcome unknown — requires manual reconciliation', undefined, {
          userId: entry.userId,
          amount: payoutAmount,
          reference: idempotencyKey,
        });
      }

      results.push({ userId: entry.userId, status: 'failed', reason: result.error });
    }
  }

  logger.info('Payout processing complete', {
    periodLabel,
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  });

  return { periodLabel, results };
}

// ─── retryFailedPayouts ───────────────────────────────────────────────────────

/**
 * Retry failed payouts. Every attempt reuses the original idempotency
 * reference, and `sendUSDT` reconciles against the provider before sending —
 * so a transfer that actually went through on the first attempt is detected
 * rather than sent again.
 */
export async function retryFailedPayouts() {
  const MAX_RETRIES = 3;
  const failed = await Payout.find({
    status: 'failed',
    retries: { $lt: MAX_RETRIES },
  })
    .limit(200)
    .lean();

  if (!failed.length) {
    logger.debug('No failed payouts to retry');
    return;
  }

  logger.info('Retrying failed payouts', { count: failed.length });

  for (const payout of failed) {
    try {
      const eligibility = await checkPayoutEligibility(payout.userId.toString());
      if (!eligibility.eligible) {
        await Payout.updateOne(
          { _id: payout._id },
          { $set: { status: 'skipped', failReason: eligibility.reason, lastAttemptAt: new Date() } },
        );
        continue;
      }

      const user = await User.findById(payout.userId).lean();
      if (!user?.usdtAddress) continue;

      const reference =
        payout.idempotencyKey ?? `${payout.period}:${payout.periodLabel}:${payout.userId}`;

      const result = await sendUSDT({
        address: user.usdtAddress,
        usdtType: user.usdtType ?? 'TRC20',
        amount: payout.amount,
        description: `PulseQuiz retry payout — ${payout.periodLabel}`,
        reference,
      });

      await Payout.updateOne(
        { _id: payout._id },
        {
          $set: {
            status: result.success ? 'sent' : 'failed',
            ...(result.txHash ? { txHash: result.txHash } : {}),
            ...(result.paymentId ? { nowpaymentsPaymentId: result.paymentId } : {}),
            ...(result.success ? { sentAt: new Date() } : { failReason: result.error }),
            retries: result.indeterminate ? MAX_RETRIES : payout.retries + 1,
            lastAttemptAt: new Date(),
          },
        },
      );

      if (result.success) {
        await AccumulatedPrize.updateOne(
          { userId: payout.userId },
          { $inc: { pendingUSDT: -payout.amount }, $set: { lastUpdated: new Date() } },
        );
        sendPayoutNotification(payout.userId.toString(), payout.amount).catch(() => {});
      }
    } catch (err) {
      logger.error('Payout retry threw', err, { payoutId: payout._id.toString() });
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
  }
}

// ─── sendWeeklyAddressWarnings ───────────────────────────────────────────────

/** Mid-week nudge to the players currently in a paying rank. */
export async function sendWeeklyAddressWarnings() {
  const label = currentPeriodLabel('weekly');
  const pool =
    (await PrizePool.findOne({ type: 'weekly', periodLabel: label }).lean()) ??
    (await PrizePool.findOne({ type: 'weekly' }).sort({ createdAt: -1 }).lean());
  if (!pool) return;

  const leaderboard = await buildLeaderboard('weekly', periodContaining('weekly'));
  const topN = leaderboard.slice(0, pool.paidRanks);

  await Promise.allSettled(
    topN.map(async (entry) => {
      // Only nudge people who actually have something to fix.
      const eligibility = await checkPayoutEligibility(entry.userId);
      if (eligibility.eligible) return;
      if (
        eligibility.reason === 'no_usdt_address' ||
        eligibility.reason === 'withdrawal_disabled'
      ) {
        await sendAddressWarningNotifications(entry.userId, entry.rank);
      }
    }),
  );
}
