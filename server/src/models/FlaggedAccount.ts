import { Schema, model, Types } from 'mongoose';

export interface IFlaggedAccount {
  userId: Types.ObjectId;
  reason: string;
  accuracyRate?: number;
  sessionVelocity?: number; // sessions per hour
  fastAnswerCount?: number; // answers under 1s
  flaggedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  action?: 'warned' | 'banned' | 'cleared';
  /** Free-text note the reviewing admin left. */
  resolutionNote?: string;
}

const FlaggedAccountSchema = new Schema<IFlaggedAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, required: true },
    accuracyRate: { type: Number },
    sessionVelocity: { type: Number },
    fastAnswerCount: { type: Number },
    flaggedAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    action: { type: String, enum: ['warned', 'banned', 'cleared'] },
    resolutionNote: { type: String, default: null },
  },
  { timestamps: true }
);

FlaggedAccountSchema.index({ resolved: 1, flaggedAt: -1 });

export default model<IFlaggedAccount>('FlaggedAccount', FlaggedAccountSchema);
