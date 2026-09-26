import mongoose from 'mongoose';
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

import ActiveQuizSession, { QUIZ_MODES } from '../models/ActiveQuizSession';
import QuizQuestion from '../models/QuizQuestion';
import {
  claimDailyAttempt,
  getOrCreateDaily,
  isPlayableDate,
  recordDailyResult,
  releaseDailyAttempt,
} from '../services/dailyService';
import {
  claimDuelSeat,
  DUEL_CODE_RE,
  DuelError,
  recordDuelResult,
  releaseDuelSeat,
} from '../services/duelService';
import User from '../models/User';
import { isAnswerTooLate } from '../config/quizTiming';

/* -------------------------------------------------------------------------- */
/*                                   SCHEMAS                                  */
/* -------------------------------------------------------------------------- */

const StartSchema = z.object({
  category: z.string().min(2).optional(),
  tournamentId: z.string().optional(),
  mode: z.enum(QUIZ_MODES as [string, ...string[]]).default('classic'),
  /** daily: the player's local date, YYYY-MM-DD */
  date: z.string().optional(),
  /** duel: the six-character code */
  duelCode: z.string().optional(),
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
    return res.status(400).json({ message: 'Invalid quiz request' });
  }
  const { tournamentId, date } = parsed.data;
  const userId = req.userId;
  // Tournaments are scored on ranked runs only.
  const mode = tournamentId ? 'classic' : (parsed.data.mode as (typeof QUIZ_MODES)[number]);

  if (mode === 'daily') {
    if (!date || !isPlayableDate(date)) {
      return res.status(400).json({ message: 'Invalid date for the daily quiz' });
    }
    const daily = await getOrCreateDaily(date);
    if (!(await claimDailyAttempt(userId, date))) {
      return res.status(409).json({ message: "You've already played today's quiz. Come back tomorrow!" });
    }
    try {
      return res.json(
        await startQuizSession({ userId, category: 'daily', mode, fixed: daily.questions, dailyDate: date }),
      );
    } catch (err) {
      await releaseDailyAttempt(userId, date);
      throw err;
    }
  }

  if (mode === 'duel') {
    const code = String(parsed.data.duelCode ?? '').trim().toUpperCase();
    if (!DUEL_CODE_RE.test(code)) {
      return res.status(400).json({ message: 'Enter a valid 6-character code' });
    }
    let seat;
    try {
      seat = await claimDuelSeat(userId, code);
    } catch (err) {
      if (err instanceof DuelError) return res.status(err.status).json({ message: err.message });
      throw err;
    }
    try {
      return res.json(
        await startQuizSession({ userId, category: seat.category, mode, fixed: seat.questions, duelCode: code }),
      );
    } catch (err) {
      await releaseDuelSeat(userId, code);
      throw err;
    }
  }

  if (!parsed.data.category) {
    return res.status(400).json({ message: 'Category required' });
  }

  const data = await startQuizSession({
    userId,
    category: parsed.data.category.trim().toLowerCase(),
    tournamentId,
    mode,
  });

  return res.json(data);
}

/**
 * GET /api/quiz/guest — five easy questions to try before signing up.
 *
 * Answers are included: nothing is scored or stored, so there is nothing to
 * protect, and it lets the whole taster run offline once loaded.
 */
