import { getSocket } from './socket';

export function connectSocket() {
  const socket = getSocket();
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket() {
  const socket = getSocket();
  if (socket.connected) {
    socket.disconnect();
  }
}
