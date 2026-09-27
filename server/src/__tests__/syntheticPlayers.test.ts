/**
 * House accounts pad the boards so a new player never sees an empty one — but
 * the boards also decide real USDT payouts, so the line that matters is that a
 * house account can never hold a paying rank. That is enforced in
 * `buildLeaderboard`, not by convention, and is the first thing tested here.
 */
import User from '../models/User';
import Progress from '../models/Progress';
import { DailyAttempt } from '../models/DailyQuiz';
import { SyntheticScore } from '../models/SyntheticScore';
import {
  initDefaultSettings,
  SETTINGS_KEYS,
  setSetting,
  getSetting,
  clearSettingsCache,
} from '../models/AppSettings';
import { buildLeaderboard } from '../services/leaderboardService';
import {
  ensureSyntheticPool,
  growSyntheticLadder,
  purgeSyntheticPlayers,
  seedSyntheticDaily,
  seedSyntheticLadder,
  trickleSyntheticActivity,
  seedSyntheticLeague,
  respreadSyntheticLadder,
  reconcileSyntheticBoards,
} from '../services/syntheticPlayers';
import { generateNicknames } from '../services/nicknames';
import { LeagueGroup, LeagueMember } from '../models/League';
import { currentWeek, GROUP_SIZE } from '../services/leagueService';
import { currentPeriodLabel } from '../utils/dateRanges';

beforeEach(async () => {
  await initDefaultSettings();
  clearSettingsCache();
});

describe('nicknames', () => {
  it('produces distinct, human-looking handles', () => {
    const nicks = generateNicknames(150);
    expect(nicks.length).toBeGreaterThan(100);
    expect(new Set(nicks.map((n) => n.toLowerCase())).size).toBe(nicks.length);
    for (const n of nicks) {
      expect(n.length).toBeGreaterThanOrEqual(3);
      // The smell to avoid is a handle that announces itself as generated.
      // Matching these as substrings would fail honest names — "CalebOtter"
      // contains "bot".
      expect(n).not.toMatch(/^(bot|fake|test|user|player|synthetic)/i);
      expect(n).not.toMatch(/\d{4,}$/);
    }
  });

  it('avoids handles that are already taken', () => {
    const taken = new Set(generateNicknames(40));
    const fresh = generateNicknames(40, taken);
    for (const n of fresh) {
      expect([...taken].map((t) => t.toLowerCase())).not.toContain(n.toLowerCase());
    }
  });
});

describe('the pool', () => {
  it('creates accounts flagged synthetic and does not duplicate them', async () => {
    await ensureSyntheticPool(25);
    const first = await User.countDocuments({ isSynthetic: true });
    expect(first).toBeGreaterThan(15);

    await ensureSyntheticPool(25);
    expect(await User.countDocuments({ isSynthetic: true })).toBe(first);
  });

  it('cannot be reached by a real OAuth sign-in', async () => {
    await ensureSyntheticPool(5);
    const u = await User.findOne({ isSynthetic: true }).lean();
    expect(u!.email).toMatch(/@pulsequiz\.invalid$/);
    expect(u!.providerId).toMatch(/^synthetic:/);
  });
});

