import { Schema, model, Types } from 'mongoose';

type Diff = 'easy' | 'medium' | 'hard';

export interface IActiveQuizSession {
  userId: Types.ObjectId;
  category: string;
  questions: { questionId: Types.ObjectId; difficulty: Diff }[];
  // correctIndex: number;
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
  hintsUsed: number;
  hintedQuestions: Types.ObjectId[];
  timeExtensionsUsed: number; // total in session (max 10)
  timeExtendedQuestions: Types.ObjectId[]; // once per question
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
    // correctIndex: {
    //   type: Number,
    //   min: 0,
    //   max: 3,
    //   required: true,
    // },
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
    hintsUsed: { type: Number, default: 0 },
    hintedQuestions: { type: [Schema.Types.ObjectId], default: [] },
    timeExtensionsUsed: { type: Number, default: 0 },
    timeExtendedQuestions: { type: [Schema.Types.ObjectId], default: [] },

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
