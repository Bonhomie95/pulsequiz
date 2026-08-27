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
  /** Which period the rows describe, e.g. "2026-W08". Null for all-time. */
  periodLabel?: string | null;
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
    },
    data: {
      type: [LeaderboardEntrySchema], // ✅ THIS fixes the error
      required: true,
      default: [], // 🔥 defensive default
    },
    periodLabel: { type: String, default: null },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// Exactly one snapshot row per type; buildLeaderboard upserts into it.
LeaderboardSnapshotSchema.index({ type: 1 }, { unique: true });

export default model<ILeaderboardSnapshot>(
  'LeaderboardSnapshot',
  LeaderboardSnapshotSchema
);
