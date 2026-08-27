import { Request, Response } from 'express';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
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
  const data = snapshot ? snapshot.data : await buildLeaderboard(type);

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

  // The caller's own standing, computed properly rather than read off the
  // top-100 snapshot — a player at #412 previously got no feedback at all.
  let me = null;
  if (req.userId) {
    const idx = data.findIndex((e: any) => e.userId === req.userId);
    if (idx >= 0) {
      me = {
        rank: idx + 1,
        points: (data[idx] as any).points,
        pointsToPaidTier: paidRanks && idx + 1 <= paidRanks ? 0 : null,
        pointsToBoard: 0,
        outsideBoard: false,
        inTopList: true,
      };
    } else {
      // One index-backed read for their own total; the cutoffs come from the
      // snapshot rather than a period-wide scan.
      const standing = await getUserStanding(req.userId, type, paidRanks);
      me = { ...standing, inTopList: false };
    }
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
