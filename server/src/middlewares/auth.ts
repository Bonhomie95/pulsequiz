import type { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt';
import User from '../models/User';

/**
 * Extend Express Request safely
 */
export interface AuthRequest extends Request {
  userId?: string;
}

/** Only refresh lastSeenAt at most once per this window (per user). */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Require authenticated user via Bearer JWT.
 * Also refreshes lastSeenAt and rejects banned accounts.
 */
export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = header.slice(7).trim();

  let userId: string;
  try {
    const decoded = verifyJwt<{ userId?: string }>(token);
    if (!decoded?.userId) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }
    userId = decoded.userId;
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }

  try {
    // One cheap read for the ban flag + last-seen timestamp.
    const user = await User.findById(userId, {
      isBanned: 1,
      lastSeenAt: 1,
    }).lean();

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (user.isBanned) {
      return res.status(403).json({ message: 'Account banned' });
    }

    // Throttle the lastSeenAt write: only bump it once per window, and do it
    // fire-and-forget so it never adds latency to the request path.
    const last = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
    if (Date.now() - last > LAST_SEEN_THROTTLE_MS) {
      User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } })
        .exec()
        .catch(() => {});
    }
  } catch {
    return res.status(500).json({ message: 'Server error' });
  }

  req.userId = userId;
  next();
}
