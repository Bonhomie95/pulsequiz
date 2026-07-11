import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import PushToken from '../models/PushToken';

const router = Router();

const RegisterSchema = z.object({
  token: z.string().min(1).max(500),
  platform: z.enum(['ios', 'android']),
});

// POST /api/push/register
router.post('/register', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'token and platform required' });
  }
  const { token, platform } = parsed.data;

  await PushToken.findOneAndUpdate(
    { token },
    { userId: req.userId, token, platform, active: true },
    { upsert: true, returnDocument: 'after' },
  );

  return res.json({ ok: true });
});

// DELETE /api/push/unregister
router.delete('/unregister', requireAuth, async (req: AuthRequest, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : null;
  if (!token) return res.status(400).json({ message: 'token required' });

  await PushToken.updateOne({ token, userId: req.userId }, { active: false });
  return res.json({ ok: true });
});

export default router;
