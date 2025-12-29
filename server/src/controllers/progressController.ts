import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth';
import { applyQuizResult } from '../services/progressService';
import { checkInStreak } from '../services/streakService';
import CoinWallet from '../models/CoinWallet';
import Progress from '../models/Progress';
import Streak from '../models/Streak';

const QuizSchema = z.object({
  category: z.string(),
  correct: z.number().min(0),
  total: z.number().min(1),
});

export async function dailyCheckIn(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const result = await checkInStreak(req.userId);
  return res.json(result);
}

export async function getProgress(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const [progress, wallet, streak] = await Promise.all([
    Progress.findOne({ userId: req.userId }).lean(),
    CoinWallet.findOne({ userId: req.userId }).lean(),
    Streak.findOne({ userId: req.userId }).lean(),
  ]);

  return res.json({
    points: progress?.points ?? 0,
    level: progress?.level ?? 1,
    coins: wallet?.coins ?? 0,
    streak: streak?.streak ?? 0,
    lastCheckIn: streak?.lastCheckIn,
  });
}
