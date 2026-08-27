import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import CoinWallet from '../models/CoinWallet';
import {
  AD_COOLDOWN_MS,
  creditVerifiedAdReward,
  getAdRewardConfig,
  todaysRewardCount,
} from '../services/adRewardService';
import { isSsvEnabled, verifyAdmobSsv } from '../services/admobSsv';
import { logger } from '../utils/logger';
import AdReward from '../models/AdReward';

/**
 * GET /api/ads/config  (auth)
 *
 * The client must render the reward the server will actually pay. Hardcoding
 * "+50 coins" in the UI while the server paid 10 was a straightforward way to
 * make users feel cheated.
 */
export async function getAdConfig(req: AuthRequest, res: Response) {
  const config = await getAdRewardConfig();
  const [watchedToday, last] = await Promise.all([
    todaysRewardCount(req.userId!),
    AdReward.findOne({ userId: req.userId }).sort({ createdAt: -1 }).select('createdAt').lean(),
  ]);

  const sinceLast = last ? Date.now() - new Date(last.createdAt).getTime() : Infinity;
  const cooldownRemaining =
    sinceLast < AD_COOLDOWN_MS ? Math.ceil((AD_COOLDOWN_MS - sinceLast) / 1000) : 0;

  return res.json({
    coinsPerAd: config.coinsPerAd,
    dailyMax: config.dailyMax,
    watchedToday,
    remainingToday: Math.max(0, config.dailyMax - watchedToday),
    cooldownSeconds: config.cooldownSeconds,
    cooldownRemaining,
    // Tells the client whether to wait for the server callback or expect the
    // legacy immediate credit.
    serverVerified: isSsvEnabled(),
  });
}

/**
 * GET /api/webhooks/admob/ssv   (public — authenticated by signature)
 *
 * Google calls this directly after a rewarded ad completes. This is the only
 * path that mints ad coins when ADMOB_SSV_ENABLED=1.
 */
export async function admobSsvCallback(req: Request, res: Response) {
  // Everything after the "?" exactly as received — the signature covers these
  // raw bytes, so it must not be re-serialised from the parsed object.
  const rawQuery = req.originalUrl.split('?')[1] ?? '';

  const params: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.query)) {
    params[k] = Array.isArray(v) ? String(v[0]) : v == null ? undefined : String(v);
  }

  const result = await verifyAdmobSsv(rawQuery, params);

  if (!result.valid) {
    logger.warn('Rejected AdMob SSV callback', { reason: result.reason });
    // Google retries on non-2xx; a bad signature will never become good, so
    // acknowledge it and drop it rather than inviting an infinite retry loop.
    return res.status(200).send('rejected');
  }

  try {
    const outcome = await creditVerifiedAdReward({
      userId: result.userId,
      transactionId: result.transactionId,
      adUnit: result.adUnit,
      adNetwork: result.adNetwork,
      rewardAmount: result.rewardAmount,
      rewardItem: result.rewardItem,
    });

    if (!outcome.credited) {
      logger.info('AdMob SSV callback not credited', {
        reason: outcome.reason,
        userId: result.userId,
      });
    }
    return res.status(200).send('ok');
  } catch (err) {
    logger.error('AdMob SSV crediting failed', err, {
      transactionId: result.transactionId,
    });
    // 500 so Google retries — the reward is legitimate, we just failed to bank it.
    return res.status(500).send('error');
  }
}

/**
 * POST /api/ads/reward  (auth)
 *
 * With SSV enabled this no longer mints anything: the client calls it after an
 * ad finishes purely to pick up the balance the callback already credited.
 *
 * When SSV is disabled (local development only — server.ts refuses to boot in
 * production without ADMOB_SSV_ENABLED) it falls back to the old
 * client-attested behaviour so the flow remains testable on a simulator.
 */
export async function rewardAd(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const config = await getAdRewardConfig();

  if (isSsvEnabled()) {
    const [wallet, watchedToday] = await Promise.all([
      CoinWallet.findOne({ userId }).select('coins').lean(),
      todaysRewardCount(userId),
    ]);

    return res.json({
      pending: true,
      coins: wallet?.coins ?? 0,
      added: 0,
      coinsPerAd: config.coinsPerAd,
      watchedToday,
      dailyMax: config.dailyMax,
      remainingToday: Math.max(0, config.dailyMax - watchedToday),
      cooldownSeconds: config.cooldownSeconds,
      message: 'Reward confirmed by the ad network — your balance will update shortly.',
    });
  }

  // ── Development fallback ──────────────────────────────────────────────────
  logger.warn('Crediting ad reward without SSV (development fallback)', { userId });

  const outcome = await creditVerifiedAdReward({
    userId,
    // Synthetic id keeps the same idempotency and daily-cap machinery in play.
    transactionId: `dev:${userId}:${Date.now()}`,
  });

  if (!outcome.credited) {
    const status = outcome.reason === 'daily_cap' ? 429 : 400;
    return res.status(status).json({
      message:
        outcome.reason === 'daily_cap'
          ? "You've reached today's ad limit. Come back tomorrow!"
          : 'Reward could not be granted.',
      watchedToday: outcome.watchedToday,
      dailyMax: outcome.dailyMax ?? config.dailyMax,
    });
  }

  return res.json({
    coins: outcome.balance,
    added: outcome.coinsAdded,
    coinsPerAd: config.coinsPerAd,
    watchedToday: outcome.watchedToday,
    dailyMax: outcome.dailyMax,
    remainingToday: Math.max(0, (outcome.dailyMax ?? 0) - (outcome.watchedToday ?? 0)),
    cooldownSeconds: config.cooldownSeconds,
  });
}