export async function guest(_req: AuthRequest, res: Response) {
  const qs = await QuizQuestion.aggregate([
    { $match: { difficulty: 'easy', disabled: { $ne: true }, category: { $ne: 'math' } } },
    { $sample: { size: 5 } },
    { $project: { question: 1, options: 1, answer: 1, explanation: 1, category: 1 } },
  ]);
  return res.json({
    questions: qs.map((q) => ({
      id: String(q._id),
      category: q.category,
      question: q.question,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation ?? null,
    })),
  });
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

  // Already answered takes priority over "not current".
  //
  // Once an answer lands the server advances currentQuestionId, so a client
  // retrying because it never saw the response was told "Not current question"
  // (400) rather than "Already answered" (409). That is the wrong signal: 400
  // reads as a bad request the client should not repeat, so the retry path
  // gave up and the run stalled on a question the server had moved past.
  if ((session.answers as any[]).some((a) => a.questionId.toString() === questionId)) {
    return res.status(409).json({ message: 'Already answered' });
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
/*                                    STATE                                   */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/quiz/state/:sessionId
 *
 * Where the run actually is, according to the server.
 *
 * Needed because an answer can succeed while its response is lost — a dropped
 * connection, a backgrounded app, a timeout. The client then retries, gets 409
 * "Already answered", and previously had nowhere to go: it stayed locked on a
 * question the server had already moved past, and the run was stuck until the
 * app was killed. With this it can resynchronise instead.
 */
export async function state(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const sessionId = req.params.sessionId;
  if (!mongoose.isValidObjectId(sessionId)) {
    return res.status(400).json({ message: 'Invalid session id' });
  }

  const session = await ActiveQuizSession.findOne({
    _id: sessionId,
    userId: req.userId,
  }).lean();

  if (!session) return res.status(404).json({ message: 'Session not found' });

  const answered = (session.answers as any[]) ?? [];

  return res.json({
    sessionId: String(session._id),
    finished: !!session.finished,
    scored: !!session.resultAppliedAt,
    currentIndex: session.currentIndex ?? answered.length,
    currentQuestionId: session.currentQuestionId
      ? String(session.currentQuestionId)
      : null,
    // Absolute, so the client can rebuild its countdown without trusting its
    // own elapsed-time bookkeeping.
    deadlineAt: session.questionDeadlineAt ?? null,
    answeredCount: answered.length,
    correctCount: answered.filter((a) => a.isCorrect).length,
    totalQuestions: (session.questions as any[]).length,
  });
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
      mode: done.mode ?? 'classic',
      correct: already,
      total: done.questions.length,
      dailyDate: done.dailyDate ?? undefined,
      duelCode: done.duelCode ?? undefined,
      alreadyFinished: true,
    });
  }

  const correct = (session.answers as any[]).filter((a) => a.isCorrect).length;
  const total = session.questions.length;

  const assistedIds = new Set(
    [...(session.hintedQuestions ?? []), ...(session.timeExtendedQuestions ?? [])].map(String),
  );
  const assistedCorrect = (session.answers as any[]).filter(
    (a) => a.isCorrect && assistedIds.has(String(a.questionId)),
  ).length;

  const mode = session.mode ?? 'classic';
  const result = await applyQuizResult({
    userId: req.userId,
    sessionId: session._id,
    category: session.category,
    mode,
    correct,
    total,
    assistedCorrect,
    // Copied out before the TTL index removes the active session.
    answers: (session.answers as any[]).map((a) => ({
      questionId: a.questionId,
      selected: a.selected ?? null,
      isCorrect: !!a.isCorrect,
      answeredAt: a.answeredAt,
    })),
  });

  // Per question, in order — the daily share grid and the duel comparison.
  const byQuestion = new Map(
    (session.answers as any[]).map((a) => [String(a.questionId), !!a.isCorrect]),
  );
  const results = session.questions.map((q: any) => byQuestion.get(String(q.questionId)) ?? false);
  const shared = { correct, total, results, timeLeftMs: session.timeLeftMs ?? 0 };

  let dailyCoins = 0;
  if (mode === 'daily' && session.dailyDate) {
    ({ coinsAwarded: dailyCoins } = await recordDailyResult(
      req.userId,
      session.dailyDate,
      shared,
    ));
  }
  if (mode === 'duel' && session.duelCode) {
    await recordDuelResult(req.userId, session.duelCode, shared);
  }

  await logActivity(req.userId, 'QUIZ_FINISH', {
    score: correct,
    coinsEarned: result.pointsAdded,
  });

  // 📺 Track sessions for interstitial ads (every 3 sessions)
  await User.updateOne(
    { _id: req.userId },
    { $inc: { sessionsSinceLastAd: 1 } },
  );

  // A quiz started and "finished" with no answers is not played — it must not
  // advance challenges or trigger the referral payout (both were farmable).
  const played = (session.answers as any[]).length > 0;

  // Track challenge progress (async, non-blocking)
  if (played) updateChallengeProgress({ userId: req.userId, correct, total }).catch((err) =>
    logger.error('Challenge progress update failed', err, { userId: req.userId }),
  );

  // Referral: pay the referrer on the referred player's FIRST completion.
  // Claiming hasCompletedFirstQuiz conditionally makes this fire exactly once.
  if (played) (async () => {
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
    mode,
    correct,
    total,
    results,
    leagueXp: result.leagueXp,
    dailyDate: session.dailyDate ?? undefined,
    duelCode: session.duelCode ?? undefined,
    dailyCoins: dailyCoins || undefined,
    assisted: assistedCorrect,
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
