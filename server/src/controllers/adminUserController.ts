import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import User from '../models/User';
import CoinWallet from '../models/CoinWallet';
import CoinTransaction from '../models/CoinTransaction';
import QuizSession from '../models/QuizSession';
import Purchase from '../models/Purchase';
import Subscription from '../models/Subscription';
import Progress from '../models/Progress';
import Streak from '../models/Streak';
import FlaggedAccount from '../models/FlaggedAccount';
import AccumulatedPrize from '../models/AccumulatedPrize';
import { escapeRegex } from '../utils/escapeRegex';
import { auditAdmin } from '../utils/adminAudit';
import { anonymiseUser } from '../services/accountService';
import { creditCoins, debitCoins, getBalance } from '../services/coinService';
import { logger } from '../utils/logger';

export async function listUsers(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 25);
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const filter = req.query.filter as string | undefined;

  // Deleted accounts are tombstones — never list them by default.
  const query: any = { deletedAt: null };

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { username: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }
  if (filter === 'banned') query.isBanned = true;
  if (filter === 'flagged') {
    const flagged = await FlaggedAccount.distinct('userId', { resolved: false });
    query._id = { $in: flagged };
  }
  if (filter === 'online') {
    query.lastSeenAt = { $gte: new Date(Date.now() - 5 * 60 * 1000) };
  }

  if (filter === 'premium') {
    const activeSubs = await Subscription.find({
      expiresAt: { $gt: new Date() },
      status: { $in: ['active', 'grace'] },
    })
      .select('userId')
      .lean();
    const premiumUserIds = activeSubs.map((s) => s.userId);
    if (premiumUserIds.length === 0) {
      return res.json({ users: [], total: 0, page, pages: 0 });
    }
    query._id = { $in: premiumUserIds };
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select('username email isBanned lastSeenAt createdAt moderationStrikes')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  const ids = users.map((u) => u._id);
  const [wallets, subs, flags, progresses, streaks] = await Promise.all([
    CoinWallet.find({ userId: { $in: ids } }).lean(),
    Subscription.find({
      userId: { $in: ids },
      expiresAt: { $gt: new Date() },
      status: { $in: ['active', 'grace'] },
    }).lean(),
    FlaggedAccount.find({ userId: { $in: ids }, resolved: false }).select('userId').lean(),
    // Score and streak were only reachable by opening a user one at a time,
    // which makes "who is doing well" and "who stopped playing" invisible in
    // the list. Both are indexed by userId, so this is two extra lookups.
    Progress.find({ userId: { $in: ids } })
      .select('userId points level totalQuizzes correctAnswers totalAnswers rating')
      .lean(),
    Streak.find({ userId: { $in: ids } }).select('userId streak lastCheckIn').lean(),
  ]);

  const walletMap = new Map(wallets.map((w) => [w.userId.toString(), w.coins]));
  const premiumSet = new Set(subs.map((s) => s.userId.toString()));
  const flaggedSet = new Set(flags.map((f) => f.userId.toString()));
  const progressMap = new Map(progresses.map((p) => [p.userId.toString(), p]));
  const streakMap = new Map(streaks.map((s) => [s.userId.toString(), s]));

  const enriched = users.map((u) => {
    const key = u._id.toString();
    const p = progressMap.get(key);
    const st = streakMap.get(key);
    return {
      ...u,
      coins: walletMap.get(key) ?? 0,
      isPremium: premiumSet.has(key),
      isFlagged: flaggedSet.has(key),
      points: p?.points ?? 0,
      level: p?.level ?? 1,
      totalQuizzes: p?.totalQuizzes ?? 0,
      accuracy: p?.totalAnswers ? Math.round((p.correctAnswers / p.totalAnswers) * 100) : null,
      rating: p?.rating ?? null,
      streak: st?.streak ?? 0,
      lastCheckIn: st?.lastCheckIn ?? null,
    };
  });

  res.json({ users: enriched, total, page, pages: Math.ceil(total / limit) });
}

export async function getUser(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ message: 'Invalid ID' });

  const user = await User.findById(id).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const [wallet, sessionCount, purchases, sub, progress, flags, ledgerSum, prize, streak] =
    await Promise.all([
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
      Progress.findOne({ userId: id }).lean(),
      FlaggedAccount.find({ userId: id }).sort({ flaggedAt: -1 }).limit(10).lean(),
      CoinTransaction.aggregate<{ total: number }>([
        { $match: { userId: new mongoose.Types.ObjectId(id) } },
        { $group: { _id: null, total: { $sum: '$delta' } } },
      ]),
      AccumulatedPrize.findOne({ userId: id }).lean(),
      Streak.findOne({ userId: id }).lean(),
    ]);

  const coins = wallet?.coins ?? 0;
  const ledgerTotal = ledgerSum[0]?.total ?? 0;

  // Where this player's streak sits against everyone else. A raw number ("7")
  // means nothing without knowing whether 7 is typical or exceptional, so the
  // rank and percentile are computed alongside it.
  const current = streak?.streak ?? 0;
  const [betterCount, streakTotal] = await Promise.all([
    Streak.countDocuments({ streak: { $gt: current } }),
    Streak.estimatedDocumentCount(),
  ]);
  const streakRank = betterCount + 1;
  // "Top X%" — smaller is better. Guard the empty-collection case.
  const streakPercentile =
    streakTotal > 0 ? Math.max(1, Math.round((streakRank / streakTotal) * 100)) : null;

  // Check-in history is capped by the model, so this stays cheap.
  const history = streak?.checkInHistory ?? [];

  res.json({
    user: {
      ...user,
      coins,
      totalSessions: sessionCount,
      isPremium: !!sub,
      premiumExpiry: sub?.expiresAt ?? null,
      premiumPlan: sub?.sku ?? null,
      progress,
      // Surfacing the drift makes a tampered or buggy balance visible at a
      // glance rather than only in the nightly reconciliation log.
      ledger: { total: ledgerTotal, drift: coins - ledgerTotal },
      pendingPrizeUSDT: prize?.pendingUSDT ?? 0,
      streak: {
        current,
        lastCheckIn: streak?.lastCheckIn ?? null,
        checkIns: history.length,
        rank: streakRank,
        of: streakTotal,
        /** Top N% by streak — 1 is the very top. */
        percentile: streakPercentile,
      },
    },
    recentPurchases: purchases,
    flags,
  });
}

const UpdateUserSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
  withdrawalEnabled: z.boolean().optional(),
  isBanned: z.boolean().optional(),
  publicProfile: z.boolean().optional(),
});

export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ message: 'Invalid ID' });

  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', errors: parsed.error.issues });
  }

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const before = {
    username: user.username,
    withdrawalEnabled: user.withdrawalEnabled,
    isBanned: user.isBanned,
    publicProfile: user.publicProfile,
  };

  const { username, withdrawalEnabled, isBanned, publicProfile } = parsed.data;

  if (username !== undefined) {
    const normalised = username.toLowerCase();
    const exists = await User.findOne({ username: normalised, _id: { $ne: id } })
      .collation({ locale: 'en', strength: 2 })
      .select('_id')
      .lean();
    if (exists) return res.status(409).json({ message: 'Username already taken' });
    user.username = normalised;
  }
  if (withdrawalEnabled !== undefined) user.withdrawalEnabled = withdrawalEnabled;
  if (publicProfile !== undefined) user.publicProfile = publicProfile;
  if (isBanned !== undefined) {
    user.isBanned = isBanned;
    if (isBanned) {
      user.withdrawalEnabled = false;
      // Kick every live session for the account rather than waiting for the
      // token to expire.
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }
  }

  await user.save();

  await auditAdmin(req, 'user.update', {
    targetType: 'user',
    targetId: id,
    before,
    after: parsed.data,
  });

  res.json({ ok: true });
}

const AdjustCoinsSchema = z.object({
  // A delta, not an absolute. Setting a balance directly is what made the
  // wallet and the ledger disagree; a signed adjustment is auditable.
  delta: z.number().int().refine((n) => n !== 0, 'delta must be non-zero'),
  reason: z.string().min(3).max(200),
});

/**
 * POST /api/admin/users/:id/coins
 *
 * Adjust a balance through the ledger. The previous endpoint did
 * `$set: { coins }` with no CoinTransaction row, which silently broke
 * reconciliation for that account forever.
 */
export async function adjustCoins(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ message: 'Invalid ID' });

  const parsed = AdjustCoinsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', errors: parsed.error.issues });
  }

  const user = await User.findById(id).select('_id').lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const { delta, reason } = parsed.data;
  const before = await getBalance(id);

  let balance: number;
  if (delta > 0) {
    balance = await creditCoins(id, delta, 'admin_grant', { note: reason });
  } else {
    const result = await debitCoins(id, -delta, 'admin_deduct', { note: reason });
    if (!result.success) {
      return res.status(400).json({
        message: `Insufficient balance: user has ${result.balance}, tried to remove ${-delta}`,
      });
    }
    balance = result.balance;
  }

  await auditAdmin(req, 'user.adjust_coins', {
    targetType: 'user',
    targetId: id,
    before: { coins: before },
    after: { coins: balance, delta, reason },
  });

  logger.warn('Admin adjusted coin balance', { userId: id, delta, reason, balance });

  res.json({ ok: true, coins: balance, delta });
}

export async function toggleBan(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ message: 'Invalid ID' });

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const wasBanned = user.isBanned;
  user.isBanned = !user.isBanned;

  if (user.isBanned) {
    user.withdrawalEnabled = false;
    // Revoke every outstanding token immediately.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  }
  await user.save();

  await auditAdmin(req, user.isBanned ? 'user.ban' : 'user.unban', {
    targetType: 'user',
    targetId: id,
    before: { isBanned: wasBanned },
    after: { isBanned: user.isBanned },
  });

  res.json({ ok: true, isBanned: user.isBanned });
}

/**
 * DELETE /api/admin/users/:id
 *
 * Full erasure. The previous version removed only the wallet and subscriptions,
 * leaving ten other collections orphaned and the account still on the
 * leaderboard.
 */
export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ message: 'Invalid ID' });

  const user = await User.findById(id).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const summary = await anonymiseUser(id);

  await auditAdmin(req, 'user.delete', {
    targetType: 'user',
    targetId: id,
    before: { username: user.username, email: user.email },
    after: summary,
  });

  res.json({ ok: true, removed: summary });
}
