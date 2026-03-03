// controllers/adminPurchaseController.ts
import { Request, Response } from 'express';
import Purchase from '../models/Purchase';

export async function listPurchases(req: Request, res: Response) {
  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const { state, store } = req.query as { state?: string; store?: string };

  const filter: any = {};
  if (state) filter.state = state;
  if (store) filter.store = store;

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [purchases, total, todayCount, revenueAgg] = await Promise.all([
    Purchase.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'username email')
      .lean(),
    Purchase.countDocuments(filter),
    Purchase.countDocuments({ createdAt: { $gte: today }, state: 'CREDITED' }),
    Purchase.aggregate([{ $match: { state: 'CREDITED' } }, { $group: { _id: null, total: { $sum: '$priceUsd' } } }]),
  ]);

  res.json({
    purchases,
    total,
    page,
    stats: {
      revenue: revenueAgg[0]?.total ?? 0,
      count:   await Purchase.countDocuments({ state: 'CREDITED' }),
      today:   todayCount,
    },
  });
}
