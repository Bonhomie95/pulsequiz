import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import Streak from '../models/Streak';
import { creditCoins } from './coinService';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { logger } from '../utils/logger';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Fallback day boundary when we don't know where the player is.
 *
 * This used to be hardcoded to Africa/Lagos for everyone, so a player in Los
 * Angeles lost their streak at 4pm local time. Clients now send their IANA
 * timezone; this is only the fallback for old clients that don't.
 */
const DEFAULT_TZ = process.env.DEFAULT_STREAK_TZ || 'UTC';

const MAX_BASE_REWARD = 200;
const MILESTONES: Record<number, number> = { 10: 500, 20: 1000, 30: 2000 };

function resolveTz(tz?: string | null): string {
  if (!tz) return DEFAULT_TZ;
  // Reject anything that isn't a real IANA zone rather than silently shifting
  // the player's day boundary to UTC.
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

export interface CheckInResult {
  alreadyCheckedIn: boolean;
  streak: number;
  coinsAdded: number;
  milestoneBonus: number;
  lastCheckIn?: Date | null;
  nextMilestone?: { at: number; bonus: number } | null;
}

export async function checkInStreak(
  userId: string,
  timezoneName?: string | null,
): Promise<CheckInResult> {
  const tz = resolveTz(timezoneName);
  const now = dayjs().tz(tz);
  const today = now.startOf('day');
  const yesterday = today.subtract(1, 'day');

  const streak = await Streak.findOne({ userId });
  if (!streak) throw new Error('Streak missing');

  const lastLocal = streak.lastCheckIn ? dayjs(streak.lastCheckIn).tz(tz) : null;

  if (lastLocal && lastLocal.isSame(today, 'day')) {
    return {
      alreadyCheckedIn: true,
      lastCheckIn: streak.lastCheckIn,
      streak: streak.streak,
      coinsAdded: 0,
      milestoneBonus: 0,
      nextMilestone: nextMilestoneAfter(streak.streak),
    };
  }

  const isConsecutive = !!lastLocal && lastLocal.isSame(yesterday, 'day');
  const newStreak = isConsecutive ? streak.streak + 1 : 1;

  // Claim today's check-in atomically. Two parallel requests would otherwise
  // both pass the "already checked in" test and both pay out.
  const claimed = await Streak.findOneAndUpdate(
    {
      userId,
      // Only match if lastCheckIn is still what we read — the optimistic guard.
      lastCheckIn: streak.lastCheckIn ?? null,
    },
    {
      $set: { streak: newStreak, lastCheckIn: today.toDate() },
      $push: { checkInHistory: { $each: [today.toDate()], $slice: -60 } },
    },
    { returnDocument: 'after' },
  );

  if (!claimed) {
    const current = await Streak.findOne({ userId }).lean();
    return {
      alreadyCheckedIn: true,
      lastCheckIn: current?.lastCheckIn ?? null,
      streak: current?.streak ?? 0,
      coinsAdded: 0,
      milestoneBonus: 0,
      nextMilestone: nextMilestoneAfter(current?.streak ?? 0),
    };
  }

  const perDay = Number(await getSetting(SETTINGS_KEYS.DAILY_CHECKIN_COINS, 20));
  const baseReward = Math.min(perDay * newStreak, MAX_BASE_REWARD);
  const milestoneBonus = MILESTONES[newStreak] ?? 0;

  // Through the ledger, not a bare $inc — the streak path used to mutate the
  // wallet directly, leaving no CoinTransaction row to reconcile against.
  await creditCoins(userId, baseReward + milestoneBonus, 'daily_checkin', {
    note: `streak:${newStreak}`,
  });

  return {
    alreadyCheckedIn: false,
    streak: newStreak,
    coinsAdded: baseReward + milestoneBonus,
    milestoneBonus,
    lastCheckIn: claimed.lastCheckIn,
    nextMilestone: nextMilestoneAfter(newStreak),
  };
}

function nextMilestoneAfter(streak: number): { at: number; bonus: number } | null {
  const next = Object.keys(MILESTONES)
    .map(Number)
    .sort((a, b) => a - b)
    .find((m) => m > streak);
  return next ? { at: next, bonus: MILESTONES[next] } : null;
}

/**
 * Warn players whose streak is about to break.
 *
 * `sendStreakWarning` existed but nothing ever called it — a streak is the
 * app's main daily-return hook, and letting one lapse silently wastes it.
 *
 * "About to break" means: they have a streak worth protecting, and they last
 * checked in roughly a day ago, so their local day is close to rolling over.
 * The 20–30 hour window keeps it to one nudge per player per day regardless of
 * their timezone.
 */
export async function warnStreaksAtRisk(limit = 2000): Promise<number> {
  const now = dayjs().utc();
  const from = now.subtract(30, 'hour').toDate();
  const to = now.subtract(20, 'hour').toDate();

  const atRisk = await Streak.find({
    streak: { $gte: 2 },
    lastCheckIn: { $gte: from, $lte: to },
  })
    .select('userId streak')
    .limit(limit)
    .lean();

  if (!atRisk.length) return 0;

  const { sendStreakWarning } = await import('./notificationService');

  const results = await Promise.allSettled(
    atRisk.map((s) => sendStreakWarning(s.userId.toString(), s.streak)),
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  logger.info('Streak warnings sent', { candidates: atRisk.length, sent });
  return sent;
}
