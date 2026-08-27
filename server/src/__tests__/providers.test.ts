/**
 * The provider-facing money paths, with the providers mocked.
 *
 * These were the least-covered files in the codebase and the ones where a bug
 * costs real money: verifying a purchase, sending a USDT payout, and handling
 * a refund webhook.
 *
 * The store verifiers and axios are mocked at module scope rather than with
 * `jest.resetModules()` — resetting modules re-evaluates the Mongoose models
 * and trips "cannot overwrite model once compiled".
 */

// Must be set before the modules under test are imported; they read env at
// module scope.
process.env.NOWPAYMENTS_API_KEY = 'test-key';
process.env.NOWPAYMENTS_EMAIL = 'ops@example.com';
process.env.NOWPAYMENTS_PASSWORD = 'secret';
process.env.ANDROID_PACKAGE_NAME = 'com.bonhomie95.pulsequiz';
delete process.env.PAYOUT_MOCK;

import mongoose from 'mongoose';
import axios from 'axios';

jest.mock('axios');
jest.mock('../iap/google');
jest.mock('../iap/apple');

import Purchase from '../models/Purchase';
import CoinWallet from '../models/CoinWallet';
import CoinTransaction from '../models/CoinTransaction';
import User from '../models/User';
import Payout from '../models/Payout';
import { initDefaultSettings } from '../models/AppSettings';

import { verifyGoogle, verifyApple } from '../controllers/purchaseController';
import { verifyGooglePurchase, resolveTrustedPackageName } from '../iap/google';
import { verifyAppleTransaction } from '../iap/apple';
import { sendUSDT } from '../services/nowpaymentsService';
import { handleGoogleNotification } from '../services/storeNotifications';
import { creditCoins, getBalance } from '../services/coinService';
import { reconcileCoinLedger } from '../services/ledgerReconciliation';
import { ensureIndexes } from './setup';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockVerifyGoogle = verifyGooglePurchase as jest.MockedFunction<typeof verifyGooglePurchase>;
const mockResolvePackage = resolveTrustedPackageName as jest.MockedFunction<typeof resolveTrustedPackageName>;
const mockVerifyApple = verifyAppleTransaction as jest.MockedFunction<typeof verifyAppleTransaction>;

async function makeUser() {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    provider: 'apple',
    providerId: new mongoose.Types.ObjectId().toString(),
  });
  await CoinWallet.create({ userId: user._id, coins: 0 });
  return user;
}

function fakeRes() {
  const out: any = { statusCode: 200, body: null };
  out.status = (c: number) => { out.statusCode = c; return out; };
  out.json = (b: any) => { out.body = b; return out; };
  return out;
}

/** The provider says this purchase is good. */
function providerAccepts() {
  mockResolvePackage.mockReturnValue({ packageName: 'com.bonhomie95.pulsequiz' });
  mockVerifyGoogle.mockResolvedValue({
    valid: true,
    purchaseState: 0,
    consumptionState: 0,
    acknowledgementState: 1,
    data: {},
  });
  mockVerifyApple.mockResolvedValue({
    valid: true,
    productId: 'pq_coins_5000',
    environment: 'Production',
    data: {},
  });
}

beforeEach(async () => {
  jest.resetAllMocks();
  await initDefaultSettings();
  await ensureIndexes(Purchase, CoinTransaction, Payout);
});

