import { Schema, model } from 'mongoose';

interface LeaderboardEntry {
  userId: string;
  username: string;
  avatar: string;
  points: number;
}

export interface ILeaderboardSnapshot {
  type: 'weekly' | 'monthly' | 'all';
  data: LeaderboardEntry[];
  generatedAt: Date;
}

const LeaderboardEntrySchema = new Schema<LeaderboardEntry>(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true },
    avatar: { type: String, required: true },
    points: { type: Number, required: true },
  },
  { _id: false } // important: no nested _id
);

const LeaderboardSnapshotSchema = new Schema<ILeaderboardSnapshot>({
  type: {
    type: String,
    enum: ['weekly', 'monthly', 'all'],
    required: true,
  },
  data: {
    type: [LeaderboardEntrySchema],
    required: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default model<ILeaderboardSnapshot>(
  'LeaderboardSnapshot',
  LeaderboardSnapshotSchema
);
