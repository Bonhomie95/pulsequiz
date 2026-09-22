import { Schema, model, Types } from 'mongoose';

type Diff = 'easy' | 'medium' | 'hard';

/**
 * An async friend challenge: the creator and one friend play the same ten
 * questions whenever they like, then compare.
 */
export interface IDuelPlayer {
  userId: Types.ObjectId;
  status: 'playing' | 'done';
  correct: number;
  total: number;
  results: boolean[];
  timeLeftMs: number;
  finishedAt?: Date | null;
}

export interface IDuel {
  code: string;
  creatorId: Types.ObjectId;
  category: string;
  questions: { questionId: Types.ObjectId; difficulty: Diff }[];
  players: IDuelPlayer[];
  expiresAt: Date;
}

const DuelSchema = new Schema<IDuel>(
  {
    code: { type: String, required: true, unique: true },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, required: true },
    questions: [
      {
        _id: false,
        questionId: { type: Schema.Types.ObjectId, ref: 'QuizQuestion', required: true },
        difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
      },
    ],
    players: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: { type: String, enum: ['playing', 'done'], default: 'playing' },
        correct: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        results: { type: [Boolean], default: [] },
        timeLeftMs: { type: Number, default: 0 },
        finishedAt: { type: Date, default: null },
      },
    ],
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

DuelSchema.index({ 'players.userId': 1, createdAt: -1 });

export default model<IDuel>('Duel', DuelSchema);
