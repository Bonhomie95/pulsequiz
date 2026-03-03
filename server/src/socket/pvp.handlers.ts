import type { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';

import User from '../models/User';
import Progress from '../models/Progress';
import QuizQuestion from '../models/QuizQuestion';
import QuizSession from '../models/QuizSession';
import UserQuestion from '../models/UserQuestion';
import PvPMatch from '../models/PvPMatch';
import { SOCKET_EVENTS } from './events';
import { awardWagerToWinner, refundWager } from '../services/coinService';

/* ---------------------------------- */
/* Constants                          */
/* ---------------------------------- */

type Diff = 'easy' | 'medium' | 'hard';

const TOTAL_Q = 10;
const TIME_PER_QUESTION = 15;
const FORFEIT_MS = 60_000;

const DIFF_ORDER: Diff[] = ['easy', 'medium', 'hard'];
const DIFF_TARGET: Record<Diff, number> = { easy: 4, medium: 4, hard: 2 };

const READY_GRACE_MS = 60_000; // same as forfeit window
const readyTimers = new Map<string, NodeJS.Timeout>(); // matchId -> timer

/* ---------------------------------- */
/* In-memory state                    */
/* ---------------------------------- */

const liveByUser = new Map<string, { matchId: string }>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();
// userId → socketId for rematch notification routing
export const userSocketMap = new Map<string, string>();

/* ---------------------------------- */
/* Utils                              */
/* ---------------------------------- */

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clearDisconnectTimer(userId: string) {
  const t = disconnectTimers.get(userId);
  if (t) clearTimeout(t);
  disconnectTimers.delete(userId);
}

/* ---------------------------------- */
/* Question selection                 */
/* ---------------------------------- */

async function pickSharedUnseenQuestions(
  userA: string,
  userB: string,
  category: string,
) {
  const [seenA, seenB] = await Promise.all([
    UserQuestion.find({ userId: userA, category }).select('questionId').lean(),
    UserQuestion.find({ userId: userB, category }).select('questionId').lean(),
  ]);

  const seen = new Set(
    [...seenA, ...seenB].map((s) => s.questionId.toString()),
  );

  const picked: any[] = [];

  for (const diff of DIFF_ORDER) {
    const need = DIFF_TARGET[diff];

    const pool = await QuizQuestion.find({
      category,
      difficulty: diff,
      _id: { $nin: [...seen].map((id) => new Types.ObjectId(id)) },
    })
      .limit(need * 6)
      .lean();

    if (pool.length < need) {
      throw new Error(`Question pool exhausted (${category}/${diff})`);
    }

    picked.push(...shuffle(pool).slice(0, need));
  }

  const ordered = picked.slice(0, TOTAL_Q);

  // 🔒 lock exposure for BOTH players
  await UserQuestion.insertMany(
    ordered.flatMap((q) => [
      { userId: userA, questionId: q._id, category, difficulty: q.difficulty },
      { userId: userB, questionId: q._id, category, difficulty: q.difficulty },
    ]),
    { ordered: false },
  ).catch(() => {});

  return ordered.map((q, i) => ({
    id: q._id.toString(),
    question: q.question,
    options: q.options,
    difficulty: q.difficulty,
    order: i,
    answer: q.answer, // server-only
  }));
}

/* ---------------------------------- */
/* Snapshot                           */
/* ---------------------------------- */

async function snapshotUser(userId: string) {
  const [u, p] = await Promise.all([
    User.findById(userId).lean(),
    Progress.findOne({ userId }).lean(),
  ]);

  return {
    userId: new Types.ObjectId(userId),
    usernameSnapshot: u?.username ?? 'Player',
    avatarSnapshot: u?.avatar ?? 'avatar0',
    levelSnapshot: p?.level ?? 1,
    allTimeRankSnapshot: 0,
  };
}

// Waiting Functions

function startReadyGrace(io: Server, matchId: string, missingUserId: string) {
  if (readyTimers.has(matchId)) return;

  readyTimers.set(
    matchId,
    setTimeout(async () => {
      const match = await PvPMatch.findById(matchId);
      if (!match || match.state === 'FINISHED') return;

      // if missing player still not ready -> forfeit
      const missing = match.players.find(
        (p: any) => p.userId.toString() === missingUserId,
      );
      if (missing?.ready) return; // they came back

      const winner = match.players.find(
        (p: any) => p.userId.toString() !== missingUserId,
      );

      match.state = 'FORFEITED';
      match.finishedAt = new Date();
      match.winnerUserId = winner?.userId;

      await match.save();

      io.to(`pvp:${matchId}`).emit(SOCKET_EVENTS.MATCH_FINISHED, {
        matchId,
        winnerUserId: winner?.userId?.toString(),
        reason: 'opponent_not_ready',
      });

      readyTimers.delete(matchId);
    }, READY_GRACE_MS),
  );
}

/* ---------------------------------- */
/* Rewards                            */
/* ---------------------------------- */

async function applyMatchRewards(matchId: string, winnerId: string, loserId: string | null) {
  const match = await PvPMatch.findById(matchId).lean();
  if (!match) return;

  // Unified point system: each player earns points based on their own answers
  // Points are computed per-player from their answer records
  for (const player of match.players) {
    const uid = player.userId.toString();
    const correctCount = player.answers.filter((a: any) => a.isCorrect).length;
    const total = match.questionSet.length;
    const basePoints = correctCount;
    const bonus = correctCount === total ? 10 : 0;
    const totalPoints = basePoints + bonus;

    // Daily cap check (import inline to avoid circular deps)
    const { isDailyCapExceeded } = await import('../services/antiCheatService');
    const { getSetting, SETTINGS_KEYS } = await import('../models/AppSettings');
    const cap = await getSetting(SETTINGS_KEYS.DAILY_SESSION_CAP, 20);
    const capExceeded = await isDailyCapExceeded(uid, Number(cap));
    const leaderboardPoints = capExceeded ? 0 : totalPoints;

    if (leaderboardPoints > 0) {
      await Progress.updateOne({ userId: uid }, { $inc: { points: leaderboardPoints } });
    }
    // Log quiz session for leaderboard
    await QuizSession.create({
      userId: uid,
      sessionId: matchId,
      category: match.category,
      score: basePoints,
      bonus,
      totalPoints: leaderboardPoints,
      correctAnswers: correctCount,
      totalQuestions: total,
      levelAtTime: 1, // approximate
    }).catch(() => {}); // non-critical if already exists
  }

  // Handle coin wager — winner takes pot (coins already locked at match creation)
  if (match.wager && match.wager > 0 && winnerId && loserId) {
    await awardWagerToWinner(winnerId, match.wager, matchId);
  }

  await User.updateMany(
    { _id: { $in: [winnerId, loserId].filter(Boolean) } },
    { $inc: { sessionsSinceLastAd: 1 } },
  );
}

async function applyDrawRewards(matchId: string) {
  const match = await PvPMatch.findById(matchId).lean();
  if (!match) return;

  for (const player of match.players) {
    const uid = player.userId.toString();
    const correctCount = player.answers.filter((a: any) => a.isCorrect).length;
    const total = match.questionSet.length;
    const basePoints = correctCount;
    const bonus = correctCount === total ? 10 : 0;
    const totalPoints = basePoints + bonus;

    const { isDailyCapExceeded } = await import('../services/antiCheatService');
    const { getSetting, SETTINGS_KEYS } = await import('../models/AppSettings');
    const cap = await getSetting(SETTINGS_KEYS.DAILY_SESSION_CAP, 20);
    const capExceeded = await isDailyCapExceeded(uid, Number(cap));
    const leaderboardPoints = capExceeded ? 0 : totalPoints;

    if (leaderboardPoints > 0) {
      await Progress.updateOne({ userId: uid }, { $inc: { points: leaderboardPoints } });
    }
    await QuizSession.create({
      userId: uid, sessionId: matchId, category: match.category,
      score: basePoints, bonus, totalPoints: leaderboardPoints,
      correctAnswers: correctCount, totalQuestions: total, levelAtTime: 1,
    }).catch(() => {});
  }

  // Refund both players' wagers on draw
  if (match.wager && match.wager > 0) {
    const [a, b] = match.players;
    await refundWager(a.userId.toString(), b.userId.toString(), match.wager, matchId);
  }

  await User.updateMany(
    { _id: { $in: match.players.map((p: any) => p.userId) } },
    { $inc: { sessionsSinceLastAd: 1 } },
  );
}

/* ---------------------------------- */
/* Winner logic                       */
/* ---------------------------------- */

/**
 * Returns { winner, loser } or { draw: true } when both players
 * finish with identical correct counts AND identical total time.
 */
function computeWinner(match: any): { winner: any; loser: any } | { draw: true } {
  const [a, b] = match.players;

  const aCorrect = a.answers.filter((x: any) => x.isCorrect).length;
  const bCorrect = b.answers.filter((x: any) => x.isCorrect).length;

  if (aCorrect !== bCorrect) {
    const winner = aCorrect > bCorrect ? a : b;
    const loser  = aCorrect > bCorrect ? b : a;
    return { winner, loser };
  }

  const ta = a.totalTimeMs ?? Number.MAX_SAFE_INTEGER;
  const tb = b.totalTimeMs ?? Number.MAX_SAFE_INTEGER;

  if (ta === tb) return { draw: true };

  const winner = ta < tb ? a : b;
  const loser  = ta < tb ? b : a;
  return { winner, loser };
}

/* ---------------------------------- */
/* Socket registration                */
/* ---------------------------------- */

export function registerPvpHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  // Track userId → socketId for rematch routing
  userSocketMap.set(userId, socket.id);
  socket.on('disconnect', () => {
    if (userSocketMap.get(userId) === socket.id) userSocketMap.delete(userId);
  });

  /* ---------- REMATCH REQUEST ---------- */
  socket.on(SOCKET_EVENTS.REMATCH_REQUEST, ({ opponentId, category, wager }: { opponentId: string; category: string; wager: number }) => {
    const opponentSocketId = userSocketMap.get(opponentId);
    if (opponentSocketId) {
      io.to(opponentSocketId).emit(SOCKET_EVENTS.REMATCH_REQUEST, {
        fromUserId: userId,
        category,
        wager,
      });
    }
  });

  socket.on(SOCKET_EVENTS.REMATCH_ACCEPTED, ({ opponentId, category, wager }: { opponentId: string; category: string; wager: number }) => {
    // Both join queue with rematchWith set to each other
    // Emit back to the requester to also join queue
    const opponentSocketId = userSocketMap.get(opponentId);
    if (opponentSocketId) {
      io.to(opponentSocketId).emit(SOCKET_EVENTS.REMATCH_ACCEPTED, {
        fromUserId: userId,
        category,
        wager,
      });
    }
  });

  socket.on(SOCKET_EVENTS.REMATCH_DECLINED, ({ opponentId }: { opponentId: string }) => {
    const opponentSocketId = userSocketMap.get(opponentId);
    if (opponentSocketId) {
      io.to(opponentSocketId).emit(SOCKET_EVENTS.REMATCH_DECLINED, { fromUserId: userId });
    }
  });

  /* ---------- MATCH START ---------- */
  socket.on(SOCKET_EVENTS.MATCH_START, async ({ matchId }) => {
    const match = await PvPMatch.findById(matchId);
    if (!match || match.state === 'FINISHED') return;

    const room = `pvp:${matchId}`;
    socket.join(room);

    const player = match.players.find(
      (p: any) => p.userId.toString() === userId,
    );
    if (!player) return;

    clearDisconnectTimer(userId);

    player.connected = true;
    player.lastSeenAt = new Date();
    player.ready = true;

    await match.save();

    const allReady = match.players.every((p: any) => !!p.ready);

    if (!allReady) {
      const missing = match.players.find((p: any) => !p.ready)!;
      io.to(room).emit(SOCKET_EVENTS.WAITING_ON_OPPONENT);
      startReadyGrace(io, matchId, missing.userId.toString());
      return;
    }

    // ✅ both ready -> cancel grace timer if any
    const t = readyTimers.get(matchId);
    if (t) clearTimeout(t);
    readyTimers.delete(matchId);

    // ✅ NOW pick questions and start match (your existing logic)
    const [pA, pB] = match.players;

    const questionSet = await pickSharedUnseenQuestions(
      pA.userId.toString(),
      pB.userId.toString(),
      match.category,
    );

    match.questionSet.splice(0);
    for (const q of questionSet) {
      match.questionSet.push({
        questionId: new Types.ObjectId(q.id),
        difficulty: q.difficulty,
        order: q.order,
      });
    }

    match.state = 'ACTIVE';
    match.startedAt = new Date();

    // reset gameplay state per player
    for (const p of match.players as any) {
      p.currentIndex = 0;
      p.furthestIndex = 0;
      p.completed = false;
      p.answers = [];
      p.failedAtIndex = undefined;
      p.startedAt = undefined;
      p.endedAt = undefined;
      p.totalTimeMs = undefined;
    }

    await match.save();

    io.to(room).emit(SOCKET_EVENTS.MATCH_START, {
      matchId,
      timePerQuestion: TIME_PER_QUESTION,
      questions: questionSet.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        difficulty: q.difficulty,
        order: q.order,
      })),
    });

    liveByUser.set(userId, { matchId });
  });

  socket.on(SOCKET_EVENTS.MATCH_PING, async ({ matchId }) => {
    const match = await PvPMatch.findById(matchId);
    if (!match || match.state === 'FINISHED') return;

    const player = match.players.find(
      (p: any) => p.userId.toString() === userId,
    );
    if (!player) return;

    player.lastSeenAt = new Date();
    player.connected = true;

    await match.save();
  });

  /* ---------- ANSWER ---------- */
  socket.on(SOCKET_EVENTS.ANSWER, async ({ matchId, questionId, selected }) => {
    const match = await PvPMatch.findById(matchId);
    if (!match || match.state === 'FINISHED') return;

    const room = `pvp:${matchId}`;
    socket.join(room);

    const player = match.players.find(
      (p: any) => p.userId.toString() === userId,
    );
    if (!player) return;

    clearDisconnectTimer(userId);

    const qRef = match.questionSet[player.currentIndex];
    if (!qRef || qRef.questionId.toString() !== questionId) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid question' });
      return;
    }

    const qq = await QuizQuestion.findById(questionId).lean();
    if (!qq) return;

    const isCorrect = selected !== null && selected === qq.answer;

    if (!player.startedAt) player.startedAt = new Date();

    player.answers.push({
      questionId: qq._id,
      selected,
      isCorrect,
      answeredAt: new Date(),
    });

    if (!isCorrect || selected === null) {
      player.failedAtIndex = player.currentIndex;
      player.endedAt = new Date();
    } else {
      player.currentIndex++;
      player.furthestIndex = Math.max(
        player.furthestIndex,
        player.currentIndex,
      );

      if (player.currentIndex >= TOTAL_Q) {
        player.completed = true;
        player.endedAt = new Date();
      }
    }

    if (player.endedAt && player.startedAt) {
      player.totalTimeMs =
        player.endedAt.getTime() - player.startedAt.getTime();
    }

    await match.save();

    io.to(room).emit(SOCKET_EVENTS.PLAYER_UPDATE, {
      userId,
      currentIndex: player.currentIndex,
      furthestIndex: player.furthestIndex,
      ended: !!player.endedAt,
    });

    const allEnded = match.players.every(
      (p: any) => p.completed || typeof p.failedAtIndex === 'number',
    );

    if (!allEnded) {
      match.state = 'WAITING_ON_OPPONENT';
      await match.save();
      io.to(room).emit(SOCKET_EVENTS.WAITING_ON_OPPONENT);
      return;
    }

    const result = computeWinner(match);

    if ('draw' in result) {
      // Draw — refund wagers, award points to both
      await applyDrawRewards(matchId);

      match.state = 'FINISHED';
      match.finishedAt = new Date();
      await match.save();

      io.to(room).emit(SOCKET_EVENTS.MATCH_DRAW, { matchId });
    } else {
      const { winner, loser } = result;
      await applyMatchRewards(matchId, winner.userId.toString(), loser?.userId?.toString() ?? null);

      match.state = 'FINISHED';
      match.finishedAt = new Date();
      match.winnerUserId = winner.userId;
      await match.save();

      io.to(room).emit(SOCKET_EVENTS.MATCH_FINISHED, {
        matchId,
        winnerUserId: winner.userId.toString(),
      });
    }
  });

  /* ---------- DISCONNECT ---------- */
  socket.on('disconnect', async () => {
    const live = liveByUser.get(userId);
    if (!live) return;

    disconnectTimers.set(
      userId,
      setTimeout(async () => {
        const match = await PvPMatch.findById(live.matchId);
        if (!match || match.state === 'FINISHED') return;

        const winner = match.players.find(
          (p: any) => p.userId.toString() !== userId,
        );

        match.state = 'FORFEITED';
        match.finishedAt = new Date();
        match.winnerUserId = winner?.userId;

        await match.save();

        io.to(`pvp:${live.matchId}`).emit(SOCKET_EVENTS.MATCH_FINISHED, {
          matchId: live.matchId,
          winnerUserId: winner?.userId?.toString(),
          reason: 'forfeit',
        });
      }, FORFEIT_MS),
    );
  });
}
