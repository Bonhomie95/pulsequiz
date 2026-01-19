import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Purchase from '../models/Purchase';
import CoinWallet from '../models/CoinWallet';
import { CoinSku, COIN_PACKS } from '../iap/products';
import { verifyAppleTransaction } from '../iap/apple';
import { verifyGooglePurchase } from '../iap/google';
import mongoose from 'mongoose';

/* ---------------- APPLE ---------------- */

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

  const uniqueKey = `apple:${transactionId}`;

  const purchase = await Purchase.findOneAndUpdate(
    { uniqueKey },
    {
      $setOnInsert: {
        userId,
        store: 'apple',
        sku,
        coins: pack.coins,
        priceUsd: pack.usd,
        appleTransactionId: transactionId,
        state: 'PENDING',
      },
    },
    { upsert: true, new: true },
  );

  if (purchase.state === 'CREDITED') {
    return res.json({ ok: true, coinsAdded: 0 });
  }

  const apple = await verifyAppleTransaction(transactionId);

  if (!apple.valid) {
    purchase.state = 'REJECTED';
    await purchase.save();
    return res.status(400).json({ message: 'Invalid transaction' });
  }

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    purchase.state = 'CREDITED';
    purchase.creditedAt = new Date();
    purchase.creditedCoins = pack.coins;
    await purchase.save({ session });

    await CoinWallet.updateOne(
      { userId },
      { $inc: { coins: pack.coins } },
      { upsert: true, session },
    );
  });
  session.endSession();

  return res.json({ ok: true, coinsAdded: pack.coins });
}

/* ---------------- GOOGLE ---------------- */

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
        googlePurchaseToken: purchaseToken,
        state: 'PENDING',
      },
    },
    { upsert: true, new: true },
  );

  if (purchase.state === 'CREDITED') {
    return res.json({ ok: true, coinsAdded: 0 });
  }

  const google = await verifyGooglePurchase({
    packageName,
    productId: sku,
    purchaseToken,
  });

  if (!google.valid) {
    purchase.state = 'REJECTED';
    await purchase.save();
    return res.status(400).json({ message: 'Invalid purchase' });
  }

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    purchase.state = 'CREDITED';
    purchase.creditedAt = new Date();
    purchase.creditedCoins = pack.coins;
    await purchase.save({ session });

    await CoinWallet.updateOne(
      { userId },
      { $inc: { coins: pack.coins } },
      { upsert: true, session },
    );
  });
  session.endSession();

  return res.json({ ok: true, coinsAdded: pack.coins });
}
