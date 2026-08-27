import { Schema, model } from 'mongoose';

export interface IAppSettings {
  key: string;
  value: string | number | boolean;
  updatedBy?: string;
}

const AppSettingsSchema = new Schema<IAppSettings>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

const AppSettings = model<IAppSettings>('AppSettings', AppSettingsSchema);

// Default settings
export const SETTINGS_KEYS = {
  REFERRAL_COIN_REFERRER: 'referral_coin_referrer',     // coins for referrer
  REFERRAL_COIN_NEW_USER: 'referral_coin_new_user',     // coins for new user
  DAILY_AD_REWARD_COINS: 'daily_ad_reward_coins',       // coins per rewarded ad
  DAILY_AD_REWARD_MAX: 'daily_ad_reward_max',           // max per day
  DAILY_CHECKIN_COINS: 'daily_checkin_coins',           // coins per check-in
  MAX_PVP_WAGER: 'max_pvp_wager',                       // max coins per wager
  DAILY_SESSION_CAP: 'daily_session_cap',               // max leaderboard sessions/day
  MIN_PAYOUT_USD: 'min_payout_usd',                     // min USDT for payout
  MIN_ACCOUNT_AGE_DAYS: 'min_account_age_days',         // min days old to receive payout
  MIN_SESSIONS_FOR_PAYOUT: 'min_sessions_for_payout',   // min total sessions
} as const;

/**
 * Settings are read on nearly every economy operation and change perhaps a few
 * times a month, so they are cached in-process with a short TTL. The TTL also
 * bounds how long a replica can serve a stale value after an admin edit.
 */
const CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS || 60_000);
const cache = new Map<string, { value: any; expiresAt: number }>();

export async function getSetting(
  key: string,
  fallback: number | string | boolean,
): Promise<any> {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.value;

  const doc = await AppSettings.findOne({ key }).lean();
  const value = doc ? doc.value : fallback;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function setSetting(key: string, value: any, updatedBy?: string) {
  const result = await AppSettings.findOneAndUpdate(
    { key },
    { value, updatedBy },
    { upsert: true, returnDocument: 'after' }
  );
  // Reflect the change immediately on this instance; others pick it up within
  // one TTL.
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Drop the cache — used by tests and by the admin bulk-update endpoint. */
export function clearSettingsCache() {
  cache.clear();
}

export async function initDefaultSettings() {
  const defaults: Record<string, number | string | boolean> = {
    [SETTINGS_KEYS.REFERRAL_COIN_REFERRER]: 50,
    [SETTINGS_KEYS.REFERRAL_COIN_NEW_USER]: 50,
    [SETTINGS_KEYS.DAILY_AD_REWARD_COINS]: 10,
    [SETTINGS_KEYS.DAILY_AD_REWARD_MAX]: 5,
    [SETTINGS_KEYS.DAILY_CHECKIN_COINS]: 5,
    [SETTINGS_KEYS.MAX_PVP_WAGER]: 500,
    [SETTINGS_KEYS.DAILY_SESSION_CAP]: 20,
    [SETTINGS_KEYS.MIN_PAYOUT_USD]: 5,
    [SETTINGS_KEYS.MIN_ACCOUNT_AGE_DAYS]: 7,
    [SETTINGS_KEYS.MIN_SESSIONS_FOR_PAYOUT]: 5,
  };
  await Promise.all(
    Object.entries(defaults).map(([key, value]) =>
      AppSettings.updateOne({ key }, { $setOnInsert: { key, value } }, { upsert: true }),
    ),
  );
  clearSettingsCache();
}

/** Every settings key that must be a non-negative number. */
export const NUMERIC_SETTINGS = new Set<string>([
  SETTINGS_KEYS.REFERRAL_COIN_REFERRER,
  SETTINGS_KEYS.REFERRAL_COIN_NEW_USER,
  SETTINGS_KEYS.DAILY_AD_REWARD_COINS,
  SETTINGS_KEYS.DAILY_AD_REWARD_MAX,
  SETTINGS_KEYS.DAILY_CHECKIN_COINS,
  SETTINGS_KEYS.MAX_PVP_WAGER,
  SETTINGS_KEYS.DAILY_SESSION_CAP,
  SETTINGS_KEYS.MIN_PAYOUT_USD,
  SETTINGS_KEYS.MIN_ACCOUNT_AGE_DAYS,
  SETTINGS_KEYS.MIN_SESSIONS_FOR_PAYOUT,
]);

/** Upper bounds, so a fat-fingered admin edit can't hand out 1,000,000 coins. */
export const SETTING_LIMITS: Record<string, { min: number; max: number }> = {
  [SETTINGS_KEYS.REFERRAL_COIN_REFERRER]: { min: 0, max: 10_000 },
  [SETTINGS_KEYS.REFERRAL_COIN_NEW_USER]: { min: 0, max: 10_000 },
  [SETTINGS_KEYS.DAILY_AD_REWARD_COINS]:  { min: 0, max: 1_000 },
  [SETTINGS_KEYS.DAILY_AD_REWARD_MAX]:    { min: 0, max: 100 },
  [SETTINGS_KEYS.DAILY_CHECKIN_COINS]:    { min: 0, max: 1_000 },
  [SETTINGS_KEYS.MAX_PVP_WAGER]:          { min: 0, max: 100_000 },
  [SETTINGS_KEYS.DAILY_SESSION_CAP]:      { min: 1, max: 500 },
  [SETTINGS_KEYS.MIN_PAYOUT_USD]:         { min: 1, max: 1_000 },
  [SETTINGS_KEYS.MIN_ACCOUNT_AGE_DAYS]:   { min: 0, max: 365 },
  [SETTINGS_KEYS.MIN_SESSIONS_FOR_PAYOUT]:{ min: 0, max: 1_000 },
};

export default AppSettings;
