import { Schema, model, Types } from 'mongoose';

export interface IPushToken {
  userId: Types.ObjectId;
  token: string;
  platform: 'ios' | 'android';
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PushTokenSchema = new Schema<IPushToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PushTokenSchema.index({ userId: 1 });
PushTokenSchema.index({ token: 1 }, { unique: true });

export default model<IPushToken>('PushToken', PushTokenSchema);
