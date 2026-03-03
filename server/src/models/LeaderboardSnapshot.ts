import { Schema, model } from 'mongoose';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  avatar: string;
  points: number;
  rank?: number;
  previousRank?: number;
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
    rank: { type: Number, default: null },
    previousRank: { type: Number, default: null },
  },
  { _id: false }
);

const LeaderboardSnapshotSchema = new Schema<ILeaderboardSnapshot>(
  {
    type: {
      type: String,
      enum: ['weekly', 'monthly', 'all'],
      required: true,
      index: true, // 🔥 add index
    },
    data: {
      type: [LeaderboardEntrySchema], // ✅ THIS fixes the error
      required: true,
      default: [], // 🔥 defensive default
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

export default model<ILeaderboardSnapshot>(
  'LeaderboardSnapshot',
  LeaderboardSnapshotSchema
);
