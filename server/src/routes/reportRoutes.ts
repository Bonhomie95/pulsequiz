import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { sensitiveActionLimiter } from '../middlewares/rateLimit';
import Report from '../models/Report';

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

export default router;
