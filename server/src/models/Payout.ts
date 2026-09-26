import { Schema, model, Types } from 'mongoose';

/**
 * processing  — claimed by a retry that is talking to the provider right now.
 * superseded  — its amount was paid as part of a later payout (balances roll
 *               over), so it must never be sent on its own.
 */
export type PayoutStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'confirmed'
  | 'failed'
  | 'skipped'
  | 'superseded';
export type PayoutPeriod = 'weekly' | 'monthly' | 'event';

export interface IPayout {
  userId: Types.ObjectId;
  amount: number; // USD value, paid in `currency`
  rank: number;
  period: PayoutPeriod;
  periodLabel: string; // e.g. "2026-W08" or "2026-02"
  usdtAddress: string;
  usdtType: string;
  /** USDT or USDC — snapshot of the user's choice when the row was created. */
  currency: 'USDT' | 'USDC';
  status: PayoutStatus;
  txHash?: string;
  retries: number;
  nowpaymentsPaymentId?: string;
  /** Stable reference sent to the payment provider so a retry after a lost
   *  response reconciles instead of sending a second transfer. */
  idempotencyKey: string;
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
    currency: { type: String, enum: ['USDT', 'USDC'], default: 'USDT' },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'confirmed', 'failed', 'skipped', 'superseded'],
      default: 'pending',
    },
    txHash: { type: String },
    retries: { type: Number, default: 0 },
    nowpaymentsPaymentId: { type: String },
    idempotencyKey: { type: String, unique: true, sparse: true },
    failReason: { type: String },
    lastAttemptAt: { type: Date },
    sentAt: { type: Date },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

PayoutSchema.index({ period: 1, periodLabel: 1, userId: 1 }, { unique: true });

// retryFailedPayouts scans by status; the user-facing list reads by user.
PayoutSchema.index({ status: 1, retries: 1 });
PayoutSchema.index({ userId: 1, createdAt: -1 });

export default model<IPayout>('Payout', PayoutSchema);
