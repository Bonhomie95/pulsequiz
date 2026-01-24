import { Request, Response } from 'express';
import UserActivity from '../models/UserActivity';

export async function getRecentActivity(_: Request, res: Response) {
  const activities = await UserActivity.find()
    .sort({ createdAt: -1 })
    .limit(30)
    .populate('userId', 'username email');

  res.json(activities);
}
