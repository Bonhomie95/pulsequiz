import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Referral, { IReferral } from '../models/Referral';
import User from '../models/User';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { creditCoins } from '../services/coinService';

/** Referral code = "REF-" + first 8 alphanumeric chars of the username, uppercased. */
function codeForUsername(username: string | null | undefined): string | null {
  const part = (username ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return part ? `REF-${part}` : null;
}

export async function getMyReferrals(req: AuthRequest, res: Response) {
  const referrals = (await Referral.find({ referrerId: req.userId }).lean()) as IReferral[];
  const total = referrals.length;
  const rewarded = referrals.filter((r) => r.rewardGranted).length;
  const coinsEarned = referrals.reduce(
    (acc, r) => acc + (r.rewardGranted ? r.rewardCoins : 0),
    0,
  );

  return res.json({ total, rewarded, coinsEarned });
}

export async function getReferralCode(req: AuthRequest, res: Response) {
  const user = await User.findById(req.userId).select('username').lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ code: codeForUsername(user.username) ?? 'REF-' });
}

export async function applyReferralCode(req: AuthRequest, res: Response) {
  const raw = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!raw) return res.status(400).json({ message: 'code required' });

  // Strict format check — also prevents regex injection below
  const clean = raw.replace(/^REF-/, '');
  if (!/^[A-Z0-9]{1,8}$/.test(clean)) {
    return res.status(404).json({ message: 'Invalid referral code' });
  }

  // Codes are a username prefix, so prefix-match candidates and confirm the
  // derived code matches exactly (avoids "REF-AB" claiming user "ABCDEF").
  const candidates = await User.find({
    username: { $regex: new RegExp(`^${clean}`, 'i') },
  })
    .select('username')
    .limit(20)
    .lean();

  const referrer = candidates.find(
    (u) => codeForUsername(u.username) === `REF-${clean}`,
  );

  if (!referrer) return res.status(404).json({ message: 'Invalid referral code' });
  if (referrer._id.toString() === req.userId) {
    return res.status(400).json({ message: 'Cannot refer yourself' });
  }

  const existing = await Referral.findOne({ referredId: req.userId });
  if (existing) {
    return res.status(400).json({ message: 'You have already used a referral code' });
  }

  const reward = Number(
    await getSetting(SETTINGS_KEYS.REFERRAL_COIN_REFERRER, 100),
  );

  // The unique index on referredId makes this race-safe: a concurrent second
  // apply throws a duplicate-key error instead of double-crediting.
  try {
    await Referral.create({
      referrerId: referrer._id,
      referredId: req.userId,
      rewardGranted: true,
      rewardCoins: reward,
    });
  } catch (e: any) {
    if (e?.code === 11000) {
      return res.status(400).json({ message: 'You have already used a referral code' });
    }
    throw e;
  }

  await creditCoins(referrer._id.toString(), reward, 'referral_bonus', {
    note: `referred:${req.userId}`,
  });

  return res.json({ ok: true, coinsGrantedToReferrer: reward });
}
