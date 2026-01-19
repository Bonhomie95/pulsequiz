import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { checkInStreak } from '../services/streakService';

export async function checkIn(req: AuthRequest, res: Response) {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const result = await checkInStreak(userId);

  return res.json({
    streak: result.streak,
    lastCheckIn: result.lastCheckIn,
    coinsAdded: result.coinsAdded,
    milestoneBonus: result.milestoneBonus,
  });
}
