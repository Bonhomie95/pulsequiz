import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Referral, { IReferral } from '../models/Referral';
import User from '../models/User';
import { creditCoins } from '../services/coinService';

export async function getMyReferrals(req: AuthRequest, res: Response) {
  const referrals = await Referral.find({ referrerId: req.userId }).lean();
  const total = referrals.length;
  const rewarded = (referrals as IReferral[]).filter((r) => r.rewardGranted).length;
  const coinsEarned = (referrals as IReferral[]).reduce((acc: number, r: IReferral) => acc + (r.rewardGranted ? r.rewardCoins : 0), 0);

  return res.json({ total, rewarded, coinsEarned });
}

export async function getReferralCode(req: AuthRequest, res: Response) {
  const user = await User.findById(req.userId).select('username').lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  // Referral code = username-based (simple approach)
  const code = `REF-${(user.username ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`;
  return res.json({ code });
}

export async function applyReferralCode(req: AuthRequest, res: Response) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: 'code required' });

  // Find referrer by code
  const clean = (code as string).replace('REF-', '');
  const referrer = await User.findOne({
    username: { $regex: new RegExp(`^${clean}`, 'i') }
  }).lean();

  if (!referrer) return res.status(404).json({ message: 'Invalid referral code' });
  if (referrer._id.toString() === req.userId) return res.status(400).json({ message: 'Cannot refer yourself' });

  const existing = await Referral.findOne({ referredId: req.userId });
  if (existing) return res.status(400).json({ message: 'You have already used a referral code' });

  const REWARD = 100;
  const referral = await Referral.create({
    referrerId: referrer._id,
    referredId: req.userId,
    rewardGranted: true,
    rewardCoins: REWARD,
  });

  // Grant coins to referrer
  await creditCoins(referrer._id.toString(), REWARD, 'referral_bonus', { note: `referred:${req.userId}` });

  return res.json({ ok: true, coinsGrantedToReferrer: REWARD });
}
