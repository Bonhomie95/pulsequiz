import type { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import QuizQuestion from '../models/QuizQuestion';
import UserQuestion from '../models/UserQuestion';
import PvPMatch from '../models/PvPMatch';
import { SOCKET_EVENTS } from './events';

/* ---------------------------------- */
/* Constants                          */
/* ---------------------------------- */

type Diff = 'easy' | 'medium' | 'hard';

const TOTAL_Q = 10;
const TIME_PER_QUESTION = 15;
const FORFEIT_MS = 60_000;

const DIFF_ORDER: Diff[] = ['easy', 'medium', 'hard'];
const DIFF_TARGET: Record<Diff, number> = { easy: 4, medium: 4, hard: 2 };

/* ---------------------------------- */
/* In-memory state                    */
/* ---------------------------------- */

const liveByUser = new Map<string, { matchId: string }>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();

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

/* ---------------------------------- */
/* Rewards                            */
/* ---------------------------------- */

async function applyMatchRewards(winnerId: string, loserId: string) {
  await Progress.updateOne({ userId: winnerId }, { $inc: { points: 50 } });
  await CoinWallet.updateOne({ userId: winnerId }, { $inc: { coins: 50 } });
  await CoinWallet.updateOne({ userId: loserId }, { $inc: { coins: 20 } });

  await User.updateMany(
    { _id: { $in: [winnerId, loserId] } },
    { $inc: { sessionsSinceLastAd: 1 } },
  );
}

/* ---------------------------------- */
/* Winner logic                       */
/* ---------------------------------- */

function computeWinner(match: any) {
  const [a, b] = match.players;

  if (a.furthestIndex !== b.furthestIndex) {
    return a.furthestIndex > b.furthestIndex ? a : b;
  }

  const ta = a.totalTimeMs ?? Number.MAX_SAFE_INTEGER;
  const tb = b.totalTimeMs ?? Number.MAX_SAFE_INTEGER;

  if (ta !== tb) return ta < tb ? a : b;

  return a.userId.toString() < b.userId.toString() ? a : b;
}

/* ---------------------------------- */
/* Socket registration                */
/* ---------------------------------- */

export function registerPvpHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  /* ---------- MATCH START ---------- */
  socket.on(SOCKET_EVENTS.MATCH_START, async ({ matchId }) => {
    const match = await PvPMatch.findById(matchId);
    if (!match) return;

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

    const existingPlayers = [...match.players];

    match.players.splice(0);

    for (const p of existingPlayers) {
      const snap = await snapshotUser(p.userId.toString());

      match.players.push({
        ...snap,
        connected: true,
        lastSeenAt: new Date(),
        currentIndex: 0,
        furthestIndex: 0,
        completed: false,
        answers: [],
      });
    }

    await match.save();

    const room = `pvp:${matchId}`;
    socket.join(room);

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

    const winner = computeWinner(match);
    const loser = match.players.find(
      (p: any) => p.userId.toString() !== winner.userId.toString(),
    )!;

    await applyMatchRewards(winner.userId.toString(), loser.userId.toString());

    match.state = 'FINISHED';
    match.finishedAt = new Date();
    match.winnerUserId = winner.userId;

    await match.save();

    io.to(room).emit(SOCKET_EVENTS.MATCH_FINISHED, {
      matchId,
      winnerUserId: winner.userId.toString(),
    });
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
