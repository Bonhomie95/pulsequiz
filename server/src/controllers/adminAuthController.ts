import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import Admin from '../models/Admin';
import { signAdminToken } from '../utils/adminJwt';

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
function adminCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true as const,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
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

  admin.lastLoginAt = new Date();
  await admin.save();

  const token = signAdminToken({
    _id: admin._id.toString(),
    role: admin.role,
  });

  // Auth travels in an httpOnly cookie, not the response body, so the SPA
  // never has to store it in JS-readable storage.
  res.cookie(ADMIN_COOKIE, token, adminCookieOptions());

  res.json({
    admin: {
      email: admin.email,
      role: admin.role,
    },
  });
}

export async function adminLogout(_req: Request, res: Response) {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
}
