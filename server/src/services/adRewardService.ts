/**
 * Rewarded-ad coin crediting.
 *
 * Two invariants, both of which were missing before:
 *   1. Coins are only minted for an ad Google confirmed was watched.
 *   2. There is a real daily cap, enforced by counting verified rewards for
 *      the current UTC day — not just a 30-second cooldown.
 */
import AdReward from '../models/AdReward';
import User from '../models/User';
import { creditCoins } from './coinService';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { logger } from '../utils/logger';

export const AD_COOLDOWN_MS = Number(process.env.AD_REWARD_COOLDOWN_MS || 30_000);

function utcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export interface AdRewardConfig {
  coinsPerAd: number;
  dailyMax: number;
  cooldownSeconds: number;
}

export async function getAdRewardConfig(): Promise<AdRewardConfig> {
  const [coinsPerAd, dailyMax] = await Promise.all([
    getSetting(SETTINGS_KEYS.DAILY_AD_REWARD_COINS, 50),
    getSetting(SETTINGS_KEYS.DAILY_AD_REWARD_MAX, 5),
  ]);
  return {
    coinsPerAd: Number(coinsPerAd),
    dailyMax: Number(dailyMax),
    cooldownSeconds: Math.round(AD_COOLDOWN_MS / 1000),
  };
}

/** How many verified rewards this user has already banked today (UTC). */
export async function todaysRewardCount(userId: string): Promise<number> {
  return AdReward.countDocuments({ userId, rewardDate: utcDateKey() });
}

export interface CreditOutcome {
  credited: boolean;
  reason?: 'duplicate' | 'daily_cap' | 'user_missing';
  coinsAdded?: number;
  balance?: number;
  watchedToday?: number;
  dailyMax?: number;
}

/**
 * Credit a verified rewarded-ad impression.
 *
 * Idempotent on `transactionId` via a unique index, so a replayed or retried
 * callback is a no-op rather than a second credit.
 */
export async function creditVerifiedAdReward(params: {
  userId: string;
  transactionId: string;
  adUnit?: string;
  adNetwork?: string;
  rewardAmount?: number;
  rewardItem?: string;
}): Promise<CreditOutcome> {
  const { userId, transactionId } = params;

  const user = await User.findById(userId).select('_id isBanned deletedAt').lean();
  if (!user || user.isBanned || user.deletedAt) {
    return { credited: false, reason: 'user_missing' };
  }

  const config = await getAdRewardConfig();
  const rewardDate = utcDateKey();

  const already = await AdReward.countDocuments({ userId, rewardDate });
  if (already >= config.dailyMax) {
    return {
      credited: false,
      reason: 'daily_cap',
      watchedToday: already,
      dailyMax: config.dailyMax,
    };
  }

  // The unique index on transactionId is the idempotency guard: a duplicate
  // callback throws E11000 here, before any coins move.
  try {
    await AdReward.create({
      userId,
      transactionId,
      adUnit: params.adUnit,
      adNetwork: params.adNetwork,
      rewardAmount: params.rewardAmount,
      rewardItem: params.rewardItem,
      coinsCredited: config.coinsPerAd,
      rewardDate,
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      logger.debug('Duplicate ad reward callback ignored', { transactionId });
      return { credited: false, reason: 'duplicate' };
    }
    throw err;
  }

  const balance = await creditCoins(userId, config.coinsPerAd, 'ad_reward', {
    note: `admob:${transactionId}`,
  });

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        lastAdRewardAt: new Date(),
        adRewardWindowDate: rewardDate,
        adRewardsInWindow: already + 1,
      },
    },
  );

  logger.info('Ad reward credited', {
    userId,
    transactionId,
    coins: config.coinsPerAd,
    watchedToday: already + 1,
  });

  return {
    credited: true,
    coinsAdded: config.coinsPerAd,
    balance,
    watchedToday: already + 1,
    dailyMax: config.dailyMax,
  };
}
