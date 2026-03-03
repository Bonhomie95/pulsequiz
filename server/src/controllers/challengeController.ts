import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Challenge from '../models/Challenge';

export async function getMyChallenges(req: AuthRequest, res: Response) {
  const challenges = await Challenge.find({
    userId: req.userId,
    status: { $in: ['active', 'completed'] },
  }).sort({ expiresAt: 1 }).lean();

  return res.json({ challenges });
}

export async function claimChallenge(req: AuthRequest, res: Response) {
  const { challengeId } = req.params;

  const challenge = await Challenge.findOne({ _id: challengeId, userId: req.userId });
  if (!challenge) return res.status(404).json({ message: 'Challenge not found' });
  if (challenge.status !== 'completed') return res.status(400).json({ message: 'Challenge not completed yet' });
  if (challenge.currentValue < challenge.targetValue) return res.status(400).json({ message: 'Challenge not finished' });

  // Reward already applied when challenge was completed — just return info
  return res.json({ ok: true, rewardCoins: challenge.rewardCoins, rewardPoints: challenge.rewardPoints });
}
