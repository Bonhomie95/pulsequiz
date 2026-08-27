import jwt from 'jsonwebtoken';

/**
 * Access tokens are short-lived and carry a `tv` (token version) claim that is
 * checked against the user document on every request. Bumping the stored
 * version — on logout, ban, or a suspected compromise — invalidates every
 * outstanding token for that one account, without the platform-wide blast
 * radius of rotating JWT_SECRET.
 *
 * Refresh tokens are separate, longer-lived, and only accepted by
 * POST /api/auth/refresh.
 */
const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '30d';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '180d';

export interface AccessClaims {
  userId: string;
  tv: number;
  typ: 'access';
  /**
   * True for a token issued before token versioning existed. Those were signed
   * with a ten-year expiry and carry no `tv` claim, so they cannot be revoked
   * by bumping the version. They are accepted once, then swapped for a modern
   * short-lived pair — see `me()` in authController.
   */
  legacy: boolean;
}

export interface RefreshClaims {
  userId: string;
  tv: number;
  typ: 'refresh';
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in environment variables');
  }
  return secret;
}

export function signAccessToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ userId, tv: tokenVersion, typ: 'access' }, getSecret(), {
    expiresIn: ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ userId, tv: tokenVersion, typ: 'refresh' }, getSecret(), {
    expiresIn: REFRESH_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}

/** Issue both halves of a session at once. */
export function issueSession(userId: string, tokenVersion: number) {
  return {
    token: signAccessToken(userId, tokenVersion),
    refreshToken: signRefreshToken(userId, tokenVersion),
  };
}

export function verifyJwt<T = unknown>(token: string): T {
  return jwt.verify(token, getSecret()) as T;
}

/**
 * Verify an access token.
 *
 * Tokens issued before the `typ`/`tv` claims existed are still accepted, so the
 * upgrade doesn't sign everyone out — but they are flagged `legacy` so the
 * next `/auth/me` can hand back a modern pair and retire them. Set
 * `REJECT_LEGACY_TOKENS=1` once the fleet has rolled over to turn them off.
 */
export function verifyAccessToken(token: string): AccessClaims {
  const decoded = verifyJwt<Partial<AccessClaims>>(token);
  if (!decoded?.userId) throw new Error('Invalid token payload');
  if (decoded.typ && decoded.typ !== 'access') throw new Error('Wrong token type');

  const legacy = decoded.typ === undefined;
  if (legacy && process.env.REJECT_LEGACY_TOKENS === '1') {
    throw new Error('Legacy token rejected');
  }

  return { userId: decoded.userId, tv: decoded.tv ?? 0, typ: 'access', legacy };
}

export function verifyRefreshToken(token: string): RefreshClaims {
  const decoded = verifyJwt<Partial<RefreshClaims>>(token);
  if (!decoded?.userId) throw new Error('Invalid token payload');
  if (decoded.typ !== 'refresh') throw new Error('Wrong token type');
  return { userId: decoded.userId, tv: decoded.tv ?? 0, typ: 'refresh' };
}

/** @deprecated Use signAccessToken / issueSession — kept for call-site compatibility. */
export function signJwt(payload: object) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}
