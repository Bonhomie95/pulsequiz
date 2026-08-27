import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';

import { SOCKET_EVENTS } from './events';
import { safeHandler } from './safeHandler';
import PvPMatch from '../models/PvPMatch';
import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import { lockWager } from '../services/coinService';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { sendPvpChallenge } from '../services/notificationService';
import { getRating } from '../services/ratingService';
import { logger } from '../utils/logger';

const QUEUE_TIMEOUT_MS = 60_000;

export type MatchQueueEntry = {
  socketId: string;
  userId: string;
  category: string;
  wager: number;
  rating: number;
  joinedAt: number;
  rematchWith?: string;
};

/**
 * Rating window, in Elo points, as a function of how long someone has waited.
 *
 * Tight at first so the first match is a fair one, then widening — waiting
 * forever for a perfect opponent is worse than a slightly uneven game.
 */
function ratingWindow(waitedMs: number): number {
  const seconds = waitedMs / 1000;
  if (seconds < 5) return 100;
  if (seconds < 15) return 250;
  if (seconds < 30) return 500;
  return Infinity; // past 30s, take anyone rather than time out
}

/**
 * In-process queue.
 *
 * NOTE: this pins the deployment to a single instance — two replicas would
 * each hold half the players and never match them. Moving this to a Redis
 * sorted set (popped with an atomic Lua script) plus the Socket.IO Redis
 * adapter is the prerequisite for horizontal scaling.
 */
const queue: MatchQueueEntry[] = [];
let ioSingleton: Server | null = null;
let timeoutSweeper: NodeJS.Timeout | null = null;

export function setIoInstance(io: Server) {
  ioSingleton = io;
  startSweeper();
}

