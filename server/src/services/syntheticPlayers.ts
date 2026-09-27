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
        // Fixed for the life of the account: the same person is near the top
        // of every board, or near the bottom of every board.
        syntheticStrength: skewedUnit(),
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

/**
 * One plausible Daily result for a house account.
 *
 * Bell-ish: two draws averaged, so 5-7 correct is common and 10/10 is rare —
 * the shape a real Daily produces. `timeLeftMs` is the tiebreak the real board
 * uses, so it has to vary or every tie would resolve in id order.
 */
function dailyAttemptFor(userId: Types.ObjectId, date: string, totalQuestions: number) {
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
}

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

  const docs = ids.slice(0, wanted).map((userId) => dailyAttemptFor(userId, date, totalQuestions));

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

  // One cohort, shared by every board.
  //
  // These used to be drawn separately per period, which read as four
  // unrelated populations: the all-time leader was absent from monthly, the
  // monthly leader absent from weekly. Real players accumulate, so whoever
  // tops all-time is usually active this month and this week too. Ranking by
  // the account's fixed strength gives that, and the per-period scale keeps
  // the magnitudes plausible.
  const cohort = await User.find({ isSynthetic: true })
    .select('_id syntheticStrength')
    .sort({ syntheticStrength: -1 })
    .limit(ladderSize)
    .lean();
  if (!cohort.length) return { seeded: 0 };

  const periods: { type: 'weekly' | 'monthly' | 'all'; label: string; scale: number }[] = [
    { type: 'weekly', label: currentPeriodLabel('weekly', at), scale: 1 },
    { type: 'monthly', label: currentPeriodLabel('monthly', at), scale: 3.5 },
    { type: 'all', label: 'all', scale: 8 },
  ];

  let seeded = 0;

  for (const period of periods) {
    const ops = cohort.map((u) => {
      const strength = Number(u.syntheticStrength) || 0.1;
      // ±12% jitter so the three boards are not the identical order — a real
      // player has better and worse weeks — while staying recognisably the
      // same person.
      const jitter = 0.88 + Math.random() * 0.24;
      // The ceiling is a hard cap, not a target: it is what keeps these
      // scores reachable. Jitter must not lift an account over it.
      // The same per-account ceiling the drift uses, so nothing is seeded
      // above the point it is allowed to grow to.
      const cap = personalCeiling(strength, period.scale, ceiling);
      const points = Math.min(cap, Math.max(1, Math.round(strength * jitter * ceiling * period.scale)));

      return {
        updateOne: {
          filter: { userId: u._id, type: period.type, periodLabel: period.label },
          // Only on insert: re-running must not reshuffle a board players are
          // already looking at.
          update: {
            $setOnInsert: {
              userId: u._id,
              type: period.type,
              periodLabel: period.label,
              points,
            },
          },
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

/**
 * Nudge every house account's standing up a little, once a day.
 *
 * Without this their scores are frozen at whatever the board was seeded with,
 * so a real player passes them once and the board stops being a contest. A
 * daily drift keeps a target ahead of an active player without ever running
 * away from them: the growth is randomised per account, so the order reshuffles
 * the way a real board does, and the weekly board resets every week anyway.
 *
 * Idempotent by date — running it ten times in a day grows nothing ten times.
 */
export async function growSyntheticLadder(
  at: Date = new Date(),
): Promise<{ grown: number; skipped?: string }> {
  if (!(await syntheticsEnabled())) return { grown: 0, skipped: 'disabled' };

  const today = at.toISOString().slice(0, 10);
  const growth = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_DAILY_GROWTH, 25));
  if (growth <= 0) return { grown: 0, skipped: 'growth_disabled' };

  // Same shape as the seed: a month accumulates faster than a week, all-time
  // faster still.
  const scales: Record<string, number> = { weekly: 1, monthly: 3.5, all: 8 };

  const due = await SyntheticScore.find({
    $or: [{ lastGrownOn: null }, { lastGrownOn: { $ne: today } }],
  })
    .select('_id type points userId')
    .lean();

  if (!due.length) return { grown: 0 };

  const ceiling = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_POINTS_CEILING, 140));
  const strengths = await strengthByUser();

  const ops = due.map((row) => {
    const scale = scales[row.type] ?? 1;
    const mine = personalCeiling(
      strengths.get(String((row as any).userId)) ?? 0.1,
      scale,
      ceiling,
    );
    // Randomised per account and per day, so the board reorders instead of
    // every entry marching up in lockstep — but clamped to the account's own
    // ceiling. This used to be a bare $inc, so the daily drift walked a few
    // accounts straight past the cap the seed and the trickle both respect.
    const gain = Math.max(1, Math.round(Math.random() * growth * scale));
    const current = (row as any).points ?? 0;
    // Clamp upward only. An account seeded above its own ceiling must stall
    // there, not be marked down — a score going backwards reads as a player
    // losing points, which never happens.
    const next = Math.max(current, Math.min(mine, current + gain));
    return {
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { points: next, lastGrownOn: today } },
      },
    };
  });

  const res = await SyntheticScore.bulkWrite(ops, { ordered: false });
  const grown = res.modifiedCount ?? 0;

  logger.info('Grew synthetic ladder', { grown, today });
  return { grown };
}


