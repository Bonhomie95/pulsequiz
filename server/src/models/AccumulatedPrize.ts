import { Schema, model, Types } from 'mongoose';

export interface IAccumulatedPrize {
  userId: Types.ObjectId;
  pendingUSDT: number; // rolling balance under $5 threshold
  totalEarned: number; // lifetime total
  lastUpdated: Date;
}

const AccumulatedPrizeSchema = new Schema<IAccumulatedPrize>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true, index: true },
    pendingUSDT: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default model<IAccumulatedPrize>('AccumulatedPrize', AccumulatedPrizeSchema);
