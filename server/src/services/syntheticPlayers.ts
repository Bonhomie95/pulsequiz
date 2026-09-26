import { Types } from 'mongoose';

import User from '../models/User';
import { DailyAttempt } from '../models/DailyQuiz';
import { SyntheticScore } from '../models/SyntheticScore';
import { SETTINGS_KEYS, getSetting, setSetting } from '../models/AppSettings';
import { currentPeriodLabel } from '../utils/dateRanges';
import { generateNicknames } from './nicknames';
import { logger } from '../utils/logger';

/**
 * House accounts that keep the leaderboards from looking deserted.
 *
 * A player who finishes their first Daily and finds themselves alone on the
 * board concludes the app is empty and leaves. These accounts give the boards
 * a population from day one.
 *
 * The hard rule, enforced in `buildLeaderboard` rather than by convention:
 * **a house account is never ranked for a payout.** Prize ranking rebuilds the
 * board with `excludeSynthetic`, so the paying ranks contain only real players.
 * That is also why the points ceiling is deliberately low — these accounts are
 * there to give a target worth chasing, not to stand between a player and a
 * prize.
 *
 * Everything is seeded idempotently and keyed by period, so re-running a day or
 * a week changes nothing.
 */

const AVATARS = Array.from({ length: 12 }, (_, i) => `avatar${i}`);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * A 0..1 draw biased towards the low end, so most accounts cluster where
 * ordinary players sit and only a few sit near the top. A flat distribution
 * makes a board look generated at a glance.
 */
function skewedUnit() {
  return Math.pow(Math.random(), 1.9);
}

export async function syntheticsEnabled(): Promise<boolean> {
  return !!(await getSetting(SETTINGS_KEYS.SYNTHETIC_ENABLED, true));
}

/**
 * Make sure `size` house accounts exist, creating any that are missing.
 *
 * Usernames must clear the case-insensitive unique index, so existing ones are
 * loaded and avoided. A duplicate that slips through a race is skipped rather
 * than failing the batch.
 */
export async function ensureSyntheticPool(size?: number): Promise<number> {
  const target = Number(size ?? (await getSetting(SETTINGS_KEYS.SYNTHETIC_POOL_SIZE, 500)));
  const existing = await User.countDocuments({ isSynthetic: true });
  if (existing >= target) return existing;

  const taken = new Set(
    (await User.find({ username: { $type: 'string' } }).select('username').lean())
      .map((u) => String(u.username)),
  );

  const nicknames = generateNicknames(target - existing, taken);
  let created = 0;

  for (const username of nicknames) {
    const id = new Types.ObjectId();
    try {
      await User.create({
        _id: id,
        // Not a routable address, and the provider pair is unique per account
        // so these can never collide with a real OAuth sign-in.
        email: `synthetic+${id.toHexString()}@pulsequiz.invalid`,
        provider: 'google',
        providerId: `synthetic:${id.toHexString()}`,
        username,
        avatar: pick(AVATARS),
        isSynthetic: true,
        hasCompletedFirstQuiz: true,
        publicProfile: false,
      });
      created++;
    } catch (err: any) {
      if (err?.code !== 11000) throw err; // duplicate username — skip it
    }
  }

  logger.info('Synthetic pool ensured', { target, existing, created });
  return existing + created;
}

/** Ids of house accounts, newest first is irrelevant — order is randomised by caller. */
async function syntheticIds(): Promise<Types.ObjectId[]> {
  const rows = await User.find({ isSynthetic: true }).select('_id').lean();
  return rows.map((r) => r._id as Types.ObjectId);
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Populate one date's Daily board.
 *
 * Scores follow the shape a real Daily produces: most people land in the
 * middle, a tail gets everything right, a few drop out early. `timeLeftMs` is
 * the tiebreak the real board uses, so it has to vary too or every tie would
 * resolve in id order.
 */
export async function seedSyntheticDaily(
  date: string,
  totalQuestions = 10,
): Promise<{ seeded: number; skipped?: string }> {
  if (!(await syntheticsEnabled())) return { seeded: 0, skipped: 'disabled' };

  const already = await DailyAttempt.countDocuments({
    date,
    userId: { $in: await syntheticIds() },
  });
  if (already > 0) return { seeded: 0, skipped: 'already_seeded' };

  await ensureSyntheticPool();

  const min = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_DAILY_MIN, 200));
  const max = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_DAILY_MAX, 400));
  const ids = shuffled(await syntheticIds());
  const wanted = Math.min(ids.length, randInt(Math.min(min, max), Math.max(min, max)));

  const docs = ids.slice(0, wanted).map((userId) => {
    // Bell-ish: two draws averaged, so 5-7 correct is common and 10/10 is rare.
    const spread = (Math.random() + Math.random()) / 2;
    const correct = Math.max(0, Math.min(totalQuestions, Math.round(spread * totalQuestions)));

    const results: boolean[] = [];
    for (let i = 0; i < totalQuestions; i++) results.push(i < correct);
    // Which ones they got right should not be the first N every time.
    for (let i = results.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [results[i], results[j]] = [results[j], results[i]];
    }

    return {
      userId,
      date,
      correct,
      total: totalQuestions,
      results,
      // Up to 15s unused per question, weighted low — few people are fast.
      timeLeftMs: Math.round(skewedUnit() * correct * 15_000),
      finishedAt: new Date(),
    };
  });

  if (!docs.length) return { seeded: 0 };

  // Unordered: a collision with an already-seeded row skips that row rather
  // than aborting the batch.
  try {
    await DailyAttempt.insertMany(docs, { ordered: false });
  } catch (err: any) {
    if (err?.code !== 11000 && !err?.writeErrors) throw err;
  }

  logger.info('Seeded synthetic daily board', { date, seeded: docs.length });
  return { seeded: docs.length };
}

