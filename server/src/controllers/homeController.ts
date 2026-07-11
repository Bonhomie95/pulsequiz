import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizSession from '../models/QuizSession';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import PrizePool from '../models/PrizePool';
import User from '../models/User';
import { getPeriodLabel } from '../services/payoutService';
import { seedChallengesForUser } from '../services/challengeService';

export async function getHomeSummary(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  // Auto-seed daily/weekly challenges if none exist for this period (fire-and-forget)
  seedChallengesForUser(userId).catch(() => {});

  const [
    wallet,
    streakDoc,
    lastSession,
    weeklySnapshot,
    monthlySnapshot,
    allSnapshot,
  ] = await Promise.all([
    CoinWallet.findOne({ userId }).lean(),
    Streak.findOne({ userId }).lean(),
    QuizSession.findOne({ userId })
      .sort({ createdAt: -1 })
      .select('category score createdAt')
      .lean(),
    LeaderboardSnapshot.findOne({ type: 'weekly' }).lean(),
    LeaderboardSnapshot.findOne({ type: 'monthly' }).lean(),
    LeaderboardSnapshot.findOne({ type: 'all' }).lean(),
  ]);

  // My current weekly rank (null if not in top 100)
  let myWeeklyRank: number | null = null;
  if (weeklySnapshot) {
    const idx = weeklySnapshot.data.findIndex((e: any) => e.userId === userId);
    myWeeklyRank = idx >= 0 ? idx + 1 : null;
  }

  let myMonthlyRank: number | null = null;
  if (monthlySnapshot) {
    const idx = monthlySnapshot.data.findIndex((e: any) => e.userId === userId);
    myMonthlyRank = idx >= 0 ? idx + 1 : null;
  }

  let myAllTimeRank: number | null = null;
  if (allSnapshot) {
    const idx = allSnapshot.data.findIndex((e: any) => e.userId === userId);
    myAllTimeRank = idx >= 0 ? idx + 1 : null;
  }

  // Paid ranks for current weekly period (how many top spots get prizes)
  let weeklyPaidRanks: number | null = null;
  try {
    const periodLabel = getPeriodLabel('weekly');
    const pool = await PrizePool.findOne({
      type: 'weekly',
      periodLabel,
    }).lean();
    weeklyPaidRanks = pool?.paidRanks ?? null;
  } catch {
    /* non-critical */
  }

  return res.json({
    coins: wallet?.coins ?? 0,
    streak: streakDoc?.streak ?? 0,
    lastCheckIn: streakDoc?.lastCheckIn ?? null,

    myWeeklyRank, // user's current rank this week (null = not in top 100)
    myMonthlyRank, // user's current rank this month
    myAllTimeRank, // user's all-time rank
    weeklyPaidRanks, // how many players get prizes this week (null = no pool set)

    lastQuiz: lastSession
      ? {
          category: lastSession.category,
          score: lastSession.score,
          playedAt: lastSession.createdAt,
        }
      : { category: null, score: null, playedAt: null },
  });
}

/**
 * GET /home/ready-players
 * Returns recently active public users for the "ready to play" carousel.
 * Excludes the calling user and users who set publicProfile = false.
 */
export async function getReadyPlayers(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // active in last 24h

  // Find users who played recently and have publicProfile enabled
  const recentSessions = await QuizSession.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$userId' } },
    { $limit: 100 },
  ]);
  const recentUserIds = recentSessions
    .map((s) => s._id.toString())
    .filter((id) => id !== userId);

  const users = await User.find({
    _id: { $in: recentUserIds },
    publicProfile: { $ne: false },
    isBanned: false,
    username: { $ne: null },
  })
    .select('username avatar')
    .limit(20)
    .lean();

  return res.json({ players: users });
}
