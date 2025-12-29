import { Response } from 'express';
import { z } from 'zod';
import User from '../models/User';
import Progress from '../models/Progress';
import { AuthRequest } from '../middlewares/auth';

const UpdateProfileSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/),
  avatar: z.string().min(1),
});

export async function getProfile(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const progress = await Progress.findOne({ userId: req.userId }).lean();

  const points = (progress as any)?.points ?? 0;
  const level = (progress as any)?.level ?? 1;
  const totalQuizzes = (progress as any)?.totalQuizzes ?? 0;

  // If you track correct/total answers, compute accuracy:
  const correct = (progress as any)?.correctAnswers ?? 0;
  const total = (progress as any)?.totalAnswers ?? 0;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  return res.json({
    user: {
      id: user._id,
      username: user.username,
      avatar: user.avatar,
      email: user.email,
    },
    stats: {
      points,
      level,
      totalQuizzes,
      accuracy,
    },
  });
}

export async function updateProfile(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const parsed = UpdateProfileSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: 'Invalid payload' });

  const { username, avatar } = parsed.data;

  const exists = await User.findOne({ username, _id: { $ne: req.userId } });
  if (exists)
    return res.status(409).json({ message: 'Username already taken' });

  const updated = await User.findByIdAndUpdate(
    req.userId,
    { username, avatar },
    { new: true }
  );

  return res.json({
    user: {
      id: updated?._id,
      username: updated?.username,
      avatar: updated?.avatar,
    },
  });
}
