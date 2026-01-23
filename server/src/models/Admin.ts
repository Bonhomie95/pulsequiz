import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAdmin {
  email: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'MODERATOR';
  isActive: boolean;
  lastLoginAt?: Date;
}

const AdminSchema = new Schema<IAdmin>(
  {
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'MODERATOR'],
      default: 'SUPER_ADMIN',
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

AdminSchema.methods.comparePassword = function (password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

export default model<IAdmin>('Admin', AdminSchema);
