/**
 * The Daily Quiz: the same ten questions for everyone on a given date, one
 * attempt each, and a shareable result grid.
 *
 * The date is the player's LOCAL calendar date (like Wordle), so the puzzle
 * turns over at their midnight. Players on the same date share a puzzle and a
 * board. Unranked on the prize leaderboard — a shared answer key would make it
 * trivially cheatable — but it earns league XP.
 */
import { DailyAttempt, DailyQuiz } from '../models/DailyQuiz';
import User from '../models/User';
import { sampleQuestionSet } from './quizService';

/** Day #1 of the daily puzzle, for the "PulseQuiz Daily #123" share line. */
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function utcDateKey(at: Date = new Date()) {
  return at.toISOString().slice(0, 10);
}

/**
 * Accept the client's local date only if some timezone on Earth is on it
 * right now (UTC-12 … UTC+14), so nobody can open tomorrow's puzzle early.
 */
export function isPlayableDate(date: string, now: Date = new Date()): boolean {
  if (!DATE_RE.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  const earliest = utcDateKey(new Date(now.getTime() - 12 * 60 * 60 * 1000));
  const latest = utcDateKey(new Date(now.getTime() + 14 * 60 * 60 * 1000));
  return date >= earliest && date <= latest;
}

export function dailyNumber(date: string): number {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - EPOCH) / DAY_MS) + 1;
}

export async function getOrCreateDaily(date: string) {
  const existing = await DailyQuiz.findOne({ date }).lean();
  if (existing) return existing;

  const questions = await sampleQuestionSet();
  if (!questions.length) throw new Error('No questions available for the daily quiz.');

  try {
    return (await DailyQuiz.create({ date, questions })).toObject();
  } catch (err: any) {
    // Two players opened the day at once — the other one's puzzle wins.
    if (err?.code === 11000) return (await DailyQuiz.findOne({ date }).lean())!;
    throw err;
  }
}

/**
 * Claim today's single attempt. Returns false if it was already used.
 */
export async function claimDailyAttempt(userId: string, date: string): Promise<boolean> {
  try {
    await DailyAttempt.create({ userId, date });
    return true;
  } catch (err: any) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

export async function releaseDailyAttempt(userId: string, date: string) {
  await DailyAttempt.deleteOne({ userId, date, finishedAt: null });
}

export async function recordDailyResult(
  userId: string,
  date: string,
  r: { correct: number; total: number; results: boolean[]; timeLeftMs: number },
) {
  await DailyAttempt.updateOne(
    { userId, date, finishedAt: null },
    { $set: { ...r, finishedAt: new Date() } },
  );
}

export async function getDailyView(userId: string, date: string) {
  const [attempt, puzzle] = await Promise.all([
    DailyAttempt.findOne({ userId, date }).lean(),
    DailyQuiz.findOne({ date }).select('questions').lean(),
  ]);

  const finished = { date, finishedAt: { $ne: null } };
  const [players, topRows] = await Promise.all([
    DailyAttempt.countDocuments(finished),
    DailyAttempt.find(finished)
      .sort({ correct: -1, timeLeftMs: -1, finishedAt: 1 })
      .limit(10)
      .select('userId correct total timeLeftMs')
      .lean(),
  ]);

  const users = await User.find({
    _id: { $in: topRows.map((r) => r.userId) },
    isBanned: { $ne: true },
    deletedAt: null,
  })
    .select('username avatar')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  let myRank: number | null = null;
  if (attempt?.finishedAt) {
    const ahead = await DailyAttempt.countDocuments({
      ...finished,
      $or: [
        { correct: { $gt: attempt.correct } },
        { correct: attempt.correct, timeLeftMs: { $gt: attempt.timeLeftMs } },
      ],
    });
    myRank = ahead + 1;
  }

  return {
    date,
    number: dailyNumber(date),
    totalQuestions: puzzle?.questions.length ?? 10,
    played: !!attempt,
    finished: !!attempt?.finishedAt,
    result: attempt?.finishedAt
      ? {
          correct: attempt.correct,
          total: attempt.total,
          results: attempt.results,
          timeLeftMs: attempt.timeLeftMs,
        }
      : null,
    myRank,
    players,
    top: topRows
      .filter((r) => byId.has(String(r.userId)))
      .map((r, i) => ({
        rank: i + 1,
        userId: String(r.userId),
        username: byId.get(String(r.userId))!.username ?? 'Player',
        avatar: byId.get(String(r.userId))!.avatar ?? '',
        correct: r.correct,
        total: r.total,
        isMe: String(r.userId) === String(userId),
      })),
  };
}
