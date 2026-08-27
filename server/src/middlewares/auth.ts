import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import User from '../models/User';

/**
 * Extend Express Request safely
 */
export interface AuthRequest extends Request {
  userId?: string;
  /** The caller presented a pre-versioning token — see verifyAccessToken. */
  legacyToken?: boolean;
}

/** Only refresh lastSeenAt at most once per this window (per user). */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Require authenticated user via Bearer JWT.
 *
 * Beyond signature validation this checks three things against the user
 * document: the account still exists, it isn't banned or deleted, and the
 * token's version claim still matches. That last check is what makes logout
 * and forced sign-out actually revoke access.
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
  let tokenVersion: number;
  let legacy = false;
  try {
    const decoded = verifyAccessToken(token);
    userId = decoded.userId;
    tokenVersion = decoded.tv;
    legacy = decoded.legacy;
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }

  try {
    // One cheap indexed read for the ban flag, token version and last-seen.
    const user = await User.findById(userId, {
      isBanned: 1,
      lastSeenAt: 1,
      tokenVersion: 1,
      deletedAt: 1,
    }).lean();

    if (!user || user.deletedAt) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if ((user.tokenVersion ?? 0) !== tokenVersion) {
      return res.status(401).json({ message: 'Session expired' });
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
  req.legacyToken = legacy;
  next();
}
