import crypto from 'crypto';
import { Schema, model, Types } from 'mongoose';

import type { PayoutCurrency, PayoutNetwork } from '../utils/validateWallet';

/** Payout network. Field names keep the historical `usdt` prefix to avoid a
 *  data migration; they now apply to whichever stablecoin `payoutCurrency` is. */
export type UsdtType = PayoutNetwork;

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  provider: 'google' | 'facebook' | 'apple';
  providerId: string;

  username?: string | null;
  avatar?: string | null;

  theme: 'light' | 'dark' | 'system';

  /** Stablecoin prizes are paid in. Defaults to USDT for existing users. */
  payoutCurrency: PayoutCurrency;
  usdtType?: UsdtType;
  usdtAddress?: string;
  /** When the payout address was last changed. Payouts are held for a cooling
   *  period after any change so a stolen session can't redirect prize money. */
  usdtAddressChangedAt?: Date | null;

  withdrawalEnabled: boolean;
  publicProfile: boolean; // whether username appears in "ready to play" carousel
  sessionsSinceLastAd: number;
  lastAdRewardAt?: Date | null;
  /** Rewarded ads credited so far in the current UTC day. */
  adRewardsInWindow: number;
  /** UTC date-string ("YYYY-MM-DD") that adRewardsInWindow refers to. */
  adRewardWindowDate?: string | null;
  lastSeenAt?: Date | null;
  isBanned: boolean;
  hasCompletedFirstQuiz: boolean;
  moderationStrikes: number;

  /** Bumped on logout / ban / credential reset. Tokens carrying an older value
   *  are rejected, which gives us real session revocation. */
  tokenVersion: number;

  /** Soft-delete marker for GDPR erasure; the row is anonymised, not dropped,
   *  so ledger and payout history stay referentially intact. */
  deletedAt?: Date | null;
  /** sha256(provider:providerId) kept on a tombstone, so the same identity
   *  re-registering can be recognised without keeping the raw id. */
  deletedIdentityHash?: string | null;
  /** Re-registration of a deleted identity: no referral bonuses. */
  referralIneligible?: boolean;

  /** ISO 3166 alpha-2, from the edge (CF-IPCountry) or the device region.
   *  Decides whether real-money prizes are offered (see prizeRegion). */
  country?: string | null;
  /** League tier for the NEXT week the player joins (0 = Bronze). */
  leagueTier: number;

  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, immutable: true },
    provider: {
      type: String,
      enum: ['google', 'facebook', 'apple'],
      required: true,
    },
    providerId: { type: String, required: true },

    // Uniqueness is enforced by the collated `username_ci` index below, not
    // here — a second plain unique index would be redundant.
    username: { type: String, default: null },
    avatar: { type: String, default: null },

    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },

    payoutCurrency: {
      type: String,
      enum: ['USDT', 'USDC'],
      default: 'USDT',
    },
    usdtType: {
      type: String,
      enum: ['TRC20', 'ERC20', 'BEP20', 'POLYGON', 'SOL'],
    },

    usdtAddress: {
      type: String,
    },
    usdtAddressChangedAt: { type: Date, default: null },

    withdrawalEnabled: {
      type: Boolean,
      default: false,
    },
    publicProfile: {
      type: Boolean,
      default: true, // opt-in by default
    },
    sessionsSinceLastAd: {
      type: Number,
      default: 0,
    },
    lastAdRewardAt: {
      type: Date,
      default: null,
    },
    adRewardsInWindow: {
      type: Number,
      default: 0,
    },
    adRewardWindowDate: { type: String, default: null },
    lastSeenAt: { type: Date, default: null },
    isBanned: { type: Boolean, default: false },
    hasCompletedFirstQuiz: { type: Boolean, default: false },
    moderationStrikes: { type: Number, default: 0 },
    tokenVersion: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
    deletedIdentityHash: { type: String, default: null },
    referralIneligible: { type: Boolean, default: false },
    country: { type: String, default: null },
    leagueTier: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// Every OAuth login looks a user up by (provider, providerId) and then falls
// back to email. Without these, signing in is a full collection scan.
UserSchema.index({ provider: 1, providerId: 1 }, { unique: true });
UserSchema.index({ email: 1 });
UserSchema.index({ lastSeenAt: -1 });
UserSchema.index(
  { deletedIdentityHash: 1 },
  { partialFilterExpression: { deletedIdentityHash: { $type: 'string' } } },
);

// Case-insensitive username uniqueness, index-backed. Usernames are normalised
// to lowercase on write; the collation makes any legacy mixed-case row collide
// too, and lets equality lookups use the index instead of an unanchorable regex.
//
// PARTIAL, not sparse. Accounts are created with `username: null` and pick a
// name afterwards — and a sparse index only skips documents where the field is
// ABSENT, not where it is null. With `sparse` the second account ever created
// collided on `username: null` and signup failed for everyone from then on.
UserSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: { username: { $type: 'string' } },
    collation: { locale: 'en', strength: 2 },
    name: 'username_ci',
  },
);

// A collated index cannot serve a regex, so friend search needs a plain one.
// Usernames are normalised to lowercase on write, which lets the search drop
// the case-insensitive flag and use an anchored prefix regex against this.
UserSchema.index(
  { username: 1 },
  {
    partialFilterExpression: { username: { $type: 'string' } },
    name: 'username_prefix',
  },
);

export function identityHash(provider: string, providerId: string): string {
  return crypto.createHash('sha256').update(`${provider}:${providerId}`).digest('hex');
}

export default model<IUser>('User', UserSchema);
