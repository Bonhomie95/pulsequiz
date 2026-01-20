import type { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import QuizQuestion from '../models/QuizQuestion';
import UserQuestion from '../models/UserQuestion';
import PvPMatch from '../models/PvPMatch';

type Diff = 'easy' | 'medium' | 'hard';

const TIME_PER_QUESTION = 15;
const TOTAL_Q = 10;

const DIFF_ORDER: Diff[] = ['easy', 'medium', 'hard'];
const DIFF_TARGET: Record<Diff, number> = { easy: 4, medium: 4, hard: 2 };

const MATCH_WAIT_MS = 60_000;
const FORFEIT_MS = 60_000;

type QueueEntry = {
  userId: string;
  category: string;
  enqueuedAt: number;
  socketId: string;
  timeout: ReturnType<typeof setTimeout>;
};

const queueByCategory = new Map<string, QueueEntry[]>(); // category -> entries
const liveByUser = new Map<string, { matchId: string; socketId: string }>();
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>(); // userId -> timer

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function pickSharedUnseenQuestions(params: {
  userA: string;
  userB: string;
  category: string;
}) {
  const { userA, userB, category } = params;

  // collect seen question ids for both players in this category
  const [seenA, seenB] = await Promise.all([
    UserQuestion.find({ userId: userA, category }).select('questionId').lean(),
    UserQuestion.find({ userId: userB, category }).select('questionId').lean(),
  ]);

  const seen = new Set<string>();
  for (const s of seenA) seen.add(s.questionId.toString());
  for (const s of seenB) seen.add(s.questionId.toString());

  const ordered: { q: any; difficulty: Diff }[] = [];

  for (const diff of DIFF_ORDER) {
    const need = DIFF_TARGET[diff];

    // pull a larger batch then trim to avoid low entropy
    const qs = await QuizQuestion.find({
      category,
      difficulty: diff,
      _id: { $nin: Array.from(seen).map((id) => new Types.ObjectId(id)) },
    })
      .limit(Math.max(need * 6, 40))
      .lean();

    if (qs.length < need) {
      throw new Error(`Question pool exhausted for "${category}" (${diff}).`);
    }

    const pick = shuffle(qs).slice(0, need);
    pick.forEach((q) => ordered.push({ q, difficulty: diff }));
  }

  if (ordered.length !== TOTAL_Q) {
    throw new Error('Failed to build 10-question set');
  }

  // track exposure for BOTH players immediately (locks unseen rule)
  const inserts = ordered.flatMap(({ q, difficulty }) => [
    {
      userId: new Types.ObjectId(userA),
      questionId: q._id,
      category,
      difficulty,
    },
    {
      userId: new Types.ObjectId(userB),
      questionId: q._id,
      category,
      difficulty,
    },
  ]);

  await UserQuestion.insertMany(inserts, { ordered: false }).catch(() => {});

  return ordered.map(({ q, difficulty }, idx) => ({
    questionId: q._id,
    difficulty,
    order: idx + 1,
    question: q.question,
    options: q.options,
  }));
}

async function snapshotUser(userId: string) {
  const [u, p] = await Promise.all([
    User.findById(userId).lean(),
    Progress.findOne({ userId }).lean(),
  ]);

  // if leaderboard rank is in a different collection later, swap here
  const allTimeRankSnapshot = 0;

  return {
    userId: new Types.ObjectId(userId),
    usernameSnapshot: u?.username ?? 'Player',
    avatarSnapshot: u?.avatar ?? 'avatar0',
    levelSnapshot: p?.level ?? 1,
    allTimeRankSnapshot,
  };
}

async function createMatch(category: string, userA: string, userB: string) {
  const [playerA, playerB] = await Promise.all([
    snapshotUser(userA),
    snapshotUser(userB),
  ]);

  const questionSet = await pickSharedUnseenQuestions({
    userA,
    userB,
    category,
  });

  const match = await PvPMatch.create({
    category,
    state: 'MATCHED',
    createdAt: new Date(),
    matchmakingExpiresAt: new Date(Date.now() + MATCH_WAIT_MS),
    forfeitWindowSeconds: 60,
    questionSet: questionSet.map((q) => ({
      questionId: q.questionId,
      difficulty: q.difficulty,
      order: q.order,
    })),
    players: [
      {
        ...playerA,
        connected: true,
        lastSeenAt: new Date(),
        currentIndex: 0,
        furthestIndex: 0,
        completed: false,
        answers: [],
      },
      {
        ...playerB,
        connected: true,
        lastSeenAt: new Date(),
        currentIndex: 0,
        furthestIndex: 0,
        completed: false,
        answers: [],
      },
    ],
  });

  return { match, questionSet };
}

function clearDisconnectTimer(userId: string) {
  const t = disconnectTimers.get(userId);
  if (t) clearTimeout(t);
  disconnectTimers.delete(userId);
}

async function forfeitUser(io: Server, matchId: string, userId: string) {
  const match = await PvPMatch.findById(matchId);
  if (!match || match.state === 'FINISHED') return;

  match.state = 'FORFEITED';

  const pA = match.players[0];
  const pB = match.players[1];

  const loser = pA.userId.toString() === userId ? pA : pB;
  const winner = pA.userId.toString() === userId ? pB : pA;

  // mark loser ended
  loser.connected = false;
  loser.endedAt = new Date();
  loser.completed = false;

  // compute rewards + apply
  await applyMatchRewards({
    winnerId: winner.userId.toString(),
    loserId: loser.userId.toString(),
    winnerFurthest: winner.furthestIndex,
    loserFurthest: loser.furthestIndex,
    winnerTimeMs: winner.totalTimeMs ?? null,
    loserTimeMs: loser.totalTimeMs ?? null,
    category: match.category,
    matchId: match._id.toString(),
    reason: 'forfeit',
  });

  match.finishedAt = new Date();
  match.winnerUserId = winner.userId;
  match.finishReason = 'forfeit';

  await match.save();

  io.to(`pvp:${matchId}`).emit('pvp:match_finished', {
    matchId,
    winnerUserId: winner.userId.toString(),
    reason: 'forfeit',
  });
}

async function applyMatchRewards(params: {
  winnerId: string;
  loserId: string;
  winnerFurthest: number;
  loserFurthest: number;
  winnerTimeMs: number | null;
  loserTimeMs: number | null;
  category: string;
  matchId: string;
  reason: 'normal' | 'forfeit';
}) {
  const { winnerId, loserId } = params;

  // points: winner +50
  await Progress.updateOne({ userId: winnerId }, { $inc: { points: 50 } });

  // coins: winner +50, loser +20
  await CoinWallet.updateOne({ userId: winnerId }, { $inc: { coins: 50 } });
  await CoinWallet.updateOne({ userId: loserId }, { $inc: { coins: 20 } });

  // ads counter: both started a session attempt
  await User.updateOne({ _id: winnerId }, { $inc: { sessionsSinceLastAd: 1 } });
  await User.updateOne({ _id: loserId }, { $inc: { sessionsSinceLastAd: 1 } });
}

function computeWinner(match: any) {
  const a = match.players[0];
  const b = match.players[1];

  const furA = a.furthestIndex ?? 0;
  const furB = b.furthestIndex ?? 0;

  if (furA > furB) return a;
  if (furB > furA) return b;

  const tA = a.totalTimeMs ?? Number.MAX_SAFE_INTEGER;
  const tB = b.totalTimeMs ?? Number.MAX_SAFE_INTEGER;

  if (tA < tB) return a;
  if (tB < tA) return b;

  // final deterministic tie-breaker: smaller userId string
  return a.userId.toString() < b.userId.toString() ? a : b;
}

async function updateAccuracyFromMatch(match: any) {
  // accuracy is correctAnswers / totalAnswers in Progress
  for (const p of match.players) {
    const total = p.answers.length;
    const correct = p.answers.filter((x: any) => x.isCorrect).length;

    if (total > 0) {
      await Progress.updateOne(
        { userId: p.userId },
        { $inc: { totalAnswers: total, correctAnswers: correct } },
      );
    }
  }
}

export function registerPvpHandlers(io: Server, socket: Socket) {
  const userId = (socket.data as any).userId as string;

  socket.on('pvp:join_queue', async (payload: { category: string }) => {
    const category = (payload?.category ?? '').trim();
    if (!category) {
      socket.emit('pvp:error', { message: 'Category required' });
      return;
    }

    // already in a match?
    if (liveByUser.has(userId)) {
      socket.emit('pvp:error', { message: 'Already in match' });
      return;
    }

    const list = queueByCategory.get(category) ?? [];

    // try match immediately
    const opponent = list.shift();

    if (opponent) {
      clearTimeout(opponent.timeout);
      queueByCategory.set(category, list);

      try {
        const { match, questionSet } = await createMatch(
          category,
          opponent.userId,
          userId,
        );

        const room = `pvp:${match._id.toString()}`;
        socket.join(room);

        // notify opponent socket
        io.to(opponent.socketId).socketsJoin(room);

        liveByUser.set(userId, {
          matchId: match._id.toString(),
          socketId: socket.id,
        });
        liveByUser.set(opponent.userId, {
          matchId: match._id.toString(),
          socketId: opponent.socketId,
        });

        io.to(room).emit('pvp:matched', {
          matchId: match._id.toString(),
          category,
          timePerQuestion: TIME_PER_QUESTION,
          totalQuestions: TOTAL_Q,
          players: match.players.map((p: any) => ({
            userId: p.userId.toString(),
            username: p.usernameSnapshot,
            avatar: p.avatarSnapshot,
            level: p.levelSnapshot,
            allTimeRank: p.allTimeRankSnapshot,
          })),
        });

        // start immediately (you can add 3s countdown client-side)
        await PvPMatch.updateOne(
          { _id: match._id },
          { $set: { state: 'ACTIVE', startedAt: new Date() } },
        );

        io.to(room).emit('pvp:start', {
          matchId: match._id.toString(),
          questions: questionSet.map((q) => ({
            id: q.questionId.toString(),
            question: q.question,
            options: q.options,
            difficulty: q.difficulty,
            order: q.order,
          })),
          timePerQuestion: TIME_PER_QUESTION,
        });
      } catch (e: any) {
        socket.emit('pvp:error', {
          message: e?.message || 'Match creation failed',
        });
        io.to(opponent.socketId).emit('pvp:error', {
          message: e?.message || 'Match creation failed',
        });
      }

      return;
    }

    // no opponent → enqueue
    const timeout = setTimeout(() => {
      // remove from queue after 60s
      const cur = queueByCategory.get(category) ?? [];
      const next = cur.filter((x) => x.userId !== userId);
      queueByCategory.set(category, next);

      socket.emit('pvp:queue_timeout', {
        category,
        message: 'No matchup yet. Play normal quiz instead.',
      });
    }, MATCH_WAIT_MS);

    list.push({
      userId,
      category,
      enqueuedAt: Date.now(),
      timeout,
      socketId: socket.id,
    } as any);

    queueByCategory.set(category, list);

    socket.emit('pvp:queued', { category, waitSeconds: 60 });
  });

  socket.on('pvp:leave_queue', (payload: { category: string }) => {
    const category = (payload?.category ?? '').trim();
    if (!category) return;

    const list = queueByCategory.get(category) ?? [];
    const idx = list.findIndex((x: any) => x.userId === userId);

    if (idx >= 0) {
      clearTimeout((list[idx] as any).timeout);
      list.splice(idx, 1);
      queueByCategory.set(category, list);
    }

    socket.emit('pvp:queue_left', { category });
  });

  socket.on(
    'pvp:answer',
    async (payload: {
      matchId: string;
      questionId: string;
      selected: number | null;
      index: number; // client index for sanity, server still trusts match doc
      elapsedMs: number; // time spent on that question (client-reported)
    }) => {
      const matchId = payload?.matchId;
      const qId = payload?.questionId;
      const selected = payload?.selected ?? null;

      if (!matchId || !qId) return;

      const match = await PvPMatch.findById(matchId);
      if (!match || match.state === 'FINISHED') return;

      const room = `pvp:${matchId}`;
      socket.join(room);

      // find player
      const player = match.players.find(
        (p: any) => p.userId.toString() === userId,
      );
      if (!player) return;

      // cancel forfeit timer if they came back
      clearDisconnectTimer(userId);
      player.connected = true;
      player.lastSeenAt = new Date();

      // reject if already ended
      if (player.completed || typeof player.failedAtIndex === 'number') return;

      // validate the question order (server-authoritative ordering)
      const expected = match.questionSet[player.currentIndex];
      if (!expected || expected.questionId.toString() !== qId) {
        socket.emit('pvp:error', { message: 'Not current question' });
        return;
      }

      // server checks correctness
      const qq = await QuizQuestion.findById(qId).lean();
      if (!qq) {
        socket.emit('pvp:error', { message: 'Question missing' });
        return;
      }

      const isCorrect = selected !== null && selected === qq.answer;

      player.answers.push({
        questionId: new Types.ObjectId(qId),
        selected,
        isCorrect,
        answeredAt: new Date(),
      });

      if (!player.startedAt) player.startedAt = new Date();

      // wrong or timeout(null) ends that player immediately
      if (!isCorrect || selected === null) {
        player.failedAtIndex = player.currentIndex;
        player.endedAt = new Date();
        player.totalTimeMs = player.startedAt
          ? player.endedAt.getTime() - player.startedAt.getTime()
          : null;

        player.furthestIndex = player.currentIndex; // reached this index then failed
        await match.save();

        io.to(room).emit('pvp:player_update', {
          matchId,
          userId,
          currentIndex: player.currentIndex,
          furthestIndex: player.furthestIndex,
          ended: true,
          failedAtIndex: player.failedAtIndex,
        });
      } else {
        // correct → advance
        player.currentIndex += 1;
        player.furthestIndex = Math.max(
          player.furthestIndex ?? 0,
          player.currentIndex,
        );

        // completed all 10
        if (player.currentIndex >= TOTAL_Q) {
          player.completed = true;
          player.endedAt = new Date();
          player.totalTimeMs = player.startedAt
            ? player.endedAt.getTime() - player.startedAt.getTime()
            : null;
        }

        await match.save();

        io.to(room).emit('pvp:player_update', {
          matchId,
          userId,
          currentIndex: player.currentIndex,
          furthestIndex: player.furthestIndex,
          ended: player.completed,
        });
      }

      // decide match state now
      const aEnded =
        match.players[0].completed ||
        typeof match.players[0].failedAtIndex === 'number';
      const bEnded =
        match.players[1].completed ||
        typeof match.players[1].failedAtIndex === 'number';

      if (aEnded && bEnded) {
        // finish
        await updateAccuracyFromMatch(match);

        const winner = computeWinner(match);
        const loser = match.players.find(
          (p: any) => p.userId.toString() !== winner.userId.toString(),
        )!;

        await applyMatchRewards({
          winnerId: winner.userId.toString(),
          loserId: loser.userId.toString(),
          winnerFurthest: winner.furthestIndex,
          loserFurthest: loser.furthestIndex,
          winnerTimeMs: winner.totalTimeMs ?? null,
          loserTimeMs: loser.totalTimeMs ?? null,
          category: match.category,
          matchId: match._id.toString(),
          reason: 'normal',
        });

        match.state = 'FINISHED';
        match.finishedAt = new Date();
        match.winnerUserId = winner.userId;
        match.finishReason = 'normal';
        await match.save();

        io.to(room).emit('pvp:match_finished', {
          matchId,
          winnerUserId: winner.userId.toString(),
          reason: 'normal',
        });
        return;
      }

      // one ended, other still playing → waiting state
      if ((aEnded && !bEnded) || (!aEnded && bEnded)) {
        match.state = 'WAITING_ON_OPPONENT';
        await match.save();
        io.to(room).emit('pvp:waiting_on_opponent', { matchId });
      }
    },
  );

  socket.on('disconnect', async () => {
    // remove from queue if queued
    for (const [category, list] of queueByCategory.entries()) {
      const idx = list.findIndex((x: any) => x.userId === userId);
      if (idx >= 0) {
        clearTimeout((list[idx] as any).timeout);
        list.splice(idx, 1);
        queueByCategory.set(category, list);
        break;
      }
    }

    const live = liveByUser.get(userId);
    if (!live) return;

    const { matchId } = live;

    // start forfeit timer (60s)
    clearDisconnectTimer(userId);

    const t = setTimeout(() => {
      forfeitUser(io, matchId, userId).catch(() => {});
    }, FORFEIT_MS);

    disconnectTimers.set(userId, t);

    // mark disconnected in DB (best-effort)
    PvPMatch.updateOne(
      { _id: matchId, 'players.userId': new Types.ObjectId(userId) },
      {
        $set: {
          'players.$.connected': false,
          'players.$.disconnectedAt': new Date(),
          'players.$.forfeitAt': new Date(Date.now() + FORFEIT_MS),
        },
      },
    ).catch(() => {});
  });
}
