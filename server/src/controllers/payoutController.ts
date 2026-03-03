import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Payout from '../models/Payout';
import AccumulatedPrize from '../models/AccumulatedPrize';
import PrizePool from '../models/PrizePool';
import { getPeriodLabel } from '../services/payoutService';

export async function getMyPayouts(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const payouts = await Payout.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const accumulated = await AccumulatedPrize.findOne({ userId: req.userId }).lean();

  return res.json({
    payouts,
    pendingUSDT: accumulated?.pendingUSDT ?? 0,
    totalEarned: accumulated?.totalEarned ?? 0,
  });
}

export async function getCurrentPrizePools(req: AuthRequest, res: Response) {
  const weeklyLabel = getPeriodLabel('weekly');
  const monthlyLabel = getPeriodLabel('monthly');

  const [weekly, monthly] = await Promise.all([
    PrizePool.findOne({ type: 'weekly', periodLabel: weeklyLabel }).lean(),
    PrizePool.findOne({ type: 'monthly', periodLabel: monthlyLabel }).lean(),
  ]);

  // Only return paidRanks counts — NOT prize amounts (revealed after period ends)
  return res.json({
    weekly: weekly
      ? { paidRanks: weekly.paidRanks, totalAmount: null, tiers: null }
      : null,
    monthly: monthly
      ? { paidRanks: monthly.paidRanks, totalAmount: null, tiers: null }
      : null,
  });
}

export async function getRevealedPrizePools(req: AuthRequest, res: Response) {
  // Return prize pools that have been locked (period ended)
  const pools = await PrizePool.find({ lockedAt: { $ne: null } })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return res.json({ pools });
}
