import { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from './events';

const QUEUE_TIMEOUT_MS = 60_000;

export type MatchQueueEntry = {
  socketId: string;
  userId: string;
  category: string;
  joinedAt: number;

  // optional: force rematch with a specific user
  rematchWith?: string;

  // optional: best-of-3 / series continuity
  seriesId?: string;
};

export type PairFoundPayload = {
  pairId: string;
  category: string;
  seriesId: string;
  isRematch: boolean;
  a: { userId: string; socketId: string };
  b: { userId: string; socketId: string };
};

const queue: MatchQueueEntry[] = [];
const pendingPairs = new Map<string, PairFoundPayload>();

let ioSingleton: Server | null = null;

// optional hook so pvp.handler can be notified immediately
let onPairFound: ((pair: PairFoundPayload) => void) | null = null;

export function setIoInstance(io: Server) {
  ioSingleton = io;
}

export function setOnPairFound(fn: (pair: PairFoundPayload) => void) {
  onPairFound = fn;
}

export function consumePair(pairId: string): PairFoundPayload | null {
  const pair = pendingPairs.get(pairId) ?? null;
  if (!pair) return null;
  pendingPairs.delete(pairId);
  return pair;
}

/* ---------------------------------- */
/* Helpers                            */
/* ---------------------------------- */

function makeId(prefix = 'pair') {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function removeFromQueueBySocket(socketId: string) {
  const idx = queue.findIndex((e) => e.socketId === socketId);
  if (idx !== -1) queue.splice(idx, 1);
}

function removeFromQueueByUser(userId: string) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].userId === userId) queue.splice(i, 1);
  }
}

function findOpponent(entry: MatchQueueEntry): MatchQueueEntry | null {
  // 🔁 Rematch takes priority (only match same category)
  if (entry.rematchWith) {
    return (
      queue.find(
        (q) =>
          q.userId === entry.rematchWith &&
          q.category === entry.category &&
          q.userId !== entry.userId,
      ) ?? null
    );
  }

  // 🎯 Normal matchmaking (same category, different user)
  return (
    queue.find(
      (q) => q.category === entry.category && q.userId !== entry.userId,
    ) ?? null
  );
}

/* ---------------------------------- */
/* Socket handlers                    */
/* ---------------------------------- */

export function registerMatchmakingHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(
    SOCKET_EVENTS.JOIN_QUEUE,
    ({
      category,
      rematchWith,
      seriesId,
    }: {
      category: string;
      rematchWith?: string;
      seriesId?: string;
    }) => {
      const cat = (category ?? '').trim();
      if (!cat) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Category required' });
        return;
      }

      // ensure no duplicate entries (reconnect, double taps, etc.)
      removeFromQueueBySocket(socket.id);
      removeFromQueueByUser(userId);

      const entry: MatchQueueEntry = {
        socketId: socket.id,
        userId,
        category: cat,
        joinedAt: Date.now(),
        rematchWith,
        seriesId,
      };

      queue.push(entry);

      socket.emit(SOCKET_EVENTS.QUEUED, {
        category: cat,
        waitMs: QUEUE_TIMEOUT_MS,
      });

      attemptMatch(io, entry);
    },
  );

  socket.on(SOCKET_EVENTS.LEAVE_QUEUE, () => {
    removeFromQueueBySocket(socket.id);
    socket.emit(SOCKET_EVENTS.MATCH_CANCELLED, { ok: true });
  });

  socket.on('disconnect', () => {
    removeFromQueueBySocket(socket.id);
  });
}

/* ---------------------------------- */
/* Pairing                            */
/* ---------------------------------- */

function attemptMatch(io: Server, entry: MatchQueueEntry) {
  const opponent = findOpponent(entry);
  if (!opponent) return;

  // remove both immediately to avoid double matches
  removeFromQueueBySocket(entry.socketId);
  removeFromQueueBySocket(opponent.socketId);

  const isRematch = !!entry.rematchWith || !!opponent.rematchWith;

  const seriesId = entry.seriesId || opponent.seriesId || makeId('series');

  const pairId = makeId('pair');

  const pair: PairFoundPayload = {
    pairId,
    category: entry.category,
    seriesId,
    isRematch,
    a: { userId: entry.userId, socketId: entry.socketId },
    b: { userId: opponent.userId, socketId: opponent.socketId },
  };

  pendingPairs.set(pairId, pair);

  // notify both clients to navigate to VS screen
  io.to(entry.socketId).emit(SOCKET_EVENTS.MATCH_FOUND, {
    pairId,
    category: entry.category,
    seriesId,
    opponentUserId: opponent.userId,
    isRematch,
  });

  io.to(opponent.socketId).emit(SOCKET_EVENTS.MATCH_FOUND, {
    pairId,
    category: opponent.category,
    seriesId,
    opponentUserId: entry.userId,
    isRematch,
  });

  // optional: notify pvp.handler immediately (server-to-server handoff)
  onPairFound?.(pair);
}

/* ---------------------------------- */
/* Timeout sweeper                    */
/* ---------------------------------- */

setInterval(() => {
  const now = Date.now();

  for (let i = queue.length - 1; i >= 0; i--) {
    const entry = queue[i];
    if (now - entry.joinedAt >= QUEUE_TIMEOUT_MS) {
      queue.splice(i, 1);
      ioSingleton?.to(entry.socketId).emit(SOCKET_EVENTS.QUEUE_TIMEOUT, {
        category: entry.category,
        message: 'No opponent found in time.',
      });
    }
  }
}, 1_000);
