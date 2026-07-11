import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import type { AuthRequest } from './auth';

/**
 * Prefer the authenticated user as the rate-limit key so limits follow the
 * account, not the network. Falls back to an IPv6-safe IP key.
 */
function userOrIpKey(req: Request): string {
  const userId = (req as AuthRequest).userId;
  return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

function ipKey(req: Request): string {
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

function limiter(opts: {
  windowMs: number;
  max: number;
  message: string;
  byUser?: boolean;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: opts.byUser ? userOrIpKey : ipKey,
    message: { message: opts.message },
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Blanket limit for the whole /api surface (per IP). */
export const globalApiLimiter = limiter({
  windowMs: 15 * MINUTE,
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 600),
  message: 'Too many requests, please slow down.',
});

/** Login endpoints — small budget, per IP. */
export const adminLoginLimiter = limiter({
  windowMs: 15 * MINUTE,
  max: Number(process.env.RATE_LIMIT_ADMIN_LOGIN_MAX || 10),
  message: 'Too many login attempts. Try again in 15 minutes.',
});

/** OAuth token exchange — per IP. */
export const oauthLimiter = limiter({
  windowMs: 15 * MINUTE,
  max: Number(process.env.RATE_LIMIT_OAUTH_MAX || 30),
  message: 'Too many login attempts. Try again later.',
});

const QUIZ_START_MAX = Number(process.env.RATE_LIMIT_QUIZ_START_MAX || 50);

/** Quiz session creation — per user. */
export const quizStartLimiter = limiter({
  windowMs: HOUR,
  max: QUIZ_START_MAX,
  byUser: true,
  message: `Rate limit exceeded: max ${QUIZ_START_MAX} quiz sessions per hour.`,
});

/** IAP verification endpoints — per user. */
export const purchaseLimiter = limiter({
  windowMs: HOUR,
  max: Number(process.env.RATE_LIMIT_PURCHASE_MAX || 30),
  byUser: true,
  message: 'Too many purchase verification attempts. Try again later.',
});

/**
 * Economy / social actions that mint coins or spam other users
 * (referral apply, friend requests, reports, room create/join, ad rewards).
 */
export const sensitiveActionLimiter = limiter({
  windowMs: HOUR,
  max: Number(process.env.RATE_LIMIT_SENSITIVE_MAX || 60),
  byUser: true,
  message: 'Too many requests for this action. Try again later.',
});
