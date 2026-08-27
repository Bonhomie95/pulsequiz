import { Schema, model, Types } from 'mongoose';

export interface IQuizSession {
  userId: Types.ObjectId;
  sessionId: Types.ObjectId;
  category: string;
  score: number;
  bonus: number;
  totalPoints: number;
  correctAnswers: number;
  totalQuestions: number;
  levelAtTime: number;
  createdAt: Date;
}

const QuizSessionSchema = new Schema<IQuizSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ActiveQuizSession',
      required: true,
      index: true,
    },
    category: { type: String, required: true, index: true },
    score: { type: Number, required: true },
    bonus: { type: Number, default: 0 },
    totalPoints: { type: Number, required: true },
    correctAnswers: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    levelAtTime: { type: Number, required: true },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// This is the largest, fastest-growing collection and the source of every
// leaderboard. Without these, leaderboard aggregations, the daily-cap check and
// every per-user history read are full collection scans.
QuizSessionSchema.index({ userId: 1, createdAt: -1 }); // profile history, daily cap
QuizSessionSchema.index({ createdAt: -1 });            // weekly/monthly leaderboard $match
QuizSessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true }); // one row per session per user

export default model<IQuizSession>('QuizSession', QuizSessionSchema);
