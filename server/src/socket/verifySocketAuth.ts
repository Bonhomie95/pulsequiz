import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

type Next = (err?: any) => void;

export async function verifySocketAuth(socket: Socket, next: Next) {
  try {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers.authorization
        ?.toString()
        .replace('Bearer ', '') ??
        '');

    if (!token) return next(new Error('Unauthorized'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    if (!decoded?.userId) return next(new Error('Unauthorized'));

    // attach userId to socket
    (socket.data as any).userId = decoded.userId;

    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
}
