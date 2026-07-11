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

export async function getSetting(key: string, fallback: number | string | boolean): Promise<any> {
  const doc = await AppSettings.findOne({ key }).lean();
  return doc ? doc.value : fallback;
}

export async function setSetting(key: string, value: any, updatedBy?: string) {
  return AppSettings.findOneAndUpdate(
    { key },
    { value, updatedBy },
    { upsert: true, returnDocument: 'after' }
  );
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
  for (const [key, value] of Object.entries(defaults)) {
    await AppSettings.updateOne({ key }, { $setOnInsert: { key, value } }, { upsert: true });
  }
}

export default AppSettings;