describe('the daily board', () => {
  it('fills a date with plausible, varied scores', async () => {
    await setSetting(SETTINGS_KEYS.SYNTHETIC_DAILY_MIN, 30);
    await setSetting(SETTINGS_KEYS.SYNTHETIC_DAILY_MAX, 40);
    clearSettingsCache();
    await ensureSyntheticPool(50);

    const { seeded } = await seedSyntheticDaily('2026-09-26');
    expect(seeded).toBeGreaterThanOrEqual(30);

    const rows = await DailyAttempt.find({ date: '2026-09-26' }).lean();
    expect(rows.length).toBe(seeded);

    for (const r of rows) {
      expect(r.correct).toBeGreaterThanOrEqual(0);
      expect(r.correct).toBeLessThanOrEqual(10);
      expect(r.results.filter(Boolean).length).toBe(r.correct);
      expect(r.finishedAt).toBeTruthy();
    }

    // A board where everyone scored the same would be obvious filler.
    expect(new Set(rows.map((r) => r.correct)).size).toBeGreaterThan(2);
  });

  it('is safe to run twice for the same date', async () => {
    await ensureSyntheticPool(20);
    await seedSyntheticDaily('2026-09-27');
    const after = await DailyAttempt.countDocuments({ date: '2026-09-27' });

    const second = await seedSyntheticDaily('2026-09-27');
    expect(second.seeded).toBe(0);
    expect(await DailyAttempt.countDocuments({ date: '2026-09-27' })).toBe(after);
  });

  it('does nothing when the padding is switched off', async () => {
    await setSetting(SETTINGS_KEYS.SYNTHETIC_ENABLED, false);
    clearSettingsCache();
    const res = await seedSyntheticDaily('2026-09-28');
    expect(res).toEqual({ seeded: 0, skipped: 'disabled' });
    expect(await DailyAttempt.countDocuments({ date: '2026-09-28' })).toBe(0);
  });
});

describe('the weekly / monthly / all-time boards', () => {
  beforeEach(async () => {
    await setSetting(SETTINGS_KEYS.SYNTHETIC_LADDER_SIZE, 30);
    await setSetting(SETTINGS_KEYS.SYNTHETIC_POINTS_CEILING, 100);
    clearSettingsCache();
    await ensureSyntheticPool(40);
  });

  it('shows house accounts to players', async () => {
    await seedSyntheticLadder();
    const board = await buildLeaderboard('weekly');
    expect(board.length).toBeGreaterThan(10);

    const ids = board.map((e) => e.userId);
    const synthetic = await User.countDocuments({ _id: { $in: ids }, isSynthetic: true });
    expect(synthetic).toBeGreaterThan(0);
  });

  it('keeps every house account out of the ranking used for payouts', async () => {
    await seedSyntheticLadder();

    const payoutBoard = await buildLeaderboard('weekly', undefined, { excludeSynthetic: true });
    const ids = payoutBoard.map((e) => e.userId);
    expect(await User.countDocuments({ _id: { $in: ids }, isSynthetic: true })).toBe(0);
  });

  it('does not let a house account push a real player out of a paying rank', async () => {
    // One real player, scoring less than the house accounts can.
    const real = await User.create({
      email: 'real@example.com', provider: 'google', providerId: 'real-1',
      username: 'realplayer', avatar: 'avatar0',
    });
    await Progress.create({ userId: real._id, points: 5 });
    await seedSyntheticLadder();

    // On the visible all-time board they may well sit above the real player…
    const shown = await buildLeaderboard('all');
    expect(shown.length).toBeGreaterThan(1);

    // …but the payout ranking has them gone, so the real player is rank 1 and
    // collects whatever the top tier pays.
    const forPayout = await buildLeaderboard('all', undefined, { excludeSynthetic: true });
    expect(forPayout.map((e) => e.userId)).toEqual([String(real._id)]);
    expect(forPayout[0].rank).toBe(1);
  });

  it('leaves the stored snapshot alone when ranking for a payout', async () => {
    await seedSyntheticLadder();
    const shown = await buildLeaderboard('weekly');
    expect(shown.length).toBeGreaterThan(0);

    await buildLeaderboard('weekly', undefined, { excludeSynthetic: true });

    // What players see must be unchanged by a payout run.
    const again = await buildLeaderboard('weekly');
    expect(again.length).toBe(shown.length);
  });

  it('holds house scores under the configured ceiling', async () => {
    await seedSyntheticLadder();
    const weekly = await SyntheticScore.find({
      type: 'weekly',
      periodLabel: currentPeriodLabel('weekly'),
    }).lean();

    expect(weekly.length).toBeGreaterThan(0);
    for (const row of weekly) expect(row.points).toBeLessThanOrEqual(100);
  });

  it('does not reshuffle a board it has already seeded', async () => {
    await seedSyntheticLadder();
    const before = await SyntheticScore.find({ type: 'weekly' }).sort({ userId: 1 }).lean();

    await seedSyntheticLadder();
    const after = await SyntheticScore.find({ type: 'weekly' }).sort({ userId: 1 }).lean();

    expect(after.map((r) => r.points)).toEqual(before.map((r) => r.points));
  });
});

