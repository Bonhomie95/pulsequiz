import rateLimit from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit';

export const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,

  // ✅ IPv4 + IPv6 safe
  keyGenerator: (req: any, res: any) => {
    return ipKeyGenerator(req, res);
  },
});
