import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth';
import { checkInStreak } from '../services/streakService';
import CoinWallet from '../models/CoinWallet';
import Progress from '../models/Progress';
import Streak from '../models/Streak';

/**
 * The player's IANA timezone, sent by the client so the streak day boundary
 * matches their local midnight instead of a single hardcoded zone.
 */
function readTimezone(req: { body?: any; headers: Record<string, any> }): string | null {
  const fromBody = typeof req.body?.timezone === 'string' ? req.body.timezone : null;
  const fromHeader =
    typeof req.headers['x-timezone'] === 'string' ? (req.headers['x-timezone'] as string) : null;
  const tz = fromBody ?? fromHeader;
  // IANA zone names are conservative: letters, digits, +-_ and /.
  return tz && /^[A-Za-z0-9_+\-\/]{1,64}$/.test(tz) ? tz : null;
}


const QuizSchema = z.object({
  category: z.string(),
  correct: z.number().min(0),
  total: z.number().min(1),
});

export async function dailyCheckIn(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const result = await checkInStreak(req.userId, readTimezone(req));
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
