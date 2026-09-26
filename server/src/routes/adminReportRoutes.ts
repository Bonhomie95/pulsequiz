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
import { auditAdmin } from '../utils/adminAudit';
import { kickUser } from '../socket/kick';

const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;

const router = Router();

// GET /api/admin/reports?page=1&limit=25&status=open
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const status = req.query.status;

    const filter: Record<string, unknown> = {};
    if (typeof status === 'string' && (REPORT_STATUSES as readonly string[]).includes(status)) {
      filter.status = status;
    }

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

    if (status !== undefined && !(REPORT_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    if (action !== undefined && (typeof action !== 'string' || action.length > 500)) {
      return res.status(400).json({ message: 'Invalid action note' });
    }

    const before = { status: report.status };
    if (status) report.status = status as (typeof REPORT_STATUSES)[number];
    if (action) report.action = action;
    report.resolvedBy = (req as { adminEmail?: string }).adminEmail ?? 'admin';
    await report.save();

    if (banUser === true && report.reportedUserId) {
      // Same effect as the Users page ban: revoke every session immediately.
      await User.updateOne(
        { _id: report.reportedUserId },
        { $set: { isBanned: true, withdrawalEnabled: false }, $inc: { tokenVersion: 1 } },
      );
      kickUser(String(report.reportedUserId));
    }

    await auditAdmin(req, banUser === true ? 'report.resolve_ban' : 'report.update', {
      targetType: 'report',
      targetId: String(req.params.id),
      before,
      after: { status: report.status, banUser: banUser === true },
    });

    return res.json({ ok: true });
  } catch (e) {
    logger.error('Admin report update failed', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
