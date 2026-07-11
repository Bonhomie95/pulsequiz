import jwt from 'jsonwebtoken';

// Users should stay logged in indefinitely, so the access token is long-lived
// (~10 years). Sessions still end on explicit logout, or if the server rejects
// the token (rotated secret / banned account → 401/403 → client logs out).
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '3650d';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in environment variables');
  }
  return secret;
}

export function signJwt(payload: object) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: JWT_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}

export function verifyJwt<T = unknown>(token: string): T {
  return jwt.verify(token, getSecret()) as T;
}
