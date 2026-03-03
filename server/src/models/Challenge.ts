import { Schema, model, Types } from 'mongoose';

export type ChallengeType = 'daily' | 'weekly';
export type ChallengeStatus = 'active' | 'completed' | 'expired';

export interface IChallenge {
  userId: Types.ObjectId;
  type: ChallengeType;
  title: string;
  description: string;
  category?: string;
  targetValue: number;  // e.g. answer 10 questions correctly
  currentValue: number;
  rewardCoins: number;
  rewardPoints: number;
  status: ChallengeStatus;
  periodLabel: string;  // e.g. "2024-W05" or "2024-02"
  completedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeSchema = new Schema<IChallenge>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['daily', 'weekly'], required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, default: null },
    targetValue: { type: Number, required: true },
    currentValue: { type: Number, default: 0 },
    rewardCoins: { type: Number, default: 0 },
    rewardPoints: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed', 'expired'], default: 'active' },
    periodLabel: { type: String, required: true },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

ChallengeSchema.index({ userId: 1, status: 1 });
ChallengeSchema.index({ userId: 1, periodLabel: 1 });
ChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 }); // clean up 1d after expiry

export default model<IChallenge>('Challenge', ChallengeSchema);
