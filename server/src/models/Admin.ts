import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';

export type AdminRoleName = 'SUPER_ADMIN' | 'MODERATOR';

export interface IAdmin {
  email: string;
  passwordHash: string;
  role: AdminRoleName;
  isActive: boolean;
  lastLoginAt?: Date;
  /** Consecutive failed logins; reset on success. */
  failedLogins: number;
  /** Per-account lockout — the IP limiter alone doesn't stop a botnet. */
  lockedUntil?: Date | null;
  createdBy?: string | null;
}

const AdminSchema = new Schema<IAdmin>(
  {
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'MODERATOR'],
      // Least privilege by default; super admins are granted explicitly.
      default: 'MODERATOR',
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    createdBy: { type: String, default: null },
  },
  { timestamps: true },
);

AdminSchema.methods.comparePassword = function (password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

export default model<IAdmin>('Admin', AdminSchema);
