import QuizSession from '../models/QuizSession';
import Progress from '../models/Progress';
import User from '../models/User';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';

type Type = 'weekly' | 'monthly' | 'all';

function getDateRange(type: Type) {
  const now = new Date();

  if (type === 'weekly') {
    const day = now.getDay(); // 0 = Sun, 1 = Mon
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const start = new Date(now);
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  if (type === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  return null;
}

/**
 * Build leaderboard dynamically
 */
export async function buildLeaderboard(type: Type) {
  let rows: { userId: string; points: number }[] = [];

  if (type === 'all') {
    const all = await Progress.find().sort({ points: -1 }).limit(100).lean();

    rows = all.map((p) => ({
      userId: p.userId.toString(),
      points: p.points,
    }));
  } else {
    const range = getDateRange(type);
    if (!range) return [];

    const agg = await QuizSession.aggregate([
      {
        $match: {
          createdAt: {
            $gte: range.start,
            $lte: range.end,
          },
        },
      },
      {
        $group: {
          _id: '$userId',
          points: { $sum: '$totalPoints' },
        },
      },
      { $sort: { points: -1 } },
      { $limit: 100 },
    ]);

    rows = agg.map((r) => ({
      userId: r._id.toString(),
      points: r.points,
    }));
  }

  const userIds = rows.map((r) => r.userId);

  const users = await User.find({ _id: { $in: userIds } })
    .select('username avatar')
    .lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const data = rows.map((r, index) => {
    const u = userMap.get(r.userId);
    return {
      userId: r.userId,
      username: u?.username ?? 'Anonymous',
      avatar: u?.avatar ?? '',
      points: r.points,
      rank: index + 1,
    };
  });

  // cache snapshot
  await LeaderboardSnapshot.updateOne(
    { type },
    { data, generatedAt: new Date() },
    { upsert: true }
  );

  return data;
}

/**
 * Rebuild all snapshots (called after quiz finish)
 */
export async function rebuildLeaderboardSnapshots() {
  await buildLeaderboard('weekly');
  await buildLeaderboard('monthly');
  await buildLeaderboard('all');
}
