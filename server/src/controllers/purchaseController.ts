import { Response } from 'express';
import mongoose from 'mongoose';

import { AuthRequest } from '../middlewares/auth';
import Purchase from '../models/Purchase';
import CoinWallet from '../models/CoinWallet';
import { CoinSku, COIN_PACKS } from '../iap/products';
import { verifyAppleTransaction } from '../iap/apple';
import { verifyGooglePurchase, resolveTrustedPackageName } from '../iap/google';
import { logActivity } from '../utils/activityLogger';

// ─── Atomic coin crediting ─────────────────────────────────────────────────

async function creditCoinsAtomic(params: {
  userId: string;
  purchaseId: string;
  coins: number;
}): Promise<number> {
  const { userId, purchaseId, coins } = params;

  let newBalance = 0;
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

      const wallet = await CoinWallet.findOneAndUpdate(
        { userId },
        { $inc: { coins } },
        { upsert: true, returnDocument: 'after', session },
      );
      newBalance = wallet?.coins ?? coins;
    });
  } finally {
    session.endSession();
  }
  return newBalance;
}

/** Current wallet balance, or 0 if the wallet doesn't exist yet. */
async function currentBalance(userId: string): Promise<number> {
  const wallet = await CoinWallet.findOne({ userId }, { coins: 1 }).lean();
  return wallet?.coins ?? 0;
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
    { upsert: true, returnDocument: 'after' },
  );

  // Anti-replay: this transaction ID cannot be used by a different account
  if (purchase.userId.toString() !== userId.toString()) {
    return res.status(403).json({ message: 'Ownership mismatch' });
  }

  // Already credited — return success idempotently (mobile retried after a drop)
  if (purchase.state === 'CREDITED') {
    return res.json({
      ok: true,
      coinsAdded: 0,
      coins: await currentBalance(userId),
      message: 'Already credited',
    });
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
  const coins = await creditCoinsAtomic({
    userId,
    purchaseId: purchase._id.toString(),
    coins: pack.coins,
  });

  await logActivity(userId, 'PURCHASE', {
    store: 'apple',
    sku,
    coins: pack.coins,
  });

  return res.json({ ok: true, coinsAdded: pack.coins, coins });
}

// ─── Google verify ─────────────────────────────────────────────────────────

export async function verifyGoogle(req: AuthRequest, res: Response) {
  const { sku, purchaseToken, packageName } = req.body as {
    sku: CoinSku;
    purchaseToken: string;
    packageName: string;
  };
  const userId = req.userId!;

  if (!sku || !purchaseToken) {
    return res
      .status(400)
      .json({ message: 'sku and purchaseToken are required' });
  }

  const pack = COIN_PACKS[sku];
  if (!pack) {
    return res.status(400).json({ message: `Unknown SKU: ${sku}` });
  }

  const resolved = resolveTrustedPackageName(packageName);
  if ('error' in resolved) {
    return res.status(400).json({ message: resolved.error });
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
    { upsert: true, returnDocument: 'after' },
  );

  if (purchase.userId.toString() !== userId.toString()) {
    return res.status(403).json({ message: 'Ownership mismatch' });
  }

  if (purchase.state === 'CREDITED') {
    return res.json({
      ok: true,
      coinsAdded: 0,
      coins: await currentBalance(userId),
      message: 'Already credited',
    });
  }

  const google = await verifyGooglePurchase({
    packageName: resolved.packageName,
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

  const coins = await creditCoinsAtomic({
    userId,
    purchaseId: purchase._id.toString(),
    coins: pack.coins,
  });

  await logActivity(userId, 'PURCHASE', {
    store: 'google',
    sku,
    coins: pack.coins,
  });

  return res.json({ ok: true, coinsAdded: pack.coins, coins });
}

// ─── Apple restore ─────────────────────────────────────────────────────────
//
// NOTE: consumable in-app purchases (coins) cannot be restored by Apple policy.
// This endpoint only reports the total previously credited; it must NOT write
// the wallet — the balance also contains coins earned from quizzes, ads,
// streaks etc., which a purchase-sum overwrite would destroy.

export async function restoreApple(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  const [purchases, wallet] = await Promise.all([
    Purchase.find({ userId, store: 'apple', state: 'CREDITED' }).lean(),
    CoinWallet.findOne({ userId }).lean(),
  ]);

  const restoredCoins = purchases.reduce(
    (sum, p) => sum + (p.creditedCoins ?? 0),
    0,
  );

  return res.json({ ok: true, restoredCoins, coins: wallet?.coins ?? 0 });
}
