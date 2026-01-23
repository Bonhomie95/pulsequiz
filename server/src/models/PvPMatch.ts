import { Schema, model } from 'mongoose';



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

type PvPMode = 'single' | 'series';

type RematchStatus = 'NONE' | 'REQUESTED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

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
    ready: { type: Boolean, default: false },
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

    // rank movement animation support (optional but recommended)
    rankBefore: { type: Number, default: null },
    rankAfter: { type: Number, default: null },

    connected: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now },
    disconnectedAt: { type: Date, default: null },
    forfeitAt: { type: Date, default: null },
    ready: { type: Boolean, default: false },

    currentIndex: { type: Number, default: 0 },
    furthestIndex: { type: Number, default: 0 },
    failedAtIndex: { type: Number, default: null },
    completed: { type: Boolean, default: false },

    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    totalTimeMs: { type: Number, default: null },

    answers: { type: [AnswerSchema], default: [] },

    // what this player earned in THIS round (match)
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

/**
 * Series score tracker: how many rounds each user has won inside the series
 */
const SeriesScoreSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    wins: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * Rematch handshake (after FINISHED)
 */
const RematchSchema = new Schema(
  {
    status: {
      type: String,
      enum: ['NONE', 'REQUESTED', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
      default: 'NONE',
      index: true,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    requestedAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },

    // optional: auto-expire rematch offer (e.g., 30s)
    expiresAt: { type: Date, default: null },
  },
  { _id: false },
);

const PvPMatchSchema = new Schema(
  {
    category: { type: String, index: true, required: true },

    mode: {
      type: String,
      enum: ['single', 'series'],
      default: 'single',
      index: true,
    },

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

    /* ---------------- SERIES (Best-of-3) ---------------- */

    // groups all rounds in the same best-of-3
    seriesId: { type: Schema.Types.ObjectId, index: true, default: null },

    bestOf: { type: Number, default: null }, // set to 3 for best-of-3
    roundIndex: { type: Number, default: null }, // 1..bestOf

    // seriesScore lives on every round doc for convenience (copied forward)
    seriesScore: { type: [SeriesScoreSchema], default: [] },

    // winners per round (copied forward)
    roundWinners: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },

    // set when the series is fully decided (first to 2)
    seriesWinnerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /* ---------------- REMATCH ---------------- */

    rematch: { type: RematchSchema, default: () => ({}) },

    // link to "next match" created from rematch or next round
    nextMatchId: {
      type: Schema.Types.ObjectId,
      ref: 'PvPMatch',
      default: null,
    },
    prevMatchId: {
      type: Schema.Types.ObjectId,
      ref: 'PvPMatch',
      default: null,
    },
  },
  { timestamps: true },
);

// Existing index
PvPMatchSchema.index({ category: 1, state: 1 });

// Helpful indexes for series/rematch lookups
PvPMatchSchema.index({ seriesId: 1, roundIndex: 1 });
PvPMatchSchema.index({ 'rematch.status': 1, finishedAt: -1 });

export default model('PvPMatch', PvPMatchSchema);
