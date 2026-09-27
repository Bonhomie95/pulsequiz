import { Request, Response } from 'express';
import User from '../models/User';
import CoinWallet from '../models/CoinWallet';
import Purchase from '../models/Purchase';
import FlaggedAccount from '../models/FlaggedAccount';
import Streak from '../models/Streak';

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

/* ---------------- STREAK RANKING & DISTRIBUTION ---------------- */

/** Bucket edges, as [inclusive lower bound, label]. */
const STREAK_BUCKETS: [number, string][] = [
  [0, 'No streak'],
  [1, '1–2 days'],
  [3, '3–6 days'],
  [7, '7–13 days'],
  [14, '14–29 days'],
  [30, '30+ days'],
];

/**
 * GET /api/admin/stats/streaks
 *
 * Retention seen through daily check-ins: how the player base is distributed
 * across streak lengths, what share is on an active streak at all, and who the
 * top holders are.
 *
 * A raw streak count answers "how long", never "how unusual" — the percentage
 * of the base in each band is what makes a number like 7 interpretable, so
 * every bucket carries its share as well as its count.
 */
export async function getStreakStats(_: Request, res: Response) {
  const [buckets, total, active, top, longest] = await Promise.all([
    Streak.aggregate<{ _id: number; count: number }>([
      {
        $bucket: {
          groupBy: '$streak',
          boundaries: [0, 1, 3, 7, 14, 30, Number.MAX_SAFE_INTEGER],
          // Mongo rejects a default that sits inside the boundary range, so it
          // cannot be 0 — that is a real bucket. Anything unbucketable (a null
          // or a negative left by a bad write) lands here and is folded into
          // "No streak" below, so it is still counted rather than dropped.
          default: -1,
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    Streak.estimatedDocumentCount(),
    Streak.countDocuments({ streak: { $gt: 0 } }),
    // Top holders, joined back to a username so the list is actionable.
    Streak.find({ streak: { $gt: 0 } })
      .sort({ streak: -1 })
      .limit(20)
      .populate<{ userId: { _id: unknown; username: string; isBanned: boolean } }>(
        'userId',
        'username isBanned deletedAt',
      )
      .lean(),
    Streak.findOne().sort({ streak: -1 }).select('streak').lean(),
  ]);

  const countFor = new Map(buckets.map((b) => [b._id, b.count]));
  const share = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

  const distribution = STREAK_BUCKETS.map(([lower, label]) => {
    // Fold the catch-all bucket into "No streak" so every player is counted
    // exactly once and the percentages still sum to 100.
    const count = (countFor.get(lower) ?? 0) + (lower === 0 ? countFor.get(-1) ?? 0 : 0);
    return { label, minStreak: lower, count, percent: share(count) };
  });

  res.json({
    total,
    active,
    activePercent: share(active),
    longestStreak: longest?.streak ?? 0,
    distribution,
    top: top
      // A populated ref is null when the user was deleted; drop those rather
      // than rendering a blank row.
      .filter((s) => s.userId && !(s.userId as any).deletedAt)
      .map((s) => ({
        userId: (s.userId as any)._id,
        username: (s.userId as any).username,
        isBanned: (s.userId as any).isBanned,
        streak: s.streak,
        lastCheckIn: s.lastCheckIn ?? null,
      })),
  });
}
