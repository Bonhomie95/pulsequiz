/**
 * App Store Server Notifications V2 and Google Play Real-Time Developer
 * Notifications.
 *
 * Without these a user can buy a coin pack, spend the coins, refund the
 * purchase through the store, and keep the goods — the server never hears
 * about the refund. They are also the only reliable way to learn that a
 * subscription renewed, lapsed or was revoked.
 */
import crypto from 'crypto';
import { google } from 'googleapis';
import { JWT as GoogleJWT } from 'google-auth-library';

import Purchase from '../models/Purchase';
import Subscription from '../models/Subscription';
import CoinWallet from '../models/CoinWallet';
import CoinTransaction from '../models/CoinTransaction';
import { logger } from '../utils/logger';

/* ── Apple ──────────────────────────────────────────────────────────────── */

function b64urlToJson(segment: string): any {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

function derToPem(der: string): string {
  const lines = der.match(/.{1,64}/g)?.join('\n') ?? der;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
}

/**
 * Verify an Apple JWS: check the x5c certificate chain links, optionally anchor
 * it to Apple's root, then verify the payload signature with the leaf key.
 *
 * Unlike the transaction-lookup path (where the authenticated HTTPS call to
 * Apple is itself the trust anchor), a webhook is an unauthenticated inbound
 * request — the signature is the only thing standing between an attacker and a
 * forged "refund this user's coins" instruction, so it must be verified.
 */
export function verifyAppleJws(signedPayload: string): { valid: boolean; payload?: any; reason?: string } {
  const parts = signedPayload.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed_jws' };

  let header: any;
  try {
    header = b64urlToJson(parts[0]);
  } catch {
    return { valid: false, reason: 'bad_header' };
  }

  const chain: string[] = header?.x5c ?? [];
  if (chain.length < 2) return { valid: false, reason: 'missing_x5c' };

  let certs: crypto.X509Certificate[];
  try {
    certs = chain.map((der) => new crypto.X509Certificate(derToPem(der)));
  } catch {
    return { valid: false, reason: 'bad_certificate' };
  }

  // Each certificate must be signed by the next one up the chain.
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].checkIssued(certs[i + 1])) {
      return { valid: false, reason: 'broken_chain' };
    }
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      return { valid: false, reason: 'chain_signature_invalid' };
    }
  }

  // Validity windows.
  const now = Date.now();
  for (const cert of certs) {
    if (new Date(cert.validFrom).getTime() > now || new Date(cert.validTo).getTime() < now) {
      return { valid: false, reason: 'certificate_expired' };
    }
  }

  // Anchor to Apple's root when it has been provisioned. Without it we still
  // verify internal chain consistency, but anyone could mint their own chain —
  // so this is required in production.
  const rootDer = process.env.APPLE_ROOT_CA_G3;
  if (rootDer) {
    try {
      const root = new crypto.X509Certificate(derToPem(rootDer.replace(/\s/g, '')));
      const top = certs[certs.length - 1];
      const anchored =
        top.fingerprint256 === root.fingerprint256 || top.verify(root.publicKey);
      if (!anchored) return { valid: false, reason: 'not_anchored_to_apple_root' };
    } catch {
      return { valid: false, reason: 'bad_root_certificate' };
    }
  } else if (process.env.NODE_ENV === 'production') {
    return { valid: false, reason: 'APPLE_ROOT_CA_G3 not configured' };
  }

  // Verify the payload signature with the leaf public key.
  const alg = header.alg === 'ES256' ? 'SHA256' : null;
  if (!alg) return { valid: false, reason: 'unsupported_alg' };

  const verifier = crypto.createVerify(alg);
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();

  const ok = verifier.verify(
    { key: certs[0].publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(parts[2], 'base64url'),
  );
  if (!ok) return { valid: false, reason: 'bad_signature' };

  try {
    return { valid: true, payload: b64urlToJson(parts[1]) };
  } catch {
    return { valid: false, reason: 'bad_payload' };
  }
}

