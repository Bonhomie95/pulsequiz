import type { Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import User from '../models/User';

type Next = (err?: any) => void;

/**
 * Socket handshake auth. Mirrors the REST `requireAuth` middleware: the
 * signature must be valid, the account must exist and not be banned or
 * deleted, and the token version must still match — otherwise a revoked
 * session could keep a live socket open indefinitely.
 */
export async function verifySocketAuth(socket: Socket, next: Next) {
  try {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers.authorization
        ?.toString()
        .replace('Bearer ', '') ??
        '');

    if (!token) return next(new Error('Unauthorized'));

    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId, {
      isBanned: 1,
      tokenVersion: 1,
      deletedAt: 1,
    }).lean();

    if (!user || user.deletedAt) return next(new Error('Unauthorized'));
    if ((user.tokenVersion ?? 0) !== decoded.tv) return next(new Error('Session expired'));
    if (user.isBanned) return next(new Error('Account banned'));

    (socket.data as any).userId = decoded.userId;

    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
}
