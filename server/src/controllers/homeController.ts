import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizSession from '../models/QuizSession';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import PrizePool from '../models/PrizePool';
import User from '../models/User';
import Progress from '../models/Progress';
import ActiveQuizSession from '../models/ActiveQuizSession';
import PvPMatch from '../models/PvPMatch';
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

  // Always read the caller's own weekly standing live.
  //
  // This used to come from the snapshot alone, which the cron rebuilds once a
  // minute — so finishing a quiz and landing back on the home screen showed
  // the rank and points from before the run, while the leaderboard screen
  // (which folds in the live figures) showed the new ones. Two screens
  // disagreeing reads as the run not having counted.
  //
  // One index-backed read plus the snapshot already loaded here; no
  // period-wide scan.
  const standing = await getUserStanding(userId, 'weekly', paidRanks);

  // Prefer the snapshot's position when it has them — it accounts for everyone
  // else on the board — and fall back to the live standing otherwise.
  const myWeeklyRank = rankIn(weeklySnapshot, userId) ?? standing.rank;

  const pointsToPaidTier =
    myWeeklyRank !== null && paidRanks
      ? myWeeklyRank <= paidRanks
        ? 0
        : null
      : (standing.pointsToPaidTier ?? null);

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
    weeklyPoints: standing.points,
    pointsToBoard: standing.pointsToBoard,

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
 * How long after their last request a player still appears in the carousel,
 * and how long they count as "online" rather than "away".
 *
 * There is no logout event: a closed app, a dead battery or a dropped network
 * all look identical from here, so presence is inferred from the last request
 * we saw. ONLINE_WINDOW_MS is deliberately just above the lastSeenAt throttle
 * in the auth middleware, so an app that is genuinely open always refreshes in
 * time to stay "online".
 */
const READY_WINDOW_MS = 30 * 60 * 1000;
const ONLINE_WINDOW_MS = 6 * 60 * 1000;
const READY_LIMIT = 20;

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
  const now = Date.now();
  const since = new Date(now - READY_WINDOW_MS);

  const users = await User.find({
    _id: { $ne: userId },
    lastSeenAt: { $gte: since },
    publicProfile: { $ne: false },
    isBanned: { $ne: true },
    deletedAt: null,
    username: { $ne: null },
    // House accounts pad the leaderboards, but they cannot actually accept a
    // challenge — offering them here would be a dead end.
    isSynthetic: { $ne: true },
  })
    .select('username avatar lastSeenAt')
    .sort({ lastSeenAt: -1 })
    .limit(READY_LIMIT)
    .lean();

  const ids = users.map((u) => u._id);

  // Who is mid-quiz right now. An unfinished session that has not expired is
  // the same signal the quiz engine itself trusts.
  const [busySolo, busyPvp] = await Promise.all([
    ActiveQuizSession.find({
      userId: { $in: ids },
      finished: false,
      expiresAt: { $gt: new Date() },
    })
      .select('userId')
      .lean(),
    PvPMatch.find({
      'players.userId': { $in: ids },
      status: { $in: ['MATCHED', 'ACTIVE', 'WAITING_ON_OPPONENT'] },
    })
      .select('players.userId')
      .lean(),
  ]);

  const busy = new Set<string>(busySolo.map((s) => String(s.userId)));
  for (const m of busyPvp as any[]) {
    for (const p of m.players ?? []) busy.add(String(p.userId));
  }

  return res.json({
    players: users.map((u) => {
      const id = u._id.toString();
      const seen = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0;
      return {
        _id: id,
        username: u.username,
        avatar: u.avatar,
        /**
         * `in_game` cannot take a challenge right now; `online` has the app
         * open; `away` was here recently but may have closed it or dropped off
         * the network — nothing tells us they left, so this is inferred from
         * how long since we last heard from them.
         */
        status: busy.has(id) ? 'in_game' : now - seen <= ONLINE_WINDOW_MS ? 'online' : 'away',
        lastSeenAt: u.lastSeenAt ?? null,
      };
    }),
    /** Lets the client poll only as often as the data can actually change. */
    refreshAfterMs: ONLINE_WINDOW_MS,
  });
}
