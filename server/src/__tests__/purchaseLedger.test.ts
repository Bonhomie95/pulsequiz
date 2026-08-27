/**
 * Paid purchases must land in the ledger.
 *
 * IAP is the single largest source of coins in the system. Crediting the wallet
 * without a matching CoinTransaction made every paying customer register as
 * drift in the nightly reconciliation — which would have made that job useless
 * exactly when it mattered.
 */
import mongoose from 'mongoose';

import CoinWallet from '../models/CoinWallet';
import CoinTransaction from '../models/CoinTransaction';
import Purchase from '../models/Purchase';
import User from '../models/User';
import { reconcileCoinLedger } from '../services/ledgerReconciliation';
import { creditCoins } from '../services/coinService';
import { revokePurchase } from '../services/storeNotifications';
import { ensureIndexes } from './setup';

async function makeUser() {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    provider: 'google',
    providerId: new mongoose.Types.ObjectId().toString(),
  });
  await CoinWallet.create({ userId: user._id, coins: 0 });
  return user;
}

beforeEach(async () => {
  await ensureIndexes(Purchase, CoinTransaction);
});

describe('the ledger balances against the wallet', () => {
  it('reports no drift for ordinary credits and debits', async () => {
    const user = await makeUser();
    await creditCoins(user._id.toString(), 500, 'ad_reward');
    await creditCoins(user._id.toString(), 100, 'daily_checkin');

    const report = await reconcileCoinLedger();
    expect(report.checked).toBe(1);
    expect(report.drifted).toBe(0);
  });

  it('detects a wallet mutated without a ledger entry', async () => {
    const user = await makeUser();
    // Exactly the shape of the bug: a bare $inc with no CoinTransaction.
    await CoinWallet.updateOne({ userId: user._id }, { $inc: { coins: 5000 } });

    const report = await reconcileCoinLedger();
    expect(report.drifted).toBe(1);
    expect(report.samples[0].drift).toBe(5000);
  });
});

describe('refund clawback', () => {
  it('reverses the coins and records it in the ledger', async () => {
    const user = await makeUser();
    await creditCoins(user._id.toString(), 5000, 'iap_purchase', { note: 'apple:tx1' });

    const purchase = await Purchase.create({
      userId: user._id,
      store: 'apple',
      sku: 'pq_coins_5000',
      coins: 5000,
      priceUsd: 4.99,
      uniqueKey: 'apple:tx1',
      appleTransactionId: 'tx1',
      state: 'CREDITED',
      creditedCoins: 5000,
    });

    await revokePurchase(purchase, 'apple_refund');

    const wallet = await CoinWallet.findOne({ userId: user._id }).lean();
    expect(wallet?.coins).toBe(0);

    const after = await Purchase.findById(purchase._id).lean();
    expect(after?.state).toBe('REFUNDED');

    // And the books still balance.
    const report = await reconcileCoinLedger();
    expect(report.drifted).toBe(0);
  });

  it('lets the balance go negative rather than gifting spent coins', async () => {
    // Buy, spend, then refund — clamping to zero would net free currency.
    const user = await makeUser();
    await creditCoins(user._id.toString(), 5000, 'iap_purchase', { note: 'apple:tx2' });
    await CoinWallet.updateOne({ userId: user._id }, { $set: { coins: 200 } });
    await CoinTransaction.create({
      userId: user._id,
      delta: -4800,
      balanceAfter: 200,
      reason: 'hint_used',
    });

    const purchase = await Purchase.create({
      userId: user._id,
      store: 'apple',
      sku: 'pq_coins_5000',
      coins: 5000,
      priceUsd: 4.99,
      uniqueKey: 'apple:tx2',
      appleTransactionId: 'tx2',
      state: 'CREDITED',
      creditedCoins: 5000,
    });

    await revokePurchase(purchase, 'apple_refund');

    const wallet = await CoinWallet.findOne({ userId: user._id }).lean();
    expect(wallet?.coins).toBe(-4800);

    const report = await reconcileCoinLedger();
    expect(report.drifted).toBe(0);
  });

  it('is a no-op on an already-refunded purchase', async () => {
    const user = await makeUser();
    await creditCoins(user._id.toString(), 500, 'iap_purchase');

    const purchase = await Purchase.create({
      userId: user._id,
      store: 'google',
      sku: 'pq_coins_500',
      coins: 500,
      priceUsd: 0.99,
      uniqueKey: 'google:tok1',
      googlePurchaseToken: 'tok1',
      state: 'REFUNDED',
      creditedCoins: 500,
    });

    await revokePurchase(purchase, 'google_voided');

    const wallet = await CoinWallet.findOne({ userId: user._id }).lean();
    expect(wallet?.coins).toBe(500);
  });
});
