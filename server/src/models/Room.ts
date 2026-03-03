import { Schema, model, Types } from 'mongoose';

export type RoomStatus = 'waiting' | 'active' | 'finished' | 'cancelled';

export interface IRoom {
  code: string;
  hostId: Types.ObjectId;
  guestId?: Types.ObjectId;
  status: RoomStatus;
  category: string;
  wager: number;
  matchId?: Types.ObjectId;
  expiresAt: Date;
}

const RoomSchema = new Schema<IRoom>(
  {
    code: { type: String, required: true, unique: true, index: true, uppercase: true },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    guestId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['waiting', 'active', 'finished', 'cancelled'], default: 'waiting' },
    category: { type: String, required: true },
    wager: { type: Number, default: 0 },
    matchId: { type: Schema.Types.ObjectId, ref: 'PvPMatch', default: null },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) },
  },
  { timestamps: true }
);

// TTL: auto-delete expired rooms
RoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IRoom>('Room', RoomSchema);
