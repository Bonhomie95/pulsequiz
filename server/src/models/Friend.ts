import { Schema, model, Types } from 'mongoose';

export type FriendStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

export interface IFriend {
  _id: Types.ObjectId;
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: FriendStatus;
  createdAt: Date;
  updatedAt: Date;
}

const FriendSchema = new Schema<IFriend>(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'blocked'],
      default: 'pending',
    },
  },
  { timestamps: true },
);

FriendSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
FriendSchema.index({ recipientId: 1, status: 1 });

export default model<IFriend>('Friend', FriendSchema);
