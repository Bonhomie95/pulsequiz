import { Request, Response, NextFunction } from 'express';
import { verifyAdminToken } from '../utils/adminJwt';
import { ADMIN_COOKIE } from '../controllers/adminAuthController';

export interface AdminRequest extends Request {
  adminId?: string;
  adminRole?: string;
}

/** Read a single cookie value from the raw Cookie header (no cookie-parser dep). */
function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
) {
  // Prefer the httpOnly cookie; fall back to a Bearer header for API tooling.
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ')
    ? header.slice(7).trim()
    : readCookie(req, ADMIN_COOKIE);

  if (!token) {
    return res.status(401).json({ message: 'Admin auth required' });
  }

  try {
    const payload = verifyAdminToken(token);
    req.adminId = payload.adminId;
    req.adminRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid admin token' });
  }
}
