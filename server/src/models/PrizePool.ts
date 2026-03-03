import { Schema, model } from 'mongoose';

export interface IPrizeTier {
  rank: number;
  amount: number; // USDT
}

export interface IPrizePool {
  type: 'weekly' | 'monthly' | 'event';
  periodLabel: string; // "2026-W08", "2026-02", or event id
  totalAmount: number;
  paidRanks: number; // how many top players get paid
  tiers: IPrizeTier[];
  setByAdmin: string;
  lockedAt?: Date; // locked when period ends — no more edits
  eventId?: string;
}

const PrizeTierSchema = new Schema<IPrizeTier>(
  { rank: { type: Number, required: true }, amount: { type: Number, required: true } },
  { _id: false }
);

const PrizePoolSchema = new Schema<IPrizePool>(
  {
    type: { type: String, enum: ['weekly', 'monthly', 'event'], required: true },
    periodLabel: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    paidRanks: { type: Number, required: true },
    tiers: { type: [PrizeTierSchema], default: [] },
    setByAdmin: { type: String, required: true },
    lockedAt: { type: Date, default: null },
    eventId: { type: String },
  },
  { timestamps: true }
);

PrizePoolSchema.index({ type: 1, periodLabel: 1 }, { unique: true });

export default model<IPrizePool>('PrizePool', PrizePoolSchema);
