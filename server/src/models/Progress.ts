import { Schema, model, Types, HydratedDocument } from 'mongoose';

export interface IProgress {
  userId: Types.ObjectId;
  points: number;
  level: number;
  totalQuizzes: number;
  correctAnswers: number;
  totalAnswers: number;

  /**
   * PvP skill rating (Elo). Matchmaking previously paired on category and
   * wager alone, so a level 40 player routinely faced a beginner — and with
   * coins staked on the result, that is a losing experience for one of them
   * every single time.
   */
  rating: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
}

export type ProgressDoc = HydratedDocument<IProgress>;

const ProgressSchema = new Schema<IProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
    points: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    totalQuizzes: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    totalAnswers: { type: Number, default: 0 },
    rating: { type: Number, default: 1200 },
    pvpWins: { type: Number, default: 0 },
    pvpLosses: { type: Number, default: 0 },
    pvpDraws: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// All-time leaderboard sorts on points; without this it is an in-memory sort
// that eventually trips Mongo's 32MB sort limit.
ProgressSchema.index({ points: -1 });
ProgressSchema.index({ rating: -1 });
// The leaderboard refresh checks "has anything changed since the last run?"
// against this every minute.
ProgressSchema.index({ updatedAt: -1 });

export default model<IProgress>('Progress', ProgressSchema);
