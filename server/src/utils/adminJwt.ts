import jwt from 'jsonwebtoken';

// NOTE: no dotenv call here. server.ts loads the environment as its first
// import, before anything else is pulled in, so a second `dotenv.config()`
// only prints "injecting env (0)" at boot and injects nothing. Scripts that
// run this module outside the server (createAdmin, syncIndexes) load dotenv
// themselves.
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET!;
const ADMIN_JWT_EXPIRES = '12h';

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
