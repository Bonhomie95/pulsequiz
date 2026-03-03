import { Schema, model, Types } from 'mongoose';

export type PayoutStatus = 'pending' | 'sent' | 'confirmed' | 'failed' | 'skipped';
export type PayoutPeriod = 'weekly' | 'monthly' | 'event';

export interface IPayout {
  userId: Types.ObjectId;
  amount: number; // USDT
  rank: number;
  period: PayoutPeriod;
  periodLabel: string; // e.g. "2026-W08" or "2026-02"
  usdtAddress: string;
  usdtType: string;
  status: PayoutStatus;
  txHash?: string;
  retries: number;
  nowpaymentsPaymentId?: string;
  failReason?: string;
  lastAttemptAt?: Date;
  createdAt: Date;
  sentAt?: Date;
  confirmedAt?: Date;
}

const PayoutSchema = new Schema<IPayout>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    rank: { type: Number, required: true },
    period: { type: String, enum: ['weekly', 'monthly', 'event'], required: true },
    periodLabel: { type: String, required: true },
    usdtAddress: { type: String, required: true },
    usdtType: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sent', 'confirmed', 'failed', 'skipped'], default: 'pending' },
    txHash: { type: String },
    retries: { type: Number, default: 0 },
    nowpaymentsPaymentId: { type: String },
    failReason: { type: String },
    lastAttemptAt: { type: Date },
    sentAt: { type: Date },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

PayoutSchema.index({ period: 1, periodLabel: 1, userId: 1 }, { unique: true });

export default model<IPayout>('Payout', PayoutSchema);
