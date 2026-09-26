import { Platform } from 'react-native';
import * as IAP from 'react-native-iap';
import type { Purchase } from 'react-native-iap';

import { api } from '@/src/api/api';
import { useCoinStore } from '@/src/store/useCoinStore';
import { usePremiumStore } from '@/src/store/usePremiumStore';
import { logger } from '@/src/utils/logger';
import { ALL_SKUS as COIN_SKUS } from './products';

export const SUBSCRIPTION_SKUS = [
  'pq_premium_monthly',
  'pq_premium_3month',
  'pq_premium_6month',
  'pq_premium_yearly',
] as const;

export type VerifyResult =
  | { kind: 'coins'; coinsAdded: number }
  | { kind: 'premium'; expiresAt: string | null; plan: string };

/**
 * Verify one store purchase with our server, then finish it.
 *
 * The transaction is only finished AFTER the server has banked it, so a failed
 * verification (offline, 5xx) leaves it pending and `reconcilePendingPurchases`
 * picks it up on the next launch. Throws on failure — callers decide how to
 * tell the user.
 */
export async function verifyAndFinish(purchase: Purchase): Promise<VerifyResult | null> {
  try {
    return await verifyAndFinishInner(purchase);
  } catch (err: any) {
    // 403 = this receipt belongs to a different PulseQuiz account. That will
    // never succeed here, so finish it rather than re-trying forever (and, on
    // Android, blocking the player from buying that pack again). Any other
    // failure stays unfinished: on Android an unacknowledged purchase is
    // auto-refunded after 3 days, which is the right outcome if our server
    // can't verify it.
    if (err?.response?.status === 403) {
      const consumable = COIN_SKUS.includes(purchase.productId);
      await IAP.finishTransaction({ purchase, isConsumable: consumable }).catch(() => {});
      logger.warn('Finished a purchase owned by another account', { sku: purchase.productId });
    }
    throw err;
  }
}

async function verifyAndFinishInner(purchase: Purchase): Promise<VerifyResult | null> {
  const sku = purchase.productId;
  const isIos = Platform.OS === 'ios';
  const isCoins = COIN_SKUS.includes(sku);
  const isSub = (SUBSCRIPTION_SKUS as readonly string[]).includes(sku);
  if (!isCoins && !isSub) return null;

  if (isIos && !purchase.transactionId) throw new Error('Missing transaction ID');
  if (!isIos && !purchase.purchaseToken) throw new Error('Missing purchase token');

  if (isCoins) {
    const res = isIos
      ? await api.post('/purchase/apple/verify', { sku, transactionId: purchase.transactionId })
      : await api.post('/purchase/google/verify', {
          sku,
          purchaseToken: purchase.purchaseToken,
          packageName: (purchase as IAP.PurchaseAndroid).packageNameAndroid,
        });
    await IAP.finishTransaction({ purchase, isConsumable: true });
    useCoinStore.getState().syncFromServer(res.data);
    return { kind: 'coins', coinsAdded: res.data?.coinsAdded ?? 0 };
  }

  const res = isIos
    ? await api.post('/subscription/apple/verify', {
        sku,
        transactionId: purchase.transactionId,
        originalTransactionId: (purchase as IAP.PurchaseIOS).originalTransactionIdentifierIOS,
      })
    : await api.post('/subscription/google/verify', {
        sku,
        purchaseToken: purchase.purchaseToken,
        packageName: (purchase as IAP.PurchaseAndroid).packageNameAndroid,
      });
  await IAP.finishTransaction({ purchase, isConsumable: false });
  usePremiumStore.getState().setPremium({ isPremium: true, expiresAt: res.data.expiresAt, plan: sku });
  return { kind: 'premium', expiresAt: res.data.expiresAt ?? null, plan: sku };
}

let reconciling = false;

/**
 * Credit anything paid for but never confirmed — the app was killed mid-
 * purchase, or verification failed offline. Android auto-refunds purchases not
 * acknowledged within 3 days, so this must run on launch, not only when the
 * player happens to reopen the store screen.
 */
export async function reconcilePendingPurchases(): Promise<number> {
  if (reconciling || Platform.OS === 'web') return 0;
  reconciling = true;
  let credited = 0;
  try {
    await IAP.initConnection();
    const pending: Purchase[] =
      Platform.OS === 'ios'
        ? await IAP.getPendingTransactionsIOS()
        : (await IAP.getAvailablePurchases()).filter((p) => {
            const a = p as IAP.PurchaseAndroid;
            // A 'pending' purchase (e.g. cash payment) isn't paid yet.
            if (p.purchaseState === 'pending') return false;
            // Unconsumed coin packs and unacknowledged subscriptions.
            return COIN_SKUS.includes(p.productId) || a.isAcknowledgedAndroid === false;
          });

    for (const p of pending) {
      try {
        if (await verifyAndFinish(p)) credited += 1;
      } catch (err) {
        logger.warn('Pending purchase not verified yet', { sku: p.productId, error: String(err) });
      }
    }
  } catch (err) {
    logger.warn('Purchase reconciliation skipped', { error: String(err) });
  } finally {
    reconciling = false;
  }
  return credited;
}
