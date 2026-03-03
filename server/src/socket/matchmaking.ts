import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { SOCKET_EVENTS } from './events';
import PvPMatch from '../models/PvPMatch';
import User from '../models/User';
import Progress from '../models/Progress';
import { lockWager } from '../services/coinService';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { sendPvpChallenge } from '../services/notificationService';

const QUEUE_TIMEOUT_MS = 60_000;

export type MatchQueueEntry = {
  socketId: string;
  userId: string;
  category: string;
  wager: number;
  joinedAt: number;
  rematchWith?: string;
};

const queue: MatchQueueEntry[] = [];
let ioSingleton: Server | null = null;

export function setIoInstance(io: Server) {
  ioSingleton = io;
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
  if (entry.rematchWith) {
    return (
      queue.find(
        (q) =>
          q.userId === entry.rematchWith &&
          q.category === entry.category &&
          q.wager === entry.wager &&
          q.userId !== entry.userId,
      ) ?? null
    );
  }
  // Must match same category AND same wager amount
  return (
    queue.find(
      (q) =>
        q.category === entry.category &&
        q.wager === entry.wager &&
        q.userId !== entry.userId,
    ) ?? null
  );
}

async function snapshotPlayer(userId: string) {
  const [user, progress] = await Promise.all([
    User.findById(userId).lean(),
    Progress.findOne({ userId }).lean(),
  ]);
  return {
    userId: new Types.ObjectId(userId),
    usernameSnapshot: user?.username ?? 'Player',
    avatarSnapshot: user?.avatar ?? 'avatar0',
    levelSnapshot: progress?.level ?? 1,
    allTimeRankSnapshot: 0,
  };
}

async function createAndBroadcastMatch(
  io: Server,
  entry: MatchQueueEntry,
  opponent: MatchQueueEntry,
) {
  const isRematch = !!entry.rematchWith || !!opponent.rematchWith;
  const maxWager = Number(await getSetting(SETTINGS_KEYS.MAX_PVP_WAGER, 500));
  const wager = Math.min(entry.wager, maxWager);

  const [snapA, snapB] = await Promise.all([
    snapshotPlayer(entry.userId),
    snapshotPlayer(opponent.userId),
  ]);

  const match = await PvPMatch.create({
    category: entry.category,
    mode: 'single',
    state: 'MATCHED',
    wager,
    players: [
      { ...snapA, ready: false, connected: false },
      { ...snapB, ready: false, connected: false },
    ],
    questionSet: [],
    matchmakingExpiresAt: new Date(Date.now() + 120_000),
  });

  const matchId = match._id.toString();

  // Lock wager coins immediately from both players
  if (wager > 0) {
    const lockResult = await lockWager(entry.userId, opponent.userId, wager, matchId);
    if (!lockResult.success) {
      await PvPMatch.deleteOne({ _id: match._id });
      io.to(entry.socketId).emit(SOCKET_EVENTS.ERROR, {
        message: `Wager failed: ${lockResult.error}. Ensure you have enough coins.`,
      });
      io.to(opponent.socketId).emit(SOCKET_EVENTS.ERROR, {
        message: 'Match cancelled: opponent had insufficient coins.',
      });
      return;
    }
  }

  const playerA = {
    userId: entry.userId,
    username: snapA.usernameSnapshot,
    avatar: snapA.avatarSnapshot,
    level: snapA.levelSnapshot,
    allTimeRank: snapA.allTimeRankSnapshot,
  };
  const playerB = {
    userId: opponent.userId,
    username: snapB.usernameSnapshot,
    avatar: snapB.avatarSnapshot,
    level: snapB.levelSnapshot,
    allTimeRank: snapB.allTimeRankSnapshot,
  };

  // Send MATCH_FOUND with real DB matchId + full player snapshots
  io.to(entry.socketId).emit(SOCKET_EVENTS.MATCH_FOUND, {
    matchId,
    category: entry.category,
    wager,
    isRematch,
    players: [playerA, playerB],
    opponentUserId: opponent.userId,
  });

  io.to(opponent.socketId).emit(SOCKET_EVENTS.MATCH_FOUND, {
    matchId,
    category: opponent.category,
    wager,
    isRematch,
    players: [playerA, playerB],
    opponentUserId: entry.userId,
  });

  // Push notifications — in case either player is backgrounded while waiting
  sendPvpChallenge(entry.userId, playerB.username).catch(() => {});
  sendPvpChallenge(opponent.userId, playerA.username).catch(() => {});
}

function attemptMatch(io: Server, entry: MatchQueueEntry) {
  const opponent = findOpponent(entry);
  if (!opponent) return;

  removeFromQueueBySocket(entry.socketId);
  removeFromQueueBySocket(opponent.socketId);

  createAndBroadcastMatch(io, entry, opponent).catch((err) => {
    console.error('Error creating match:', err);
    queue.push(entry);
    queue.push(opponent);
  });
}

export function registerMatchmakingHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(
    SOCKET_EVENTS.JOIN_QUEUE,
    ({
      category,
      wager = 0,
      rematchWith,
    }: {
      category: string;
      wager?: number;
      rematchWith?: string;
    }) => {
      const cat = (category ?? '').trim().toLowerCase();
      if (!cat) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Category required' });
        return;
      }

      const safeWager = Math.max(0, Math.floor(Number(wager) || 0));

      removeFromQueueBySocket(socket.id);
      removeFromQueueByUser(userId);

      const entry: MatchQueueEntry = {
        socketId: socket.id,
        userId,
        category: cat,
        wager: safeWager,
        joinedAt: Date.now(),
        rematchWith,
      };

      queue.push(entry);
      socket.emit(SOCKET_EVENTS.QUEUED, { category: cat, wager: safeWager, waitMs: QUEUE_TIMEOUT_MS });
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
