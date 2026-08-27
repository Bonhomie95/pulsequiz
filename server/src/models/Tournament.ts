import { Schema, model, Types } from 'mongoose';

export type TournamentStatus = 'upcoming' | 'active' | 'finished' | 'cancelled';

export interface ITournamentParticipant {
  userId: Types.ObjectId;
  usernameSnapshot: string;
  avatarSnapshot: string;
  score: number;
  rank?: number;
  joinedAt: Date;
}

export interface ITournament {
  title: string;
  description: string;
  category: string;
  status: TournamentStatus;
  entryFeeCoins: number;
  prizePoolCoins: number;
  maxParticipants: number;
  participants: ITournamentParticipant[];
  startsAt: Date;
  endsAt: Date;
  winnersCount: number;    // how many top players get prizes
  prizeDistribution: { rank: number; coins: number }[];
  /** Set once prizes have been paid. Guards against paying a tournament twice. */
  settledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ParticipantSchema = new Schema<ITournamentParticipant>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    usernameSnapshot: { type: String, required: true },
    avatarSnapshot: { type: String, default: 'avatar0' },
    score: { type: Number, default: 0 },
    rank: { type: Number, default: null },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PrizeDistributionSchema = new Schema(
  {
    rank: { type: Number, required: true },
    coins: { type: Number, required: true },
  },
  { _id: false }
);

const TournamentSchema = new Schema<ITournament>(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, required: true },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'finished', 'cancelled'],
      default: 'upcoming',
      index: true,
    },
    entryFeeCoins: { type: Number, default: 0 },
    prizePoolCoins: { type: Number, default: 0 },
    maxParticipants: { type: Number, default: 100 },
    participants: { type: [ParticipantSchema], default: [] },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    winnersCount: { type: Number, default: 3 },
    prizeDistribution: { type: [PrizeDistributionSchema], default: [] },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TournamentSchema.index({ status: 1, startsAt: 1 });
TournamentSchema.index({ 'participants.userId': 1 });
TournamentSchema.index({ status: 1, endsAt: 1 });

export default model<ITournament>('Tournament', TournamentSchema);
