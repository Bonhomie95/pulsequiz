import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import CoinWallet from '../models/CoinWallet';
import QuizSession from '../models/QuizSession';
import Purchase from '../models/Purchase';
import Subscription from '../models/Subscription';
import { escapeRegex } from '../utils/escapeRegex';

export async function listUsers(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 25);
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const filter = req.query.filter as string | undefined; // 'banned' | 'premium' | 'online'

  const query: any = {};

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { username: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }
  if (filter === 'banned') query.isBanned = true;
  if (filter === 'online') {
    // Online = seen within last 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    query.lastSeenAt = { $gte: fiveMinAgo };
  }

  // For premium filter we need a separate lookup — handled after the main query
  const isPremiumFilter = filter === 'premium';

  // For premium filter: first get all premium userIds, then filter by them
  let premiumUserIds: any[] | null = null;
  if (isPremiumFilter) {
    const activeSubs = await Subscription.find({
      expiresAt: { $gt: new Date() },
      status: { $in: ['active', 'grace'] },
    })
      .select('userId')
      .lean();
    premiumUserIds = activeSubs.map((s) => s.userId);
    if (premiumUserIds.length === 0) {
      // No premium users — return empty early
      return res.json({ users: [], total: 0, page, pages: 0 });
    }
    query._id = { $in: premiumUserIds };
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select('username email isBanned lastSeenAt createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  // Attach coin balances and premium status in one pass
  const ids = users.map((u) => u._id);
  const [wallets, subs] = await Promise.all([
    CoinWallet.find({ userId: { $in: ids } }).lean(),
    Subscription.find({
      userId: { $in: ids },
      expiresAt: { $gt: new Date() },
      status: { $in: ['active', 'grace'] },
    }).lean(),
  ]);

  const walletMap = new Map(wallets.map((w) => [w.userId.toString(), w.coins]));
  const premiumSet = new Set(subs.map((s) => s.userId.toString()));

  const enriched = users.map((u) => ({
    ...u,
    coins: walletMap.get(u._id.toString()) ?? 0,
    isPremium: premiumSet.has(u._id.toString()),
  }));

  res.json({ users: enriched, total, page, pages: Math.ceil(total / limit) });
}

export async function getUser(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ message: 'Invalid ID' });

  const user = await User.findById(id).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const [wallet, sessionCount, purchases, sub] = await Promise.all([
    CoinWallet.findOne({ userId: id }).lean(),
    QuizSession.countDocuments({ userId: id }),
    Purchase.find({ userId: id }).sort({ createdAt: -1 }).limit(10).lean(),
    Subscription.findOne({
      userId: id,
      expiresAt: { $gt: new Date() },
      status: { $in: ['active', 'grace'] },
    })
      .sort({ expiresAt: -1 })
      .lean(),
  ]);

  res.json({
    user: {
      ...user,
      coins: wallet?.coins ?? 0,
      totalSessions: sessionCount,
      isPremium: !!sub,
      premiumExpiry: sub?.expiresAt ?? null,
      premiumPlan: sub?.sku ?? null,
    },
    recentPurchases: purchases,
  });
}

export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ message: 'Invalid ID' });

  const { username, coins, withdrawalEnabled, isBanned } = req.body as {
    username?: string;
    coins?: number;
    withdrawalEnabled?: boolean;
    isBanned?: boolean;
  };

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (username !== undefined) {
    const exists = await User.findOne({ username, _id: { $ne: id } });
    if (exists)
      return res.status(409).json({ message: 'Username already taken' });
    user.username = username || null;
  }
  if (withdrawalEnabled !== undefined)
    user.withdrawalEnabled = withdrawalEnabled;
  if (isBanned !== undefined) user.isBanned = isBanned;
  await user.save();

  // Adjust coins separately (wallet upsert)
  if (coins !== undefined && typeof coins === 'number' && coins >= 0) {
    await CoinWallet.updateOne(
      { userId: id },
      { $set: { coins } },
      { upsert: true },
    );
  }

  res.json({ ok: true });
}

export async function toggleBan(req: Request, res: Response) {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.isBanned = !user.isBanned;
  if (user.isBanned) user.withdrawalEnabled = false;
  await user.save();

  res.json({ ok: true, isBanned: user.isBanned });
}

export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ message: 'Invalid ID' });

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  // Cascade delete associated data
  await Promise.all([
    CoinWallet.deleteOne({ userId: id }),
    Subscription.deleteMany({ userId: id }),
    User.deleteOne({ _id: id }),
  ]);

  res.json({ ok: true });
}
