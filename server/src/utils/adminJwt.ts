import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET!;
const ADMIN_JWT_EXPIRES = '12h';

// const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!ADMIN_JWT_SECRET) {
  throw new Error('ADMIN_JWT_SECRET is not set in environment variables');
}

export function signAdminToken(admin: { _id: string; role: string }) {
  return jwt.sign({ adminId: admin._id, role: admin.role }, ADMIN_JWT_SECRET, {
    expiresIn: ADMIN_JWT_EXPIRES,
  });
}

export function verifyAdminToken(token: string) {
  return jwt.verify(token, ADMIN_JWT_SECRET) as {
    adminId: string;
    role: string;
  };
}
