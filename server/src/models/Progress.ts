import { Schema, model, Types, HydratedDocument } from 'mongoose';

export interface IProgress {
  userId: Types.ObjectId;
  points: number;
  level: number;
  totalQuizzes: number;
  correctAnswers: number;
  totalAnswers: number;
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
  },
  { timestamps: true }
);

export default model<IProgress>('Progress', ProgressSchema);
