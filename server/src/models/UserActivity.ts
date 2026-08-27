import { Schema, model, Types } from 'mongoose';

const UserActivitySchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', index: true },
    type: {
      type: String,
      enum: [
        'QUIZ_START',
        'QUIZ_FINISH',
        'PURCHASE',
        'CHECK_IN',
        'PROFILE_UPDATE',
        'BAN',
      ],
    },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

UserActivitySchema.index({ userId: 1, createdAt: -1 });
UserActivitySchema.index({ createdAt: -1 });

export default model('UserActivity', UserActivitySchema);
