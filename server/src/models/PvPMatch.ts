import { Schema, model, Types } from 'mongoose';

type Diff = 'easy' | 'medium' | 'hard';

type PvPState =
  | 'WAITING'
  | 'MATCHED'
  | 'ACTIVE'
  | 'WAITING_ON_OPPONENT'
  | 'FINISHED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FORFEITED';

const AnswerSchema = new Schema(
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
  { _id: false },
);

const PlayerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    usernameSnapshot: { type: String, required: true },
    avatarSnapshot: { type: String, required: true },
    levelSnapshot: { type: Number, required: true },
    allTimeRankSnapshot: { type: Number, default: 0 },

    connected: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now },
    disconnectedAt: { type: Date, default: null },
    forfeitAt: { type: Date, default: null },

    currentIndex: { type: Number, default: 0 },
    furthestIndex: { type: Number, default: 0 },
    failedAtIndex: { type: Number, default: null },
    completed: { type: Boolean, default: false },

    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    totalTimeMs: { type: Number, default: null },

    answers: { type: [AnswerSchema], default: [] },
    pointsAwarded: { type: Number, default: 0 },
    coinsAwarded: { type: Number, default: 0 },
  },
  { _id: false },
);

const QuestionRefSchema = new Schema(
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
    order: { type: Number, required: true },
  },
  { _id: false },
);

const PvPMatchSchema = new Schema(
  {
    category: { type: String, index: true, required: true },
    state: {
      type: String,
      enum: [
        'WAITING',
        'MATCHED',
        'ACTIVE',
        'WAITING_ON_OPPONENT',
        'FINISHED',
        'CANCELLED',
        'EXPIRED',
        'FORFEITED',
      ],
      default: 'WAITING',
      index: true,
    },

    players: { type: [PlayerSchema], default: [] }, // exactly 2 once matched
    questionSet: { type: [QuestionRefSchema], default: [] }, // exactly 10

    createdAt: { type: Date, default: Date.now },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },

    matchmakingExpiresAt: { type: Date, required: true },
    forfeitWindowSeconds: { type: Number, default: 60 },

    winnerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    finishReason: { type: String, enum: ['normal', 'forfeit'], default: null },
  },
  { timestamps: true },
);

PvPMatchSchema.index({ category: 1, state: 1 });

export default model('PvPMatch', PvPMatchSchema);
