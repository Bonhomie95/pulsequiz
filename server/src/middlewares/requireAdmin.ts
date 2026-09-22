import { Request, Response, NextFunction } from 'express';
import { verifyAdminToken } from '../utils/adminJwt';
import { ADMIN_COOKIE, ADMIN_COOKIE_CROSS_SITE } from '../controllers/adminAuthController';
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

/**
 * CSRF guard for the cross-site cookie mode.
 *
 * With SameSite=None the browser will attach the admin session to requests a
 * malicious page makes. It cannot, however, set a custom header without a
 * CORS preflight, and the preflight only passes for origins in
 * FRONTEND_ORIGIN. So: every state-changing admin request must carry this
 * header. In the default (same-site) mode SameSite already does this job and
 * the check stays out of the way.
 */
export function requireAdminCsrfHeader(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!ADMIN_COOKIE_CROSS_SITE) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // A Bearer token is not sent automatically by a browser, so it is not
  // forgeable cross-site and needs no header.
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  if (req.headers['x-admin-request'] === '1') return next();
  return res.status(403).json({ message: 'Missing admin request header' });
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
