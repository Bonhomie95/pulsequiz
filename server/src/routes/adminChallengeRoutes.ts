import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import Challenge from '../models/Challenge';
import User from '../models/User';
import { getDailyLabel, getWeeklyLabel } from '../services/challengeService';
import { auditAdmin } from '../utils/adminAudit';

const router = Router();
router.use(requireAdmin);

// GET /api/admin/challenges
router.get('/', async (req: Request, res: Response) => {
  const { userId, status, type } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};

  if (userId) {
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    filter.userId = userId;
  }
  if (status) filter.status = status;
  if (type) filter.type = type;

  const challenges = await Challenge.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return res.json({ challenges });
});

const CreateSchema = z.object({
  userId: z.string().refine(mongoose.isValidObjectId, 'Invalid user id'),
  type: z.enum(['daily', 'weekly']),
  metric: z.enum(['quizzes_played', 'correct_answers', 'perfect_scores']),
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(200).optional(),
  category: z.string().trim().max(64).optional(),
  targetValue: z.number().int().positive().max(10_000),
  rewardCoins: z.number().int().min(0).max(100_000).default(0),
  rewardPoints: z.number().int().min(0).max(10_000).default(0),
  expiresAt: z.string().optional(),
});

/**
 * POST /api/admin/challenges — hand a challenge to one player.
 *
 * Grants coins and leaderboard points, so it is SUPER_ADMIN only.
 */
router.post('/', requireSuperAdmin, async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid challenge',
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  const data = parsed.data;

  const user = await User.findById(data.userId).select('_id deletedAt').lean();
  if (!user || user.deletedAt) {
    return res.status(404).json({ message: 'User not found' });
  }

  // The period label MUST match what the tracker looks for. This used to build
  // `W${weekOfMonth}` — no year, and a different scheme entirely from the
  // `2026-W34` that getWeeklyLabel produces — so updateChallengeProgress,
  // which filters on the current daily/weekly labels, never matched an
  // admin-created weekly challenge and it sat at zero progress forever.
  const periodLabel = data.type === 'daily' ? getDailyLabel() : getWeeklyLabel();

  const expiresAt = data.expiresAt
    ? new Date(data.expiresAt)
    : new Date(Date.now() + (data.type === 'daily' ? 1 : 7) * 86_400_000);

  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return res.status(400).json({ message: 'expiresAt must be a future date' });
  }

  try {
    const challenge = await Challenge.create({
      userId: data.userId,
      type: data.type,
      metric: data.metric,
      title: data.title,
      description: data.description ?? data.title,
      ...(data.category ? { category: data.category } : {}),
      targetValue: data.targetValue,
      currentValue: 0,
      rewardCoins: data.rewardCoins,
      rewardPoints: data.rewardPoints,
      status: 'active',
      periodLabel,
      expiresAt,
    });

    await auditAdmin(req, 'challenge.create', {
      targetType: 'user',
      targetId: data.userId,
      after: {
        title: data.title,
        rewardCoins: data.rewardCoins,
        rewardPoints: data.rewardPoints,
      },
    });

    return res.status(201).json({ challenge });
  } catch (err: any) {
    return res.status(400).json({ message: err?.message ?? 'Could not create challenge' });
  }
});

// DELETE /api/admin/challenges/:id
router.delete('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid challenge id' });
  }

  const before = await Challenge.findById(req.params.id).lean();
  if (!before) return res.status(404).json({ message: 'Challenge not found' });

  // Deleting a claimed challenge would erase the record of a reward that was
  // actually paid, leaving the ledger entry pointing at nothing.
  if (before.status === 'claimed') {
    return res.status(409).json({
      message: 'That reward has already been paid and cannot be deleted',
    });
  }

  await Challenge.deleteOne({ _id: req.params.id });

  await auditAdmin(req, 'challenge.delete', {
    targetType: 'challenge',
    targetId: req.params.id,
    before: { title: before.title, userId: before.userId.toString() },
  });

  return res.json({ ok: true });
});

export default router;
