import { Schema, model, Types } from 'mongoose';

export interface IReport {
  _id: Types.ObjectId;
  reporterId:     Types.ObjectId;   // who filed the report
  reportedUserId: Types.ObjectId;   // who is being reported
  reason: string;                   // short category
  details?: string;                 // optional free-text
  status: 'open' | 'resolved' | 'dismissed';
  action?: string;                  // admin note on what was done
  resolvedBy?: string;              // admin email
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reporterId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason:   { type: String, required: true },
    details:  { type: String, default: null },
    status:   { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open', index: true },
    action:   { type: String, default: null },
    resolvedBy: { type: String, default: null },
  },
  { timestamps: true }
);

ReportSchema.index({ status: 1, createdAt: -1 });

export default model<IReport>('Report', ReportSchema);
