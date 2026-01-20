import http from 'http';
import { Server } from 'socket.io';
import { verifySocketAuth } from './verifySocketAuth';
import { registerPvpHandlers } from './pvp.handlers';
import { registerMatchmakingHandlers, setIoInstance } from './matchmaking';

export function createSocketServer(server: http.Server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // tighten later
      methods: ['GET', 'POST'],
    },
  });

  io.use(verifySocketAuth);
  setIoInstance(io);

  io.on('connection', (socket) => {
    registerPvpHandlers(io, socket);
    registerMatchmakingHandlers(io, socket);
  });

  return io;
}
