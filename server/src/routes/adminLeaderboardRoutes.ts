import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import { buildLeaderboard } from '../services/leaderboardService';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';

const router = Router();

const ALLOWED = ['weekly', 'monthly', 'all'] as const;
type BoardType = typeof ALLOWED[number];

// GET /api/admin/leaderboard/:type
// Always returns fresh data — rebuilds live if snapshot is stale or missing
router.get('/:type', requireAdmin, async (req: Request, res: Response) => {
  const type = req.params.type as BoardType;
  if (!ALLOWED.includes(type)) {
    return res.status(400).json({ message: 'Invalid type. Use: weekly, monthly, all' });
  }

  try {
    // Try existing snapshot first
    const snapshot = await LeaderboardSnapshot.findOne({ type }).lean();

    // If snapshot exists and is less than 10 minutes old, return it
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (snapshot && snapshot.data.length > 0 && snapshot.generatedAt > tenMinAgo) {
      return res.json({
        type,
        data: snapshot.data,
        generatedAt: snapshot.generatedAt,
        cached: true,
      });
    }

    // Otherwise rebuild live (this also updates the snapshot in the DB)
    const data = await buildLeaderboard(type);
    return res.json({
      type,
      data,
      generatedAt: new Date(),
      cached: false,
    });
  } catch (e) {
    console.error('Admin leaderboard error', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