function startSweeper() {
  if (timeoutSweeper) return;
  timeoutSweeper = setInterval(() => {
    const now = Date.now();

    // Retry matching first: the rating window widens with wait time, so a
    // player who couldn't be paired a second ago may be pairable now.
    if (ioSingleton) {
      for (const entry of [...queue]) {
        if (!queue.includes(entry)) continue; // already matched this tick
        attemptMatch(ioSingleton, entry);
      }
    }

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
  timeoutSweeper.unref();
}

export function stopMatchmaking() {
  if (timeoutSweeper) clearInterval(timeoutSweeper);
  timeoutSweeper = null;
  queue.length = 0;
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

  const now = Date.now();

  const candidates = queue.filter(
    (q) =>
      q.category === entry.category &&
      q.wager === entry.wager &&
      q.userId !== entry.userId &&
      // Don't pair someone into a rematch they didn't ask for.
      !q.rematchWith,
  );

  if (!candidates.length) return null;

  // Both players' windows must accept the pairing — otherwise a long-waiting
  // player would drag a fresh one into a badly matched game.
  const eligible = candidates.filter((q) => {
    const gap = Math.abs(q.rating - entry.rating);
    return (
      gap <= ratingWindow(now - entry.joinedAt) &&
      gap <= ratingWindow(now - q.joinedAt)
    );
  });

  if (!eligible.length) return null;

  // Closest rating wins; ties go to whoever has waited longest.
  return eligible.sort((a, b) => {
    const gapA = Math.abs(a.rating - entry.rating);
    const gapB = Math.abs(b.rating - entry.rating);
    if (gapA !== gapB) return gapA - gapB;
    return a.joinedAt - b.joinedAt;
  })[0];
}

async function snapshotPlayer(userId: string) {
  const [user, progress] = await Promise.all([
    User.findById(userId).select('username avatar').lean(),
    Progress.findOne({ userId }).select('level').lean(),
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

  // Stake both players. Either both are debited or neither is — lockWager
  // compensates player A when B can't cover.
  if (wager > 0) {
    const lockResult = await lockWager(entry.userId, opponent.userId, wager, matchId);
    if (!lockResult.success) {
      await PvPMatch.deleteOne({ _id: match._id });

      const shortId = lockResult.error === 'player_a_insufficient' ? entry : opponent;
      const otherId = shortId === entry ? opponent : entry;

      io.to(shortId.socketId).emit(SOCKET_EVENTS.ERROR, {
        message: `You need ${wager} coins to play this wager.`,
      });
      io.to(otherId.socketId).emit(SOCKET_EVENTS.ERROR, {
        message: 'Match cancelled — your opponent had insufficient coins.',
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

  const payload = {
    matchId,
    category: entry.category,
    wager,
    isRematch,
    players: [
      { ...playerA, rating: entry.rating },
      { ...playerB, rating: opponent.rating },
    ],
  };

  io.to(entry.socketId).emit(SOCKET_EVENTS.MATCH_FOUND, {
    ...payload,
    opponentUserId: opponent.userId,
  });
  io.to(opponent.socketId).emit(SOCKET_EVENTS.MATCH_FOUND, {
    ...payload,
    opponentUserId: entry.userId,
  });

  logger.info('PvP match created', { matchId, category: entry.category, wager });

  sendPvpChallenge(entry.userId, playerB.username).catch(() => {});
  sendPvpChallenge(opponent.userId, playerA.username).catch(() => {});
}

function attemptMatch(io: Server, entry: MatchQueueEntry) {
  const opponent = findOpponent(entry);
  if (!opponent) return;

  removeFromQueueBySocket(entry.socketId);
  removeFromQueueBySocket(opponent.socketId);

  createAndBroadcastMatch(io, entry, opponent).catch((err) => {
    logger.error('Match creation failed', err, {
      a: entry.userId,
      b: opponent.userId,
    });
    // Put them back so a transient failure doesn't strand two players.
    queue.push(entry, opponent);
    io.to(entry.socketId).emit(SOCKET_EVENTS.ERROR, {
      message: "Couldn't start that match. Searching again…",
    });
    io.to(opponent.socketId).emit(SOCKET_EVENTS.ERROR, {
      message: "Couldn't start that match. Searching again…",
    });
  });
}

export function registerMatchmakingHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(
    SOCKET_EVENTS.JOIN_QUEUE,
    safeHandler(
      socket,
      SOCKET_EVENTS.JOIN_QUEUE,
      async ({
        category,
        wager = 0,
        rematchWith,
      }: {
        category?: string;
        wager?: number;
        rematchWith?: string;
      }) => {
        const cat = String(category ?? '').trim().toLowerCase();
        if (!cat || cat.length > 64) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Pick a category to play' });
          return;
        }

        const maxWager = Number(await getSetting(SETTINGS_KEYS.MAX_PVP_WAGER, 500));
        const safeWager = Math.min(
          Math.max(0, Math.floor(Number(wager) || 0)),
          maxWager,
        );

        // Reject up front rather than creating a match and immediately
        // cancelling it — the old flow told the player "match cancelled" when
        // the real problem was their own balance.
        if (safeWager > 0) {
          const wallet = await CoinWallet.findOne({ userId }).select('coins').lean();
          if ((wallet?.coins ?? 0) < safeWager) {
            socket.emit(SOCKET_EVENTS.ERROR, {
              message: `You need ${safeWager} coins to stake this wager. You have ${wallet?.coins ?? 0}.`,
            });
            return;
          }
        }

        if (rematchWith && !Types.ObjectId.isValid(rematchWith)) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid rematch target' });
          return;
        }

        removeFromQueueBySocket(socket.id);
        removeFromQueueByUser(userId);

        const entry: MatchQueueEntry = {
          socketId: socket.id,
          userId,
          category: cat,
          wager: safeWager,
          rating: await getRating(userId),
          joinedAt: Date.now(),
          rematchWith,
        };

        queue.push(entry);
        socket.emit(SOCKET_EVENTS.QUEUED, {
          category: cat,
          wager: safeWager,
          waitMs: QUEUE_TIMEOUT_MS,
        });
        attemptMatch(io, entry);
      },
    ),
  );

  socket.on(
    SOCKET_EVENTS.LEAVE_QUEUE,
    safeHandler(socket, SOCKET_EVENTS.LEAVE_QUEUE, () => {
      removeFromQueueBySocket(socket.id);
      socket.emit(SOCKET_EVENTS.MATCH_CANCELLED, { ok: true });
    }),
  );

  socket.on('disconnect', () => {
    removeFromQueueBySocket(socket.id);
  });
}
