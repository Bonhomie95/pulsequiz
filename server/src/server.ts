// Load env before anything else — several modules read process.env at import time.
import 'dotenv/config';

import mongoose from 'mongoose';
import http from 'http';

import { logger } from './utils/logger';
import { initObservability, installCrashGuards } from './utils/observability';

const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_JWT_SECRET'] as const;

/**
 * Settings that are merely inconvenient to omit in development but are
 * genuinely unsafe to omit in production.
 */
const REQUIRED_IN_PROD = [
  ['FRONTEND_ORIGIN', 'CORS would reflect any origin with credentials'],
  ['SENTRY_DSN', 'server errors would go unreported'],
  ['ADMOB_SSV_ENABLED', 'rewarded-ad coins would be credited without ad verification'],
] as const;

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    logger.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  for (const secretKey of ['JWT_SECRET', 'ADMIN_JWT_SECRET'] as const) {
    const value = process.env[secretKey] as string;
    if (value.length < 32) {
      logger.error(`${secretKey} must be at least 32 characters`);
      process.exit(1);
    }
    if (/change-me/i.test(value)) {
      logger.error(`${secretKey} still holds the .env.example placeholder`);
      process.exit(1);
    }
  }
  if (process.env.JWT_SECRET === process.env.ADMIN_JWT_SECRET) {
    logger.error('JWT_SECRET and ADMIN_JWT_SECRET must differ');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    const problems: string[] = [];
    const origin = (process.env.FRONTEND_ORIGIN ?? '').trim();
    if (!origin || origin === '*') {
      problems.push('FRONTEND_ORIGIN must be an explicit origin list in production');
    }
    for (const [key, why] of REQUIRED_IN_PROD) {
      if (key === 'FRONTEND_ORIGIN') continue; // handled above
      if (!process.env[key]) problems.push(`${key} is not set — ${why}`);
    }
    if (problems.length) {
      logger.error(`Unsafe production configuration:\n  - ${problems.join('\n  - ')}`);
      process.exit(1);
    }
  }
}

async function start() {
  validateEnv();
  initObservability();

  // Imported lazily so env validation above runs before any module reads env.
  const { default: app } = await import('./app');
  const { createSocketServer } = await import('./socket');
  const { startLeaderboardCron } = await import('./cron/leaderboardCron');
  const { initDefaultSettings } = await import('./models/AppSettings');

  const port = Number(process.env.PORT || 5000);

  await mongoose.connect(process.env.MONGO_URI as string, {
    // Bound the pool so a traffic spike queues instead of exhausting Mongo's
    // connection limit, and fail fast rather than hanging a request forever.
    maxPoolSize: Number(process.env.MONGO_MAX_POOL || 50),
    minPoolSize: Number(process.env.MONGO_MIN_POOL || 5),
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });
  logger.info('Mongo connected');

  await initDefaultSettings();

  const server = http.createServer(app);
  const io = createSocketServer(server);

  // Only one process may own the scheduled jobs. When RUN_CRON is explicitly
  // "0" this instance is a plain web node and the cron runs on a dedicated
  // worker; the jobs also take a distributed lock, so this is belt and braces.
  if (process.env.RUN_CRON !== '0') {
    startLeaderboardCron(io);
  } else {
    logger.info('Cron disabled on this instance (RUN_CRON=0)');
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal?: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    // Stop accepting new work, then give in-flight requests a chance to finish.
    const timeout = setTimeout(() => {
      logger.warn('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, Number(process.env.SHUTDOWN_TIMEOUT_MS || 15_000));
    timeout.unref();

    try {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mongoose.connection.close(false);
      logger.info('Shutdown complete');
    } catch (err) {
      logger.error('Error during shutdown', err);
    } finally {
      clearTimeout(timeout);
    }
  };

  installCrashGuards(() => shutdown('fatal'));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void shutdown(signal).then(() => process.exit(0));
    });
  }

  server.listen(port, () => {
    logger.info(`Server + Socket.IO listening`, { port, env: process.env.NODE_ENV });
  });
}

start().catch((e) => {
  logger.error('Server failed to start', e);
  process.exit(1);
});
