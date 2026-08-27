import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { sensitiveActionLimiter } from '../middlewares/rateLimit';
import Report from '../models/Report';
import QuizQuestion from '../models/QuizQuestion';
import { logger } from '../utils/logger';

const router = Router();

const ReportSchema = z.object({
  reportedUserId: z.string().refine(mongoose.isValidObjectId, 'Invalid user id'),
  reason: z.string().trim().min(1).max(120),
  details: z.string().trim().max(500).optional(),
});

// POST /api/reports — submit a report
router.post(
  '/',
  requireAuth,
  sensitiveActionLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = ReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: 'reportedUserId and reason are required' });
      }
      const { reportedUserId, reason, details } = parsed.data;

      if (reportedUserId === req.userId) {
        return res.status(400).json({ message: 'You cannot report yourself' });
      }

      // Max 3 reports per user per 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await Report.countDocuments({
        reporterId: req.userId,
        createdAt: { $gte: oneDayAgo },
      });
      if (recentCount >= 3) {
        return res
          .status(429)
          .json({ message: 'You can submit at most 3 reports per day' });
      }

      const doc = await Report.create({
        reporterId: req.userId,
        reportedUserId,
        reason,
        details: details || undefined,
      });

      return res.status(201).json({ ok: true, id: doc._id });
    } catch (e) {
      console.error('Report create error', e);
      return res.status(500).json({ message: 'Server error' });
    }
  },
);

/**
 * POST /api/reports/question — "this question is wrong or unclear"
 *
 * The Report model existed but there was no way for a player to flag a bad
 * question, so a wrong answer key could sit in rotation indefinitely, costing
 * players runs and leaderboard points.
 *
 * Reports accumulate on the question; past a threshold it is pulled from
 * rotation automatically and queued for review, because a question that
 * multiple players independently call wrong probably is.
 */
const AUTO_DISABLE_REPORTS = Number(process.env.QUESTION_AUTO_DISABLE_REPORTS || 5);

const QuestionReportSchema = z.object({
  questionId: z.string().refine(mongoose.isValidObjectId, 'Invalid question id'),
  reason: z.enum(['wrong_answer', 'unclear', 'typo', 'outdated', 'offensive', 'other']),
  details: z.string().trim().max(500).optional(),
});

router.post(
  '/question',
  requireAuth,
  sensitiveActionLimiter,
  async (req: AuthRequest, res: Response) => {
    const parsed = QuestionReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'A question and a reason are required' });
    }

    const { questionId, reason, details } = parsed.data;

    const question = await QuizQuestion.findByIdAndUpdate(
      questionId,
      { $inc: { reportCount: 1 } },
      { returnDocument: 'after' },
    );
    if (!question) return res.status(404).json({ message: 'Question not found' });

    // Auto-pull from rotation once enough players agree.
    if (question.reportCount >= AUTO_DISABLE_REPORTS && !question.disabled) {
      await QuizQuestion.updateOne({ _id: questionId }, { $set: { disabled: true } });
      logger.warn('Question auto-disabled after repeated reports', {
        questionId,
        reportCount: question.reportCount,
      });
    }

    logger.info('Question reported', { questionId, reason, userId: req.userId });

    return res.json({
      ok: true,
      message: "Thanks — we'll review this question.",
    });
  },
);

export default router;
