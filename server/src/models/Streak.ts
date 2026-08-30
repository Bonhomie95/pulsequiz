import { Schema, model, Types } from 'mongoose';

export interface IStreak {
  userId: Types.ObjectId;
  streak: number;
  lastCheckIn: Date | null;
  checkInHistory: Date[];
}

const StreakSchema = new Schema<IStreak>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
    streak: { type: Number, default: 0 },
    lastCheckIn: { type: Date, default: null },
    checkInHistory: { type: [Date], default: [] },
  },
  { timestamps: true }
);

StreakSchema.index({ lastCheckIn: -1 });
// The admin streak ranking filters and sorts on `streak`: the distribution,
// the top-holders board, and every user-detail view's rank lookup. Without
// this those are collection scans with an in-memory sort, which degrades
// linearly with the player base and can trip Mongo's 32MB sort limit.
StreakSchema.index({ streak: -1 });

export default model<IStreak>('Streak', StreakSchema);