/**
 * Where one account tops out, rather than where all of them do.
 *
 * A single global ceiling made every strong account pile up on the same
 * number: ten of them sat at exactly 140 on the weekly board, an unmoving
 * plateau at the top, because the drift skips anything already at the cap.
 * Real boards do not have ten people tied for third.
 *
 * Deriving it from the account's own strength spreads the top out and leaves
 * everyone room to move, while keeping the whole population under the
 * ceiling — which is the point of the ceiling: a target a real player can
 * reach and overtake.
 */
function personalCeiling(strength: number, scale: number, ceiling: number): number {
  const s = Math.min(1, Math.max(0, Number(strength) || 0));
  return Math.max(1, Math.round(ceiling * scale * (0.35 + s * 0.65)));
}

/** Strength per house account, for the cap above. */
async function strengthByUser(): Promise<Map<string, number>> {
  const rows = await User.find({ isSynthetic: true })
    .select('_id syntheticStrength')
    .lean();
  return new Map(rows.map((r) => [String(r._id), Number(r.syntheticStrength) || 0.1]));
}

/* ───────────────────── Arrivals between the daily seeds ────────────────── */

/**
 * A trickle of new faces, every 30–45 minutes.
 *
 * Seeding once a day makes a board that is full the moment you first look and
 * then frozen for twenty-four hours — which reads as a dump of fake rows the
 * second time you check. Real boards gain people all day and the scores on
 * them creep up, so this adds a handful of Daily results and nudges the
 * weekly/monthly/all-time standings on a loose interval.
 *
 * The interval is randomised rather than clockwork for the same reason, and
 * the next run is booked *before* the work so a slow tick cannot double-fire.
 */
const TRICKLE_MIN_MS = 30 * 60_000;
const TRICKLE_MAX_MS = 45 * 60_000;

/** New Daily entries: 2–5 house accounts that have not played today. */
async function trickleDaily(date: string, totalQuestions = 10): Promise<number> {
  const ids = await syntheticIds();
  if (!ids.length) return 0;

  const played = await DailyAttempt.find({ date, userId: { $in: ids } })
    .select('userId')
    .lean();
  const playedSet = new Set(played.map((p) => String(p.userId)));

  const fresh = shuffled(ids.filter((id) => !playedSet.has(String(id))));
  if (!fresh.length) return 0;

  const wanted = Math.min(fresh.length, randInt(2, 5));
  const docs = fresh.slice(0, wanted).map((id) => dailyAttemptFor(id, date, totalQuestions));

  try {
    await DailyAttempt.insertMany(docs, { ordered: false });
  } catch (err: any) {
    if (err?.code !== 11000 && !err?.writeErrors) throw err;
  }
  return docs.length;
}

