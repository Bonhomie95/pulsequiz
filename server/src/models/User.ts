import { Schema, model, Types } from 'mongoose';

export type UsdtType = 'TRC20' | 'ERC20' | 'BEP20';

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  provider: 'google' | 'facebook';
  providerId: string;

  username?: string | null;
  avatar?: string | null;

  theme: 'light' | 'dark' | 'system';

  usdtType?: UsdtType;
  usdtAddress?: string;

  withdrawalEnabled: boolean;
  publicProfile: boolean; // whether username appears in "ready to play" carousel
  sessionsSinceLastAd: number;
  lastAdRewardAt?: Date | null;
  adRewardsInWindow: number;
  lastSeenAt?: Date | null;
  isBanned: boolean;
  hasCompletedFirstQuiz: boolean;

  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, immutable: true },
    provider: { type: String, enum: ['google', 'facebook'], required: true },
    providerId: { type: String, required: true },

    username: { type: String, unique: true, sparse: true, default: null },
    avatar: { type: String, default: null },

    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },

    usdtType: {
      type: String,
      enum: ['TRC20', 'ERC20', 'BEP20'],
    },

    usdtAddress: {
      type: String,
    },

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
    lastSeenAt: { type: Date, default: null },
    isBanned: { type: Boolean, default: false },
    hasCompletedFirstQuiz: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default model<IUser>('User', UserSchema);
