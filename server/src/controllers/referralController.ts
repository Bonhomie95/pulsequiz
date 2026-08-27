import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Referral, { IReferral } from '../models/Referral';
import User from '../models/User';
import Progress from '../models/Progress';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { creditCoins } from '../services/coinService';
import { logger } from '../utils/logger';

/** Referral code = "REF-" + first 8 alphanumeric chars of the username, uppercased. */
function codeForUsername(username: string | null | undefined): string | null {
  const part = (username ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return part ? `REF-${part}` : null;
}

export async function getMyReferrals(req: AuthRequest, res: Response) {
  const referrals = (await Referral.find({ referrerId: req.userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()) as IReferral[];

  const total = referrals.length;
  const rewarded = referrals.filter((r) => r.rewardGranted).length;
  const coinsEarned = referrals.reduce(
    (acc, r) => acc + (r.rewardGranted ? r.rewardCoins : 0),
    0,
  );

  const reward = Number(await getSetting(SETTINGS_KEYS.REFERRAL_COIN_REFERRER, 100));

  return res.json({
    total,
    rewarded,
    // Signed up but hasn't finished their first quiz yet.
    pending: total - rewarded,
    coinsEarned,
    rewardPerReferral: reward,
  });
}

export async function getReferralCode(req: AuthRequest, res: Response) {
  const user = await User.findById(req.userId).select('username').lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const reward = Number(await getSetting(SETTINGS_KEYS.REFERRAL_COIN_REFERRER, 100));

  return res.json({
    code: codeForUsername(user.username) ?? 'REF-',
    rewardPerReferral: reward,
  });
}

export async function applyReferralCode(req: AuthRequest, res: Response) {
  const raw = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!raw) return res.status(400).json({ message: 'Enter a referral code' });

  // Strict format check — also prevents regex injection below.
  const clean = raw.replace(/^REF-/, '');
  if (!/^[A-Z0-9]{1,8}$/.test(clean)) {
    return res.status(404).json({ message: "That referral code doesn't exist" });
  }

  // Codes are an uppercased username prefix, and usernames are stored
  // lowercase — so lowercase the needle and drop the 'i' flag. A
  // case-insensitive regex cannot use an index; an anchored one can.
  const candidates = await User.find({
    username: { $regex: `^${clean.toLowerCase()}` },
    isBanned: { $ne: true },
    deletedAt: null,
  })
    .select('username')
    .limit(20)
    .lean();

  const referrer = candidates.find(
    (u) => codeForUsername(u.username) === `REF-${clean}`,
  );

  if (!referrer) return res.status(404).json({ message: "That referral code doesn't exist" });
  if (referrer._id.toString() === req.userId) {
    return res.status(400).json({ message: "You can't refer yourself" });
  }

  // A brand-new account claiming a code is the normal case; an established
  // account doing it is almost always someone farming their own referrals.
  const me = await User.findById(req.userId).select('createdAt hasCompletedFirstQuiz').lean();
  if (me?.hasCompletedFirstQuiz) {
    return res.status(400).json({
      message: 'Referral codes can only be used before your first quiz',
    });
  }

  const existing = await Referral.findOne({ referredId: req.userId }).lean();
  if (existing) {
    return res.status(400).json({ message: "You've already used a referral code" });
  }

  const reward = Number(await getSetting(SETTINGS_KEYS.REFERRAL_COIN_REFERRER, 100));
  const newUserReward = Number(await getSetting(SETTINGS_KEYS.REFERRAL_COIN_NEW_USER, 50));

  // The unique index on referredId makes this race-safe: a concurrent second
  // apply throws a duplicate-key error instead of creating a second referral.
  //
  // rewardGranted starts FALSE. The referrer is paid when the referred player
  // finishes their first quiz — quizController.finish looks for exactly this
  // row. Previously it was created as already-granted AND paid immediately,
  // so the first-quiz gate never fired and a referrer could be paid for
  // accounts that never played.
  try {
    await Referral.create({
      referrerId: referrer._id,
      referredId: req.userId,
      rewardGranted: false,
      rewardCoins: reward,
    });
  } catch (e: any) {
    if (e?.code === 11000) {
      return res.status(400).json({ message: "You've already used a referral code" });
    }
    throw e;
  }

  // The joining player's welcome bonus is unconditional — they've done the
  // thing we asked (entered a code) and there's nothing to farm.
  let coinsGranted = 0;
  if (newUserReward > 0) {
    await creditCoins(req.userId!, newUserReward, 'referral_bonus', {
      note: `joined_via:${referrer._id}`,
    });
    coinsGranted = newUserReward;
  }

  logger.info('Referral code applied', {
    referrerId: referrer._id.toString(),
    referredId: req.userId,
  });

  return res.json({
    ok: true,
    coinsGranted,
    referrerUsername: referrer.username,
    message: `You got ${coinsGranted} coins! ${referrer.username} earns ${reward} when you finish your first quiz.`,
  });
}

/**
 * Pay the referrer once the referred player completes their first quiz.
 *
 * Called from the quiz-finish path. Guarded by a conditional update so it can
 * only ever pay once, even if finish() is retried.
 */
export async function grantReferralOnFirstQuiz(referredUserId: string): Promise<void> {
  const referral = await Referral.findOneAndUpdate(
    { referredId: referredUserId, rewardGranted: false },
    { $set: { rewardGranted: true, grantedAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!referral) return;

  // Don't pay for a referral into a banned account.
  const referrer = await User.findById(referral.referrerId)
    .select('isBanned deletedAt')
    .lean();
  if (!referrer || referrer.isBanned || referrer.deletedAt) return;

  await creditCoins(referral.referrerId.toString(), referral.rewardCoins, 'referral_bonus', {
    note: `referral_firstquiz:${referredUserId}`,
  });

  logger.info('Referral reward granted', {
    referrerId: referral.referrerId.toString(),
    referredId: referredUserId,
    coins: referral.rewardCoins,
  });
}
