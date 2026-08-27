import { Schema, model, Types } from 'mongoose';

export type ChallengeType = 'daily' | 'weekly';
export type ChallengeStatus = 'active' | 'completed' | 'claimed' | 'expired';
export type ChallengeMetric = 'quizzes_played' | 'correct_answers' | 'perfect_scores';

export interface IChallenge {
  userId: Types.ObjectId;
  type: ChallengeType;
  title: string;
  description: string;
  category?: string;
  /** What the challenge counts. Was written by the seeder but missing from the
   *  schema, so Mongoose strict mode dropped it on insert — which meant
   *  progress tracking could never match a metric and no challenge ever
   *  advanced past 0. */
  metric: ChallengeMetric;
  targetValue: number;  // e.g. answer 10 questions correctly
  currentValue: number;
  rewardCoins: number;
  rewardPoints: number;
  status: ChallengeStatus;
  claimedAt?: Date | null;
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
    metric: {
      type: String,
      enum: ['quizzes_played', 'correct_answers', 'perfect_scores'],
      required: true,
    },
    category: { type: String, default: null },
    targetValue: { type: Number, required: true },
    currentValue: { type: Number, default: 0 },
    rewardCoins: { type: Number, default: 0 },
    rewardPoints: { type: Number, default: 0 },
    // 'claimed' is distinct from 'expired': it records that the reward was
    // paid, which is what makes the claim guard idempotent.
    status: {
      type: String,
      enum: ['active', 'completed', 'claimed', 'expired'],
      default: 'active',
    },
    claimedAt: { type: Date, default: null },
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
