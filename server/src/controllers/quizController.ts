import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth';

import { startQuizSession } from '../services/quizService';
import { submitQuizAnswer } from '../services/quizAnswerService';
import { applyQuizResult } from '../services/progressService';
import { rebuildLeaderboardSnapshots } from '../services/leaderboardService';
import { useHintService } from '../services/quizHintService';
import { extendQuestionTime } from '../services/quizTimeService';

import ActiveQuizSession from '../models/ActiveQuizSession';
import User from '../models/User';

/* -------------------------------------------------------------------------- */
/*                                   SCHEMAS                                  */
/* -------------------------------------------------------------------------- */

const StartSchema = z.object({
  category: z.string().min(2),
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
    category: parsed.data.category,
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
  const data = await submitQuizAnswer({
    userId: req.userId,
    sessionId,
    questionId,
    selected,
  });

  return res.json(data);
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

  const correct = session.answers.filter((a) => a.isCorrect).length;
  const total = session.questions.length;

  const result = await applyQuizResult({
    userId: req.userId,
    sessionId: session._id,
    category: session.category,
    correct,
    total,
  });

  // 📺 Track sessions for interstitial ads (every 3 sessions)
  await User.updateOne(
    { _id: req.userId },
    { $inc: { sessionsSinceLastAd: 1 } }
  );

  await rebuildLeaderboardSnapshots();

  return res.json({
    correct,
    total,
    points: result.pointsAdded,
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
