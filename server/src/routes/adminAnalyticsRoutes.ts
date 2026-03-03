import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import Purchase from '../models/Purchase';
import Subscription from '../models/Subscription';
import User from '../models/User';

const router = Router();

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const range = (req.query.range as string) || '30d';

  // Date range window
  const now = new Date();
  const from =
    range === 'all'
      ? new Date(0)
      : range === '90d'
        ? new Date(now.getTime() - 90 * 86400_000)
        : new Date(now.getTime() - 30 * 86400_000);

  // Month boundaries for MoM comparison
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    revenueAgg,
    revenueThisMonthAgg,
    revenueLastMonthAgg,
    totalUsers,
    newUsersThisMonth,
    activePremium,
    dailyRevenueAgg,
    dailySignupsAgg,
    planRevenueAgg,
  ] = await Promise.all([
    // All-time total revenue from credited purchases
    Purchase.aggregate([
      { $match: { state: 'CREDITED' } },
      { $group: { _id: null, total: { $sum: '$priceUsd' } } },
    ]),
    // This month revenue
    Purchase.aggregate([
      { $match: { state: 'CREDITED', createdAt: { $gte: thisMonthStart } } },
      { $group: { _id: null, total: { $sum: '$priceUsd' } } },
    ]),
    // Last month revenue
    Purchase.aggregate([
      {
        $match: {
          state: 'CREDITED',
          createdAt: { $gte: lastMonthStart, $lt: thisMonthStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$priceUsd' } } },
    ]),
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: thisMonthStart } }),
    Subscription.countDocuments({
      expiresAt: { $gt: now },
      status: { $in: ['active', 'grace'] },
    }),
    // Daily revenue over range (purchases + subscriptions combined)
    Purchase.aggregate([
      { $match: { state: 'CREDITED', createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$priceUsd' },
          purchases: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Daily new signups over range
    User.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          signups: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Revenue per subscription plan
    Subscription.aggregate([
      { $match: { status: { $in: ['active', 'expired', 'cancelled'] } } },
      {
        $group: {
          _id: '$sku',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Map plan revenue using fixed prices (since Subscription model doesn't store priceUsd)
  const PLAN_PRICES: Record<string, number> = {
    pq_premium_monthly: 2.99,
    pq_premium_3month: 7.99,
    pq_premium_6month: 13.99,
    pq_premium_yearly: 24.99,
  };

  const revenueByPlan = planRevenueAgg
    .map((p: any) => ({
      sku: p._id,
      label: p._id,
      count: p.count,
      revenue: (PLAN_PRICES[p._id] ?? 0) * p.count,
    }))
    .sort((a: any, b: any) => b.revenue - a.revenue);

  res.json({
    totalRevenue: revenueAgg[0]?.total ?? 0,
    revenueThisMonth: revenueThisMonthAgg[0]?.total ?? 0,
    revenueLastMonth: revenueLastMonthAgg[0]?.total ?? 0,
    totalUsers,
    newUsersThisMonth,
    activePremium,
    dailyRevenue: dailyRevenueAgg.map((d: any) => ({
      date: d._id,
      revenue: Math.round(d.revenue * 100) / 100,
      purchases: d.purchases,
    })),
    dailySignups: dailySignupsAgg.map((d: any) => ({
      date: d._id,
      signups: d.signups,
    })),
    revenueByPlan,
  });
});

export default router;
