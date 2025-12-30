import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { AuthRequest } from './auth';

export const quizStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: any) => {
    // 1️⃣ Prefer authenticated user
    if (req.userId) {
      return `user:${req.userId}`;
    }

    // 2️⃣ Fallback to IPv6-safe IP
    return `ip:${ipKeyGenerator(req)}`;
  },

  message: {
    message: 'Rate limit exceeded: max 25 quiz sessions per hour.',
  },
});
