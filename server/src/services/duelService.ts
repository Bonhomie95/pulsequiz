/**
 * Async friend duels: the creator plays ten questions, shares a code, and one
 * friend plays the same ten whenever they like. No stakes — league XP only.
 */
import crypto from 'crypto';

import Duel from '../models/Duel';
import User from '../models/User';
import QuizQuestion from '../models/QuizQuestion';
import { sampleQuestionSet } from './quizService';
import { sendDuelFinished } from './notificationService';
import { logger } from '../utils/logger';

const DUEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// No 0/O/1/I — codes get read aloud and typed by hand.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DUEL_CODE_RE = /^[A-Z2-9]{6}$/;

function newCode(): string {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export class DuelError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function createDuel(userId: string, category: string) {
  const exists = await QuizQuestion.exists({ category, disabled: { $ne: true } });
  if (!exists) throw new DuelError(400, 'That category has no questions yet.');

  const questions = await sampleQuestionSet(category);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const duel = await Duel.create({
        code: newCode(),
        creatorId: userId,
        category,
        questions,
        players: [],
        expiresAt: new Date(Date.now() + DUEL_TTL_MS),
      });
      return { code: duel.code, category, expiresAt: duel.expiresAt };
    } catch (err: any) {
      if (err?.code !== 11000) throw err; // code collision — try another
    }
  }
  throw new DuelError(503, 'Could not create a challenge. Try again.');
}

/**
 * Take this player's one seat in the duel. The creator always has a seat; one
 * other player may join. Returns the fixed question set to play.
 */
export async function claimDuelSeat(userId: string, code: string) {
  const duel = await Duel.findOne({ code }).lean();
  if (!duel) throw new DuelError(404, 'Challenge not found. Check the code.');
  if (duel.expiresAt.getTime() < Date.now()) {
    throw new DuelError(410, 'This challenge has expired.');
  }

  const isCreator = String(duel.creatorId) === String(userId);
  const filter: Record<string, unknown> = {
    _id: duel._id,
    'players.userId': { $ne: userId },
  };
  if (!isCreator) {
    // Nobody other than the creator has joined yet.
    filter.players = { $not: { $elemMatch: { userId: { $ne: duel.creatorId } } } };
  }

  const claimed = await Duel.findOneAndUpdate(
    filter,
    { $push: { players: { userId, status: 'playing' } } },
    { returnDocument: 'after' },
  ).lean();

  if (!claimed) {
    const mine = duel.players.some((p) => String(p.userId) === String(userId));
    throw new DuelError(
      409,
      mine ? "You've already played this challenge." : 'Someone else already took this challenge.',
    );
  }

  return { category: duel.category, questions: duel.questions };
}

export async function releaseDuelSeat(userId: string, code: string) {
  await Duel.updateOne(
    { code },
    { $pull: { players: { userId, status: 'playing' } } },
  );
}

export async function recordDuelResult(
  userId: string,
  code: string,
  r: { correct: number; total: number; results: boolean[]; timeLeftMs: number },
) {
  const duel = await Duel.findOneAndUpdate(
    { code, players: { $elemMatch: { userId, status: 'playing' } } },
    {
      $set: {
        'players.$.status': 'done',
        'players.$.correct': r.correct,
        'players.$.total': r.total,
        'players.$.results': r.results,
        'players.$.timeLeftMs': r.timeLeftMs,
        'players.$.finishedAt': new Date(),
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!duel) return;

  // Tell the other side their friend has played.
  const other = duel.players.find(
    (p) => String(p.userId) !== String(userId) && p.status === 'done',
  );
  if (other) {
    const me = await User.findById(userId).select('username').lean();
    sendDuelFinished(String(other.userId), me?.username ?? 'Your friend', code).catch((err) =>
      logger.error('Duel push failed', err, { code }),
    );
  }
}

export async function getDuel(code: string, viewerId: string) {
  const duel = await Duel.findOne({ code }).lean();
  if (!duel) throw new DuelError(404, 'Challenge not found. Check the code.');

  const ids = [duel.creatorId, ...duel.players.map((p) => p.userId)];
  const users = await User.find({ _id: { $in: ids } }).select('username avatar').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const viewerPlayed = duel.players.some(
    (p) => String(p.userId) === String(viewerId) && p.status === 'done',
  );

  const players = duel.players.map((p) => {
    const u = byId.get(String(p.userId));
    const done = p.status === 'done';
    return {
      userId: String(p.userId),
      username: u?.username ?? 'Player',
      avatar: u?.avatar ?? '',
      isMe: String(p.userId) === String(viewerId),
      status: p.status,
      // Scores stay hidden until you've played, so nobody plays to a target.
      correct: done && viewerPlayed ? p.correct : null,
      total: p.total || duel.questions.length,
      results: done && viewerPlayed ? p.results : [],
      timeLeftMs: done && viewerPlayed ? p.timeLeftMs : null,
    };
  });

  const done = players.filter((p) => p.status === 'done' && p.correct !== null);
  let winnerId: string | null = null;
  if (done.length === 2) {
    const [a, b] = done;
    if (a.correct! !== b.correct!) winnerId = a.correct! > b.correct! ? a.userId : b.userId;
    else if (a.timeLeftMs! !== b.timeLeftMs!) {
      winnerId = a.timeLeftMs! > b.timeLeftMs! ? a.userId : b.userId;
    }
  }

  const creator = byId.get(String(duel.creatorId));
  return {
    code: duel.code,
    category: duel.category,
    totalQuestions: duel.questions.length,
    expiresAt: duel.expiresAt,
    expired: duel.expiresAt.getTime() < Date.now(),
    creator: { userId: String(duel.creatorId), username: creator?.username ?? 'Player' },
    isCreator: String(duel.creatorId) === String(viewerId),
    canPlay:
      duel.expiresAt.getTime() >= Date.now() &&
      !duel.players.some((p) => String(p.userId) === String(viewerId)) &&
      (String(duel.creatorId) === String(viewerId) ||
        !duel.players.some((p) => String(p.userId) !== String(duel.creatorId))),
    players,
    complete: done.length === 2,
    winnerId,
  };
}

export async function listMyDuels(userId: string) {
  const duels = await Duel.find({ $or: [{ creatorId: userId }, { 'players.userId': userId }] })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('code category creatorId players expiresAt createdAt')
    .lean();

  const ids = new Set<string>();
  duels.forEach((d) => {
    ids.add(String(d.creatorId));
    d.players.forEach((p) => ids.add(String(p.userId)));
  });
  const users = await User.find({ _id: { $in: [...ids] } }).select('username').lean();
  const name = new Map(users.map((u) => [String(u._id), u.username ?? 'Player']));

  return duels.map((d) => {
    const me = d.players.find((p) => String(p.userId) === String(userId));
    const them = d.players.find((p) => String(p.userId) !== String(userId));
    const opponentId = them ? String(them.userId) : String(d.creatorId) !== String(userId) ? String(d.creatorId) : null;
    return {
      code: d.code,
      category: d.category,
      createdAt: (d as any).createdAt,
      expired: d.expiresAt.getTime() < Date.now(),
      opponent: opponentId ? name.get(opponentId) ?? 'Player' : null,
      myStatus: me?.status ?? 'not_played',
      theirStatus: them?.status ?? 'waiting',
      myScore: me?.status === 'done' ? me.correct : null,
      theirScore: me?.status === 'done' && them?.status === 'done' ? them.correct : null,
    };
  });
}