/**
 * Give house accounts a standing on the weekly, monthly and all-time boards.
 *
 * `SYNTHETIC_POINTS_CEILING` caps the very top. It is intentionally a score an
 * engaged player reaches in a period — the point is a board that looks alive
 * and a target that can be overtaken, not an unreachable wall. Monthly and
 * all-time scale up because they accumulate over longer windows.
 */
export async function seedSyntheticLadder(
  at: Date = new Date(),
): Promise<{ seeded: number; skipped?: string }> {
  if (!(await syntheticsEnabled())) return { seeded: 0, skipped: 'disabled' };

  await ensureSyntheticPool();

  const ladderSize = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_LADDER_SIZE, 120));
  const ceiling = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_POINTS_CEILING, 140));
  const ids = await syntheticIds();
  if (!ids.length) return { seeded: 0 };

  const periods: { type: 'weekly' | 'monthly' | 'all'; label: string; scale: number }[] = [
    { type: 'weekly', label: currentPeriodLabel('weekly', at), scale: 1 },
    { type: 'monthly', label: currentPeriodLabel('monthly', at), scale: 3.5 },
    { type: 'all', label: 'all', scale: 8 },
  ];

  let seeded = 0;

  for (const period of periods) {
    // `ladderSize` caps how many house accounts appear on a board, not how
    // many each run adds. Without this the board grew every tick until the
    // whole pool was on it.
    const already = await SyntheticScore.find({ type: period.type, periodLabel: period.label })
      .select('userId')
      .lean();
    const onBoard = new Set(already.map((r) => String(r.userId)));
    const shortfall = Math.min(ids.length, ladderSize) - onBoard.size;
    if (shortfall <= 0) continue;

    // A different slice per period, so the same handles do not head every board.
    const chosen = shuffled(ids.filter((id) => !onBoard.has(String(id)))).slice(0, shortfall);
    const ops = chosen.map((userId) => {
      const points = Math.max(1, Math.round(skewedUnit() * ceiling * period.scale));
      return {
        updateOne: {
          filter: { userId, type: period.type, periodLabel: period.label },
          // Only on insert: re-running must not reshuffle a board players are
          // already looking at.
          update: { $setOnInsert: { userId, type: period.type, periodLabel: period.label, points } },
          upsert: true,
        },
      };
    });

    if (ops.length) {
      const res = await SyntheticScore.bulkWrite(ops, { ordered: false });
      seeded += res.upsertedCount ?? 0;
    }
  }

  logger.info('Seeded synthetic ladder', { seeded });
  return { seeded };
}

/**
 * Remove every house account and everything they hold.
 *
 * The admin switch for turning the padding off for good; also what the tests
 * use to get back to a clean board.
 */
export async function purgeSyntheticPlayers(): Promise<{ users: number }> {
  const ids = await syntheticIds();
  if (!ids.length) return { users: 0 };

  await Promise.all([
    DailyAttempt.deleteMany({ userId: { $in: ids } }),
    SyntheticScore.deleteMany({ userId: { $in: ids } }),
  ]);
  const res = await User.deleteMany({ isSynthetic: true });

  await setSetting(SETTINGS_KEYS.SYNTHETIC_ENABLED, false);

  logger.info('Purged synthetic players', { users: res.deletedCount });
  return { users: res.deletedCount ?? 0 };
}
