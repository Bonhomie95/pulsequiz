import type { Server } from 'socket.io';

/**
 * Sockets authenticate once at the handshake, so revoking a session (ban,
 * logout, deletion) left an open socket able to keep matchmaking and wagering.
 * Every connection joins `user:<id>`; this drops them all.
 */
let io: Server | null = null;

export function setKickIo(server: Server) {
  io = server;
}

export function userRoom(userId: string) {
  return `user:${userId}`;
}

export function kickUser(userId: string) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}
