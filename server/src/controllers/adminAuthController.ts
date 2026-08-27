import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import Admin from '../models/Admin';
import { signAdminToken } from '../utils/adminJwt';
import { logger } from '../utils/logger';

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const ADMIN_COOKIE = 'admin_token';

/**
 * Cookie options for the admin session token. httpOnly keeps it out of reach
 * of JS (XSS can't read it); sameSite=lax + secure-in-prod is correct for the
 * admin SPA and API sharing a registrable domain.
 */
// Must match ADMIN_JWT_EXPIRES in utils/adminJwt. A cookie that outlives its
// token just means the browser keeps sending a credential the server already
// rejects, which reads to the admin as a random logout mid-session.
const ADMIN_SESSION_MS = 1000 * 60 * 60 * 12; // 12h

function adminCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true as const,
    secure: isProd,
    // 'strict' is correct here: the admin SPA never receives cross-site
    // top-level navigations that need the session, and it removes the CSRF
    // surface that 'lax' leaves open on GET.
    sameSite: isProd ? ('strict' as const) : ('lax' as const),
    path: '/',
    maxAge: ADMIN_SESSION_MS,
  };
}

// Compared against when the email doesn't match an admin, so both branches
// cost one bcrypt comparison and response timing doesn't reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('invalid-password-placeholder', 12);

export async function adminLogin(req: Request, res: Response) {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  const { email, password } = parsed.data;

  const admin = await Admin.findOne({ email });
  const hash = admin?.isActive ? admin.passwordHash : DUMMY_HASH;

  const ok = await bcrypt.compare(password, hash);
  if (!ok || !admin || !admin.isActive) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  await Admin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });

  const token = signAdminToken({
    _id: admin._id.toString(),
    role: admin.role,
  });

  // Auth travels in an httpOnly cookie, not the response body, so the SPA
  // never has to store it in JS-readable storage.
  res.cookie(ADMIN_COOKIE, token, adminCookieOptions());

  logger.info('Admin signed in', { adminId: admin._id.toString(), role: admin.role, ip: req.ip });

  res.json({
    admin: {
      email: admin.email,
      role: admin.role,
    },
    expiresInMs: ADMIN_SESSION_MS,
  });
}

export async function adminLogout(_req: Request, res: Response) {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
}

/** GET /api/admin/me — who am I, and what may I do? */
export async function adminMe(req: Request, res: Response) {
  const areq = req as import('../middlewares/requireAdmin').AdminRequest;
  return res.json({
    admin: { id: areq.adminId, email: areq.adminEmail, role: areq.adminRole },
  });
}
