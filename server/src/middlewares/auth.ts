import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt';

export type AuthRequest = Request & { userId?: string };

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = header.replace('Bearer ', '').trim();

  try {
    const decoded = verifyJwt<{ userId: string }>(token);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}
