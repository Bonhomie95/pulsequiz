import { Request, Response } from 'express';
import LeaderboardSnapshot, {
  type LeaderboardEntry,
} from '../models/LeaderboardSnapshot';
import PrizePool from '../models/PrizePool';
import { buildLeaderboard, getUserStanding } from '../services/leaderboardService';
import { currentPeriodLabel } from '../utils/dateRanges';
import { AuthRequest } from '../middlewares/auth';

const ALLOWED_TYPES = ['weekly', 'monthly', 'all'] as const;
type LeaderboardType = (typeof ALLOWED_TYPES)[number];

export async function getLeaderboard(req: AuthRequest, res: Response) {
  const type = (req.params.type || 'weekly') as LeaderboardType;

  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ message: 'Invalid leaderboard type' });
  }

  // Serve the snapshot; the cron refreshes it every minute.
  const snapshot = await LeaderboardSnapshot.findOne({ type }).lean();
  const data = ((snapshot ? snapshot.data : await buildLeaderboard(type)) ??
    []) as LeaderboardEntry[];

  // Prize pool info — rank count is always visible, amounts only after the
  // period is locked.
  let prizeInfo: {
    paidRanks: number;
    totalAmount: number | null;
    tiers: { rank: number; amount: number }[] | null;
    revealed: boolean;
  } | null = null;

  let paidRanks: number | null = null;

  if (type === 'weekly' || type === 'monthly') {
    const periodLabel = currentPeriodLabel(type);
    const pool = await PrizePool.findOne({ type, periodLabel }).lean();

    if (pool) {
      paidRanks = pool.paidRanks;
      const revealed = !!pool.lockedAt;
      prizeInfo = {
        paidRanks: pool.paidRanks,
        totalAmount: revealed ? pool.totalAmount : null,
        tiers: revealed ? pool.tiers : null,
        revealed,
      };
    }
  }

  // The caller's own standing.
  //
  // Their *points* are always read live. Taking them off the snapshot when the
  // player happened to be in the top 100 meant their own total was up to a
  // minute stale — the cron's rebuild cadence — so a player who finished a quiz
  // and opened this screen saw their previous total and concluded the run had
  // not counted. On the next visit the snapshot had caught up and showed the
  // earlier quiz's score, which reads as the scores being one behind.
  //
  // The snapshot is still the right source for *rank* and for the cutoffs:
  // those describe other players, and a minute of staleness there is invisible.
  let me = null;
  if (req.userId) {
    const standing = await getUserStanding(req.userId, type, paidRanks);

    // Fold the caller's live total back into the board they are looking at.
    //
    // The snapshot is up to a minute old, so a player who had just finished a
    // quiz saw their own row still showing the pre-quiz score — and if the new
    // score moved them past someone, the order was wrong too. Their own number
    // is the one they check immediately, so it has to be current; everyone
    // else's may stay cached, since a minute of drift there is invisible.
    const mineIdx = data.findIndex((e) => e.userId === req.userId);
    if (mineIdx >= 0 && data[mineIdx].points !== standing.points) {
      data[mineIdx] = { ...data[mineIdx], points: standing.points };
      data.sort((a, b) => b.points - a.points);
      data.forEach((e, i) => {
        e.rank = i + 1;
      });
    }

    const idx = data.findIndex((e) => e.userId === req.userId);

    me = {
      ...standing,
      // Prefer the snapshot's position when they are on the stored board;
      // getUserStanding falls back to the same snapshot anyway.
      rank: idx >= 0 ? idx + 1 : standing.rank,
      ...(idx >= 0
        ? {
            pointsToPaidTier: paidRanks && idx + 1 <= paidRanks ? 0 : standing.pointsToPaidTier,
            pointsToBoard: 0,
            outsideBoard: false,
          }
        : {}),
      inTopList: idx >= 0,
    };
  }

  return res.json({
    type,
    generatedAt: snapshot?.generatedAt ?? new Date(),
    periodLabel: snapshot?.periodLabel ?? null,
    data,
    me,
    prizeInfo,
    cached: !!snapshot,
  });
}

/**
 * GET /leaderboard/my-rank
 * The user's standing across all three boards, including outside the top 100.
 */
export async function getMyRank(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const weeklyPool = await PrizePool.findOne({
    type: 'weekly',
    periodLabel: currentPeriodLabel('weekly'),
  })
    .select('paidRanks')
    .lean();

  const [weekly, monthly, all] = await Promise.all([
    getUserStanding(req.userId, 'weekly', weeklyPool?.paidRanks ?? null),
    getUserStanding(req.userId, 'monthly'),
    getUserStanding(req.userId, 'all'),
  ]);

  return res.json({
    weekly,
    monthly,
    all,
    weeklyPaidRanks: weeklyPool?.paidRanks ?? null,
  });
}
