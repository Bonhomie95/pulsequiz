import { Request, Response } from 'express';

import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizSession from '../models/QuizSession';
import { AuthRequest } from '../middlewares/auth';

export async function getHomeSummary(req: AuthRequest, res: Response) {
  const userId = req.userId;

  const [wallet, streakDoc, lastSession] = await Promise.all([
    CoinWallet.findOne({ userId }).lean(),
    Streak.findOne({ userId }).lean(),
    QuizSession.findOne({ userId })
      .sort({ createdAt: -1 })
      .select('category score createdAt')
      .lean(),
  ]);

  return res.json({
    coins: wallet?.coins ?? 0,

    streak: streakDoc?.streak ?? 0,
    lastCheckIn: streakDoc?.lastCheckIn ?? null,

    lastQuiz: lastSession
      ? {
          category: lastSession.category,
          score: lastSession.score,
          playedAt: lastSession.createdAt,
        }
      : {
          category: null,
          score: null,
          playedAt: null,
        },
  });
}
