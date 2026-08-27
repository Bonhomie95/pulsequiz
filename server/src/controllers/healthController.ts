import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { metrics } from '../middlewares/requestContext';

const startedAt = Date.now();

const MONGO_STATE: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * Liveness + readiness in one. Returns 503 while Mongo is unavailable so a load
 * balancer takes the instance out of rotation instead of serving 500s.
 */
export async function getHealth(_req: Request, res: Response) {
  const state = mongoose.connection.readyState;
  const mongoOk = state === 1;

  let pingMs: number | null = null;
  if (mongoOk) {
    const t0 = Date.now();
    try {
      await mongoose.connection.db?.admin().ping();
      pingMs = Date.now() - t0;
    } catch {
      return res.status(503).json({ ok: false, mongo: 'ping_failed' });
    }
  }

  return res.status(mongoOk ? 200 : 503).json({
    ok: mongoOk,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    mongo: MONGO_STATE[state] ?? 'unknown',
    mongoPingMs: pingMs,
    version: process.env.APP_VERSION ?? null,
  });
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx]);
}

/**
 * Plain-JSON operational metrics. Guarded by METRICS_TOKEN when set, since the
 * numbers describe traffic shape and error rates.
 */
export function getMetrics(req: Request, res: Response) {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const provided = req.headers.authorization?.replace('Bearer ', '');
    if (provided !== token) return res.status(401).json({ message: 'Unauthorized' });
  }

  const sorted = [...metrics.durations].sort((a, b) => a - b);
  const mem = process.memoryUsage();

  return res.json({
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requests: {
      total: metrics.requestsTotal,
      inFlight: metrics.requestsInFlight,
      errors4xx: metrics.errors4xx,
      errors5xx: metrics.errors5xx,
    },
    latencyMs: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      sampleSize: sorted.length,
    },
    memoryMb: {
      rss: Math.round(mem.rss / 1e6),
      heapUsed: Math.round(mem.heapUsed / 1e6),
    },
    mongo: {
      state: MONGO_STATE[mongoose.connection.readyState] ?? 'unknown',
    },
  });
}
