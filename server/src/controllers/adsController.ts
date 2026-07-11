import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import User from '../models/User';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { creditCoins } from '../services/coinService';

const COOLDOWN_MS = Number(process.env.AD_REWARD_COOLDOWN_MS || 30_000);

export async function rewardAd(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const reward = Number(
    await getSetting(SETTINGS_KEYS.DAILY_AD_REWARD_COINS, 50),
  );

  const now = new Date();
  const cooldownFloor = new Date(now.getTime() - COOLDOWN_MS);

  // Atomic claim: only matches when the cooldown has elapsed, so two
  // concurrent requests can't both pass the check and double-credit.
  const user = await User.findOneAndUpdate(
    {
      _id: req.userId,
      $or: [
        { lastAdRewardAt: null },
        { lastAdRewardAt: { $lte: cooldownFloor } },
      ],
    },
    { $set: { lastAdRewardAt: now } },
    { returnDocument: 'after' },
  );

  if (!user) {
    const existing = await User.findById(req.userId).select('lastAdRewardAt').lean();
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }
    const elapsed = now.getTime() - (existing.lastAdRewardAt?.getTime() ?? 0);
    const remaining = Math.max(1, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
    return res.status(429).json({
      message: 'Ad cooldown active',
      remainingSeconds: remaining,
    });
  }

  const coins = await creditCoins(req.userId, reward, 'ad_reward');

  return res.json({
    coins,
    added: reward,
    cooldownSeconds: Math.round(COOLDOWN_MS / 1000),
  });
}
