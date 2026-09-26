import { Schema, model, Types } from 'mongoose';

/** A weekly cohort of up to GROUP_SIZE players in one tier. */
export interface ILeagueGroup {
  week: string; // ISO week label, e.g. "2026-W39"
  tier: number;
  size: number;
  settledAt?: Date | null;
}

const LeagueGroupSchema = new Schema<ILeagueGroup>(
  {
    week: { type: String, required: true },
    tier: { type: Number, required: true },
    size: { type: Number, default: 0 },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

LeagueGroupSchema.index({ week: 1, tier: 1, size: 1 });
LeagueGroupSchema.index({ settledAt: 1, week: 1 });

export const LeagueGroup = model<ILeagueGroup>('LeagueGroup', LeagueGroupSchema);

export type LeagueOutcome = 'promoted' | 'demoted' | 'stayed';

export interface ILeagueMember {
  userId: Types.ObjectId;
  week: string;
  tier: number;
  groupId: Types.ObjectId;
  xp: number;
  /** Filled in when the week is settled. */
  finalRank?: number | null;
  outcome?: LeagueOutcome | null;
  reward?: number;
}

const LeagueMemberSchema = new Schema<ILeagueMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    week: { type: String, required: true },
    tier: { type: Number, required: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'LeagueGroup', required: true },
    xp: { type: Number, default: 0 },
    finalRank: { type: Number, default: null },
    outcome: { type: String, enum: ['promoted', 'demoted', 'stayed', null], default: null },
    reward: { type: Number, default: 0 },
  },
  { timestamps: true },
);

LeagueMemberSchema.index({ userId: 1, week: 1 }, { unique: true });
LeagueMemberSchema.index({ groupId: 1, xp: -1 });

export const LeagueMember = model<ILeagueMember>('LeagueMember', LeagueMemberSchema);
