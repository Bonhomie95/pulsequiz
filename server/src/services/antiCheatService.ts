import FlaggedAccount from '../models/FlaggedAccount';
import QuizSession from '../models/QuizSession';
import User from '../models/User';
import { Types } from 'mongoose';

const ACCURACY_THRESHOLD = 0.98; // flag if >98% across 10+ sessions
const CONSECUTIVE_PERFECT_THRESHOLD = 10;
const FAST_ANSWER_THRESHOLD_MS = 1000; // answers under 1s
const SESSION_VELOCITY_THRESHOLD = 10; // sessions per hour

export async function checkUserForCheating(userId: string) {
  // Get last 20 sessions
  const sessions = await QuizSession.find({ userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  if (sessions.length < 10) return; // not enough data

  // 1. Accuracy check
  const totalCorrect = sessions.reduce((s, q) => s + q.correctAnswers, 0);
  const totalAnswers = sessions.reduce((s, q) => s + q.totalQuestions, 0);
  const accuracyRate = totalAnswers > 0 ? totalCorrect / totalAnswers : 0;

  if (accuracyRate >= ACCURACY_THRESHOLD && sessions.length >= 10) {
    await flagUser(userId, `Suspiciously high accuracy: ${(accuracyRate * 100).toFixed(1)}% over ${sessions.length} sessions`, {
      accuracyRate,
    });
  }

  // 2. Session velocity (sessions per hour in last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentSessions = sessions.filter((s) => new Date(s.createdAt) > oneDayAgo);
  const velocity = recentSessions.length;
  if (velocity > SESSION_VELOCITY_THRESHOLD * 3) {
    await flagUser(userId, `High session velocity: ${velocity} sessions in 24h`, {
      sessionVelocity: velocity,
    });
  }
}

async function flagUser(
  userId: string,
  reason: string,
  meta?: { accuracyRate?: number; sessionVelocity?: number; fastAnswerCount?: number }
) {
  // Don't duplicate flags for the same reason within 24h
  const existing = await FlaggedAccount.findOne({
    userId,
    reason: { $regex: reason.slice(0, 30) },
    flaggedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });
  if (existing) return;

  await FlaggedAccount.create({
    userId,
    reason,
    accuracyRate: meta?.accuracyRate,
    sessionVelocity: meta?.sessionVelocity,
    fastAnswerCount: meta?.fastAnswerCount,
    flaggedAt: new Date(),
    resolved: false,
  });

  console.warn(`🚨 Anti-cheat flag: userId=${userId} reason=${reason}`);
}

/**
 * Check if a user has exceeded the daily session cap for leaderboard purposes.
 * Returns true if cap exceeded (session should not count toward leaderboard).
 */
export async function isDailyCapExceeded(userId: string, cap: number): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await QuizSession.countDocuments({
    userId,
    createdAt: { $gte: startOfDay },
  });

  return count >= cap;
}

/**
 * Validate minimum answer time to prevent bots submitting instantly.
 * Returns true if the answer was submitted too fast (flag it).
 */
export function isTooFast(answeredAt: Date, questionStartedAt: Date): boolean {
  const elapsed = answeredAt.getTime() - questionStartedAt.getTime();
  return elapsed < FAST_ANSWER_THRESHOLD_MS;
}
