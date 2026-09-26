import { Request, Response } from 'express';
import { z } from 'zod';
import Payout from '../models/Payout';
import PrizePool from '../models/PrizePool';
import {
  processPeriodPayouts,
  retryPayout as retryPayoutService,
  resolveParkedPayout,
  PARKED_RETRIES,
} from '../services/payoutService';
import { previousPeriod, periodContaining } from '../utils/dateRanges';
import { auditAdmin } from '../utils/adminAudit';
import type { AdminRequest } from '../middlewares/requireAdmin';

const PrizePoolSchema = z.object({
  type: z.enum(['weekly', 'monthly', 'event']),
  periodLabel: z.string(),
  totalAmount: z.number().positive(),
  paidRanks: z.number().int().positive(),
  tiers: z.array(z.object({ rank: z.number(), amount: z.number() })),
});

export async function getAllPayouts(req: Request, res: Response) {
  const { status, page = '1', limit = '50' } = req.query as Record<string, string>;

  const filter: any = {};
  if (status) filter.status = status;

  const total = await Payout.countDocuments(filter);
  const payouts = await Payout.find(filter)
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate('userId', 'username email')
    .lean();

  return res.json({ payouts, total, page: Number(page) });
}

export async function retryPayout(req: Request, res: Response) {
  const id = String(req.params.id);
  const payout = await Payout.findById(id).lean();
  if (!payout) return res.status(404).json({ message: 'Not found' });
  if (payout.status !== 'failed') {
    return res.status(400).json({ message: 'Can only retry failed payouts' });
  }
  if (payout.retries >= PARKED_RETRIES) {
    return res.status(409).json({
      message:
        'Outcome of the last attempt is unknown. Check NOWPayments for this reference before doing anything else.',
    });
  }

  // Same claim-and-reserve path as the cron, so a double click or an
  // overlapping cron run can't send twice.
  const outcome = await retryPayoutService(id, {
    maxRetries: PARKED_RETRIES,
    description: `Manual retry: ${payout.periodLabel}`,
  });

  await auditAdmin(req, 'payout.retry', {
    targetType: 'payout',
    targetId: id,
    after: { outcome: outcome.status, amount: payout.amount },
  });

  if (outcome.status === 'not_retryable') {
    return res.status(409).json({ message: 'Payout is already being processed' });
  }
  return res.json({
    success: outcome.status === 'sent',
    status: outcome.status,
    error: 'error' in outcome ? outcome.error : 'reason' in outcome ? outcome.reason : undefined,
  });
}

/** POST /admin/payouts/:id/resolve  { outcome: 'sent' | 'not_sent', txHash? } */
export async function resolvePayout(req: Request, res: Response) {
  const parsed = z
    .object({ outcome: z.enum(['sent', 'not_sent']), txHash: z.string().trim().max(200).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'outcome must be sent or not_sent' });

  const id = String(req.params.id);
  const ok = await resolveParkedPayout(id, parsed.data.outcome, parsed.data.txHash);
  if (!ok) return res.status(409).json({ message: 'Only a payout awaiting reconciliation can be resolved' });

  await auditAdmin(req, 'payout.resolve', { targetType: 'payout', targetId: id, after: parsed.data });
  return res.json({ ok: true });
}

export async function setPrizePool(req: Request, res: Response) {
  const adminUsername = (req as AdminRequest).adminEmail ?? 'admin';
  const parsed = PrizePoolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid data', errors: parsed.error.issues });

  const { type, periodLabel, totalAmount, paidRanks, tiers } = parsed.data;

  // Validate tier amounts don't exceed total
  const tierSum = tiers.reduce((s: number, t: { rank: number; amount: number }) => s + t.amount, 0);
  if (tierSum > totalAmount) {
    return res.status(400).json({ message: `Tier amounts (${tierSum}) exceed total pool (${totalAmount})` });
  }

  if (tiers.some((t) => t.amount < 0 || t.rank < 1)) {
    return res.status(400).json({ message: 'Tier ranks must be >= 1 and amounts >= 0' });
  }

  const before = await PrizePool.findOne({ type, periodLabel }).lean();

  // A locked pool has already paid out; editing it retroactively would make the
  // payout records disagree with the configuration they were computed from.
  if (before?.lockedAt) {
    return res.status(409).json({
      message: 'This pool has already been processed and can no longer be edited',
    });
  }

  const pool = await PrizePool.findOneAndUpdate(
    { type, periodLabel },
    { totalAmount, paidRanks, tiers, setByAdmin: adminUsername },
    { upsert: true, returnDocument: 'after' }
  );

  await auditAdmin(req, 'prizepool.set', {
    targetType: 'prizepool',
    targetId: `${type}:${periodLabel}`,
    before: before ? { totalAmount: before.totalAmount, paidRanks: before.paidRanks, tiers: before.tiers } : null,
    after: { totalAmount, paidRanks, tiers },
  });

  return res.json({ pool });
}

/**
 * Period labels the admin UI should offer when configuring a pool — the
 * current period and the one that just closed, computed the same way the
 * payout job computes them.
 */
export async function getPeriodOptions(_req: Request, res: Response) {
  return res.json({
    weekly: {
      current: periodContaining('weekly').label,
      previous: previousPeriod('weekly').label,
    },
    monthly: {
      current: periodContaining('monthly').label,
      previous: previousPeriod('monthly').label,
    },
  });
}

export async function getPrizePools(req: Request, res: Response) {
  const pools = await PrizePool.find().sort({ createdAt: -1 }).limit(20).lean();
  return res.json({ pools });
}

export async function triggerPayout(req: Request, res: Response) {
  const parsed = z
    .object({
      type: z.enum(['weekly', 'monthly']),
      // Which period to settle. Defaults to the one that just closed, matching
      // the cron; 'current' is available for testing an in-progress period.
      period: z.enum(['previous', 'current']).default('previous'),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'type must be "weekly" or "monthly"' });
  }

  const { type, period } = parsed.data;
  const target = period === 'current' ? periodContaining(type) : previousPeriod(type);

  const result = await processPeriodPayouts(type, target);

  await auditAdmin(req, 'payout.trigger', {
    targetType: 'period',
    targetId: `${type}:${target.label}`,
    after: {
      sent: result.results?.filter((r) => r.status === 'sent').length ?? 0,
      skipped: result.results?.filter((r) => r.status === 'skipped').length ?? 0,
      failed: result.results?.filter((r) => r.status === 'failed').length ?? 0,
    },
  });

  return res.json(result);
}

export async function exportPayoutsCSV(req: Request, res: Response) {
  const payouts = await Payout.find()
    .populate('userId', 'username email')
    .lean();

  // Quote every field and neutralise leading formula characters so the CSV
  // can't break on commas or execute formulas when opened in a spreadsheet.
  const csvField = (v: unknown): string => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const header = 'username,email,amount_usd,currency,network,rank,period,period_label,status,tx_hash,created_at\n';
  const rows = payouts.map((p: any) => [
    p.userId?.username ?? '',
    p.userId?.email ?? '',
    p.amount,
    p.currency ?? 'USDT',
    p.usdtType ?? '',
    p.rank,
    p.period,
    p.periodLabel,
    p.status,
    p.txHash ?? '',
    new Date(p.createdAt).toISOString(),
  ].map(csvField).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="payouts.csv"');
  return res.send(header + rows);
}