/** Decode a nested JWS without re-verifying (the outer envelope was verified). */
function decodeNested(jws?: string): any | null {
  if (!jws) return null;
  try {
    return b64urlToJson(jws.split('.')[1]);
  } catch {
    return null;
  }
}

/* ── Coin clawback ──────────────────────────────────────────────────────── */

/**
 * Reverse a credited coin purchase after a refund.
 *
 * Balances are allowed to go negative: the user already spent the coins, and a
 * silent clamp to zero would let refund-abuse net free currency. The negative
 * balance blocks further spending until it is worked off or an admin resolves it.
 */
export async function revokePurchase(purchase: any, reason: string) {
  if (!purchase || purchase.state === 'REFUNDED') return;

  const coins = purchase.creditedCoins ?? 0;
  if (coins > 0) {
    const wallet = await CoinWallet.findOneAndUpdate(
      { userId: purchase.userId },
      { $inc: { coins: -coins } },
      { upsert: true, returnDocument: 'after' },
    );

    await CoinTransaction.create({
      userId: purchase.userId,
      delta: -coins,
      balanceAfter: wallet?.coins ?? 0,
      reason: 'admin_deduct',
      meta: `refund:${reason}:${purchase.uniqueKey}`,
    });
  }

  await Purchase.updateOne(
    { _id: purchase._id },
    { $set: { state: 'REFUNDED', refundedAt: new Date(), refundReason: reason } },
  );

  logger.warn('Purchase refunded — coins clawed back', {
    purchaseId: purchase._id.toString(),
    coins,
    reason,
  });
}

/* ── Apple notification handling ────────────────────────────────────────── */

const APPLE_REVOKE_TYPES = new Set(['REFUND', 'REVOKE', 'CONSUMPTION_REQUEST']);

export async function handleAppleNotification(payload: any) {
  const notificationType: string = payload?.notificationType ?? '';
  const subtype: string | undefined = payload?.subtype;

  const transactionInfo = decodeNested(payload?.data?.signedTransactionInfo);
  const renewalInfo = decodeNested(payload?.data?.signedRenewalInfo);

  const bundleId = payload?.data?.bundleId ?? transactionInfo?.bundleId;
  if (process.env.APPLE_BUNDLE_ID && bundleId !== process.env.APPLE_BUNDLE_ID) {
    logger.warn('Apple notification for unexpected bundle', { bundleId });
    return { handled: false, reason: 'bundle_mismatch' };
  }

  const transactionId: string | undefined = transactionInfo?.transactionId;
  logger.info('Apple store notification', { notificationType, subtype, transactionId });

  // ── Consumables: refund → claw back ──────────────────────────────────────
  if (APPLE_REVOKE_TYPES.has(notificationType) && transactionId) {
    const purchase = await Purchase.findOne({ uniqueKey: `apple:${transactionId}` });
    if (purchase) {
      await revokePurchase(purchase, `apple_${notificationType.toLowerCase()}`);
      return { handled: true };
    }
  }

  // ── Subscriptions ────────────────────────────────────────────────────────
  const originalTransactionId: string | undefined =
    transactionInfo?.originalTransactionId ?? renewalInfo?.originalTransactionId;

  if (originalTransactionId) {
    const expiresMs = transactionInfo?.expiresDate;
    const expiresAt = expiresMs ? new Date(expiresMs) : null;

    let status: 'active' | 'grace' | 'expired' | 'revoked' | null = null;
    if (['DID_RENEW', 'SUBSCRIBED', 'OFFER_REDEEMED'].includes(notificationType)) status = 'active';
    else if (notificationType === 'DID_FAIL_TO_RENEW') status = subtype === 'GRACE_PERIOD' ? 'grace' : 'expired';
    else if (notificationType === 'EXPIRED') status = 'expired';
    else if (notificationType === 'REVOKE' || notificationType === 'REFUND') status = 'revoked';

    if (status) {
      await Subscription.updateOne(
        { store: 'apple', appleOriginalTransactionId: originalTransactionId },
        {
          $set: {
            status,
            ...(expiresAt ? { expiresAt } : {}),
            lastNotificationType: notificationType,
            lastNotificationAt: new Date(),
          },
        },
      );
      return { handled: true };
    }
  }

  return { handled: false, reason: 'unhandled_type' };
}

