import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizSession from '../models/QuizSession';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import PrizePool from '../models/PrizePool';
import User from '../models/User';
import Progress from '../models/Progress';
import { currentPeriodLabel } from '../utils/dateRanges';
import { getUserStanding } from '../services/leaderboardService';
import { seedChallengesForUser } from '../services/challengeService';
import { getAdRewardConfig } from '../services/adRewardService';

/** Rank within a snapshot, or null when the user isn't in the stored top N. */
function rankIn(snapshot: { data: any[] } | null, userId: string): number | null {
  if (!snapshot) return null;
  const idx = snapshot.data.findIndex((e: any) => e.userId === userId);
  return idx >= 0 ? idx + 1 : null;
}

export async function getHomeSummary(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  // Auto-seed daily/weekly challenges if none exist for this period.
  seedChallengesForUser(userId).catch(() => {});

  const weeklyLabel = currentPeriodLabel('weekly');

  const [
    wallet,
    streakDoc,
    progress,
    lastSession,
    weeklySnapshot,
    monthlySnapshot,
    allSnapshot,
    weeklyPool,
    adConfig,
  ] = await Promise.all([
    CoinWallet.findOne({ userId }).select('coins').lean(),
    Streak.findOne({ userId }).lean(),
    Progress.findOne({ userId }).select('points level totalQuizzes').lean(),
    QuizSession.findOne({ userId })
      .sort({ createdAt: -1 })
      .select('category score createdAt')
      .lean(),
    LeaderboardSnapshot.findOne({ type: 'weekly' }).lean(),
    LeaderboardSnapshot.findOne({ type: 'monthly' }).lean(),
    LeaderboardSnapshot.findOne({ type: 'all' }).lean(),
    PrizePool.findOne({ type: 'weekly', periodLabel: weeklyLabel }).lean(),
    getAdRewardConfig(),
  ]);

  const paidRanks = weeklyPool?.paidRanks ?? null;

  const myWeeklyRank = rankIn(weeklySnapshot, userId);

  // The number that motivates a player who isn't on the board yet. Only worth
  // computing when they aren't already ranked — and it costs one index-backed
  // read plus the snapshot we've already loaded, not a period-wide scan.
  let standing: Awaited<ReturnType<typeof getUserStanding>> | null = null;
  if (myWeeklyRank === null) {
    standing = await getUserStanding(userId, 'weekly', paidRanks);
  }

  const pointsToPaidTier =
    myWeeklyRank !== null && paidRanks
      ? myWeeklyRank <= paidRanks
        ? 0
        : null
      : (standing?.pointsToPaidTier ?? null);

  return res.json({
    coins: wallet?.coins ?? 0,
    streak: streakDoc?.streak ?? 0,
    lastCheckIn: streakDoc?.lastCheckIn ?? null,

    level: progress?.level ?? 1,
    points: progress?.points ?? 0,
    totalQuizzes: progress?.totalQuizzes ?? 0,

    myWeeklyRank,
    myMonthlyRank: rankIn(monthlySnapshot, userId),
    myAllTimeRank: rankIn(allSnapshot, userId),
    weeklyPaidRanks: paidRanks,
    // How many points from the prize tier, or 0 when already inside it.
    pointsToPaidTier,
    weeklyPoints: standing?.points ?? null,
    pointsToBoard: standing?.pointsToBoard ?? null,

    // The client renders the reward the server will actually pay, rather than
    // a hardcoded number that can drift out of sync with the settings.
    adReward: {
      coinsPerAd: adConfig.coinsPerAd,
      dailyMax: adConfig.dailyMax,
    },

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
 *
 * Recently active public users for the "ready to play" carousel.
 *
 * Reads from `User.lastSeenAt` (indexed) rather than aggregating the whole
 * QuizSession collection — the old version ran an unindexed full scan on every
 * home-screen load.
 */
export async function getReadyPlayers(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const since = new Date(Date.now() - 30 * 60 * 1000); // active in last 30 min

  const users = await User.find({
    _id: { $ne: userId },
    lastSeenAt: { $gte: since },
    publicProfile: { $ne: false },
    isBanned: { $ne: true },
    deletedAt: null,
    username: { $ne: null },
  })
    .select('username avatar lastSeenAt')
    .sort({ lastSeenAt: -1 })
    .limit(20)
    .lean();

  return res.json({
    players: users.map((u) => ({
      _id: u._id.toString(),
      username: u.username,
      avatar: u.avatar,
    })),
  });
}
