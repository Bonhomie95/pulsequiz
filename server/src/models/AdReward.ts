import { Schema, model, Types } from 'mongoose';

/**
 * One row per *verified* rewarded-ad impression.
 *
 * Coins are credited from Google's server-to-server verification callback, not
 * from the client claiming it watched an ad. `transactionId` is Google's, and
 * it is unique — so a replayed callback inserts nothing and credits nothing.
 */
export interface IAdReward {
  userId: Types.ObjectId;
  transactionId: string;
  adUnit?: string;
  adNetwork?: string;
  rewardAmount?: number;
  rewardItem?: string;
  coinsCredited: number;
  /** UTC "YYYY-MM-DD" the reward counted against, for the daily cap. */
  rewardDate: string;
  createdAt: Date;
}

const AdRewardSchema = new Schema<IAdReward>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    transactionId: { type: String, required: true, unique: true },
    adUnit: { type: String },
    adNetwork: { type: String },
    rewardAmount: { type: Number },
    rewardItem: { type: String },
    coinsCredited: { type: Number, required: true },
    rewardDate: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AdRewardSchema.index({ userId: 1, rewardDate: 1 });
AdRewardSchema.index({ createdAt: -1 });

export default model<IAdReward>('AdReward', AdRewardSchema);
