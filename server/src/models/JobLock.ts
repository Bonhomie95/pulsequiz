import { Schema, model } from 'mongoose';

/**
 * Distributed lock for scheduled jobs.
 *
 * Cron previously ran inside the API process with only an in-memory "running"
 * flag, so the moment a second replica exists every job fires twice — which for
 * the payout job means paying every winner twice.
 *
 * A job claims its name with a TTL; a crashed holder's lock expires and the
 * next tick can take over.
 */
export interface IJobLock {
  name: string;
  owner: string;
  expiresAt: Date;
  lastRunAt?: Date;
}

const JobLockSchema = new Schema<IJobLock>(
  {
    name: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    lastRunAt: { type: Date },
  },
  { timestamps: true },
);

// Mongo reclaims expired locks automatically; the conditional update below is
// what actually guarantees correctness, this just keeps the collection tidy.
JobLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default model<IJobLock>('JobLock', JobLockSchema);