/**
 * Nudge the standing boards: a few points onto some existing entries, plus a
 * couple of new arrivals.
 *
 * The bump is small and only lands on a slice of the board, so the order
 * reshuffles the way a real one does instead of everyone marching up together.
 * The ceiling still applies — these are a target to overtake, not a wall.
 */
async function trickleLadder(at: Date): Promise<{ bumped: number; added: number }> {
  const ceiling = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_POINTS_CEILING, 140));
  const ladderSize = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_LADDER_SIZE, 120));

  const periods: { type: 'weekly' | 'monthly' | 'all'; label: string; scale: number }[] = [
    { type: 'weekly', label: currentPeriodLabel('weekly', at), scale: 1 },
    { type: 'monthly', label: currentPeriodLabel('monthly', at), scale: 3.5 },
    { type: 'all', label: 'all', scale: 8 },
  ];

  let bumped = 0;
  let added = 0;
  const strengths = await strengthByUser();

  for (const period of periods) {
    const cap = Math.round(ceiling * period.scale);

    const rows = await SyntheticScore.find({ type: period.type, periodLabel: period.label })
      .select('_id points userId')
      .lean();

    // A slice of the board, not all of it.
    const slice = shuffled(rows).slice(0, Math.max(1, Math.round(rows.length * 0.25)));
    const ops = slice
      .map((r) => {
        const mine = personalCeiling(
          strengths.get(String((r as any).userId)) ?? 0.1,
          period.scale,
          ceiling,
        );
        const gain = randInt(2, Math.max(3, Math.round(12 * period.scale)));
        const current = r.points ?? 0;
        const next = Math.max(current, Math.min(mine, current + gain));
        if (next === current) return null;
        return { updateOne: { filter: { _id: r._id }, update: { $set: { points: next } } } };
      })
      .filter(Boolean) as any[];

    if (ops.length) {
      const res = await SyntheticScore.bulkWrite(ops, { ordered: false });
      bumped += res.modifiedCount ?? 0;
    }

    // Room on the board? Bring one or two more in, entering low the way a new
    // player would rather than landing near the top.
    if (rows.length < ladderSize) {
      const present = new Set(rows.map((r) => String((r as any).userId)));
      const onBoard = await SyntheticScore.find({ type: period.type, periodLabel: period.label })
        .select('userId')
        .lean();
      for (const r of onBoard) present.add(String(r.userId));

      const candidates = shuffled((await syntheticIds()).filter((id) => !present.has(String(id))));
      const wanted = Math.min(candidates.length, ladderSize - rows.length, randInt(1, 2));

      const inserts = candidates.slice(0, wanted).map((userId) => ({
        updateOne: {
          filter: { userId, type: period.type, periodLabel: period.label },
          update: {
            $setOnInsert: {
              userId,
              type: period.type,
              periodLabel: period.label,
              // Entering, not arriving at the top: the low end of the range.
              points: Math.max(1, Math.round(skewedUnit() * 0.35 * cap)),
            },
          },
          upsert: true,
        },
      }));

      if (inserts.length) {
        const res = await SyntheticScore.bulkWrite(inserts, { ordered: false });
        added += res.upsertedCount ?? 0;
      }
    }
  }

  return { bumped, added };
}

export async function trickleSyntheticActivity(
  at: Date = new Date(),
): Promise<{ daily: number; bumped: number; added: number; skipped?: string }> {
  const none = { daily: 0, bumped: 0, added: 0 };
  if (!(await syntheticsEnabled())) return { ...none, skipped: 'disabled' };

  const dueAt = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_NEXT_TRICKLE, 0));
  if (at.getTime() < dueAt) return { ...none, skipped: 'not_due' };

  // Book the next one first: a slow run must not let the next tick fire too.
  await setSetting(
    SETTINGS_KEYS.SYNTHETIC_NEXT_TRICKLE,
    at.getTime() + randInt(TRICKLE_MIN_MS, TRICKLE_MAX_MS),
  );

  await ensureSyntheticPool();

  const daily = await trickleDaily(at.toISOString().slice(0, 10));
  const { bumped, added } = await trickleLadder(at);
  // Keep the league groups populated and moving too — they were the one
  // board house accounts never reached.
  await seedSyntheticLeague(at);
  const leagueBumped = await trickleSyntheticLeague(at);

  logger.info('Synthetic activity trickled', { daily, bumped, added, leagueBumped });
  return { daily, bumped, added };
}