/* ── Google notification handling ───────────────────────────────────────── */

let _publisher: ReturnType<typeof google.androidpublisher> | null = null;

function getPublisher() {
  if (_publisher) return _publisher;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  const creds = JSON.parse(raw);
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  _publisher = google.androidpublisher({
    version: 'v3',
    auth: new GoogleJWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    }),
  });
  return _publisher;
}

/**
 * Google RTDN arrives as a Pub/Sub push envelope:
 *   { message: { data: <base64 DeveloperNotification> }, subscription: "..." }
 */
export async function handleGoogleNotification(envelope: any) {
  const dataB64 = envelope?.message?.data;
  if (!dataB64) return { handled: false, reason: 'no_message_data' };

  let notification: any;
  try {
    notification = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8'));
  } catch {
    return { handled: false, reason: 'bad_payload' };
  }

  const packageName: string | undefined = notification?.packageName;
  if (process.env.ANDROID_PACKAGE_NAME && packageName !== process.env.ANDROID_PACKAGE_NAME) {
    logger.warn('Google notification for unexpected package', { packageName });
    return { handled: false, reason: 'package_mismatch' };
  }

  // ── One-time products (coin packs) ───────────────────────────────────────
  const oneTime = notification?.oneTimeProductNotification;
  if (oneTime?.purchaseToken) {
    // notificationType 1 = PURCHASED, 2 = CANCELED
    if (oneTime.notificationType === 2) {
      const purchase = await Purchase.findOne({ uniqueKey: `google:${oneTime.purchaseToken}` });
      if (purchase) {
        await revokePurchase(purchase, 'google_canceled');
        return { handled: true };
      }
    }
    return { handled: true };
  }

  // ── Voided purchases (refunds and chargebacks) ───────────────────────────
  const voided = notification?.voidedPurchaseNotification;
  if (voided?.purchaseToken) {
    const purchase = await Purchase.findOne({ uniqueKey: `google:${voided.purchaseToken}` });
    if (purchase) {
      await revokePurchase(purchase, 'google_voided');
    }
    return { handled: true };
  }

  // ── Subscriptions ────────────────────────────────────────────────────────
  const sub = notification?.subscriptionNotification;
  if (sub?.purchaseToken) {
    try {
      const pub = getPublisher();
      const res = await pub.purchases.subscriptionsv2.get({
        packageName: packageName as string,
        token: sub.purchaseToken,
      });
      const state: string = res.data.subscriptionState ?? '';
      const lineItem = (res.data.lineItems ?? [])[0];
      const expiresAt = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;

      const status =
        state === 'SUBSCRIPTION_STATE_ACTIVE'
          ? 'active'
          : state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
            ? 'grace'
            : state === 'SUBSCRIPTION_STATE_EXPIRED'
              ? 'expired'
              : state === 'SUBSCRIPTION_STATE_CANCELED'
                ? 'cancelled'
                : 'expired';

      await Subscription.updateOne(
        { store: 'google', googlePurchaseToken: sub.purchaseToken },
        {
          $set: {
            status,
            ...(expiresAt ? { expiresAt } : {}),
            lastNotificationType: String(sub.notificationType),
            lastNotificationAt: new Date(),
          },
        },
      );
      return { handled: true };
    } catch (err) {
      logger.error('Failed to reconcile Google subscription notification', err);
      throw err;
    }
  }

  return { handled: false, reason: 'unhandled_type' };
}
