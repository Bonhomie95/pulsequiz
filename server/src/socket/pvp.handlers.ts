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
import { botPlayerIn, startBotPlay, stopBot } from './pvpBot';
import { createRematch } from './matchmaking';
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
/**
 * Below this, no human has read the question — reflex alone is around 200ms
 * and these are four-option multiple choice.
 */
const IMPOSSIBLY_FAST_MS = 250;

export const userSocketMap = new Map<string, string>();      // userId -> socketId

/** Pair key -> the players who have agreed to a rematch. */
const rematchIntents = new Map<string, Set<string>>();

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

  /* ---------- HINT ---------- */

  /**
   * One 50/50 per player per match, free.
   *
   * Deliberately not purchasable. Both players answer the same ten questions
   * with coins staked on the result, so a hint you can buy is a win you can
   * buy — which is exactly why the solo hint service refuses to serve the
   * shared-question modes. One free use each keeps the help symmetric.
   *
   * The correct answer never leaves the server: this returns one wrong option
   * to grey out, nothing more.
   */
  on(SOCKET_EVENTS.HINT, async ({ matchId }: { matchId?: string }) => {
    if (typeof matchId !== 'string' || !Types.ObjectId.isValid(matchId)) return;

    const match = await PvPMatch.findById(matchId);
    if (!match || match.settledAt || match.state === 'FINISHED') return;

    const player = (match.players as any[]).find(
      (p) => p.userId.toString() === userId,
    );
    if (!player || player.completed) return;

    const index = player.currentIndex;

    // Already spent. Re-send it rather than staying silent, so a reconnect
    // gets its greyed-out option back instead of looking like a dead button.
    if (typeof player.hintUsedAtIndex === 'number') {
      if (player.hintUsedAtIndex === index) {
        socket.emit(SOCKET_EVENTS.HINT_RESULT, {
          questionIndex: index,
          disabledIndex: player.hintDisabledIndex,
          remaining: 0,
        });
      } else {
        socket.emit(SOCKET_EVENTS.HINT_RESULT, {
          questionIndex: index,
          disabledIndex: null,
          remaining: 0,
          message: 'You have already used your 50/50',
        });
      }
      return;
    }

    const qRef = (match.questionSet as any[])[index];
    if (!qRef) return;

    const question = await QuizQuestion.findById(qRef.questionId)
      .select('answer options')
      .lean();
    if (!question) return;

    const wrong = (question.options ?? [])
      .map((_: unknown, i: number) => i)
      .filter((i: number) => i !== question.answer);
    if (!wrong.length) return;

    const disabledIndex = wrong[Math.floor(Math.random() * wrong.length)];

    // Positional write: the opponent shares this document and answering at the
    // same moment would lose a whole-document save to the version check.
    await PvPMatch.updateOne(
      { _id: matchId, 'players.userId': new Types.ObjectId(userId) },
      {
        $set: {
          'players.$.hintUsedAtIndex': index,
          'players.$.hintDisabledIndex': disabledIndex,
        },
      },
    );

    socket.emit(SOCKET_EVENTS.HINT_RESULT, {
      questionIndex: index,
      disabledIndex,
      remaining: 0,
    });
  });

  /* ---------- REMATCH ---------- */

  /**
   * Who has asked to replay against whom: "<a>:<b>" (ids sorted) -> the set of
   * players who have said yes. When both are in, the match is created here
   * rather than sending each client back to the matchmaking queue and hoping
   * the sweeper pairs them.
   */
  const pairKey = (x: string, y: string) => [x, y].sort().join(':');

  const relay = (event: string) =>
    on(event, async ({ opponentId, category, wager }: any) => {
      if (typeof opponentId !== 'string' || !opponentId) return;

      const opponentSocketId = userSocketMap.get(opponentId);

      if (!opponentSocketId) {
        // They have closed the app or dropped off. Dropping this silently left
        // the requester on a spinner until a 30s timeout, so the button looked
        // broken; a bare error is no better. Say what actually happened.
        rematchIntents.delete(pairKey(userId, opponentId));
        if (event !== SOCKET_EVENTS.REMATCH_DECLINED) {
          socket.emit(SOCKET_EVENTS.REMATCH_DECLINED, {
            fromUserId: opponentId,
            reason: 'offline',
          });
        }
        return;
      }

      if (event === SOCKET_EVENTS.REMATCH_DECLINED) {
        rematchIntents.delete(pairKey(userId, opponentId));
        io.to(opponentSocketId).emit(event, { fromUserId: userId, category, wager });
        return;
      }

      // Record this player's intent. A request and an acceptance both count —
      // two people tapping "rematch" at the same moment is agreement, not a
      // collision.
      const key = pairKey(userId, opponentId);
      const agreed = rematchIntents.get(key) ?? new Set<string>();
      agreed.add(userId);
      rematchIntents.set(key, agreed);

      if (agreed.has(opponentId)) {
        rematchIntents.delete(key);
        const created = await createRematch(
          io,
          { userId, socketId: socket.id, rating: 1000 },
          { userId: opponentId, socketId: opponentSocketId, rating: 1000 },
          String(category ?? 'General Knowledge'),
          Number(wager) || 0,
        );
        if (!created) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Could not start the rematch.' });
          io.to(opponentSocketId).emit(SOCKET_EVENTS.ERROR, {
            message: 'Could not start the rematch.',
          });
        }
        return;
      }

      // Only one side so far — let the other know they have been asked.
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

    const player = (match.players as any[]).find(
      (p) => p.userId.toString() === userId,
    );
    if (!player) return; // not a participant — ignore silently
    // Join only after the membership check, or any user could subscribe to a
    // stranger's match room and receive its questions and results.
    socket.join(room);

    clearDisconnectTimer(userId);

    // Mark this player ready with a targeted atomic write, NOT by saving the
    // whole document.
    //
    // Both clients emit MATCH_START the moment the match is found, so the two
    // saves raced and Mongoose's version check rejected whichever landed
    // second. That player's readiness was silently lost, `allReady` never
    // became true, the question set was never dealt — and the screen stayed
    // blank until the ready-grace timer forfeited the match.
    await PvPMatch.updateOne(
      { _id: matchId, 'players.userId': new Types.ObjectId(userId) },
      {
        $set: {
          'players.$.connected': true,
          'players.$.lastSeenAt': new Date(),
          'players.$.ready': true,
        },
      },
    );

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

    // Re-read: our own write above is already persisted, and this is the only
    // way to see the opponent's, which may have landed while we were working.
    const fresh = await PvPMatch.findById(matchId).select('players').lean();
    const freshPlayers = (fresh?.players ?? match.players) as any[];

    const allReady = freshPlayers.every((p) => !!p.ready);
    if (!allReady) {
      const missing = freshPlayers.find((p) => !p.ready)!;
      // The player who is ready is the one waiting — not the one we are
      // still waiting on.
      socket.emit(SOCKET_EVENTS.WAITING_ON_OPPONENT);
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

    // If one side is a house account, start playing for it. Nothing else
    // will: it has no client to answer with.
    const botUserId = await botPlayerIn(started as any);
    if (botUserId) startBotPlay(io, matchId, botUserId);
  });

  /* ---------- KEEPALIVE ---------- */

  let lastPingAt = 0;
  on(SOCKET_EVENTS.MATCH_PING, async ({ matchId }: { matchId: string }) => {
    if (!Types.ObjectId.isValid(matchId)) return;
    // Each ping is a DB write; a client spamming it shouldn't cost us one each.
    if (Date.now() - lastPingAt < 3000) return;
    lastPingAt = Date.now();
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

      /**
       * Apply one answer, retrying a lost version check.
       *
       * Both players are subdocuments of the same match, so two answers in
       * flight at once make one `save()` fail — which says nothing about the
       * player who sent it.
       */
      const room = `pvp:${matchId}`;

      let applied:
        | { match: any; player: any; qq: any; isCorrect: boolean; expired: boolean }
        | null = null;

      for (let attempt = 0; attempt < 6 && !applied; attempt++) {
        const match = await PvPMatch.findById(matchId);
        if (!match || match.settledAt || match.state === 'FINISHED') return;

        const player = (match.players as any[]).find(
          (p) => p.userId.toString() === userId,
        );
        if (!player) return;
        socket.join(room);

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

        // A quick answer is recorded, not thrown away.
        //
        // This used to reject anything under a second outright: no
        // PLAYER_UPDATE, so the question never advanced and the player sat
        // watching their own clock run out having answered. A second is well
        // within human reach on an easy question, and voiding a real answer
        // is a far worse outcome than logging a suspicious one — the
        // finish-time anti-cheat sweep already looks at accuracy and timing
        // patterns across sessions, which is where automation actually shows
        // up.
        //
        // Below IMPOSSIBLY_FAST_MS there is no human explanation, so that is
        // still refused, and the client is told why.
        const elapsedSinceServed = now.getTime() - servedAt.getTime();

        if (!expired && selected !== null && elapsedSinceServed < IMPOSSIBLY_FAST_MS) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'That answer came in too fast to be counted.',
          });
          return;
        }

        if (!expired && selected !== null && isTooFast(now, servedAt)) {
          logger.warn('Fast PvP answer recorded for review', {
            matchId,
            userId,
            elapsedMs: elapsedSinceServed,
          });
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

        // A wrong answer no longer ends the run.
        //
        // PvP used to be sudden death: one slip and you were out, watching the
        // other player finish alone. Both players now answer the same ten
        // questions whatever happens, and the result is decided on score with
        // time as the tie-break — which is what computeWinner already did.
        //
        // `failedAtIndex` is deliberately left unset. The "has this player
        // ended" checks still read it so that matches already in flight when
        // this shipped continue to settle.
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

        if (player.endedAt && player.startedAt) {
          player.totalTimeMs = player.endedAt.getTime() - player.startedAt.getTime();
        }

        try {
          await match.save();
          applied = { match, player, qq, isCorrect, expired };
        } catch (err: any) {
          // Optimistic-concurrency loss. This is NOT a duplicate submit: both
          // players live in the same match document, so whoever saves second
          // loses the version check. Swallowing it dropped the opponent's
          // answer on the floor — their tap did nothing and the question never
          // advanced, which reads as "you can't answer because they answered
          // first". Re-read and re-apply instead; a real duplicate is caught
          // by the questionId check on the retry.
          if (err?.name === 'VersionError') continue;
          throw err;
        }
      }

      if (!applied) return;
      const { match, player, qq, isCorrect, expired } = applied;


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
        // Only the player who has actually finished, and only them.
        //
        // This fired on every accepted answer and went to the whole room, so
        // both players were told "you're done, waiting for your opponent" from
        // question one onward, and nothing ever took it back.
        if (player.completed || typeof player.failedAtIndex === 'number') {
          socket.emit(SOCKET_EVENTS.WAITING_ON_OPPONENT);
        }
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

      stopBot(matchId);
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

          const me = (match.players as any[]).find((p) => p.userId.toString() === userId);
          // Already finished before dropping: nothing to forfeit. The match
          // settles when the opponent finishes, or via the deadline sweeper if
          // they stall — never by handing them the pot for our disconnect.
          if (me && (me.completed || typeof me.failedAtIndex === 'number')) return;

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
