import { Response } from 'express';
import mongoose from 'mongoose';

import { AuthRequest } from '../middlewares/auth';
import Purchase from '../models/Purchase';
import CoinWallet from '../models/CoinWallet';
import { CoinSku, COIN_PACKS } from '../iap/products';
import { verifyAppleTransaction } from '../iap/apple';
import { verifyGooglePurchase } from '../iap/google';

/* -------------------------------------------------- */
/* Helpers                                             */
/* -------------------------------------------------- */

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

/**
 * Optional: refund handler (hook later to Apple Server Notifications V2 or cron reconciliation)
 */
export async function handleAppleRefund(purchase: any) {
  if (!purchase) return;
  if (purchase.state === 'REFUNDED') return;
  if (!purchase.creditedCoins) return;

  await CoinWallet.updateOne(
    { userId: purchase.userId },
    { $inc: { coins: -purchase.creditedCoins } },
  );

  purchase.state = 'REFUNDED';
  purchase.creditedAt = purchase.creditedAt ?? new Date();
  await purchase.save();
}

/* -------------------------------------------------- */
/* APPLE VERIFY                                        */
/* -------------------------------------------------- */

export async function verifyApple(req: AuthRequest, res: Response) {
  const { sku, transactionId } = req.body as {
    sku: CoinSku;
    transactionId: string;
  };

  const userId = req.userId!;
  const pack = COIN_PACKS[sku];

  if (!pack) {
    return res.status(400).json({ message: 'Invalid SKU' });
  }

  if (!transactionId) {
    return res.status(400).json({ message: 'transactionId required' });
  }

  const uniqueKey = `apple:${transactionId}`;

  // Create-or-load purchase record (idempotent)
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
      },
    },
    { upsert: true, new: true },
  );

  // ✅ Anti-replay: same receipt cannot be used by another account
  if (purchase.userId.toString() !== userId.toString()) {
    return res.status(403).json({ message: 'Ownership mismatch' });
  }

  // If already credited, be idempotent
  if (purchase.state === 'CREDITED') {
    return res.json({ ok: true, coinsAdded: 0 });
  }

  // Verify with Apple
  const apple = await verifyAppleTransaction(transactionId, sku);

  // Must match SKU and be valid
  if (!apple.valid || apple.productId !== sku) {
    purchase.state = 'REJECTED';
    purchase.raw = apple.data ?? null;
    purchase.verifiedAt = new Date();
    await purchase.save();
    return res.status(400).json({ message: 'Invalid transaction' });
  }

  purchase.raw = apple.data ?? null;
  purchase.verifiedAt = new Date();
  await purchase.save();

  // Credit atomically
  await creditCoinsAtomic({
    userId,
    purchaseId: purchase._id.toString(),
    coins: pack.coins,
  });

  return res.json({ ok: true, coinsAdded: pack.coins });
}

/* -------------------------------------------------- */
/* GOOGLE VERIFY                                       */
/* -------------------------------------------------- */

export async function verifyGoogle(req: AuthRequest, res: Response) {
  const { sku, purchaseToken, packageName } = req.body as {
    sku: CoinSku;
    purchaseToken: string;
    packageName: string;
  };

  const userId = req.userId!;
  const pack = COIN_PACKS[sku];

  if (!pack) {
    return res.status(400).json({ message: 'Invalid SKU' });
  }

  if (!purchaseToken || !packageName) {
    return res
      .status(400)
      .json({ message: 'purchaseToken and packageName required' });
  }

  const uniqueKey = `google:${purchaseToken}`;

  // Create-or-load purchase record (idempotent)
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
      },
    },
    { upsert: true, new: true },
  );

  // ✅ Anti-replay: token cannot be reused on another account
  if (purchase.userId.toString() !== userId.toString()) {
    return res.status(403).json({ message: 'Ownership mismatch' });
  }

  // If already credited, be idempotent
  if (purchase.state === 'CREDITED') {
    return res.json({ ok: true, coinsAdded: 0 });
  }

  // Verify with Google + acknowledge if needed
  const google = await verifyGooglePurchase({
    packageName,
    productId: sku,
    purchaseToken,
  });

  // Snapshot
  purchase.raw = google.data ?? null;
  purchase.verifiedAt = new Date();
  await purchase.save();

  if (!google.valid) {
    purchase.state = 'REJECTED';
    await purchase.save();
    return res.status(400).json({ message: 'Invalid purchase' });
  }

  // Credit atomically
  await creditCoinsAtomic({
    userId,
    purchaseId: purchase._id.toString(),
    coins: pack.coins,
  });

  return res.json({ ok: true, coinsAdded: pack.coins });
}

export async function restoreApple(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  const purchases = await Purchase.find({
    userId,
    store: 'apple',
    state: 'CREDITED',
  });

  let restoredCoins = 0;

  for (const p of purchases) {
    restoredCoins += p.creditedCoins;
  }

  await CoinWallet.updateOne(
    { userId },
    { $set: { coins: restoredCoins } },
    { upsert: true },
  );

  return res.json({
    ok: true,
    restoredCoins,
  });
}
