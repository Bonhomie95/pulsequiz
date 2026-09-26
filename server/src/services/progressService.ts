import Progress, { ProgressDoc } from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import QuizSession from '../models/QuizSession';
import { getLevelFromPoints } from '../utils/level';
import { isDailyCapExceeded } from './antiCheatService';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { Types } from 'mongoose';
import type { QuizMode } from '../models/ActiveQuizSession';
import { addLeagueXp } from './leagueService';
import { logger } from '../utils/logger';

export async function applyQuizResult(params: {
  userId: string;
  sessionId: Types.ObjectId;
  category: string;
  /** Only classic runs are ranked; every mode earns league XP. */
  mode?: QuizMode;
  correct: number;
  total: number;
  /** Correct answers helped by a coin-bought hint or time extension. They
   *  count for stats but earn no ranking points: ranking decides real-money
   *  prizes, and coins can be bought — purchases must not buy prize chances. */
  assistedCorrect?: number;
  /** Per-answer detail, preserved so a disputed score can be investigated. */
  answers?: {
    questionId: Types.ObjectId;
    selected: number | null;
    isCorrect: boolean;
    answeredAt: Date;
  }[];
}) {
  const { userId, sessionId, category, correct, total, answers = [] } = params;
  const mode = params.mode ?? 'classic';
  const ranked = mode === 'classic';
  const assisted = Math.min(Math.max(0, params.assistedCorrect ?? 0), correct);

  /* ---------------- SCORE ---------------- */
  const basePoints = correct - assisted;
  const bonus = ranked && correct === total && assisted === 0 ? 10 : 0;
  const totalPoints = basePoints + bonus;

  /* ---------------- DAILY CAP CHECK ---------------- */
  const sessionCap = Number(await getSetting(SETTINGS_KEYS.DAILY_SESSION_CAP, 20));
  // Ranked runs share the ranked cap; unranked runs get a looser one of their
  // own, so practice can't farm league XP without limit.
  const capExceeded = ranked
    ? await isDailyCapExceeded(userId, sessionCap)
    : await isDailyCapExceeded(userId, sessionCap * 2, false);
  // If cap exceeded, store session with 0 leaderboard points (still records history)
  const leaderboardPoints = capExceeded || !ranked ? 0 : totalPoints;
  const leagueXp = capExceeded ? 0 : totalPoints;

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
        mode,
        score: basePoints,
        bonus,
        totalPoints: leaderboardPoints, // 0 if daily cap exceeded
        correctAnswers: correct,
        totalQuestions: total,
        levelAtTime: priorProgress?.level ?? 1,
        answers,
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

  if (isFirstApply && leagueXp > 0) {
    await addLeagueXp(userId, leagueXp).catch((err) =>
      logger.error('League XP update failed', err, { userId }),
    );
  }

  const accuracy =
    progress.totalAnswers > 0
      ? Math.round((progress.correctAnswers / progress.totalAnswers) * 100)
      : 0;

  /* ---------------- RETURN ---------------- */
  return {
    pointsAdded: leaderboardPoints,
    leagueXp: isFirstApply ? leagueXp : 0,
    actualPoints: totalPoints,
    capExceeded,
    bonus,
    newLevel: progress.level,
    leveledUp,
    totalQuizzes: progress.totalQuizzes,
    accuracy,
  };
}
