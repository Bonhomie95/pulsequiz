import { Request, Response } from 'express';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import { buildLeaderboard } from '../services/leaderboardService';

const ALLOWED_TYPES = ['weekly', 'monthly', 'all'] as const;
type LeaderboardType = (typeof ALLOWED_TYPES)[number];

export async function getLeaderboard(req: Request, res: Response) {
  const type = (req.params.type || 'weekly') as LeaderboardType;

  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ message: 'Invalid leaderboard type' });
  }

  // 1️⃣ Try cached snapshot first
  const snapshot = await LeaderboardSnapshot.findOne({ type }).lean();

  if (snapshot) {
    return res.json({
      type,
      generatedAt: snapshot.generatedAt,
      data: snapshot.data,
      cached: true,
    });
  }

  // 2️⃣ Fallback (rare) — build on demand
  const data = await buildLeaderboard(type);

  return res.json({
    type,
    generatedAt: new Date(),
    data,
    cached: false,
  });
}
