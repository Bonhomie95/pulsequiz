import { Schema, model, Types } from 'mongoose';

/**
 * A house account's standing for one leaderboard period.
 *
 * Kept in its own collection rather than as fabricated QuizSession rows so the
 * padding never reaches anything that counts real activity — revenue, signups,
 * session totals, per-question difficulty calibration. The leaderboard merges
 * these in for display; `buildLeaderboard` leaves them out when it is ranking
 * for a payout, so a house account can never take a paying rank from a player.
 */
export interface ISyntheticScore {
  userId: Types.ObjectId;
  type: 'weekly' | 'monthly' | 'all';
  /** e.g. "2026-W39", "2026-09", or "all" for the all-time board. */
  periodLabel: string;
  points: number;
}

const SyntheticScoreSchema = new Schema<ISyntheticScore>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['weekly', 'monthly', 'all'], required: true },
    periodLabel: { type: String, required: true },
    points: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

SyntheticScoreSchema.index({ userId: 1, type: 1, periodLabel: 1 }, { unique: true });
SyntheticScoreSchema.index({ type: 1, periodLabel: 1, points: -1 });

export const SyntheticScore = model<ISyntheticScore>('SyntheticScore', SyntheticScoreSchema);
