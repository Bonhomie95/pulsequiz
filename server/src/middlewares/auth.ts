import type { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt';

/**
 * Extend Express Request safely
 */
export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Require authenticated user via Bearer JWT
 */
export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = header.slice(7).trim();

  try {
    const decoded = verifyJwt<{ userId?: string }>(token);

    if (!decoded?.userId) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}
