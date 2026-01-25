import { Request, Response } from 'express';
import User from '../models/User';

export async function listUsers(req: Request, res: Response) {
  const page = Number(req.query.page) || 1;
  const search = typeof req.query.search === 'string' ? req.query.search : '';

  const limit = 20;
  const skip = (page - 1) * limit;

  const query: any = {};

  if (search) {
    query.username = { $regex: search, $options: 'i' };
  }

  const users = await User.find(query)
    .select('username email coins level isBanned lastSeenAt createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments(query);

  res.json({ users, total });
}

export async function toggleBan(req: Request, res: Response) {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.isBanned = !user.isBanned;
  await user.save();

  res.json({ ok: true, isBanned: user.isBanned });
}
