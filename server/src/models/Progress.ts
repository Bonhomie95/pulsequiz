import { Schema, model, Types } from 'mongoose';

export interface IProgress {
  userId: Types.ObjectId;
  points: number;
  level: number;
  updatedAt: Date;
}

const ProgressSchema = new Schema<IProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
    points: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export default model<IProgress>('Progress', ProgressSchema);
