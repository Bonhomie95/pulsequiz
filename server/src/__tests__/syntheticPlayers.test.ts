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
import { initDefaultSettings, SETTINGS_KEYS, setSetting, clearSettingsCache } from '../models/AppSettings';
import { buildLeaderboard } from '../services/leaderboardService';
import {
  ensureSyntheticPool,
  purgeSyntheticPlayers,
  seedSyntheticDaily,
  seedSyntheticLadder,
} from '../services/syntheticPlayers';
import { generateNicknames } from '../services/nicknames';
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
