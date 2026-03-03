import { Response } from 'express';
import mongoose from 'mongoose';

import { AuthRequest } from '../middlewares/auth';
import Purchase from '../models/Purchase';
import CoinWallet from '../models/CoinWallet';
import { CoinSku, COIN_PACKS } from '../iap/products';
import { verifyAppleTransaction } from '../iap/apple';
import { verifyGooglePurchase } from '../iap/google';
import { logActivity } from '../utils/activityLogger';

// ─── Atomic coin crediting ─────────────────────────────────────────────────

async function creditCoinsAtomic(params: {
  userId: string;
  purchaseId: string;
  coins: number;
}) {
  const { userId, purchaseId, coins } = params;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Purchase.updateOne(
        { _id: purchaseId },
        {
          $set: {
            state: 'CREDITED',
            creditedAt: new Date(),
            creditedCoins: coins,
          },
        },
        { session },
      );

      await CoinWallet.updateOne(
        { userId },
        { $inc: { coins } },
        { upsert: true, session },
      );
    });
  } finally {
    session.endSession();
  }
}

// ─── Apple refund handler (call from Apple Server Notifications webhook) ───

export async function handleAppleRefund(purchase: any) {
  if (!purchase || purchase.state === 'REFUNDED' || !purchase.creditedCoins)
    return;

  await CoinWallet.updateOne(
    { userId: purchase.userId },
    { $inc: { coins: -purchase.creditedCoins } },
  );

  purchase.state = 'REFUNDED';
  await purchase.save();
}

// ─── Apple verify ──────────────────────────────────────────────────────────

export async function verifyApple(req: AuthRequest, res: Response) {
  const { sku, transactionId } = req.body as {
    sku: CoinSku;
    transactionId: string;
  };
  const userId = req.userId!;

  if (!sku || !transactionId) {
    return res
      .status(400)
      .json({ message: 'sku and transactionId are required' });
  }

  const pack = COIN_PACKS[sku];
  if (!pack) {
    return res.status(400).json({ message: `Unknown SKU: ${sku}` });
  }

  const uniqueKey = `apple:${transactionId}`;

  // Idempotent upsert — create the record on first call, load it on retries
  const purchase = await Purchase.findOneAndUpdate(
    { uniqueKey },
    {
      $setOnInsert: {
        userId,
        store: 'apple',
        sku,
        coins: pack.coins,
        priceUsd: pack.usd,
        uniqueKey,
        appleTransactionId: transactionId,
        state: 'PENDING',
        ip: req.ip ?? null,
      },
    },
    { upsert: true, new: true },
  );

  // Anti-replay: this transaction ID cannot be used by a different account
  if (purchase.userId.toString() !== userId.toString()) {
    return res.status(403).json({ message: 'Ownership mismatch' });
  }

  // Already credited — return success idempotently (mobile retried after a drop)
  if (purchase.state === 'CREDITED') {
    return res.json({ ok: true, coinsAdded: 0, message: 'Already credited' });
  }

  // Verify with Apple's server
  const apple = await verifyAppleTransaction(transactionId, sku);

  purchase.raw = apple.data ?? null;
  purchase.verifiedAt = new Date();

  if (!apple.valid || apple.productId !== sku) {
    purchase.state = 'REJECTED';
    await purchase.save();
    console.warn(
      `[Apple IAP] Rejected: txId=${transactionId} sku=${sku} productId=${apple.productId} error=${apple.error}`,
    );
    return res
      .status(400)
      .json({ message: 'Transaction is invalid or does not match SKU' });
  }

  await purchase.save();

  // Credit atomically
  await creditCoinsAtomic({
    userId,
    purchaseId: purchase._id.toString(),
    coins: pack.coins,
  });

  await logActivity(userId, 'PURCHASE', {
    store: 'apple',
    sku,
    coins: pack.coins,
  });

  return res.json({ ok: true, coinsAdded: pack.coins });
}

// ─── Google verify ─────────────────────────────────────────────────────────

export async function verifyGoogle(req: AuthRequest, res: Response) {
  const { sku, purchaseToken, packageName } = req.body as {
    sku: CoinSku;
    purchaseToken: string;
    packageName: string;
  };
  const userId = req.userId!;

  if (!sku || !purchaseToken || !packageName) {
    return res
      .status(400)
      .json({ message: 'sku, purchaseToken, and packageName are required' });
  }

  const pack = COIN_PACKS[sku];
  if (!pack) {
    return res.status(400).json({ message: `Unknown SKU: ${sku}` });
  }

  const uniqueKey = `google:${purchaseToken}`;

  const purchase = await Purchase.findOneAndUpdate(
    { uniqueKey },
    {
      $setOnInsert: {
        userId,
        store: 'google',
        sku,
        coins: pack.coins,
        priceUsd: pack.usd,
        uniqueKey,
        googlePurchaseToken: purchaseToken,
        state: 'PENDING',
        ip: req.ip ?? null,
      },
    },
    { upsert: true, new: true },
  );

  if (purchase.userId.toString() !== userId.toString()) {
    return res.status(403).json({ message: 'Ownership mismatch' });
  }

  if (purchase.state === 'CREDITED') {
    return res.json({ ok: true, coinsAdded: 0, message: 'Already credited' });
  }

  const google = await verifyGooglePurchase({
    packageName,
    productId: sku,
    purchaseToken,
  });

  purchase.raw = google.data ?? null;
  purchase.verifiedAt = new Date();

  if (!google.valid) {
    purchase.state = 'REJECTED';
    await purchase.save();
    console.warn(
      `[Google IAP] Rejected: token=${purchaseToken.slice(0, 20)}… sku=${sku} purchaseState=${google.purchaseState} error=${google.error}`,
    );
    return res
      .status(400)
      .json({ message: 'Purchase is invalid or already consumed' });
  }

  await purchase.save();

  await creditCoinsAtomic({
    userId,
    purchaseId: purchase._id.toString(),
    coins: pack.coins,
  });

  await logActivity(userId, 'PURCHASE', {
    store: 'google',
    sku,
    coins: pack.coins,
  });

  return res.json({ ok: true, coinsAdded: pack.coins });
}

// ─── Apple restore ─────────────────────────────────────────────────────────
//
// NOTE: consumable in-app purchases (coins) cannot be restored by Apple policy.
// This endpoint exists only for non-consumables if you add any in future.
// For coins specifically, we sum all CREDITED purchases as a best-effort restore.

export async function restoreApple(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  const purchases = await Purchase.find({
    userId,
    store: 'apple',
    state: 'CREDITED',
  }).lean();

  const restoredCoins = purchases.reduce(
    (sum, p) => sum + (p.creditedCoins ?? 0),
    0,
  );

  // Overwrite wallet with sum of all credited purchases
  await CoinWallet.updateOne(
    { userId },
    { $set: { coins: restoredCoins } },
    { upsert: true },
  );

  return res.json({ ok: true, restoredCoins });
}
