/**
 * controllers/subscriptionController.ts
 *
 * POST /api/subscription/apple/verify   — verify Apple auto-renewable receipt
 * POST /api/subscription/google/verify  — verify Google sub purchase token
 * GET  /api/subscription/status         — { isPremium, expiresAt, plan, store }
 * POST /api/subscription/apple/restore  — restore from stored record
 *
 * What premium means:
 *   ✅ No banner ads
 *   ✅ No interstitial ads (timed)
 *   ✅ Rewarded ads still shown if user CHOOSES to watch for coins
 */

import { Response } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { google } from 'googleapis';
import { JWT as GoogleJWT } from 'google-auth-library';
import { AuthRequest } from '../middlewares/auth';
import Subscription, { SUBSCRIPTION_PLANS, SubscriptionSku } from '../models/Subscription';
import { resolveTrustedPackageName } from '../iap/google';

// ─── Apple helpers ────────────────────────────────────────────────────────

const APPLE_BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api.storekit.itunes.apple.com'
    : 'https://api.storekit-sandbox.itunes.apple.com';

function makeAppleJWT() {
  const key = (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  return jwt.sign(
    { iss: process.env.APPLE_ISSUER_ID, aud: 'appstoreconnect-v1', exp: Math.floor(Date.now() / 1000) + 300, bid: process.env.APPLE_BUNDLE_ID },
    key,
    { algorithm: 'ES256', keyid: process.env.APPLE_KEY_ID },
  );
}

async function verifyAppleSubscriptionTx(transactionId: string, expectedSku: string) {
  try {
    const res = await axios.get(`${APPLE_BASE_URL}/inApps/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${makeAppleJWT()}` },
      validateStatus: () => true,
    });
    if (res.status !== 200) return { valid: false, expiresAt: null, originalTxId: null, data: res.data };

    const signed: string = res.data.signedTransactionInfo ?? res.data;
    let t: any = signed;
    if (typeof signed === 'string') {
      t = JSON.parse(Buffer.from(signed.split('.')[1], 'base64url').toString('utf8'));
    }

    const expiresMs  = t.expiresDate ?? t.expirationDate ?? null;
    const expiresAt  = expiresMs ? new Date(expiresMs) : null;
    const valid =
      t.bundleId === process.env.APPLE_BUNDLE_ID &&
      t.productId === expectedSku &&
      !t.revocationDate &&
      expiresAt != null && expiresAt > new Date();

    return { valid, expiresAt, originalTxId: t.originalTransactionId ?? null, productId: t.productId, data: t };
  } catch (e: any) {
    return { valid: false, expiresAt: null, originalTxId: null, data: null, error: e?.message };
  }
}

// ─── Google helpers ───────────────────────────────────────────────────────

let _googlePublisher: ReturnType<typeof google.androidpublisher> | null = null;
function getGooglePublisher() {
  if (_googlePublisher) return _googlePublisher;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  const creds = JSON.parse(raw);
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  const auth = new GoogleJWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
  _googlePublisher = google.androidpublisher({ version: 'v3', auth });
  return _googlePublisher;
}

async function verifyGoogleSubscriptionToken(sku: string, purchaseToken: string, packageName: string) {
  try {
    const pub = getGooglePublisher();
    const res = await pub.purchases.subscriptionsv2.get({ packageName, token: purchaseToken });
    const data = res.data;
    const lineItem = (data.lineItems ?? []).find((li: any) => li.productId === sku);
    const expiresAt = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
    const state: string = data.subscriptionState ?? '';
    const valid = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(state) && expiresAt != null && expiresAt > new Date();
    return { valid, expiresAt, data };
  } catch (e: any) {
    return { valid: false, expiresAt: null, data: null, error: e?.message };
  }
}

// ─── Controllers ──────────────────────────────────────────────────────────

export async function getSubscriptionStatus(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const sub = await Subscription.findOne({
    userId,
    expiresAt: { $gt: new Date() },
    status: { $in: ['active', 'grace'] },
  }).sort({ expiresAt: -1 }).lean();

  if (!sub) return res.json({ isPremium: false, expiresAt: null, plan: null });
  return res.json({ isPremium: true, expiresAt: sub.expiresAt, plan: sub.sku, store: sub.store });
}

export async function verifyAppleSub(req: AuthRequest, res: Response) {
  const { sku, transactionId, originalTransactionId } = req.body as {
    sku: SubscriptionSku; transactionId: string; originalTransactionId?: string;
  };
  const userId = req.userId!;
  const plan = SUBSCRIPTION_PLANS[sku];
  if (!plan) return res.status(400).json({ message: `Unknown SKU: ${sku}` });
  if (!transactionId) return res.status(400).json({ message: 'transactionId required' });

  const result = await verifyAppleSubscriptionTx(transactionId, sku);
  if (!result.valid) return res.status(400).json({ message: 'Invalid or expired subscription', detail: result.error });

  const expiresAt = result.expiresAt ?? (() => { const d = new Date(); d.setDate(d.getDate() + plan.durationDays); return d; })();
  const origTxId = originalTransactionId ?? result.originalTxId ?? transactionId;

  const sub = await Subscription.findOneAndUpdate(
    { appleOriginalTransactionId: origTxId, userId },
    { $set: { userId, store: 'apple', sku, status: 'active', expiresAt, renewedAt: new Date(), raw: result.data, appleOriginalTransactionId: origTxId }, $setOnInsert: { startedAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );

  return res.json({ ok: true, isPremium: true, expiresAt: sub.expiresAt, plan: sku });
}

export async function verifyGoogleSub(req: AuthRequest, res: Response) {
  const { sku, purchaseToken, packageName } = req.body as {
    sku: SubscriptionSku; purchaseToken: string; packageName: string;
  };
  const userId = req.userId!;
  const plan = SUBSCRIPTION_PLANS[sku];
  if (!plan) return res.status(400).json({ message: `Unknown SKU: ${sku}` });
  if (!purchaseToken) return res.status(400).json({ message: 'purchaseToken required' });

  const resolved = resolveTrustedPackageName(packageName);
  if ('error' in resolved) return res.status(400).json({ message: resolved.error });

  const result = await verifyGoogleSubscriptionToken(sku, purchaseToken, resolved.packageName);
  if (!result.valid) return res.status(400).json({ message: 'Invalid or expired subscription', detail: (result as any).error });

  const expiresAt = result.expiresAt ?? (() => { const d = new Date(); d.setDate(d.getDate() + plan.durationDays); return d; })();

  const sub = await Subscription.findOneAndUpdate(
    { googlePurchaseToken: purchaseToken, userId },
    { $set: { userId, store: 'google', sku, status: 'active', expiresAt, renewedAt: new Date(), raw: result.data, googlePurchaseToken: purchaseToken }, $setOnInsert: { startedAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );

  return res.json({ ok: true, isPremium: true, expiresAt: sub.expiresAt, plan: sku });
}

export async function restoreAppleSub(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const sub = await Subscription.findOne({ userId, store: 'apple', expiresAt: { $gt: new Date() } })
    .sort({ expiresAt: -1 }).lean();
  if (!sub) return res.json({ ok: true, isPremium: false, message: 'No active subscription found' });
  return res.json({ ok: true, isPremium: true, expiresAt: sub.expiresAt, plan: sub.sku });
}
