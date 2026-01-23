import jwt from 'jsonwebtoken';

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;

if (!ADMIN_JWT_SECRET) {
  throw new Error('ADMIN_JWT_SECRET is not set in environment variables');
}

type AdminTokenPayload = {
  adminId: string;
  role: string;
};

export function signAdminToken(admin: {
  _id: string;
  role: string;
}) {
  const payload: AdminTokenPayload = {
    adminId: admin._id.toString(),
    role: admin.role,
  };

  return jwt.sign(payload, ADMIN_JWT_SECRET, {
    expiresIn: '7d',
  });
}
