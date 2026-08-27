import { randomUUID } from 'crypto';
import JobLock from '../models/JobLock';
import { logger } from './logger';

const OWNER = `${process.env.HOSTNAME || 'node'}-${process.pid}-${randomUUID().slice(0, 8)}`;

/**
 * Run `fn` only if this process can claim `name`.
 *
 * The claim is a single conditional upsert: it succeeds when no lock exists or
 * the existing one has expired, so exactly one replica runs the job.
 */
export async function withJobLock<T>(
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  let claimed = false;
  try {
    const res = await JobLock.findOneAndUpdate(
      { name, $or: [{ expiresAt: { $lte: now } }, { owner: OWNER }] },
      { $set: { owner: OWNER, expiresAt, lastRunAt: now } },
      { upsert: true, returnDocument: 'after' },
    );
    claimed = res?.owner === OWNER;
  } catch (err: any) {
    // Duplicate key = another replica inserted the lock first. Not an error.
    if (err?.code === 11000) {
      logger.debug('Job lock held elsewhere', { name });
      return null;
    }
    throw err;
  }

  if (!claimed) {
    logger.debug('Job lock held elsewhere', { name });
    return null;
  }

  // Keep the lock alive while a long job runs, so it isn't stolen mid-flight.
  const heartbeat = setInterval(() => {
    JobLock.updateOne(
      { name, owner: OWNER },
      { $set: { expiresAt: new Date(Date.now() + ttlMs) } },
    ).catch(() => {});
  }, Math.max(5_000, Math.floor(ttlMs / 3)));
  heartbeat.unref();

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    // Release so a retry doesn't have to wait out the TTL.
    await JobLock.updateOne({ name, owner: OWNER }, { $set: { expiresAt: new Date() } }).catch(
      () => {},
    );
  }
}
