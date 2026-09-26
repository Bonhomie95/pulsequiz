import { Router, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import { auditAdmin } from '../utils/adminAudit';
import Subscription from '../models/Subscription';

const router = Router();

// GET /admin/subscriptions
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const [subs, total] = await Promise.all([
      Subscription.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'username email'),
      Subscription.countDocuments(filter),
    ]);

    const [activeCount, graceCount, expiredCount] = await Promise.all([
      Subscription.countDocuments({ status: 'active' }),
      Subscription.countDocuments({ status: 'grace' }),
      Subscription.countDocuments({ status: 'expired' }),
    ]);

    return res.json({
      subscriptions: subs,
      total,
      stats: { active: activeCount, grace: graceCount, expired: expiredCount },
    });
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /admin/subscriptions/:id/cancel
router.patch(
  '/:id/cancel',
  requireAdmin,
  // Removes premium from a paying user — SUPER_ADMIN only, and audited. Note
  // this does not stop store billing; the user cancels that in their store.
  requireSuperAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const sub = await Subscription.findById(req.params.id);
      if (!sub) return res.status(404).json({ message: 'Not found' });
      const before = sub.status;
      sub.status = 'cancelled';
      await sub.save();
      await auditAdmin(req, 'subscription.cancel', {
        targetType: 'subscription',
        targetId: String(req.params.id),
        before: { status: before },
        after: { status: 'cancelled' },
      });
      return res.json({ message: 'Cancelled' });
    } catch (e) {
      return res.status(500).json({ message: 'Server error' });
    }
  },
);

export default router;
