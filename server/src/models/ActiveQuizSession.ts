import { Schema, model, Types } from 'mongoose';

type Diff = 'easy' | 'medium' | 'hard';

export interface IActiveQuizSession {
  userId: Types.ObjectId;
  category: string;
  questions: { questionId: Types.ObjectId; difficulty: Diff }[];
  answers: {
    questionId: Types.ObjectId;
    selected: number | null;
    isCorrect: boolean;
    answeredAt: Date;
  }[];
  isCorrect: boolean;
  currentIndex: number;
  startedAt: Date;
  expiresAt: Date;
  finished: boolean;
}

const ActiveQuizSessionSchema = new Schema<IActiveQuizSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    category: { type: String, required: true, index: true },
    questions: [
      {
        questionId: {
          type: Schema.Types.ObjectId,
          ref: 'QuizQuestion',
          required: true,
        },
        difficulty: {
          type: String,
          enum: ['easy', 'medium', 'hard'],
          required: true,
        },
      },
    ],
    answers: [
      {
        questionId: {
          type: Schema.Types.ObjectId,
          ref: 'QuizQuestion',
          required: true,
        },
        selected: { type: Number, default: null },
        isCorrect: { type: Boolean, required: true },
        answeredAt: { type: Date, required: true },
      },
    ],
    isCorrect: { type: Boolean, default: false },
    currentIndex: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    finished: { type: Boolean, default: false },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 15 * 60 * 1000), // 15 min
    },
  },
  { timestamps: true }
);

ActiveQuizSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto-cleanup

export default model<IActiveQuizSession>(
  'ActiveQuizSession',
  ActiveQuizSessionSchema
);
