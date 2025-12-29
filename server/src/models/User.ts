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
  },
  { timestamps: true }
);

export default model<IUser>('User', UserSchema);
