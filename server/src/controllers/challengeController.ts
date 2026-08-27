import { Response } from 'express';
import { Types } from 'mongoose';

import { AuthRequest } from '../middlewares/auth';
import Challenge from '../models/Challenge';
import { claimChallengeReward } from '../services/challengeService';
import { getBalance } from '../services/coinService';
import { logger } from '../utils/logger';

export async function getMyChallenges(req: AuthRequest, res: Response) {
  const challenges = await Challenge.find({
    userId: req.userId,
    // 'claimed' rows are kept out of the active list but still shown as done
    // for the rest of the period, so a player can see what they earned.
    status: { $in: ['active', 'completed', 'claimed'] },
  })
    .sort({ status: 1, expiresAt: 1 })
    .lean();

  return res.json({
    challenges: challenges.map((c) => ({
      ...c,
      claimable: c.status === 'completed',
      claimed: c.status === 'claimed',
    })),
  });
}

/**
 * POST /api/challenges/:challengeId/claim
 *
 * This used to return the reward amounts with a comment saying the reward had
 * "already been applied when the challenge was completed" — but nothing ever
 * applied it. Completing a challenge only flipped its status, so players were
 * shown a coin total they never received. The service call below is what
 * actually pays, and it is guarded so it can only pay once.
 */
export async function claimChallenge(req: AuthRequest, res: Response) {
  const { challengeId } = req.params;
  if (!Types.ObjectId.isValid(challengeId)) {
    return res.status(400).json({ message: 'Invalid challenge' });
  }

  try {
    const reward = await claimChallengeReward(req.userId!, challengeId);

    logger.info('Challenge reward claimed', {
      userId: req.userId,
      challengeId,
      coins: reward.rewardCoins,
    });

    return res.json({
      ok: true,
      rewardCoins: reward.rewardCoins,
      rewardPoints: reward.rewardPoints,
      coins: await getBalance(req.userId!),
    });
  } catch (err: any) {
    const message = err?.message ?? 'Could not claim that reward';

    if (message === 'Challenge not found') {
      return res.status(404).json({ message });
    }
    if (message === 'Reward already claimed') {
      return res.status(409).json({ message: "You've already claimed this reward" });
    }
    if (message === 'Challenge not yet completed') {
      return res.status(400).json({ message: 'Finish the challenge first' });
    }
    throw err;
  }
}
