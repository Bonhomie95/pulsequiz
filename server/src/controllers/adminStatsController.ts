import { Request, Response } from 'express';
import User from '../models/User';
import CoinWallet from '../models/CoinWallet';
import Purchase from '../models/Purchase';

/* ---------------- TOTAL USERS ---------------- */
export async function getTotalUsers(_: Request, res: Response) {
  const total = await User.countDocuments();
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
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const total = await Purchase.countDocuments({
    createdAt: { $gte: start },
    state: 'CREDITED',
  });

  res.json({ total });
}

/* ---------------- FLAGGED USERS ---------------- */
export async function getFlaggedUsers(_: Request, res: Response) {
  const total = await User.countDocuments({ isBanned: true });
  res.json({ total });
}
