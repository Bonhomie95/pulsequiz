/**
 * models/Subscription.ts
 *
 * Tracks premium "Ad-Free" subscriptions from Apple and Google.
 * isPremium = expiresAt > now AND status ∈ {active, grace}
 *
 * SKUs to create in App Store Connect + Google Play Console:
 *   pq_premium_monthly  — $2.99/month
 *   pq_premium_3month   — $7.99 / 3 months  (~$2.66/mo, save 11%)
 *   pq_premium_6month   — $13.99 / 6 months (~$2.33/mo, save 22%)
 *   pq_premium_yearly   — $24.99 / year     (~$2.08/mo, save 31%)
 */

import { Schema, model, Types } from 'mongoose';

export type SubscriptionSku =
  | 'pq_premium_monthly'
  | 'pq_premium_3month'
  | 'pq_premium_6month'
  | 'pq_premium_yearly';

export const SUBSCRIPTION_PLANS: Record<
  SubscriptionSku,
  { usd: number; durationDays: number; label: string; badge: string | null }
> = {
  pq_premium_monthly: { usd: 2.99,  durationDays: 31,  label: 'Monthly',   badge: null },
  pq_premium_3month:  { usd: 7.99,  durationDays: 92,  label: '3 Months',  badge: 'Save 11%' },
  pq_premium_6month:  { usd: 13.99, durationDays: 184, label: '6 Months',  badge: 'Save 22%' },
  pq_premium_yearly:  { usd: 24.99, durationDays: 365, label: '12 Months', badge: 'Best Value 🔥' },
};

export interface ISubscription {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  store: 'apple' | 'google';
  sku: SubscriptionSku;
  status: 'active' | 'expired' | 'cancelled' | 'grace' | 'revoked';
  startedAt: Date;
  expiresAt: Date;
  renewedAt?: Date;
  appleOriginalTransactionId?: string;
  googlePurchaseToken?: string;
  /** Last store server notification seen for this subscription. */
  lastNotificationType?: string;
  lastNotificationAt?: Date;
  raw?: any;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    store:   { type: String, enum: ['apple', 'google'], required: true },
    sku:     { type: String, enum: Object.keys(SUBSCRIPTION_PLANS), required: true },
    status:  {
      type: String,
      // 'revoked' covers a refunded or family-share-removed subscription, which
      // must lose premium immediately rather than run to its expiry date.
      enum: ['active', 'expired', 'cancelled', 'grace', 'revoked'],
      default: 'active',
    },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    renewedAt: { type: Date, default: null },
    appleOriginalTransactionId: { type: String, sparse: true, index: true },
    googlePurchaseToken:        { type: String, sparse: true, index: true },
    lastNotificationType: { type: String, default: null },
    lastNotificationAt:   { type: Date, default: null },
    raw: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

SubscriptionSchema.index({ userId: 1, store: 1 });
// getSubscriptionStatus reads by user + active window on every app launch.
SubscriptionSchema.index({ userId: 1, status: 1, expiresAt: -1 });

export default model<ISubscription>('Subscription', SubscriptionSchema);
