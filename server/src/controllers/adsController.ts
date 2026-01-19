import CoinWallet from '../models/CoinWallet';
import { AuthRequest } from '../middlewares/auth';
import User from '../models/User';
import { Response } from 'express';

export async function rewardAd(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const REWARD = 50;
  const COOLDOWN_MS = 30_000; // 30 seconds

  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const now = Date.now();

  if (user.lastAdRewardAt) {
    const diff = now - user.lastAdRewardAt.getTime();

    if (diff < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - diff) / 1000);

      return res.status(429).json({
        message: 'Ad cooldown active',
        remainingSeconds: remaining,
      });
    }
  }

  // ✅ reward allowed
  user.lastAdRewardAt = new Date(now);
  await user.save();

  const wallet = await CoinWallet.findOneAndUpdate(
    { userId: req.userId },
    { $inc: { coins: REWARD } },
    { new: true, upsert: true },
  );

  return res.json({
    coins: wallet.coins,
    added: REWARD,
    cooldownSeconds: 30,
  });
}