describe('daily growth', () => {
  beforeEach(async () => {
    await setSetting(SETTINGS_KEYS.SYNTHETIC_LADDER_SIZE, 20);
    await setSetting(SETTINGS_KEYS.SYNTHETIC_POINTS_CEILING, 100);
    await setSetting(SETTINGS_KEYS.SYNTHETIC_DAILY_GROWTH, 25);
    clearSettingsCache();
    await ensureSyntheticPool(25);
    await seedSyntheticLadder();
  });

  it('raises standings so the board stays a contest', async () => {
    const before = await SyntheticScore.find({ type: 'weekly' }).sort({ _id: 1 }).lean();
    const res = await growSyntheticLadder();
    expect(res.grown).toBeGreaterThan(0);

    const after = await SyntheticScore.find({ type: 'weekly' }).sort({ _id: 1 }).lean();

    // The board as a whole moves up. Not every row: each account has its own
    // ceiling, and one already at it stops there — which is what lets a real
    // player overtake rather than chase a number that keeps running away.
    const sum = (rows: { points: number }[]) => rows.reduce((a, r) => a + r.points, 0);
    expect(sum(after)).toBeGreaterThan(sum(before));
    for (let i = 0; i < before.length; i++) {
      expect(after[i].points).toBeGreaterThanOrEqual(before[i].points);
    }
  });

  it('never lifts an account past its own ceiling, however many days pass', async () => {
    // The drift used to be a bare $inc, so it walked accounts straight past
    // the cap that the seed and the trickle both respect — the live weekly
    // board had entries above it.
    const ceiling = 100;
    let at = new Date();
    for (let day = 0; day < 40; day++) {
      at = new Date(at.getTime() + 86_400_000);
      await growSyntheticLadder(at);
    }

    const rows = await SyntheticScore.find({ type: 'weekly' }).lean();
    for (const r of rows) expect(r.points).toBeLessThanOrEqual(ceiling);

    // And they must not all pile onto the same number: a wall of identical
    // scores at the top is the thing that reads as generated.
    const top = rows.map((r) => r.points).sort((a, b) => b - a).slice(0, 8);
    expect(new Set(top).size).toBeGreaterThan(1);
  });

  it('grows once a day however often it runs', async () => {
    await growSyntheticLadder();
    const after = await SyntheticScore.find({ type: 'weekly' }).sort({ _id: 1 }).lean();

    await growSyntheticLadder();
    await growSyntheticLadder();
    const later = await SyntheticScore.find({ type: 'weekly' }).sort({ _id: 1 }).lean();

    expect(later.map((r) => r.points)).toEqual(after.map((r) => r.points));
  });

  it('grows again the next day', async () => {
    await growSyntheticLadder();
    const day1 = await SyntheticScore.find({ type: 'weekly' }).sort({ _id: 1 }).lean();

    const tomorrow = new Date(Date.now() + 86_400_000);
    const res = await growSyntheticLadder(tomorrow);
    expect(res.grown).toBeGreaterThan(0);

    const day2 = await SyntheticScore.find({ type: 'weekly' }).sort({ _id: 1 }).lean();
    const sum = (rows: { points: number }[]) => rows.reduce((a, r) => a + r.points, 0);
    expect(sum(day2)).toBeGreaterThan(sum(day1));
    for (let i = 0; i < day1.length; i++) {
      expect(day2[i].points).toBeGreaterThanOrEqual(day1[i].points);
    }
  });

  it('does nothing when the padding is switched off', async () => {
    await setSetting(SETTINGS_KEYS.SYNTHETIC_ENABLED, false);
    clearSettingsCache();
    expect(await growSyntheticLadder()).toEqual({ grown: 0, skipped: 'disabled' });
  });
});

