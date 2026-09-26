import { io, Socket } from 'socket.io-client';
import { storage } from '@/src/utils/storage';

let socket: Socket | null = null;

/**
 * socket.io treats a URL path as a NAMESPACE, so `https://host/api` connected
 * to the "/api" namespace — which the server doesn't have — and every PvP,
 * room and rematch connection was refused with "Invalid namespace".
 * Connect to the origin only.
 */
export function socketUrl(apiUrl: string | undefined): string {
  if (!apiUrl) return '';
  const m = /^(https?:\/\/[^/]+)/i.exec(apiUrl.trim());
  return m ? m[1] : apiUrl;
}

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(socketUrl(process.env.EXPO_PUBLIC_SOCKET_URL || process.env.EXPO_PUBLIC_API_URL), {
    transports: ['websocket'],
    autoConnect: false,
    auth: async (cb) => {
      const token = await storage.getToken();
      cb({ token });
    },
  });

  return socket;
}
