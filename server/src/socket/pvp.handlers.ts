import type { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';

import User from '../models/User';
import Progress from '../models/Progress';
import QuizQuestion from '../models/QuizQuestion';
import UserQuestion from '../models/UserQuestion';
import PvPMatch from '../models/PvPMatch';
import { SOCKET_EVENTS } from './events';
import { safeHandler } from './safeHandler';
import { settleMatch, computeWinner } from '../services/pvpService';
import { isTooFast } from '../services/antiCheatService';
import { logger } from '../utils/logger';
import { TIME_PER_QUESTION, ANSWER_GRACE_MS } from '../config/quizTiming';

/* ---------------------------------- */
/* Constants                          */
/* ---------------------------------- */

type Diff = 'easy' | 'medium' | 'hard';

const TOTAL_Q = 10;
/** Grace added to the client's countdown for network latency. */
const FORFEIT_MS = 60_000;
const READY_GRACE_MS = 60_000;

const DIFF_ORDER: Diff[] = ['easy', 'medium', 'hard'];
const DIFF_TARGET: Record<Diff, number> = { easy: 4, medium: 4, hard: 2 };

/**
 * Cap on how many previously-seen question ids we exclude. An unbounded $nin
 * grows with every game a player finishes until the query itself exceeds
 * Mongo's 16MB document limit.
 */
const MAX_SEEN_EXCLUSIONS = 300;

/* ---------------------------------- */
/* In-memory state                    */
/* ---------------------------------- */
/* These are per-process. The stale-match sweeper in pvpService is the durable
 * backstop that settles anything a restart strands. */

const readyTimers = new Map<string, NodeJS.Timeout>();      // matchId -> timer
const liveByUser = new Map<string, { matchId: string }>();   // userId -> live match
const disconnectTimers = new Map<string, NodeJS.Timeout>();  // userId -> timer
export const userSocketMap = new Map<string, string>();      // userId -> socketId

function clearReadyTimer(matchId: string) {
  const t = readyTimers.get(matchId);
  if (t) clearTimeout(t);
  readyTimers.delete(matchId);
}

function clearDisconnectTimer(userId: string) {
  const t = disconnectTimers.get(userId);
  if (t) clearTimeout(t);
  disconnectTimers.delete(userId);
}

/** Release every per-match handle so a long-lived process doesn't grow forever. */
function releaseMatch(matchId: string, players: { userId: any }[]) {
  clearReadyTimer(matchId);
  for (const p of players) {
    const uid = p.userId.toString();
    if (liveByUser.get(uid)?.matchId === matchId) liveByUser.delete(uid);
    clearDisconnectTimer(uid);
  }
}

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

/* ---------------------------------- */
/* Question selection                 */
/* ---------------------------------- */

/**
 * Pick a shared question set both players are unlikely to have seen.
 *
 * Unlike the previous version this never throws on an exhausted pool. A thrown
 * error inside a socket handler used to take the whole process down, and with
 * small category pools it was reachable within a couple of games. Instead we
 * degrade: unseen questions first, then the least-recently-seen ones, then
 * anything in the category.
 */
async function pickSharedQuestions(userA: string, userB: string, category: string) {
  const [seenA, seenB] = await Promise.all([
    UserQuestion.find({ userId: userA, category })
      .select('questionId')
      .sort({ createdAt: -1 })
      .limit(MAX_SEEN_EXCLUSIONS)
      .lean(),
    UserQuestion.find({ userId: userB, category })
      .select('questionId')
      .sort({ createdAt: -1 })
      .limit(MAX_SEEN_EXCLUSIONS)
      .lean(),
  ]);

  const seenIds = [...seenA, ...seenB].map((s) => s.questionId);
  const picked: any[] = [];
  const usedIds = new Set<string>();

  const take = (pool: any[], need: number) => {
    for (const q of shuffle(pool)) {
      if (picked.length >= TOTAL_Q) break;
      const id = q._id.toString();
      if (usedIds.has(id)) continue;
      usedIds.add(id);
      picked.push(q);
      if (--need <= 0) break;
    }
  };

  // Pass 1 — unseen, respecting the difficulty mix.
  for (const diff of DIFF_ORDER) {
    const need = DIFF_TARGET[diff];
    // $sample rather than a natural-order window: limit(need * 6) shuffled
    // only the first two dozen rows of the collection, so early questions
    // surfaced far more often than later ones even though the shuffle made
    // matches look varied.
    const pool = await QuizQuestion.aggregate([
      {
        $match: {
          category,
          disabled: { $ne: true },
          difficulty: diff,
          _id: { $nin: seenIds },
        },
      },
      { $sample: { size: need * 6 } },
    ]);
    take(pool, need);
  }

  // Pass 2 — top up from anything unseen in the category, any difficulty.
  if (picked.length < TOTAL_Q) {
    const pool = await QuizQuestion.aggregate([
      {
        $match: {
          category,
          disabled: { $ne: true },
          _id: {
            $nin: [...seenIds, ...[...usedIds].map((id) => new Types.ObjectId(id))],
          },
        },
      },
      { $sample: { size: TOTAL_Q * 3 } },
    ]);
    take(pool, TOTAL_Q - picked.length);
  }

  // Pass 3 — the category pool is genuinely too small, so recycle. Repeats are
  // a content problem to fix by seeding more questions, not a reason to fail
  // the match.
  if (picked.length < TOTAL_Q) {
    logger.warn('PvP question pool exhausted — recycling seen questions', {
      category,
      picked: picked.length,
    });
    const pool = await QuizQuestion.aggregate([
      {
        $match: {
          category,
          disabled: { $ne: true },
          _id: { $nin: [...usedIds].map((id) => new Types.ObjectId(id)) },
        },
      },
      { $sample: { size: TOTAL_Q * 3 } },
    ]);
    take(pool, TOTAL_Q - picked.length);
  }

  if (picked.length === 0) {
    throw new Error(`No questions seeded for category "${category}"`);
  }

  // Order easy → medium → hard so the difficulty curve still reads correctly
  // even when the mix had to be relaxed.
  const ordered = [...picked].sort(
    (x, y) => DIFF_ORDER.indexOf(x.difficulty) - DIFF_ORDER.indexOf(y.difficulty),
  );

  // Record exposure for both players. Duplicates are expected on recycle.
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
  }));
}

