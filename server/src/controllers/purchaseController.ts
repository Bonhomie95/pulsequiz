import { Response } from 'express';
import mongoose from 'mongoose';

import { AuthRequest } from '../middlewares/auth';
import Purchase from '../models/Purchase';
import CoinWallet from '../models/CoinWallet';
import CoinTransaction from '../models/CoinTransaction';
import { logger } from '../utils/logger';
import { CoinSku, COIN_PACKS } from '../iap/products';
import { verifyAppleTransaction } from '../iap/apple';
import { verifyGooglePurchase, resolveTrustedPackageName } from '../iap/google';
import { logActivity } from '../utils/activityLogger';

// ─── Atomic coin crediting ─────────────────────────────────────────────────

/**
 * Credit a verified purchase.
 *
 * Three writes that must agree: the purchase is marked credited, the wallet is
 * incremented, and a ledger entry records it. The ledger entry is not optional
 * — a paid purchase is the single largest source of coins in the system, and
 * omitting it made every paying customer look like drift to the nightly
 * reconciliation job.
 *
 * Runs in a transaction where the deployment supports one. Transactions need a
 * replica set; on a standalone mongod (local development) we fall back to
 * sequential writes ordered so the worst case is a credited wallet with the
 * purchase still marked pending, which the retry path resolves idempotently.
 */
async function creditCoinsAtomic(params: {
  userId: string;
  purchaseId: string;
  coins: number;
  store: 'apple' | 'google';
  uniqueKey: string;
}): Promise<number> {
  const { userId, purchaseId, coins, store, uniqueKey } = params;

  const apply = async (session?: mongoose.ClientSession) => {
    const opts = session ? { session } : {};

    const wallet = await CoinWallet.findOneAndUpdate(
      { userId },
      { $inc: { coins } },
      { upsert: true, returnDocument: 'after', ...opts },
    );
    const balance = wallet?.coins ?? coins;

    await CoinTransaction.create(
      [
        {
          userId,
          delta: coins,
          balanceAfter: balance,
          reason: 'iap_purchase',
          meta: `${store}:${uniqueKey}`,
        },
      ],
      session ? { session } : {},
    );

    await Purchase.updateOne(
      { _id: purchaseId },
      {
        $set: {
          state: 'CREDITED',
          creditedAt: new Date(),
          creditedCoins: coins,
        },
      },
      opts,
    );

    return balance;
  };

  // Decide from the topology rather than by pattern-matching an error string:
  // a standalone mongod rejects transactions with several different messages
  // ("does not support retryable writes", "Transaction numbers are only
  // allowed on a replica set member or mongos", …) and missing one of them
  // means every purchase 500s instead of falling back.
  if (!supportsTransactions()) {
    return apply();
  }

  let session: mongoose.ClientSession | null = null;
  try {
    session = await mongoose.startSession();
    let balance = 0;
    await session.withTransaction(async () => {
      balance = await apply(session!);
    });
    return balance;
  } catch (err: any) {
    // Backstop for a topology we misread, or one that changed under us.
    if (!isTransactionUnsupported(err)) throw err;

    logger.warn('Transactions unavailable — crediting purchase sequentially', {
      purchaseId,
      reason: err?.message,
    });
    return apply();
  } finally {
    await session?.endSession();
  }
}

/**
 * Whether this deployment can run a multi-document transaction.
 *
 * Transactions need a replica set or a sharded cluster. Atlas is always one of
 * those; a local `mongod` and the in-memory server used by the tests are not.
 */
function supportsTransactions(): boolean {
  const type = (mongoose.connection as any)?.client?.topology?.description?.type;
  if (!type) return false; // unknown — take the safe path
  return type !== 'Single' && type !== 'Unknown';
}

function isTransactionUnsupported(err: unknown): boolean {
  const message = String((err as Error)?.message ?? '');
  return /transaction|retryable writes|replica set|mongos|Illegal state transition/i.test(
    message,
  );
}

/** Current wallet balance, or 0 if the wallet doesn't exist yet. */
async function currentBalance(userId: string): Promise<number> {
  const wallet = await CoinWallet.findOne({ userId }, { coins: 1 }).lean();
  return wallet?.coins ?? 0;
}

// Refunds are handled by `revokePurchase` in services/storeNotifications.ts,
// driven by the store webhooks. It writes a ledger entry; the old helper that
// lived here adjusted the wallet directly and was never wired up.

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
    store: 'apple',
    uniqueKey,
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
    store: 'google',
    uniqueKey,
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
