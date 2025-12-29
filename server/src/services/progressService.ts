import Progress, { ProgressDoc } from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import QuizSession from '../models/QuizSession';
import { getLevelFromPoints } from '../utils/level';
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

  /* ---------------- PROGRESS ---------------- */
  const progress = (await Progress.findOne({ userId })) as ProgressDoc;
  if (!progress) throw new Error('Progress missing');
  if (!progress) throw new Error('Progress missing');

  const prevLevel = progress.level;

  progress.points += totalPoints;
  progress.totalQuizzes += 1;
  progress.correctAnswers += correct;
  progress.totalAnswers += total;

  progress.level = getLevelFromPoints(progress.points);

  await progress.save();

  const leveledUp = progress.level > prevLevel;

  const accuracy =
    progress.totalAnswers > 0
      ? Math.round((progress.correctAnswers / progress.totalAnswers) * 100)
      : 0;

  /* ---------------- SESSION HISTORY ---------------- */
  await QuizSession.create({
    userId,
    sessionId,
    category,
    score: basePoints,
    bonus,
    totalPoints,
    correctAnswers: correct,
    totalQuestions: total,
    levelAtTime: progress.level,
  });

  /* ---------------- COIN REWARD ---------------- */
  const coinReward = 20 + progress.level * 5;
  await CoinWallet.updateOne({ userId }, { $inc: { coins: coinReward } });

  /* ---------------- RETURN ---------------- */
  return {
    pointsAdded: totalPoints,
    bonus,
    newLevel: progress.level,
    leveledUp,
    totalQuizzes: progress.totalQuizzes,
    accuracy,
    coinReward,
  };
}