describe('Google purchase verification', () => {
  it('credits coins and writes a ledger entry for a valid purchase', async () => {
    providerAccepts();
    const user = await makeUser();
    const res = fakeRes();

    await verifyGoogle(
      {
        userId: user._id.toString(),
        ip: '1.2.3.4',
        body: {
          sku: 'pq_coins_5000',
          purchaseToken: 'tok-valid',
          packageName: 'com.bonhomie95.pulsequiz',
        },
      } as any,
      res,
    );

    expect(res.body.ok).toBe(true);
    expect(res.body.coinsAdded).toBe(5000);
    expect(await getBalance(user._id.toString())).toBe(5000);

    // A paid purchase must be visible to reconciliation — it was not, before.
    const ledger = await CoinTransaction.find({ userId: user._id }).lean();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].reason).toBe('iap_purchase');
    expect(ledger[0].delta).toBe(5000);
    expect((await reconcileCoinLedger()).drifted).toBe(0);
  });

  it('rejects an invalid purchase and credits nothing', async () => {
    providerAccepts();
    mockVerifyGoogle.mockResolvedValue({
      valid: false,
      purchaseState: 0,
      consumptionState: 1, // already consumed
      acknowledgementState: 1,
      data: {},
    });

    const user = await makeUser();
    const res = fakeRes();

    await verifyGoogle(
      {
        userId: user._id.toString(),
        body: { sku: 'pq_coins_500', purchaseToken: 'tok-used', packageName: 'com.bonhomie95.pulsequiz' },
      } as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(await getBalance(user._id.toString())).toBe(0);
    expect((await Purchase.findOne({ uniqueKey: 'google:tok-used' }).lean())?.state).toBe('REJECTED');
  });

  it('will not let a second account claim the same token', async () => {
    providerAccepts();
    const a = await makeUser();
    const b = await makeUser();

    await verifyGoogle(
      { userId: a._id.toString(), body: { sku: 'pq_coins_500', purchaseToken: 'shared', packageName: 'com.bonhomie95.pulsequiz' } } as any,
      fakeRes(),
    );

    const res = fakeRes();
    await verifyGoogle(
      { userId: b._id.toString(), body: { sku: 'pq_coins_500', purchaseToken: 'shared', packageName: 'com.bonhomie95.pulsequiz' } } as any,
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(await getBalance(b._id.toString())).toBe(0);
  });

  it('is idempotent — a retried verify does not double-credit', async () => {
    providerAccepts();
    const user = await makeUser();
    const req = {
      userId: user._id.toString(),
      body: { sku: 'pq_coins_1500', purchaseToken: 'retry-tok', packageName: 'com.bonhomie95.pulsequiz' },
    } as any;

    await verifyGoogle(req, fakeRes());
    const second = fakeRes();
    await verifyGoogle(req, second);

    expect(second.body.coinsAdded).toBe(0);
    expect(second.body.message).toBe('Already credited');
    expect(await getBalance(user._id.toString())).toBe(1500);
    expect(await CoinTransaction.countDocuments({ userId: user._id })).toBe(1);
  });

  it('rejects a package name that is not ours', async () => {
    providerAccepts();
    mockResolvePackage.mockReturnValue({ error: 'Package name mismatch' });

    const user = await makeUser();
    const res = fakeRes();

    await verifyGoogle(
      { userId: user._id.toString(), body: { sku: 'pq_coins_500', purchaseToken: 't', packageName: 'com.someone.else' } } as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(await getBalance(user._id.toString())).toBe(0);
    // The provider must not even be contacted for another app's receipt.
    expect(mockVerifyGoogle).not.toHaveBeenCalled();
  });

  it('rejects an unknown SKU rather than trusting the client', async () => {
    providerAccepts();
    const user = await makeUser();
    const res = fakeRes();

    await verifyGoogle(
      { userId: user._id.toString(), body: { sku: 'pq_coins_9999999', purchaseToken: 't', packageName: 'com.bonhomie95.pulsequiz' } } as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(await getBalance(user._id.toString())).toBe(0);
  });
});

describe('Apple purchase verification', () => {
  it('rejects a receipt whose product does not match the claimed SKU', async () => {
    providerAccepts();
    // The client asks for the 20,000 pack while the receipt is for the 500.
    mockVerifyApple.mockResolvedValue({
      valid: true,
      productId: 'pq_coins_500',
      environment: 'Production',
      data: {},
    });

    const user = await makeUser();
    const res = fakeRes();

    await verifyApple(
      { userId: user._id.toString(), body: { sku: 'pq_coins_20000', transactionId: 'tx-mismatch' } } as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(await getBalance(user._id.toString())).toBe(0);
  });

  it('credits the pack the SERVER maps, never a client-supplied amount', async () => {
    providerAccepts();
    mockVerifyApple.mockResolvedValue({
      valid: true,
      productId: 'pq_coins_500',
      environment: 'Production',
      data: {},
    });

    const user = await makeUser();
    const res = fakeRes();

    await verifyApple(
      {
        userId: user._id.toString(),
        // A tampered client asking for a million coins on a $0.99 pack.
        body: { sku: 'pq_coins_500', transactionId: 'tx-ok', coins: 1_000_000 },
      } as any,
      res,
    );

    expect(res.body.coinsAdded).toBe(500);
    expect(await getBalance(user._id.toString())).toBe(500);
  });
});

describe('USDT payouts', () => {
  const REFERENCE = 'weekly:2026-W10:abc';

  const params = {
    address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
    usdtType: 'TRC20',
    amount: 25,
    description: 'test',
    reference: REFERENCE,
  };

  /**
   * Route mocks by URL rather than by call order.
   *
   * `sendUSDT` caches its bearer token at module scope for a few minutes, so
   * whether a given call hits /auth depends on which test ran before it — an
   * ordered `mockResolvedValueOnce` chain silently answers the wrong request.
   */
  function mockProvider(opts: {
    existing?: unknown[];
    onPayout?: () => any;
  }) {
    mockedAxios.post.mockImplementation(async (url: any, body?: any) => {
      const u = String(url);
      if (u.endsWith('/auth')) return { data: { token: 'jwt' } } as any;
      if (u.endsWith('/payout')) {
        if (opts.onPayout) return opts.onPayout();
        return { data: { id: 55, withdrawals: [{ id: 77, hash: '0xdef' }] } } as any;
      }
      if (/\/payout\/\d+\/verify$/.test(u)) return { data: {} } as any;
      throw new Error(`unexpected POST ${u}`);
    });

    mockedAxios.get.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/payout')) return { data: { data: opts.existing ?? [] } } as any;
      throw new Error(`unexpected GET ${u}`);
    });
  }

  function payoutCalls() {
    return mockedAxios.post.mock.calls.filter(([url]) => String(url).endsWith('/payout'));
  }

  it('does not resend a transfer the provider already has', async () => {
    mockProvider({
      existing: [{ id: 991, extra_id: REFERENCE, status: 'FINISHED', hash: '0xabc' }],
    });

    const result = await sendUSDT(params);

    expect(result.success).toBe(true);
    expect(result.txHash).toBe('0xabc');
    // The whole point: no withdrawal was submitted.
    expect(payoutCalls()).toHaveLength(0);
  });

  it('treats a provider-side failure of an existing transfer as a failure', async () => {
    mockProvider({
      existing: [{ id: 991, extra_id: REFERENCE, status: 'FAILED' }],
    });

    const result = await sendUSDT(params);

    expect(result.success).toBe(false);
    expect(payoutCalls()).toHaveLength(0);
  });

  it('sends the reference so a retry can find the transfer', async () => {
    mockProvider({});

    const result = await sendUSDT({ ...params, usdtType: 'BEP20' });

    expect(result.success).toBe(true);

    const withdrawal = (payoutCalls()[0][1] as any).withdrawals[0];
    expect(withdrawal.extra_id).toBe(REFERENCE);
    expect(withdrawal.unique_external_id).toBe(REFERENCE);
    // BEP20 must map to the BSC currency, not silently fall back to TRC20.
    expect(withdrawal.currency).toBe('usdtbsc');
  });

  it('flags a lost response as indeterminate rather than failed', async () => {
    mockProvider({
      onPayout: () => {
        throw Object.assign(new Error('socket hang up'), { response: undefined });
      },
    });

    const result = await sendUSDT(params);

    expect(result.success).toBe(false);
    // Parked for manual reconciliation — we do not know whether it moved.
    expect(result.indeterminate).toBe(true);
  });

  it('reports a provider rejection as a plain failure, safe to retry', async () => {
    mockProvider({
      onPayout: () => {
        throw { response: { status: 400, data: { message: 'Insufficient funds' } } };
      },
    });

    const result = await sendUSDT(params);

    expect(result.success).toBe(false);
    expect(result.indeterminate).toBeFalsy();
    expect(result.error).toBe('Insufficient funds');
  });
});

describe('store refund webhooks', () => {
  function envelope(payload: Record<string, unknown>) {
    return {
      message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') },
    };
  }

  it('claws back coins when Google voids a purchase', async () => {
    const user = await makeUser();
    await creditCoins(user._id.toString(), 5000, 'iap_purchase', { note: 'google:tok9' });
    await Purchase.create({
      userId: user._id,
      store: 'google',
      sku: 'pq_coins_5000',
      coins: 5000,
      priceUsd: 4.99,
      uniqueKey: 'google:tok9',
      googlePurchaseToken: 'tok9',
      state: 'CREDITED',
      creditedCoins: 5000,
    });

    const result = await handleGoogleNotification(
      envelope({
        packageName: 'com.bonhomie95.pulsequiz',
        voidedPurchaseNotification: { purchaseToken: 'tok9' },
      }),
    );

    expect(result.handled).toBe(true);
    expect(await getBalance(user._id.toString())).toBe(0);
    expect((await Purchase.findOne({ uniqueKey: 'google:tok9' }).lean())?.state).toBe('REFUNDED');
    expect((await reconcileCoinLedger()).drifted).toBe(0);
  });

  it('ignores a notification for a different app', async () => {
    const result = await handleGoogleNotification(
      envelope({
        packageName: 'com.someone.else',
        voidedPurchaseNotification: { purchaseToken: 'x' },
      }),
    );
    expect(result).toEqual({ handled: false, reason: 'package_mismatch' });
  });

  it('ignores a malformed envelope rather than throwing', async () => {
    expect(await handleGoogleNotification({})).toEqual({
      handled: false,
      reason: 'no_message_data',
    });
    expect(await handleGoogleNotification({ message: { data: 'not-base64-json' } })).toEqual({
      handled: false,
      reason: 'bad_payload',
    });
  });
});