/* ---------------------------------- */
/* Ready grace                        */
/* ---------------------------------- */

function startReadyGrace(io: Server, matchId: string, missingUserId: string) {
  if (readyTimers.has(matchId)) return;

  readyTimers.set(
    matchId,
    setTimeout(() => {
      void (async () => {
        readyTimers.delete(matchId);

        const match = await PvPMatch.findById(matchId).lean();
        if (!match || match.settledAt) return;

        const missing = (match.players as any[]).find(
          (p) => p.userId.toString() === missingUserId,
        );
        if (missing?.ready) return; // they came back

        const winner = (match.players as any[]).find(
          (p) => p.userId.toString() !== missingUserId,
        );
        if (!winner) return;

        // This used to end the match without settling, which destroyed both
        // players' staked coins.
        await settleMatch(io, matchId, {
          kind: 'winner',
          winnerUserId: winner.userId.toString(),
          reason: 'not_ready',
        });
        releaseMatch(matchId, match.players as any[]);
      })().catch((err) =>
        logger.error('Ready-grace settlement failed', err, { matchId }),
      );
    }, READY_GRACE_MS),
  );
}

/* ---------------------------------- */
/* Socket registration                */
/* ---------------------------------- */

export function registerPvpHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  userSocketMap.set(userId, socket.id);

  const on = (event: string, fn: (...args: any[]) => Promise<void> | void) =>
    socket.on(event, safeHandler(socket, event, fn));

  /* ---------- REMATCH ---------- */

  const relay = (event: string) =>
    on(event, ({ opponentId, category, wager }: any) => {
      const opponentSocketId = userSocketMap.get(opponentId);
      if (!opponentSocketId) return;
      io.to(opponentSocketId).emit(event, { fromUserId: userId, category, wager });
    });

  relay(SOCKET_EVENTS.REMATCH_REQUEST);
  relay(SOCKET_EVENTS.REMATCH_ACCEPTED);
  relay(SOCKET_EVENTS.REMATCH_DECLINED);

  /* ---------- MATCH START ---------- */

  on(SOCKET_EVENTS.MATCH_START, async ({ matchId }: { matchId: string }) => {
    if (!Types.ObjectId.isValid(matchId)) return;

    const match = await PvPMatch.findById(matchId);
    if (!match || match.settledAt) return;

    const room = `pvp:${matchId}`;
    socket.join(room);

    const player = (match.players as any[]).find(
      (p) => p.userId.toString() === userId,
    );
    if (!player) return; // not a participant — ignore silently

    clearDisconnectTimer(userId);

    player.connected = true;
    player.lastSeenAt = new Date();
    player.ready = true;

    // Reconnect into an already-running match: replay state rather than
    // restarting it. Without this an in-flight match would be reset by a
    // client that dropped and came back.
    if (match.state === 'ACTIVE' || match.state === 'WAITING_ON_OPPONENT') {
      await match.save();

      const questionIds = (match.questionSet as any[]).map((q) => q.questionId);
      const docs = await QuizQuestion.find({ _id: { $in: questionIds } })
        .select('question options difficulty')
        .lean();
      const byId = new Map(docs.map((d) => [d._id.toString(), d]));

      socket.emit(SOCKET_EVENTS.MATCH_START, {
        matchId,
        timePerQuestion: TIME_PER_QUESTION,
        resumedAtIndex: player.currentIndex,
        deadlineAt: player.questionDeadlineAt,
        questions: (match.questionSet as any[]).map((ref, i) => {
          const q = byId.get(ref.questionId.toString());
          return {
            id: ref.questionId.toString(),
            question: q?.question ?? '',
            options: q?.options ?? [],
            difficulty: ref.difficulty,
            order: i,
          };
        }),
      });

      liveByUser.set(userId, { matchId });
      return;
    }

    await match.save();

    const allReady = (match.players as any[]).every((p) => !!p.ready);
    if (!allReady) {
      const missing = (match.players as any[]).find((p) => !p.ready)!;
      io.to(room).emit(SOCKET_EVENTS.WAITING_ON_OPPONENT);
      startReadyGrace(io, matchId, missing.userId.toString());
      return;
    }

    clearReadyTimer(matchId);

    const [pA, pB] = match.players as any[];
    const questionSet = await pickSharedQuestions(
      pA.userId.toString(),
      pB.userId.toString(),
      match.category,
    );

    const now = new Date();
    const deadline = new Date(now.getTime() + TIME_PER_QUESTION * 1000 + ANSWER_GRACE_MS);

    // Claim the start transition so two simultaneous MATCH_START events (both
    // players readying at once) can't each deal a different question set.
    const started = await PvPMatch.findOneAndUpdate(
      { _id: matchId, state: { $in: ['MATCHED', 'WAITING'] }, settledAt: null },
      {
        $set: {
          state: 'ACTIVE',
          startedAt: now,
          questionSet: questionSet.map((q) => ({
            questionId: new Types.ObjectId(q.id),
            difficulty: q.difficulty,
            order: q.order,
          })),
          'players.$[].currentIndex': 0,
          'players.$[].furthestIndex': 0,
          'players.$[].completed': false,
          'players.$[].answers': [],
          'players.$[].failedAtIndex': null,
          'players.$[].startedAt': now,
          'players.$[].endedAt': null,
          'players.$[].totalTimeMs': null,
          'players.$[].answeredMs': 0,
          'players.$[].questionServedAt': now,
          'players.$[].questionDeadlineAt': deadline,
        },
      },
      { returnDocument: 'after' },
    ).lean();

    if (!started) return; // someone else already started it

    io.to(room).emit(SOCKET_EVENTS.MATCH_START, {
      matchId,
      timePerQuestion: TIME_PER_QUESTION,
      deadlineAt: deadline,
      questions: questionSet,
    });

    for (const p of started.players as any[]) {
      liveByUser.set(p.userId.toString(), { matchId });
    }
  });

  /* ---------- KEEPALIVE ---------- */

  on(SOCKET_EVENTS.MATCH_PING, async ({ matchId }: { matchId: string }) => {
    if (!Types.ObjectId.isValid(matchId)) return;
    // Targeted update — no full document read-modify-write.
    await PvPMatch.updateOne(
      { _id: matchId, 'players.userId': new Types.ObjectId(userId) },
      { $set: { 'players.$.lastSeenAt': new Date(), 'players.$.connected': true } },
    );
  });

  /* ---------- ANSWER ---------- */

  on(
    SOCKET_EVENTS.ANSWER,
    async ({
      matchId,
      questionId,
      selected,
    }: {
      matchId: string;
      questionId: string;
      selected: number | null;
    }) => {
      if (!Types.ObjectId.isValid(matchId) || !Types.ObjectId.isValid(questionId)) return;
      if (selected !== null && (!Number.isInteger(selected) || selected < 0 || selected > 3)) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid answer' });
        return;
      }

      const match = await PvPMatch.findById(matchId);
      if (!match || match.settledAt || match.state === 'FINISHED') return;

      const room = `pvp:${matchId}`;
      socket.join(room);

      const player = (match.players as any[]).find(
        (p) => p.userId.toString() === userId,
      );
      if (!player) return;

      clearDisconnectTimer(userId);

      // Already ended this run — ignore late duplicates.
      if (player.completed || typeof player.failedAtIndex === 'number') return;

      const qRef = (match.questionSet as any[])[player.currentIndex];
      if (!qRef || qRef.questionId.toString() !== questionId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid question' });
        return;
      }

      const now = new Date();
      const servedAt: Date = player.questionServedAt ?? match.startedAt ?? now;

      // ── Server-authoritative timing ────────────────────────────────────────
      // The client countdown is cosmetic. A late answer is a timeout regardless
      // of what the client claims, and an impossibly fast one is rejected.
      const deadline: Date | null = player.questionDeadlineAt ?? null;
      const expired = deadline ? now.getTime() > deadline.getTime() : false;

      if (!expired && selected !== null && isTooFast(now, servedAt)) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Answer submitted too quickly' });
        return;
      }

      const qq = await QuizQuestion.findById(questionId).select('answer').lean();
      if (!qq) return;

      const isCorrect = !expired && selected !== null && selected === qq.answer;

      // Elapsed time is measured entirely from server timestamps, and clamped
      // so a stalled client can't bank an arbitrarily small (or huge) number.
      const elapsedMs = Math.min(
        Math.max(now.getTime() - servedAt.getTime(), 0),
        TIME_PER_QUESTION * 1000 + ANSWER_GRACE_MS,
      );

      player.answers.push({
        questionId: qq._id,
        selected: expired ? null : selected,
        isCorrect,
        answeredAt: now,
      });
      player.answeredMs = (player.answeredMs ?? 0) + elapsedMs;

      if (!player.startedAt) player.startedAt = servedAt;

      if (!isCorrect) {
        player.failedAtIndex = player.currentIndex;
        player.endedAt = now;
        player.questionDeadlineAt = null;
      } else {
        player.currentIndex += 1;
        player.furthestIndex = Math.max(player.furthestIndex, player.currentIndex);

        if (player.currentIndex >= (match.questionSet as any[]).length) {
          player.completed = true;
          player.endedAt = now;
          player.questionDeadlineAt = null;
        } else {
          // Serve the next question with a fresh server-side deadline.
          player.questionServedAt = now;
          player.questionDeadlineAt = new Date(
            now.getTime() + TIME_PER_QUESTION * 1000 + ANSWER_GRACE_MS,
          );
        }
      }

      if (player.endedAt && player.startedAt) {
        player.totalTimeMs = player.endedAt.getTime() - player.startedAt.getTime();
      }

      try {
        await match.save();
      } catch (err: any) {
        // Optimistic-concurrency loss: another answer for this player won the
        // race. Dropping it is correct — it was a duplicate submit.
        if (err?.name === 'VersionError') return;
        throw err;
      }

      socket.emit(SOCKET_EVENTS.PLAYER_UPDATE, {
        userId,
        currentIndex: player.currentIndex,
        furthestIndex: player.furthestIndex,
        ended: !!player.endedAt,
        correct: isCorrect,
        correctIndex: qq.answer,
        deadlineAt: player.questionDeadlineAt,
        timedOut: expired,
      });

      socket.to(room).emit(SOCKET_EVENTS.PLAYER_UPDATE, {
        userId,
        currentIndex: player.currentIndex,
        furthestIndex: player.furthestIndex,
        ended: !!player.endedAt,
      });

      const allEnded = (match.players as any[]).every(
        (p) => p.completed || typeof p.failedAtIndex === 'number',
      );

      if (!allEnded) {
        io.to(room).emit(SOCKET_EVENTS.WAITING_ON_OPPONENT);
        return;
      }

      const result = computeWinner(match);
      const outcome =
        'draw' in result
          ? ({ kind: 'draw' } as const)
          : ({
              kind: 'winner',
              winnerUserId: result.winner.userId.toString(),
              reason: 'normal',
            } as const);

      await settleMatch(io, matchId, outcome);
      releaseMatch(matchId, match.players as any[]);
    },
  );

  /* ---------- DISCONNECT ---------- */

  socket.on('disconnect', () => {
    if (userSocketMap.get(userId) === socket.id) userSocketMap.delete(userId);

    const live = liveByUser.get(userId);
    if (!live) return;

    disconnectTimers.set(
      userId,
      setTimeout(() => {
        void (async () => {
          disconnectTimers.delete(userId);

          const match = await PvPMatch.findById(live.matchId).lean();
          if (!match || match.settledAt) {
            liveByUser.delete(userId);
            return;
          }

          const winner = (match.players as any[]).find(
            (p) => p.userId.toString() !== userId,
          );
          if (!winner) return;

          // Previously this ended the match without paying out, burning both
          // stakes on every dropped connection.
          await settleMatch(io, live.matchId, {
            kind: 'winner',
            winnerUserId: winner.userId.toString(),
            reason: 'forfeit',
          });
          releaseMatch(live.matchId, match.players as any[]);
        })().catch((err) =>
          logger.error('Forfeit settlement failed', err, { matchId: live.matchId, userId }),
        );
      }, FORFEIT_MS),
    );
  });
}
