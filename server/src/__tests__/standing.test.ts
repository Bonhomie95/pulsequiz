/**
 * Standing must be correct AND cheap.
 *
 * The home screen calls this on every load for the majority of players — the
 * ones outside the top 100 — so a period-wide aggregation here would be the
 * same mistake as rebuilding the leaderboard on every quiz finish.
 */
import mongoose from 'mongoose';

import QuizSession from '../models/QuizSession';
import User from '../models/User';
import Progress from '../models/Progress';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import { buildLeaderboard, getUserStanding } from '../services/leaderboardService';
import { ensureIndexes } from './setup';

const ids: string[] = [];

async function seedPlayers(count: number) {
  ids.length = 0;
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const user = await User.create({
      email: `p${i}@example.com`,
      provider: 'google',
      providerId: `p${i}`,
      username: `player${i}`,
      avatar: 'avatar0',
    });
    ids.push(user._id.toString());
    await Progress.create({ userId: user._id, points: (count - i) * 10 });

    // Player i scores (count - i) * 10, so player 0 is top.
    await QuizSession.create({
      userId: user._id,
      sessionId: new mongoose.Types.ObjectId(),
      category: 'math',
      score: 10,
      bonus: 0,
      totalPoints: (count - i) * 10,
      correctAnswers: 10,
      totalQuestions: 10,
      levelAtTime: 1,
      createdAt: now,
    });
  }
}

beforeEach(async () => {
  await ensureIndexes(QuizSession);
});

describe('getUserStanding', () => {
  it('gives an exact rank for a player on the board', async () => {
    await seedPlayers(10);
    await buildLeaderboard('weekly');

    const top = await getUserStanding(ids[0], 'weekly', 3);
    expect(top.rank).toBe(1);
    expect(top.points).toBe(100);
    expect(top.pointsToPaidTier).toBe(0);
    expect(top.outsideBoard).toBe(false);

    const fifth = await getUserStanding(ids[4], 'weekly', 3);
    expect(fifth.rank).toBe(5);
    // 60 points, needs to pass the 3rd place score of 80 → 21 more.
    expect(fifth.pointsToPaidTier).toBe(21);
  });

  it('reports how far a player outside the board has to climb', async () => {
    // 105 players — the board stores 100, so the bottom five are off it.
    await seedPlayers(105);
    await buildLeaderboard('weekly');

    const last = await getUserStanding(ids[104], 'weekly', 3);

    expect(last.rank).toBeNull();
    expect(last.outsideBoard).toBe(true);
    expect(last.points).toBe(10);
    // Must pass the 100th-placed player to appear at all.
    expect(last.pointsToBoard).toBeGreaterThan(0);
    expect(last.pointsToPaidTier).toBeGreaterThan(last.pointsToBoard!);
  });

  it('returns an empty standing for a player who has not scored', async () => {
    await seedPlayers(3);
    await buildLeaderboard('weekly');

    const fresh = await User.create({
      email: 'fresh@example.com',
      provider: 'google',
      providerId: 'fresh',
      username: 'freshplayer',
      avatar: 'avatar0',
    });

    const standing = await getUserStanding(fresh._id.toString(), 'weekly', 3);
    expect(standing).toEqual({
      rank: null,
      points: 0,
      pointsToPaidTier: null,
      pointsToBoard: null,
      outsideBoard: false,
    });
  });

  it('treats any score as qualifying when there are fewer players than paid ranks', async () => {
    await seedPlayers(2);
    await buildLeaderboard('weekly');

    const standing = await getUserStanding(ids[1], 'weekly', 10);
    expect(standing.pointsToPaidTier).toBe(0);
  });

  it('works for the all-time board too', async () => {
    await seedPlayers(5);
    await buildLeaderboard('all');

    const standing = await getUserStanding(ids[0], 'all');
    expect(standing.rank).toBe(1);
    expect(standing.points).toBe(50);
  });

  it('does not scan the whole period — only the caller and the snapshot', async () => {
    await seedPlayers(105);
    await buildLeaderboard('weekly');

    // Count the aggregations that touch QuizSession without a userId filter.
    // A period-wide scan is exactly what this function must never do.
    const original = QuizSession.aggregate.bind(QuizSession);
    const pipelines: any[] = [];
    (QuizSession as any).aggregate = (pipeline: any[], ...rest: any[]) => {
      pipelines.push(pipeline);
      return original(pipeline, ...rest);
    };

    try {
      await getUserStanding(ids[104], 'weekly', 3);
    } finally {
      (QuizSession as any).aggregate = original;
    }

    expect(pipelines).toHaveLength(1);
    const match = pipelines[0][0].$match;
    expect(match.userId).toBeDefined();
  });
});

describe('buildLeaderboard', () => {
  it('excludes banned accounts so they cannot hold a paid rank', async () => {
    await seedPlayers(5);
    await User.updateOne({ _id: ids[0] }, { $set: { isBanned: true } });

    const board = await buildLeaderboard('weekly');

    expect(board.find((e) => e.userId === ids[0])).toBeUndefined();
    // Ranks must close up, not leave a hole.
    expect(board[0].rank).toBe(1);
    expect(board[0].userId).toBe(ids[1]);
  });

  it('stores the period label alongside the rows', async () => {
    await seedPlayers(3);
    await buildLeaderboard('weekly');

    const snap = await LeaderboardSnapshot.findOne({ type: 'weekly' }).lean();
    expect(snap?.periodLabel).toMatch(/^\d{4}-W\d{2}$/);
  });
});
