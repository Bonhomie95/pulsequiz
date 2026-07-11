import http from 'http';
import { Server } from 'socket.io';
import { verifySocketAuth } from './verifySocketAuth';
import { registerPvpHandlers } from './pvp.handlers';
import { registerMatchmakingHandlers, setIoInstance } from './matchmaking';
import { registerRoomHandlers } from './room.handlers';
import User from '../models/User';
import { getAllowedOrigins } from '../app';

export function createSocketServer(server: http.Server) {
  const io = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ['GET', 'POST'],
    },
  });

  io.use(verifySocketAuth);
  setIoInstance(io);

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    // ── lastSeenAt: mark online immediately on socket connect ──────────────
    User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(() => {});

    // ── Heartbeat: mobile pings every 60s to keep lastSeenAt fresh ─────────
    // Client emits 'ping:heartbeat', server just timestamps it.
    socket.on('ping:heartbeat', () => {
      User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(
        () => {},
      );
    });

    registerPvpHandlers(io, socket);
    registerMatchmakingHandlers(io, socket);
    registerRoomHandlers(io, socket);
  });

  return io;
}
