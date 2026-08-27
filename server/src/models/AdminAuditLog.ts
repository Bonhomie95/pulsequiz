import { Schema, model, Types } from 'mongoose';

/**
 * Immutable record of every mutating admin action.
 *
 * Admins can ban accounts, rewrite coin balances, set prize pools and trigger
 * real USDT payouts. Without a log there is no way to answer "who moved this
 * money" after the fact.
 */
export interface IAdminAuditLog {
  adminId: Types.ObjectId;
  adminEmail: string;
  adminRole: string;
  action: string;                 // e.g. 'user.ban', 'payout.trigger'
  targetType?: string;            // 'user' | 'payout' | 'setting' | ...
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  requestId?: string;
  createdAt: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    adminEmail: { type: String, required: true },
    adminRole: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String },
    requestId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AdminAuditLogSchema.index({ createdAt: -1 });
AdminAuditLogSchema.index({ adminId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ action: 1, createdAt: -1 });
AdminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export default model<IAdminAuditLog>('AdminAuditLog', AdminAuditLogSchema);
