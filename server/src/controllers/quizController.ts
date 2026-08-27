import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth';

import { startQuizSession } from '../services/quizService';
import { submitQuizAnswer } from '../services/quizAnswerService';
import { applyQuizResult } from '../services/progressService';
import { useHintService } from '../services/quizHintService';
import { extendQuestionTime } from '../services/quizTimeService';
import { checkUserForCheating } from '../services/antiCheatService';
import { updateChallengeProgress } from '../services/challengeService';
import { grantReferralOnFirstQuiz } from './referralController';
import Tournament from '../models/Tournament';
import { logActivity } from '../utils/activityLogger';
import { logger } from '../utils/logger';

import ActiveQuizSession from '../models/ActiveQuizSession';
import User from '../models/User';
import { isAnswerTooLate } from '../config/quizTiming';

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

  // ⏱ Deadline validation, with the same round-trip grace the service uses.
  // These two checks must agree: this one runs first, so a stricter check here
  // would reject answers the service would have accepted.
  if (isAnswerTooLate(session.questionDeadlineAt)) {
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

  // Claim the scoring. Scoring is a one-shot transition, so a duplicate
  // request (double-tap, retry after a dropped response) can't award twice.
  //
  // The claim is on `resultAppliedAt`, NOT `finished` — the answer handler
  // already sets `finished` the moment a run ends, so by the time the client
  // calls this endpoint the session is normally finished already. Claiming on
  // `finished` would send every real quiz down the "already scored" branch.
  const session = await ActiveQuizSession.findOneAndUpdate(
    { _id: parsed.data.sessionId, userId: req.userId, resultAppliedAt: null },
    { $set: { resultAppliedAt: new Date(), finished: true } },
    { returnDocument: 'after' },
  ).lean();

  if (!session) {
    // Either it doesn't exist, or it was already scored. Replay the stored
    // result instead of erroring, so a retry is harmless.
    const done = await ActiveQuizSession.findOne({
      _id: parsed.data.sessionId,
      userId: req.userId,
    }).lean();

    if (!done) return res.status(404).json({ message: 'Session not found' });

    const already = (done.answers as any[]).filter((a) => a.isCorrect).length;
    return res.json({
      correct: already,
      total: done.questions.length,
      alreadyFinished: true,
    });
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
  updateChallengeProgress({ userId: req.userId, correct, total }).catch((err) =>
    logger.error('Challenge progress update failed', err, { userId: req.userId }),
  );

  // Referral: pay the referrer on the referred player's FIRST completion.
  // Claiming hasCompletedFirstQuiz conditionally makes this fire exactly once.
  (async () => {
    const claimed = await User.findOneAndUpdate(
      { _id: req.userId, hasCompletedFirstQuiz: { $ne: true } },
      { $set: { hasCompletedFirstQuiz: true } },
    );
    if (claimed) await grantReferralOnFirstQuiz(req.userId!);
  })().catch((err) =>
    logger.error('Referral grant failed', err, { userId: req.userId }),
  );

  // NOTE: the leaderboard is NOT rebuilt here. It used to be — three
  // full-collection aggregations inside every quiz-finish request, with a cost
  // that grew with total sessions ever played. The cron refreshes it on a
  // one-minute cadence instead.

  // Anti-cheat: async check (don't block response)
  checkUserForCheating(req.userId).catch((err) =>
    logger.error('Anti-cheat check failed', err, { userId: req.userId }),
  );

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
    ).catch((err) =>
      logger.error('Tournament score update failed', err, {
        tournamentId: String((session as any).tournamentId),
      }),
    );
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
