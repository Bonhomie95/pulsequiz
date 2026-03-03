import { Schema, model, Types } from 'mongoose';

export interface IReferral {
  referrerId: Types.ObjectId;
  referredId: Types.ObjectId;
  rewardGranted: boolean;
  rewardCoins: number;
  createdAt: Date;
}

const ReferralSchema = new Schema<IReferral>(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referredId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    rewardGranted: { type: Boolean, default: false },
    rewardCoins: { type: Number, default: 100 },
  },
  { timestamps: true }
);

export default model<IReferral>('Referral', ReferralSchema);
