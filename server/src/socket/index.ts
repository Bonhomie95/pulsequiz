import http from 'http';
import { Server } from 'socket.io';

import { verifySocketAuth } from './verifySocketAuth';
import { registerPvpHandlers } from './pvp.handlers';
import { registerMatchmakingHandlers, setIoInstance, stopMatchmaking } from './matchmaking';
import { registerRoomHandlers } from './room.handlers';
import { safeHandler } from './safeHandler';
import User from '../models/User';
import { getAllowedOrigins } from '../app';
import { logger } from '../utils/logger';

/** Bound how often a single socket can bump lastSeenAt. */
const HEARTBEAT_THROTTLE_MS = 30_000;

export function createSocketServer(server: http.Server) {
  const io = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ['GET', 'POST'],
    },
    // A stalled client should be reaped rather than holding a slot forever.
    pingInterval: 25_000,
    pingTimeout: 20_000,
    // Bound inbound frames; nothing we accept is remotely this large.
    maxHttpBufferSize: 64 * 1024,
  });

  io.use(verifySocketAuth);
  setIoInstance(io);

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(() => {});

    // Heartbeat, throttled per socket. Unthrottled, a malicious client could
    // drive one write per emit.
    let lastBeat = Date.now();
    socket.on(
      'ping:heartbeat',
      safeHandler(socket, 'ping:heartbeat', () => {
        if (Date.now() - lastBeat < HEARTBEAT_THROTTLE_MS) return;
        lastBeat = Date.now();
        User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(() => {});
      }),
    );

    registerPvpHandlers(io, socket);
    registerMatchmakingHandlers(io, socket);
    registerRoomHandlers(io, socket);

    socket.on('error', (err) => {
      logger.warn('Socket error', { userId, socketId: socket.id, error: String(err) });
    });
  });

  // Release the matchmaking interval when the server shuts down, so a graceful
  // stop isn't held open by a timer.
  io.on('close', () => stopMatchmaking());

  return io;
}
