import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizSession from '../models/QuizSession';
import { Types } from 'mongoose';
import dayjs from 'dayjs';
import { getLevelFromPoints } from '../utils/level';

export async function applyQuizResult(params: {
  userId: string;
  category: string;
  correct: number;
  total: number;
}) {
  const { userId, category, correct, total } = params;

  const basePoints = correct;
  const bonus = correct === total ? 10 : 0;
  const totalPoints = basePoints + bonus;

  // Save quiz session
  await QuizSession.create({
    userId,
    category,
    score: basePoints,
    bonus,
    totalPoints,
    correctAnswers: correct,
    totalQuestions: total,
  });

  // Update progress
  const progress = await Progress.findOne({ userId });
  if (!progress) throw new Error('Progress missing');

  progress.points += totalPoints;
  progress.level = getLevelFromPoints(progress.points);
  await progress.save();

  // Coin reward (based on level)
  const coinReward = 20 + progress.level * 5;
  await CoinWallet.updateOne(
    { userId },
    { $inc: { coins: coinReward } }
  );

  return {
    pointsAdded: totalPoints,
    bonus,
    newLevel: progress.level,
    coinReward,
  };
}