describe('purging', () => {
  it('removes the accounts and everything they hold, and turns the padding off', async () => {
    await ensureSyntheticPool(15);
    await seedSyntheticDaily('2026-09-29');
    await seedSyntheticLadder();

    await purgeSyntheticPlayers();

    expect(await User.countDocuments({ isSynthetic: true })).toBe(0);
    expect(await SyntheticScore.countDocuments({})).toBe(0);
    expect(await DailyAttempt.countDocuments({ date: '2026-09-29' })).toBe(0);

    clearSettingsCache();
    const res = await seedSyntheticDaily('2026-09-30');
    expect(res.skipped).toBe('disabled');
  });
});

describe('arrivals between the daily seeds', () => {
  it('adds a few Daily entries, and only when its interval is up', async () => {
    await ensureSyntheticPool(40);
    const date = new Date().toISOString().slice(0, 10);

    const first = await trickleSyntheticActivity();
    expect(first.skipped).toBeUndefined();
    expect(first.daily).toBeGreaterThanOrEqual(2);
    expect(first.daily).toBeLessThanOrEqual(5);

    const afterFirst = await DailyAttempt.countDocuments({ date });

    // Straight away again: the next one is booked 30–45 minutes out, so this
    // must do nothing rather than dumping another batch on the board.
    const second = await trickleSyntheticActivity();
    expect(second.skipped).toBe('not_due');
    expect(await DailyAttempt.countDocuments({ date })).toBe(afterFirst);

    // Once that interval has passed, more arrive.
    const later = new Date(Date.now() + 46 * 60_000);
    const third = await trickleSyntheticActivity(later);
    expect(third.skipped).toBeUndefined();
    expect(third.daily).toBeGreaterThan(0);
  });

  it('nudges standings up without ever passing the ceiling', async () => {
    await ensureSyntheticPool(40);
    await seedSyntheticLadder();

    const ceiling = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_POINTS_CEILING, 140));
    const before = await SyntheticScore.find({ type: 'weekly' }).select('points').lean();
    const beforeTotal = before.reduce((a, r) => a + (r.points ?? 0), 0);

    await trickleSyntheticActivity();

    const after = await SyntheticScore.find({ type: 'weekly' }).select('points').lean();
    expect(after.reduce((a, r) => a + (r.points ?? 0), 0)).toBeGreaterThan(beforeTotal);

    // The whole point of these accounts is being overtakeable.
    for (const row of after) expect(row.points).toBeLessThanOrEqual(ceiling);
  });
});

describe('leagues', () => {
  it('fills the weekly group, so a new player is not alone in Bronze', async () => {
    // Leagues fill through addLeagueXp, which only real play triggers — so
    // house accounts never joined one and Bronze held five people.
    await ensureSyntheticPool(40);

    const res = await seedSyntheticLeague(new Date(), 26);
    expect(res.joined).toBeGreaterThan(20);

    const { week } = currentWeek();
    const members = await LeagueMember.find({ week }).lean();
    expect(members.length).toBeGreaterThan(20);

    // Groups are capped, and the seat count must match the memberships —
    // this goes through the real join path precisely so that holds.
    const groups = await LeagueGroup.find({ week }).lean();
    const seats = groups.reduce((a, g) => a + g.size, 0);
    expect(seats).toBe(members.length);
    for (const g of groups) expect(g.size).toBeLessThanOrEqual(GROUP_SIZE);
  });

  it('leaves the podium winnable', async () => {
    await ensureSyntheticPool(40);
    await seedSyntheticLeague(new Date(), 26);

    const { week } = currentWeek();
    const xp = (await LeagueMember.find({ week }).select('xp').lean()).map((m) => m.xp);

    // A real player has to be able to reach the top three. Nobody parked at
    // an unreachable number, and not everyone on the same one.
    expect(Math.max(...xp)).toBeLessThan(1000);
    expect(new Set(xp).size).toBeGreaterThan(5);
  });

  it('does not seat the same account twice however often it runs', async () => {
    await ensureSyntheticPool(40);
    await seedSyntheticLeague(new Date(), 26);
    const first = await LeagueMember.countDocuments({});

    await seedSyntheticLeague(new Date(), 26);
    await seedSyntheticLeague(new Date(), 26);

    expect(await LeagueMember.countDocuments({})).toBe(first);
  });
});

