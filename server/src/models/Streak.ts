import { Schema, model, Types } from 'mongoose';

export interface IStreak {
  userId: Types.ObjectId;
  streak: number;
  lastCheckIn: Date | null;
}

const StreakSchema = new Schema<IStreak>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
    streak: { type: Number, default: 0 },
    lastCheckIn: { type: Date, default: null },
  },
  { timestamps: true }
);

export default model<IStreak>('Streak', StreakSchema);
