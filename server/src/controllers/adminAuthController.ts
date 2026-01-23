import { Request, Response } from 'express';
import Admin from '../models/Admin';
import bcrypt from 'bcryptjs';
import { signAdminToken } from '../utils/adminJwt';

export async function adminLogin(req: Request, res: Response) {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email });
  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const token = signAdminToken({
    _id: admin._id.toString(),
    role: admin.role,
  });

  res.json({
    token,
    admin: {
      email: admin.email,
      role: admin.role,
    },
  });
}
