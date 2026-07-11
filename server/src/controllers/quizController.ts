import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth';

import { startQuizSession } from '../services/quizService';
import { submitQuizAnswer } from '../services/quizAnswerService';
import { applyQuizResult } from '../services/progressService';
import { rebuildLeaderboardSnapshots } from '../services/leaderboardService';
import { useHintService } from '../services/quizHintService';
import { extendQuestionTime } from '../services/quizTimeService';
import { checkUserForCheating } from '../services/antiCheatService';
import { updateChallengeProgress } from '../services/challengeService';
import Referral from '../models/Referral';
import Tournament from '../models/Tournament';
import { creditCoins } from '../services/coinService';
import { logActivity } from '../utils/activityLogger';

import ActiveQuizSession from '../models/ActiveQuizSession';
import User from '../models/User';

/* -------------------------------------------------------------------------- */
/*                                   SCHEMAS                                  */
/* -------------------------------------------------------------------------- */

const StartSchema = z.object({
  category: z.string().min(2),
  tournamentId: z.string().optional(),
});

const AnswerSchema = z.object({
  sessionId: z.string().min(8),
  questionId: z.string().min(8),
  selected: z.number().min(0).max(3).nullable(),
});

const FinishSchema = z.object({
  sessionId: z.string().min(8),
});

const HintSchema = z.object({
  sessionId: z.string().min(8),
  questionId: z.string().min(8),
});

const ExtendTimeSchema = z.object({
  sessionId: z.string().min(8),
  questionId: z.string().min(8),
});

/* -------------------------------------------------------------------------- */
/*                                   START                                    */
/* -------------------------------------------------------------------------- */

export async function start(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = StartSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Category required' });
  }

  const data = await startQuizSession({
    userId: req.userId,
    category: parsed.data.category.trim().toLowerCase(),
    tournamentId: parsed.data.tournamentId,
  });

  return res.json(data);
}

/* -------------------------------------------------------------------------- */
/*                                   ANSWER                                   */
/* -------------------------------------------------------------------------- */

export async function answer(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = AnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const { sessionId, questionId, selected } = parsed.data;

  // 🔒 HARD TIME CHECK (SERVER IS SOURCE OF TRUTH)
  const session = await ActiveQuizSession.findOne({
    _id: sessionId,
    userId: req.userId,
    finished: false,
  });

  if (!session) {
    return res.status(404).json({ message: 'Session not found' });
  }

  // Validate current question
  if (
    !session.currentQuestionId ||
    session.currentQuestionId.toString() !== questionId
  ) {
    return res.status(400).json({ message: 'Not current question' });
  }

  // ⏱ Deadline validation
  if (
    session.questionDeadlineAt &&
    Date.now() > new Date(session.questionDeadlineAt).getTime()
  ) {
    return res.status(400).json({ message: 'answer too late' });
  }

  // Delegate correctness + progression to service
  try {
    const data = await submitQuizAnswer({
      userId: req.userId,
      sessionId,
      questionId,
      selected,
    });
    return res.json(data);
  } catch (err: any) {
    // VersionError = a concurrent submit for the same session already won the
    // race (optimistic concurrency). Treat as a duplicate, not a server error.
    if (err?.name === 'VersionError' || err?.message === 'Already answered') {
      return res.status(409).json({ message: 'Already answered' });
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*                                   FINISH                                   */
/* -------------------------------------------------------------------------- */

export async function finish(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = FinishSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const session = await ActiveQuizSession.findOne({
    _id: parsed.data.sessionId,
    userId: req.userId,
  }).lean();

  if (!session) {
    return res.status(404).json({ message: 'Session not found' });
  }

  const correct = (session.answers as any[]).filter((a) => a.isCorrect).length;
  const total = session.questions.length;

  const result = await applyQuizResult({
    userId: req.userId,
    sessionId: session._id,
    category: session.category,
    correct,
    total,
  });

  await logActivity(req.userId, 'QUIZ_FINISH', {
    score: correct,
    coinsEarned: result.pointsAdded,
  });

  // 📺 Track sessions for interstitial ads (every 3 sessions)
  await User.updateOne(
    { _id: req.userId },
    { $inc: { sessionsSinceLastAd: 1 } },
  );

  // Track challenge progress (async, non-blocking)
  updateChallengeProgress({ userId: req.userId, correct, total }).catch(console.error);

  // Referral: reward referrer on referred user's FIRST quiz completion
  (async () => {
    try {
      const u = await User.findOne({ _id: req.userId, hasCompletedFirstQuiz: false }).lean();
      if (u) {
        await User.updateOne({ _id: req.userId }, { hasCompletedFirstQuiz: true });
        const ref = await Referral.findOne({ referredId: req.userId, rewardGranted: false });
        if (ref) {
          ref.rewardGranted = true;
          await ref.save();
          await creditCoins(ref.referrerId.toString(), ref.rewardCoins, 'referral_bonus', {
            note: `referral_firstquiz:${req.userId}`,
          });
        }
      }
    } catch { /* non-critical */ }
  })();

  await rebuildLeaderboardSnapshots();

  // Anti-cheat: async check (don't block response)
  checkUserForCheating(req.userId).catch(console.error);

  // Tournament score submission: if session has tournamentId, update participant score
  if ((session as any).tournamentId) {
    Tournament.findOneAndUpdate(
      {
        _id: (session as any).tournamentId,
        status: 'active',
        'participants.userId': req.userId,
      },
      {
        $inc: { 'participants.$.score': correct },
      }
    ).catch(console.error);
  }

  return res.json({
    correct,
    total,
    points: result.pointsAdded,
    actualPoints: result.actualPoints,
    capExceeded: result.capExceeded,
    level: result.newLevel,
    accuracy: result.accuracy,
    leveledUp: result.leveledUp,
  });
}

/* -------------------------------------------------------------------------- */
/*                                    HINT                                    */
/* -------------------------------------------------------------------------- */

export async function hint(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = HintSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const data = await useHintService({
    userId: req.userId,
    sessionId: parsed.data.sessionId,
    questionId: parsed.data.questionId,
  });

  return res.json(data);
}

/* -------------------------------------------------------------------------- */
/*                               EXTEND TIME                                  */
/* -------------------------------------------------------------------------- */

export async function extendTime(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = ExtendTimeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const data = await extendQuestionTime({
    userId: req.userId,
    sessionId: parsed.data.sessionId,
    questionId: parsed.data.questionId,
  });

  return res.json(data);
}
