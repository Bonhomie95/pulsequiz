/**
 * routes/reportRoutes.ts  (user-facing)
 * Place at: server/src/routes/reportRoutes.ts
 * Register in app.ts:  app.use('/api/reports', reportRoutes);
 */
import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import Report from '../models/Report';

const router = Router();

// POST /api/reports  — submit a report
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { reportedUserId, reason, details } = req.body as {
      reportedUserId: string;
      reason: string;
      details?: string;
    };

    if (!reportedUserId || !reason) {
      return res.status(400).json({ message: 'reportedUserId and reason are required' });
    }

    if (reportedUserId === req.userId) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    // Rate-limit: max 3 open reports per user per 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await Report.countDocuments({
      reporterId: req.userId,
      createdAt:  { $gte: oneDayAgo },
    });
    if (recentCount >= 3) {
      return res.status(429).json({ message: 'You can submit at most 3 reports per day' });
    }

    const doc = new Report({
      reporterId:     req.userId,
      reportedUserId,
      reason:  reason.trim().slice(0, 120),
      details: details ? details.trim().slice(0, 500) : undefined,
    });
    await doc.save();

    return res.status(201).json({ ok: true, id: doc._id });
  } catch (e) {
    console.error('Report create error', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;