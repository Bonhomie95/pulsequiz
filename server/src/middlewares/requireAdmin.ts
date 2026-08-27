import { Request, Response, NextFunction } from 'express';
import { verifyAdminToken } from '../utils/adminJwt';
import { ADMIN_COOKIE } from '../controllers/adminAuthController';
import Admin from '../models/Admin';

export type AdminRole = 'SUPER_ADMIN' | 'MODERATOR';

export interface AdminRequest extends Request {
  adminId?: string;
  adminRole?: AdminRole;
  adminEmail?: string;
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

export async function requireAdmin(
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

  let payload: { adminId: string; role: string };
  try {
    payload = verifyAdminToken(token);
  } catch {
    return res.status(401).json({ message: 'Invalid admin token' });
  }

  // Re-read the account so a deactivated or role-changed admin loses access
  // immediately rather than at token expiry.
  const admin = await Admin.findById(payload.adminId)
    .select('email role isActive')
    .lean();

  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Admin account is not active' });
  }

  req.adminId = admin._id.toString();
  req.adminRole = admin.role as AdminRole;
  req.adminEmail = admin.email;
  next();
}

/**
 * Restrict a route to specific admin roles.
 *
 * Roles existed on the model but were never checked, so a MODERATOR could
 * trigger payouts, edit wallet balances and rewrite the economy settings.
 * Anything that touches money or platform configuration is SUPER_ADMIN only.
 */
export function requireRole(...roles: AdminRole[]) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.adminRole) {
      return res.status(401).json({ message: 'Admin auth required' });
    }
    if (!roles.includes(req.adminRole)) {
      return res.status(403).json({
        message: `This action requires one of: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

/** Convenience alias for the common case. */
export const requireSuperAdmin = requireRole('SUPER_ADMIN');
