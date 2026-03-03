import { Request, Response } from 'express';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import PrizePool from '../models/PrizePool';
import { buildLeaderboard } from '../services/leaderboardService';
import { getPeriodLabel } from '../services/payoutService';
import { AuthRequest } from '../middlewares/auth';

const ALLOWED_TYPES = ['weekly', 'monthly', 'all'] as const;
type LeaderboardType = (typeof ALLOWED_TYPES)[number];

export async function getLeaderboard(req: Request, res: Response) {
  const type = (req.params.type || 'weekly') as LeaderboardType;

  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ message: 'Invalid leaderboard type' });
  }

  // 1. Try cached snapshot first
  const snapshot = await LeaderboardSnapshot.findOne({ type }).lean();

  const data = snapshot
    ? snapshot.data
    : await buildLeaderboard(type);

  // 2. Prize pool info (hidden during active period, revealed after lock)
  let prizeInfo: {
    paidRanks: number;
    totalAmount: number | null;
    tiers: { rank: number; amount: number }[] | null;
    revealed: boolean;
  } | null = null;

  if (type === 'weekly' || type === 'monthly') {
    const periodLabel = getPeriodLabel(type as 'weekly' | 'monthly');
    const pool = await PrizePool.findOne({ type, periodLabel }).lean();

    if (pool) {
      // If pool is locked (period ended), reveal full prize breakdown
      const revealed = !!pool.lockedAt;
      prizeInfo = {
        paidRanks: pool.paidRanks,
        totalAmount: revealed ? pool.totalAmount : null,
        tiers: revealed ? pool.tiers : null,
        revealed,
      };
    }
  }

  return res.json({
    type,
    generatedAt: snapshot?.generatedAt ?? new Date(),
    data,
    prizeInfo,   // null if no pool set; paidRanks always shown; amounts only after period ends
    cached: !!snapshot,
  });
}

/**
 * GET /leaderboard/my-rank
 * Returns the authenticated user's rank across all leaderboard types.
 */
export async function getMyRank(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const types: LeaderboardType[] = ['weekly', 'monthly', 'all'];
  const result: Record<string, number | null> = {};

  for (const type of types) {
    const snapshot = await LeaderboardSnapshot.findOne({ type }).lean();
    if (!snapshot) { result[type] = null; continue; }
    const idx = snapshot.data.findIndex((e: any) => e.userId === req.userId);
    result[type] = idx >= 0 ? idx + 1 : null;
  }

  return res.json(result);
}
