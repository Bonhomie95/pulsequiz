import { Router, Request, Response } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import AdminAuditLog from '../models/AdminAuditLog';

const router = Router();

router.use(requireAdmin, requireSuperAdmin);

/** GET /api/admin/audit?action=&adminId=&page=&limit= */
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 50);

  const filter: Record<string, unknown> = {};
  if (typeof req.query.action === 'string' && req.query.action) {
    filter.action = req.query.action;
  }
  if (typeof req.query.adminId === 'string' && req.query.adminId) {
    filter.adminId = req.query.adminId;
  }
  if (typeof req.query.targetId === 'string' && req.query.targetId) {
    filter.targetId = req.query.targetId;
  }

  const [entries, total] = await Promise.all([
    AdminAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AdminAuditLog.countDocuments(filter),
  ]);

  res.json({ entries, total, page, pages: Math.ceil(total / limit) });
});

export default router;
