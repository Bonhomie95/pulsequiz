import { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from './events';
import { MatchQueueEntry } from './types';

const QUEUE_TIMEOUT_MS = 60_000;

const matchmakingQueue: MatchQueueEntry[] = [];

/* ---------------------------------- */
/* Utils                              */
/* ---------------------------------- */

function removeFromQueue(socketId: string) {
  const idx = matchmakingQueue.findIndex((q) => q.socketId === socketId);
  if (idx !== -1) matchmakingQueue.splice(idx, 1);
}

function findMatchFor(entry: MatchQueueEntry): MatchQueueEntry | null {
  return (
    matchmakingQueue.find(
      (q) =>
        q.category === entry.category &&
        q.userId !== entry.userId &&
        q.socketId !== entry.socketId,
    ) ?? null
  );
}

/* ---------------------------------- */
/* Main logic                         */
/* ---------------------------------- */

export function registerMatchmakingHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  /* ---------- FIND MATCH ---------- */
  socket.on(SOCKET_EVENTS.MATCH_FIND, ({ category }: { category: string }) => {
    // prevent duplicate queue entries
    removeFromQueue(socket.id);

    const entry: MatchQueueEntry = {
      socketId: socket.id,
      userId,
      category,
      joinedAt: Date.now(),
    };

    matchmakingQueue.push(entry);

    attemptMatch(io, entry);
  });

  /* ---------- DISCONNECT ---------- */
  socket.on('disconnect', () => {
    removeFromQueue(socket.id);
  });
}

/* ---------------------------------- */
/* Match attempt loop                 */
/* ---------------------------------- */

function attemptMatch(io: Server, entry: MatchQueueEntry) {
  const opponent = findMatchFor(entry);

  if (!opponent) return;

  // 🚫 remove both immediately to avoid race conditions
  removeFromQueue(entry.socketId);
  removeFromQueue(opponent.socketId);

  // 🔔 notify both clients
  io.to(entry.socketId).emit(SOCKET_EVENTS.MATCH_FOUND, {
    opponentSocketId: opponent.socketId,
    category: entry.category,
  });

  io.to(opponent.socketId).emit(SOCKET_EVENTS.MATCH_FOUND, {
    opponentSocketId: entry.socketId,
    category: entry.category,
  });

  // ⚠️ next step: create PvP match + lock questions
}

/* ---------------------------------- */
/* Timeout sweeper                    */
/* ---------------------------------- */

setInterval(() => {
  const now = Date.now();

  for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
    const entry = matchmakingQueue[i];

    if (now - entry.joinedAt >= QUEUE_TIMEOUT_MS) {
      matchmakingQueue.splice(i, 1);

      // notify client
      // (safe: socket may already be gone)
      try {
        ioSingleton?.to(entry.socketId).emit(SOCKET_EVENTS.MATCH_TIMEOUT);
      } catch {}
    }
  }
}, 1_000);

/**
 * Because setInterval is outside socket scope,
 * we hold a singleton reference to io
 */
let ioSingleton: Server | null = null;
export function setIoInstance(io: Server) {
  ioSingleton = io;
}
