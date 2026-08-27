import { Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';

import FlaggedAccount from '../models/FlaggedAccount';
import User from '../models/User';
import { auditAdmin } from '../utils/adminAudit';
import type { AdminRequest } from '../middlewares/requireAdmin';
import { logger } from '../utils/logger';

export async function getFlaggedAccounts(req: Request, res: Response) {
  const { resolved } = req.query;
  const limit = Math.min(200, Number(req.query.limit) || 100);

  const filter: Record<string, unknown> = {};
  if (resolved !== undefined) filter.resolved = resolved === 'true';

  const [accounts, openCount] = await Promise.all([
    FlaggedAccount.find(filter)
      .sort({ flaggedAt: -1 })
      .populate('userId', 'username email isBanned createdAt')
      .limit(limit)
      .lean(),
    FlaggedAccount.countDocuments({ resolved: false }),
  ]);

  return res.json({
    accounts,
    openCount,
    // Worth surfacing: an open flag holds that account's prize payouts.
    note: 'Accounts with an unresolved flag are excluded from payouts until reviewed.',
  });
}

export async function resolveFlag(req: Request, res: Response) {
  // The real signed-in admin. This used to read `req.admin?.username`, which
  // requireAdmin never sets — so every resolution was attributed to the
  // literal string 'admin'.
  const adminEmail = (req as AdminRequest).adminEmail ?? 'unknown';
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid flag id' });
  }

  const parsed = z
    .object({
      action: z.enum(['warned', 'banned', 'cleared']),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'action must be warned, banned or cleared' });
  }

  const { action, note } = parsed.data;

  // Claim the flag so two admins reviewing the same queue can't both act.
  const flag = await FlaggedAccount.findOneAndUpdate(
    { _id: id, resolved: false },
    {
      $set: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: adminEmail,
        action,
        ...(note ? { resolutionNote: note } : {}),
      },
    },
    { returnDocument: 'after' },
  );

  if (!flag) {
    const existing = await FlaggedAccount.findById(id).lean();
    if (!existing) return res.status(404).json({ message: 'Flag not found' });
    return res.status(409).json({
      message: `Already resolved by ${existing.resolvedBy ?? 'another admin'}`,
    });
  }

  if (action === 'banned') {
    await User.updateOne(
      { _id: flag.userId },
      {
        $set: { isBanned: true, withdrawalEnabled: false },
        // Revoke every live session immediately rather than waiting for the
        // token to expire.
        $inc: { tokenVersion: 1 },
      },
    );
    logger.warn('Account banned from anti-cheat review', {
      userId: flag.userId.toString(),
      adminEmail,
    });
  }

  await auditAdmin(req, `anticheat.${action}`, {
    targetType: 'user',
    targetId: flag.userId.toString(),
    before: { flagId: id, reason: flag.reason },
    after: { action, note },
  });

  return res.json({ ok: true, action });
}
