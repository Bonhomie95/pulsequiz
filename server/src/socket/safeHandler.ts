import type { Socket } from 'socket.io';
import { SOCKET_EVENTS } from './events';
import { logger } from '../utils/logger';

/**
 * Socket.IO does not observe the promise an async handler returns, so a
 * rejection escapes as an unhandled rejection — which, on Node >= 15,
 * terminates the process and drops every live match on the instance.
 *
 * Wrap every handler in this. Errors are logged with context, reported to
 * Sentry through the logger's sink, and surfaced to the client as a generic
 * message rather than an internal stack.
 */
export function safeHandler<A extends any[]>(
  socket: Socket,
  event: string,
  fn: (...args: A) => Promise<void> | void,
): (...args: A) => void {
  return (...args: A) => {
    try {
      const result = fn(...args);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err) => report(socket, event, err));
      }
    } catch (err) {
      report(socket, event, err);
    }
  };
}

function report(socket: Socket, event: string, err: unknown) {
  logger.error(`Socket handler failed: ${event}`, err, {
    event,
    userId: (socket.data as { userId?: string })?.userId,
    socketId: socket.id,
  });

  try {
    socket.emit(SOCKET_EVENTS.ERROR, {
      message: 'Something went wrong. Please try again.',
      event,
    });
  } catch {
    /* socket already gone */
  }
}
