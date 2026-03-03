import { Schema, model, Types } from 'mongoose';

export type CoinReason =
  | 'daily_checkin'
  | 'ad_reward'
  | 'iap_purchase'
  | 'referral_bonus'
  | 'pvp_wager_win'
  | 'pvp_wager_refund'
  | 'pvp_wager_stake'
  | 'hint_used'
  | 'challenge_reward'
  | 'tournament_entry'
  | 'tournament_prize'
  | 'admin_grant'
  | 'admin_deduct';

export interface ICoinTransaction {
  userId: Types.ObjectId;
  delta: number; // positive = credit, negative = debit
  balanceAfter: number;
  reason: CoinReason;
  sessionId?: string;
  matchId?: string;
  meta?: string;
  createdAt: Date;
}

const CoinTransactionSchema = new Schema<ICoinTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reason: {
      type: String,
      enum: [
        'daily_checkin', 'ad_reward', 'iap_purchase', 'referral_bonus',
        'pvp_wager_win', 'pvp_wager_refund', 'pvp_wager_stake',
        'hint_used', 'challenge_reward', 'tournament_entry', 'tournament_prize', 'admin_grant', 'admin_deduct',
      ],
      required: true,
    },
    sessionId: { type: String },
    matchId: { type: String },
    meta: { type: String },
  },
  { timestamps: true }
);

// Immutable - never update, only insert
CoinTransactionSchema.set('strict', true);

export default model<ICoinTransaction>('CoinTransaction', CoinTransactionSchema);
