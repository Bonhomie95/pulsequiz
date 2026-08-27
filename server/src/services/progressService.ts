import Progress, { ProgressDoc } from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import QuizSession from '../models/QuizSession';
import { getLevelFromPoints } from '../utils/level';
import { isDailyCapExceeded } from './antiCheatService';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { Types } from 'mongoose';

export async function applyQuizResult(params: {
  userId: string;
  sessionId: Types.ObjectId;
  category: string;
  correct: number;
  total: number;
}) {
  const { userId, sessionId, category, correct, total } = params;

  /* ---------------- SCORE ---------------- */
  const basePoints = correct;
  const bonus = correct === total ? 10 : 0;
  const totalPoints = basePoints + bonus;

  /* ---------------- DAILY CAP CHECK ---------------- */
  const sessionCap = await getSetting(SETTINGS_KEYS.DAILY_SESSION_CAP, 20);
  const capExceeded = await isDailyCapExceeded(userId, Number(sessionCap));
  // If cap exceeded, store session with 0 leaderboard points (still records history)
  const leaderboardPoints = capExceeded ? 0 : totalPoints;

  /* ---------------- SESSION HISTORY ---------------- */
  // Written FIRST, and idempotently: the unique (userId, sessionId) index means
  // a retried finish inserts nothing, and we only move Progress when we
  // actually created the row. Otherwise a retry would inflate points without a
  // matching history entry.
  const priorProgress = await Progress.findOne({ userId }).select('level').lean();

  const inserted = await QuizSession.updateOne(
    { userId, sessionId },
    {
      $setOnInsert: {
        userId,
        sessionId,
        category,
        score: basePoints,
        bonus,
        totalPoints: leaderboardPoints, // 0 if daily cap exceeded
        correctAnswers: correct,
        totalQuestions: total,
        levelAtTime: priorProgress?.level ?? 1,
      },
    },
    { upsert: true },
  );

  const isFirstApply = inserted.upsertedCount > 0;

  /* ---------------- PROGRESS ---------------- */
  // Atomic $inc rather than read-modify-write: two sessions finishing at once
  // used to lose one increment entirely.
  const progress = (await Progress.findOneAndUpdate(
    { userId },
    isFirstApply
      ? {
          $inc: {
            points: leaderboardPoints,
            totalQuizzes: 1,
            correctAnswers: correct,
            totalAnswers: total,
          },
        }
      : {},
    { upsert: true, returnDocument: 'after' },
  )) as ProgressDoc;

  if (!progress) throw new Error('Progress missing');

  const prevLevel = priorProgress?.level ?? 1;
  const newLevel = getLevelFromPoints(progress.points);

  if (newLevel !== progress.level) {
    await Progress.updateOne({ userId }, { $set: { level: newLevel } });
    progress.level = newLevel;
  }

  const leveledUp = newLevel > prevLevel;

  const accuracy =
    progress.totalAnswers > 0
      ? Math.round((progress.correctAnswers / progress.totalAnswers) * 100)
      : 0;

  /* ---------------- RETURN ---------------- */
  return {
    pointsAdded: leaderboardPoints,
    actualPoints: totalPoints,
    capExceeded,
    bonus,
    newLevel: progress.level,
    leveledUp,
    totalQuizzes: progress.totalQuizzes,
    accuracy,
  };
}
