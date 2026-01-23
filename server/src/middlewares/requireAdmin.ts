import { Request, Response, NextFunction } from 'express';
import { verifyAdminToken } from '../utils/adminJwt';

export interface AdminRequest extends Request {
  adminId?: string;
  adminRole?: string;
}

export function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Admin auth required' });
  }

  try {
    const token = header.split(' ')[1];
    const payload = verifyAdminToken(token);

    req.adminId = payload.adminId;
    req.adminRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid admin token' });
  }
}
