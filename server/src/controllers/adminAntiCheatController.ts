import { Request, Response } from 'express';
import FlaggedAccount from '../models/FlaggedAccount';
import User from '../models/User';
import { z } from 'zod';

export async function getFlaggedAccounts(req: Request, res: Response) {
  const { resolved } = req.query;
  const filter: any = {};
  if (resolved !== undefined) filter.resolved = resolved === 'true';

  const accounts = await FlaggedAccount.find(filter)
    .sort({ flaggedAt: -1 })
    .populate('userId', 'username email isBanned createdAt')
    .limit(100)
    .lean();

  return res.json({ accounts });
}

export async function resolveFlag(req: Request, res: Response) {
  const adminUsername = (req as any).admin?.username ?? 'admin';
  const { id } = req.params;
  const { action } = z.object({ action: z.enum(['warned', 'banned', 'cleared']) }).parse(req.body);

  const flag = await FlaggedAccount.findById(id);
  if (!flag) return res.status(404).json({ message: 'Not found' });

  flag.resolved = true;
  flag.resolvedAt = new Date();
  flag.resolvedBy = adminUsername;
  flag.action = action;
  await flag.save();

  if (action === 'banned') {
    await User.updateOne({ _id: flag.userId }, { isBanned: true, withdrawalEnabled: false });
  }

  return res.json({ ok: true });
}
