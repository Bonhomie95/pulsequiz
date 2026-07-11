import { Request, Response } from 'express';
import { z } from 'zod';
import Payout from '../models/Payout';
import PrizePool from '../models/PrizePool';
import AccumulatedPrize from '../models/AccumulatedPrize';
import User from '../models/User';
import { processPeriodPayouts } from '../services/payoutService';
import { sendUSDT } from '../services/nowpaymentsService';

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
  const { id } = req.params;
  const payout = await Payout.findById(id);
  if (!payout) return res.status(404).json({ message: 'Not found' });
  if (payout.status !== 'failed') return res.status(400).json({ message: 'Can only retry failed payouts' });

  const user = await User.findById(payout.userId).lean();
  if (!user?.usdtAddress) return res.status(400).json({ message: 'User has no USDT address' });

  const result = await sendUSDT({
    address: user.usdtAddress,
    usdtType: user.usdtType ?? 'TRC20',
    amount: payout.amount,
    description: `Manual retry: ${payout.periodLabel}`,
  });

  await Payout.updateOne(
    { _id: id },
    {
      status: result.success ? 'sent' : 'failed',
      txHash: result.txHash,
      failReason: result.success ? undefined : result.error,
      retries: payout.retries + 1,
      lastAttemptAt: new Date(),
      ...(result.success ? { sentAt: new Date() } : {}),
    }
  );

  return res.json({ success: result.success, error: result.error });
}

export async function setPrizePool(req: Request, res: Response) {
  const adminUsername = (req as any).admin?.username ?? 'admin';
  const parsed = PrizePoolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid data', errors: parsed.error.issues });

  const { type, periodLabel, totalAmount, paidRanks, tiers } = parsed.data;

  // Validate tier amounts don't exceed total
  const tierSum = tiers.reduce((s: number, t: { rank: number; amount: number }) => s + t.amount, 0);
  if (tierSum > totalAmount) {
    return res.status(400).json({ message: `Tier amounts (${tierSum}) exceed total pool (${totalAmount})` });
  }

  const pool = await PrizePool.findOneAndUpdate(
    { type, periodLabel },
    { totalAmount, paidRanks, tiers, setByAdmin: adminUsername },
    { upsert: true, returnDocument: 'after' }
  );

  return res.json({ pool });
}

export async function getPrizePools(req: Request, res: Response) {
  const pools = await PrizePool.find().sort({ createdAt: -1 }).limit(20).lean();
  return res.json({ pools });
}

export async function triggerPayout(req: Request, res: Response) {
  const { type } = z.object({ type: z.enum(['weekly', 'monthly']) }).parse(req.body);
  const result = await processPeriodPayouts(type);
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

  const header = 'username,email,amount_usdt,rank,period,period_label,status,tx_hash,created_at\n';
  const rows = payouts.map((p: any) => [
    p.userId?.username ?? '',
    p.userId?.email ?? '',
    p.amount,
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