describe('board reconciliation', () => {
  it('puts every account on every board', async () => {
    // Arrivals used to join one period at a time, so 72 accounts held a
    // monthly standing with no all-time row — one sat 3rd for the month
    // while their profile showed no all-time rank and three games played.
    await ensureSyntheticPool(30);
    await seedSyntheticLadder();

    // Strand someone who is on a board, the way the old arrival path did.
    const seeded = await SyntheticScore.findOne({ type: 'monthly' }).lean();
    const orphanId = seeded!.userId;
    await SyntheticScore.deleteMany({ userId: orphanId, type: { $in: ['all', 'weekly'] } });
    expect(await SyntheticScore.countDocuments({ userId: orphanId })).toBe(1);

    await respreadSyntheticLadder();

    const types = (await SyntheticScore.find({ userId: orphanId }).lean()).map((r) => r.type);
    expect(types.sort()).toEqual(['all', 'monthly', 'weekly']);
  });

  it('spreads the top instead of stacking it on one number', async () => {
    // Thirteen accounts sat on exactly 1,120 under a single global cap, so
    // the board listed them 2nd to 14th while every profile said "#2".
    await ensureSyntheticPool(40);
    await seedSyntheticLadder();
    await SyntheticScore.updateMany({ type: 'all' }, { $set: { points: 1120 } });

    await respreadSyntheticLadder();

    const top = (
      await SyntheticScore.find({ type: 'all' }).sort({ points: -1 }).limit(10).lean()
    ).map((r) => r.points);
    expect(new Set(top).size).toBeGreaterThan(6);
  });

  it('converges rather than drifting when run repeatedly', async () => {
    await ensureSyntheticPool(20);
    await seedSyntheticLadder();
    const ceiling = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_POINTS_CEILING, 140));

    for (let i = 0; i < 5; i++) await respreadSyntheticLadder();

    // Still under the ceiling the whole scheme exists to respect.
    const weekly = await SyntheticScore.find({ type: 'weekly' }).lean();
    for (const r of weekly) expect(r.points).toBeLessThanOrEqual(ceiling);
  });
});

describe('the hourly reconcile', () => {
  it('leaves standings where the drift put them', async () => {
    // This runs every hour. A full respread here would overwrite the drift
    // each time and the board would jump about instead of creeping up, which
    // is the whole point of the drift.
    await ensureSyntheticPool(20);
    await seedSyntheticLadder();

    const before = await SyntheticScore.find({ type: 'weekly' }).sort({ _id: 1 }).lean();
    await reconcileSyntheticBoards();
    const after = await SyntheticScore.find({ type: 'weekly' }).sort({ _id: 1 }).lean();

    expect(after.map((r) => r.points)).toEqual(before.map((r) => r.points));
  });

  it('still fills a missing board and clamps an over-ceiling row', async () => {
    await ensureSyntheticPool(20);
    await seedSyntheticLadder();
    const ceiling = Number(await getSetting(SETTINGS_KEYS.SYNTHETIC_POINTS_CEILING, 140));

    const seeded = await SyntheticScore.findOne({ type: 'monthly' }).lean();
    await SyntheticScore.deleteMany({ userId: seeded!.userId, type: 'weekly' });
    await SyntheticScore.updateOne({ _id: seeded!._id }, { $set: { points: 99_999 } });

    const res = await reconcileSyntheticBoards();
    expect(res.filled).toBeGreaterThan(0);
    expect(res.clamped).toBeGreaterThan(0);

    const fixed = await SyntheticScore.findOne({ _id: seeded!._id }).lean();
    expect(fixed!.points).toBeLessThanOrEqual(Math.round(ceiling * 3.5));
    expect(
      await SyntheticScore.countDocuments({ userId: seeded!.userId, type: 'weekly' }),
    ).toBe(1);
  });
});
