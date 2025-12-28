import jwt from 'jsonwebtoken';

export function signJwt(payload: object) {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: '30d',
  });
}

export function verifyJwt<T = any>(token: string): T {
  return jwt.verify(token, process.env.JWT_SECRET as string) as T;
}
