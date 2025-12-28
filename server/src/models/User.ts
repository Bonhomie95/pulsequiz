import { Schema, model, Types } from 'mongoose';

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  provider: 'google' | 'facebook';
  providerId: string;
  username: string;
  avatar: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    provider: { type: String, enum: ['google', 'facebook'], required: true },
    providerId: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    avatar: { type: String, required: true },
  },
  { timestamps: true }
);

export default model<IUser>('User', UserSchema);
