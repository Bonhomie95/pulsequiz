import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

/** Rolling counters exposed by /metrics. */
export const metrics = {
  requestsTotal: 0,
  requestsInFlight: 0,
  errors4xx: 0,
  errors5xx: 0,
  /** Reservoir of recent durations (ms) for percentile reporting. */
  durations: [] as number[],
};

const DURATION_SAMPLE = 500;

/**
 * Attaches a request id, echoes it back in a header so a user-reported error
 * can be traced, and records timing/outcome for /metrics.
 *
 * Health and metrics endpoints are excluded from access logging so a
 * one-second liveness probe doesn't drown the log stream.
 */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming)
      ? incoming
      : randomUUID();

  (req as Request & { id: string }).id = id;
  res.setHeader('X-Request-Id', id);

  const isProbe = req.path === '/health' || req.path === '/metrics';
  const startedAt = process.hrtime.bigint();

  metrics.requestsTotal += 1;
  metrics.requestsInFlight += 1;

  res.on('finish', () => {
    metrics.requestsInFlight -= 1;

    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    metrics.durations.push(ms);
    if (metrics.durations.length > DURATION_SAMPLE) metrics.durations.shift();

    if (res.statusCode >= 500) metrics.errors5xx += 1;
    else if (res.statusCode >= 400) metrics.errors4xx += 1;

    if (isProbe) return;

    const ctx = {
      requestId: id,
      method: req.method,
      path: req.route?.path ? req.baseUrl + req.route.path : req.path,
      status: res.statusCode,
      durationMs: Math.round(ms),
    };

    // 5xx already got a full error record from the error handler; log the
    // access line at warn so it is still visible without duplicating stacks.
    if (res.statusCode >= 500) logger.warn('request failed', ctx);
    else logger.debug('request', ctx);
  });

  next();
}
