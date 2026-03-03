import { requireAdmin } from '../middlewares/requireAdmin';
import { Router } from 'express';

import Challenge from '../models/Challenge';
import { Response, Request } from 'express';

const router = Router();

// GET /api/admin/challenges
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const { userId, status, type } = req.query;
  const filter: any = {};
  if (userId) filter.userId = userId;
  if (status) filter.status = status;
  if (type) filter.type = type;

  const challenges = await Challenge.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  return res.json({ challenges });
});

// POST /api/admin/challenges - create a challenge for a user or all users
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  const { userId, type, title, description, category, targetValue, rewardCoins, rewardPoints, expiresAt } = req.body;
  if (!userId || !type || !title || !targetValue || !expiresAt) {
    return res.status(400).json({ message: 'userId, type, title, targetValue, expiresAt required' });
  }

  const periodLabel = type === 'daily'
    ? new Date().toISOString().slice(0, 10)
    : `W${Math.ceil(new Date().getDate() / 7)}`;

  const challenge = await Challenge.create({
    userId, type, title, description: description ?? title,
    category: category ?? null,
    targetValue, currentValue: 0,
    rewardCoins: rewardCoins ?? 0,
    rewardPoints: rewardPoints ?? 0,
    status: 'active',
    periodLabel,
    expiresAt: new Date(expiresAt),
  });

  return res.json({ challenge });
});

// DELETE /api/admin/challenges/:id
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  await Challenge.deleteOne({ _id: req.params.id });
  return res.json({ ok: true });
});

export default router;
