import { Request, Response } from 'express';
import User from '../models/User';
import CoinWallet from '../models/CoinWallet';
import Purchase from '../models/Purchase';
import FlaggedAccount from '../models/FlaggedAccount';

/* ---------------- TOTAL USERS ---------------- */
export async function getTotalUsers(_: Request, res: Response) {
  // Tombstoned accounts would otherwise inflate this forever.
  const total = await User.countDocuments({ deletedAt: null });
  res.json({ total });
}

/* ---------------- COINS CIRCULATING ---------------- */
export async function getTotalCoins(_: Request, res: Response) {
  const result = await CoinWallet.aggregate([
    { $group: { _id: null, total: { $sum: '$coins' } } },
  ]);

  res.json({ total: result[0]?.total || 0 });
}

/* ---------------- PURCHASES TODAY ---------------- */
export async function getPurchasesToday(_: Request, res: Response) {
  // UTC, to match every other daily boundary in the system.
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const total = await Purchase.countDocuments({
    createdAt: { $gte: start },
    state: 'CREDITED',
  });

  res.json({ total });
}

/* ---------------- ACCOUNTS NEEDING REVIEW ---------------- */
export async function getFlaggedUsers(_: Request, res: Response) {
  // This used to count bans, which is a different thing entirely — a ban is a
  // decision already taken, whereas an open flag is work waiting for an admin
  // AND a hold on that player's prize payouts.
  const [open, banned] = await Promise.all([
    FlaggedAccount.countDocuments({ resolved: false }),
    User.countDocuments({ isBanned: true, deletedAt: null }),
  ]);

  res.json({ total: open, openFlags: open, banned });
}