/* ───────────────────────────── Leagues ─────────────────────────────────── */

/**
 * Put house accounts in the weekly league groups.
 *
 * Leagues fill through `addLeagueXp`, which only real play triggers — so
 * house accounts never joined one and a new player found themselves in a
 * Bronze group of five. A league of five has no ladder to climb and no
 * podium worth winning.
 *
 * It goes through `addLeagueXp` rather than writing memberships directly, so
 * group sizing, seat allocation and the promotion maths stay in one place.
 * Their tier is whatever the account holds, which starts at Bronze — so they
 * fill the bottom first, exactly where a new player lands, and the weekly
 * settlement promotes the strong ones out over time on the same rules as
 * everyone else.
 *
 * XP is capped per account by strength, so the podium stays winnable: these
 * are there to make the group a contest, not to occupy the top three.
 */
const LEAGUE_TARGET = 26; // a full group is 30; leave room for real players
const LEAGUE_XP_CEILING = 900;

export async function seedSyntheticLeague(
  at: Date = new Date(),
  target = LEAGUE_TARGET,
): Promise<{ joined: number; skipped?: string }> {
  if (!(await syntheticsEnabled())) return { joined: 0, skipped: 'disabled' };

  const { addLeagueXp } = await import('./leagueService');
  const { week } = (await import('./leagueService')).currentWeek(at);
  const { LeagueMember } = await import('../models/League');

  await ensureSyntheticPool();
  const ids = await syntheticIds();
  if (!ids.length) return { joined: 0 };

  const already = await LeagueMember.find({ week, userId: { $in: ids } })
    .select('userId')
    .lean();
  const have = new Set(already.map((m) => String(m.userId)));

  const missing = shuffled(ids.filter((id) => !have.has(String(id))));
  const wanted = Math.max(0, Math.min(missing.length, target - have.size));

  const strengths = await strengthByUser();
  let joined = 0;
  for (const userId of missing.slice(0, wanted)) {
    const strength = strengths.get(String(userId)) ?? 0.1;
    // Spread across the week's plausible range, topping out below the
    // ceiling for all but the strongest.
    const xp = Math.max(10, Math.round(LEAGUE_XP_CEILING * strength * (0.3 + Math.random() * 0.6)));
    await addLeagueXp(String(userId), xp);
    joined += 1;
  }

  if (joined) logger.info('Seeded synthetic league members', { week, joined });
  return { joined };
}

/** A little XP onto some of them, so the group moves between visits. */
export async function trickleSyntheticLeague(at: Date = new Date()): Promise<number> {
  if (!(await syntheticsEnabled())) return 0;

  const { addLeagueXp } = await import('./leagueService');
  const { week } = (await import('./leagueService')).currentWeek(at);
  const { LeagueMember } = await import('../models/League');

  const ids = await syntheticIds();
  if (!ids.length) return 0;

  const rows = await LeagueMember.find({ week, userId: { $in: ids } })
    .select('userId xp')
    .lean();
  if (!rows.length) return 0;

  const strengths = await strengthByUser();
  const slice = shuffled(rows).slice(0, Math.max(1, Math.round(rows.length * 0.3)));

  let bumped = 0;
  for (const row of slice) {
    const strength = strengths.get(String(row.userId)) ?? 0.1;
    const ceiling = Math.round(LEAGUE_XP_CEILING * (0.35 + strength * 0.65));
    if ((row.xp ?? 0) >= ceiling) continue;
    await addLeagueXp(String(row.userId), randInt(5, 40));
    bumped += 1;
  }
  return bumped;
}
