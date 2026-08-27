/**
 * routes/adminReportRoutes.ts
 * Place at: server/src/routes/adminReportRoutes.ts
 */
import { Router, Response } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import { AuthRequest } from '../middlewares/auth';
import Report from '../models/Report';
import User from '../models/User';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/admin/reports?page=1&limit=25&status=open
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const { status } = req.query as { status?: string };

    const filter: Record<string, any> = {};
    if (status) filter.status = status;

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('reporterId', 'username email')
        .populate('reportedUserId', 'username email isBanned')
        .lean(),
      Report.countDocuments(filter),
    ]);

    return res.json({ reports, total });
  } catch (e) {
    logger.error('Admin reports list failed', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/admin/reports/:id
router.patch('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, banUser, action } = req.body as {
      status?: string;
      banUser?: boolean;
      action?: string;
    };

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    if (status) report.status = status as any;
    if (action) report.action = action;
    report.resolvedBy = (req as any).adminEmail ?? 'admin';
    await report.save();

    if (banUser && report.reportedUserId) {
      await User.findByIdAndUpdate(report.reportedUserId, {
        isBanned: true,
        withdrawalEnabled: false,
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    logger.error('Admin report update failed', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
