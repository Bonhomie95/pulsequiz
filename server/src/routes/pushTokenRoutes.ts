import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import PushToken from '../models/PushToken';

const router = Router();

// POST /api/push/register
router.post('/register', requireAuth, async (req: AuthRequest, res: Response) => {
  const body = req as any;
  const { token, platform } = body.body;
  if (!token || !platform) return res.status(400).json({ message: 'token and platform required' });

  await PushToken.findOneAndUpdate(
    { token },
    { userId: req.userId, token, platform, active: true },
    { upsert: true, new: true }
  );

  return res.json({ ok: true });
});

// DELETE /api/push/unregister
router.delete('/unregister', requireAuth, async (req: AuthRequest, res: Response) => {
  const { token } = (req as any).body;
  if (!token) return res.status(400).json({ message: 'token required' });

  await PushToken.updateOne({ token, userId: req.userId }, { active: false });
  return res.json({ ok: true });
});

export default router;
