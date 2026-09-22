import { Schema, model, Types } from 'mongoose';

type Diff = 'easy' | 'medium' | 'hard';

/** The shared puzzle for one calendar date ("YYYY-MM-DD"). */
export interface IDailyQuiz {
  date: string;
  questions: { questionId: Types.ObjectId; difficulty: Diff }[];
}

const DailyQuizSchema = new Schema<IDailyQuiz>(
  {
    date: { type: String, required: true, unique: true },
    questions: [
      {
        _id: false,
        questionId: { type: Schema.Types.ObjectId, ref: 'QuizQuestion', required: true },
        difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
      },
    ],
  },
  { timestamps: true },
);

export const DailyQuiz = model<IDailyQuiz>('DailyQuiz', DailyQuizSchema);

/**
 * One player's go at one date. Created when the run STARTS (unique per
 * user+date), so quitting and restarting can't be used to preview the answers.
 */
export interface IDailyAttempt {
  userId: Types.ObjectId;
  date: string;
  correct: number;
  total: number;
  /** Per question, in order: true = correct. Drives the share grid. */
  results: boolean[];
  timeLeftMs: number;
  finishedAt?: Date | null;
}

const DailyAttemptSchema = new Schema<IDailyAttempt>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    correct: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    results: { type: [Boolean], default: [] },
    timeLeftMs: { type: Number, default: 0 },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

DailyAttemptSchema.index({ userId: 1, date: 1 }, { unique: true });
DailyAttemptSchema.index({ date: 1, finishedAt: 1, correct: -1, timeLeftMs: -1 });

export const DailyAttempt = model<IDailyAttempt>('DailyAttempt', DailyAttemptSchema);
