import { io, Socket } from 'socket.io-client';
import { storage } from '@/src/utils/storage';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(process.env.EXPO_PUBLIC_API_URL!, {
    transports: ['websocket'],
    autoConnect: false,
    auth: async (cb) => {
      const token = await storage.getToken();
      cb({ token });
    },
  });

  return socket;
}
