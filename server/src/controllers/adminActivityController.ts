import { Request, Response } from 'express';
import UserActivity from '../models/UserActivity';

export async function getRecentActivity(req: Request, res: Response) {
  const limit = Math.min(500, Math.max(10, Number(req.query.limit) || 100));
  const type = req.query.type as string | undefined;
  const search = req.query.search as string | undefined;

  const filter: any = {};
  if (type) filter.type = type;

  let query = UserActivity.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'username email');

  const activities = await query.lean();

  // Apply username/email search in-memory (small result set)
  const result = search
    ? activities.filter((a: any) => {
        const u = a.userId as any;
        if (!u) return false;
        const q = search.toLowerCase();
        return (
          (u.username ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
        );
      })
    : activities;

  res.json(result);
}
