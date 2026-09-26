/**
 * Payout retries must never send the same money twice: not on a double click,
 * and not after the amount already rolled into a later successful payout.
 */
import mongoose from 'mongoose';

import User from '../models/User';
import Payout from '../models/Payout';
import AccumulatedPrize from '../models/AccumulatedPrize';
import Progress from '../models/Progress';
import { initDefaultSettings } from '../models/AppSettings';
import { retryPayout, retryFailedPayouts, resolveParkedPayout, PARKED_RETRIES } from '../services/payoutService';
import { ensureIndexes } from './setup';

jest.mock('../services/nowpaymentsService', () => ({
  sendUSDT: jest.fn(async () => ({ success: true, txHash: 'tx', paymentId: 'p' })),
}));
import { sendUSDT } from '../services/nowpaymentsService';

async function setup(pending: number) {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId()}@x.com`,
    provider: 'google',
    providerId: new mongoose.Types.ObjectId().toString(),
    username: `p${Math.floor(Math.random() * 1e9)}`,
    usdtType: 'ERC20',
    usdtAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    withdrawalEnabled: true,
    createdAt: new Date(Date.now() - 30 * 86400e3),
  });
  await Progress.create({ userId: user._id, totalQuizzes: 50 });
  await AccumulatedPrize.create({ userId: user._id, pendingUSDT: pending, totalEarned: pending });
  const payout = await Payout.create({
    userId: user._id,
    amount: 10,
    rank: 1,
    period: 'weekly',
    periodLabel: '2026-W30',
    usdtAddress: user.usdtAddress,
    usdtType: 'ERC20',
    status: 'failed',
    retries: 1,
    idempotencyKey: `weekly:2026-W30:${user._id}`,
  });
  return { user, payout };
}

beforeEach(async () => {
  await initDefaultSettings();
  await ensureIndexes(Payout);
  (sendUSDT as jest.Mock).mockClear();
});

describe('retryPayout', () => {
  it('two concurrent retries send exactly once', async () => {
    const { user, payout } = await setup(10);
    const [a, b] = await Promise.all([
      retryPayout(payout._id.toString()),
      retryPayout(payout._id.toString()),
    ]);
    expect([a.status, b.status].sort()).toEqual(['not_retryable', 'sent']);
    expect(sendUSDT).toHaveBeenCalledTimes(1);
    const acc = await AccumulatedPrize.findOne({ userId: user._id }).lean();
    expect(acc?.pendingUSDT).toBe(0);
  });

  it('a payout whose money was already paid later is superseded, not re-sent', async () => {
    const { payout } = await setup(0); // a later payout drained the balance
    const r = await retryPayout(payout._id.toString());
    expect(r.status).toBe('superseded');
    expect(sendUSDT).not.toHaveBeenCalled();
  });

  it('a definite failure gives the reservation back', async () => {
    (sendUSDT as jest.Mock).mockResolvedValueOnce({ success: false, error: 'nope' });
    const { user, payout } = await setup(10);
    const r = await retryPayout(payout._id.toString());
    expect(r.status).toBe('failed');
    const acc = await AccumulatedPrize.findOne({ userId: user._id }).lean();
    expect(acc?.pendingUSDT).toBe(10);
  });
});

describe('parked payouts', () => {
  it('a row interrupted mid-send is parked for a human, not retried', async () => {
    const { payout } = await setup(0);
    await Payout.updateOne({ _id: payout._id }, { status: 'processing', lastAttemptAt: new Date(Date.now() - 3600e3) });
    await retryFailedPayouts();
    const row = await Payout.findById(payout._id).lean();
    expect(row?.status).toBe('failed');
    expect(row?.retries).toBe(PARKED_RETRIES);
    expect(sendUSDT).not.toHaveBeenCalled();
  });

  it('resolving as not sent returns the reserved amount and makes it retryable', async () => {
    const { user, payout } = await setup(0); // amount was reserved when parked
    await Payout.updateOne({ _id: payout._id }, { retries: PARKED_RETRIES });
    expect(await resolveParkedPayout(payout._id.toString(), 'not_sent')).toBe(true);
    expect((await AccumulatedPrize.findOne({ userId: user._id }).lean())?.pendingUSDT).toBe(10);
    const r = await retryPayout(payout._id.toString());
    expect(r.status).toBe('sent');
    expect((await AccumulatedPrize.findOne({ userId: user._id }).lean())?.pendingUSDT).toBe(0);
  });

  it('resolving as sent marks it paid without touching the balance', async () => {
    const { user, payout } = await setup(0);
    await Payout.updateOne({ _id: payout._id }, { retries: PARKED_RETRIES });
    expect(await resolveParkedPayout(payout._id.toString(), 'sent', '0xabc')).toBe(true);
    expect((await Payout.findById(payout._id).lean())?.status).toBe('sent');
    expect((await AccumulatedPrize.findOne({ userId: user._id }).lean())?.pendingUSDT).toBe(0);
    // A normal failed row can't be "resolved".
    expect(await resolveParkedPayout(payout._id.toString(), 'sent')).toBe(false);
  });
});

describe('rolled-over balances', () => {
  it('two failed periods then a retry pays the full amount exactly once', async () => {
    const { processPeriodPayouts } = await import('../services/payoutService');
    const { periodContaining } = await import('../utils/dateRanges');
    const QuizSession = (await import('../models/QuizSession')).default;
    const PrizePool = (await import('../models/PrizePool')).default;

    const { user } = await setup(0);
    await Payout.deleteMany({ userId: user._id }); // start clean
    const w2 = periodContaining('weekly', new Date(Date.now() - 7 * 86400e3));
    const w1 = periodContaining('weekly', new Date(w2.start.getTime() - 86400e3));

    for (const [p, prize] of [[w1, 10], [w2, 5]] as const) {
      await QuizSession.create({
        userId: user._id,
        sessionId: new mongoose.Types.ObjectId(),
        category: 'math',
        score: 5,
        totalPoints: 5,
        correctAnswers: 5,
        totalQuestions: 10,
        levelAtTime: 1,
        createdAt: new Date(p.start.getTime() + 3600e3),
      });
      await PrizePool.create({
        type: 'weekly', periodLabel: p.label, totalAmount: prize, paidRanks: 1,
        tiers: [{ rank: 1, amount: prize }], setByAdmin: 'test',
      });
    }

    (sendUSDT as jest.Mock).mockResolvedValue({ success: false, error: 'provider down' });
    await processPeriodPayouts('weekly', w1);
    await processPeriodPayouts('weekly', w2);
    (sendUSDT as jest.Mock).mockResolvedValue({ success: true, txHash: 'tx' });

    const rows = await Payout.find({ userId: user._id }).sort({ createdAt: 1 }).lean();
    expect(rows.map((r) => r.status)).toEqual(['superseded', 'failed']);
    expect(rows[1].amount).toBe(15);

    (sendUSDT as jest.Mock).mockClear();
    await retryFailedPayouts();
    expect(sendUSDT).toHaveBeenCalledTimes(1);
    expect((sendUSDT as jest.Mock).mock.calls[0][0].amount).toBe(15);
    expect((await AccumulatedPrize.findOne({ userId: user._id }).lean())?.pendingUSDT).toBe(0);
  });
});
