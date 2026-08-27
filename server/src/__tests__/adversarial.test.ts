/**
 * Adversarial checks on the paths that move money.
 *
 * These try to break the guards rather than confirm the happy path — the
 * happy path is covered elsewhere.
 */
import mongoose from 'mongoose';
import crypto from 'crypto';

import CoinWallet from '../models/CoinWallet';
import User from '../models/User';
import Progress from '../models/Progress';
import AdReward from '../models/AdReward';
import PvPMatch from '../models/PvPMatch';
import QuizQuestion from '../models/QuizQuestion';
import PrizePool from '../models/PrizePool';
import Payout from '../models/Payout';
import AccumulatedPrize from '../models/AccumulatedPrize';
import FlaggedAccount from '../models/FlaggedAccount';
import { initDefaultSettings } from '../models/AppSettings';

import { lockWager, getBalance, debitCoins } from '../services/coinService';
import { settleMatch } from '../services/pvpService';
import { creditVerifiedAdReward } from '../services/adRewardService';
import { verifyAdmobSsv } from '../services/admobSsv';
import { verifyAppleJws } from '../services/storeNotifications';
import { checkPayoutEligibility, processPeriodPayouts } from '../services/payoutService';
import { previousPeriod } from '../utils/dateRanges';
import { ensureIndexes } from './setup';

function fakeIo() {
  return { to: () => ({ emit: () => {} }) } as any;
}

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    provider: 'google',
    providerId: new mongoose.Types.ObjectId().toString(),
    username: `u${Math.floor(Math.random() * 1e9)}`,
    avatar: 'avatar0',
    ...overrides,
  });
  await CoinWallet.create({ userId: user._id, coins: 1000 });
  await Progress.create({ userId: user._id, totalQuizzes: 50 });
  return user;
}

beforeEach(async () => {
  await initDefaultSettings();
  await ensureIndexes(AdReward, Payout, QuizQuestion, PrizePool);
});

describe('coins cannot be conjured', () => {
  it('a forged AdMob callback is rejected', async () => {
    const query =
      'ad_network=5450213213286189855&ad_unit=123&reward_amount=1' +
      '&reward_item=coins&timestamp=' + Date.now() +
      '&transaction_id=forged1&user_id=abc&signature=Zm9yZ2Vk&key_id=3335741209';

    const params = Object.fromEntries(new URLSearchParams(query));
    const result = await verifyAdmobSsv(query, params);

    expect(result.valid).toBe(false);
  });

  it('a callback with no signature is rejected before any network call', async () => {
    const result = await verifyAdmobSsv('user_id=abc&transaction_id=x', {
      user_id: 'abc',
      transaction_id: 'x',
    });
    expect(result).toEqual({ valid: false, reason: 'missing_signature' });
  });

  it('replaying the same ad transaction credits once, even in parallel', async () => {
    const user = await makeUser();
    await CoinWallet.updateOne({ userId: user._id }, { $set: { coins: 0 } });

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        creditVerifiedAdReward({
          userId: user._id.toString(),
          transactionId: 'same-txn',
        }).catch(() => ({ credited: false as const })),
      ),
    );

    expect(outcomes.filter((o) => o.credited)).toHaveLength(1);
    expect(await AdReward.countDocuments({})).toBe(1);
  });

  it('a forged Apple webhook payload is rejected', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', x5c: [] })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ notificationType: 'REFUND' })).toString('base64url');
    const jws = `${header}.${payload}.${crypto.randomBytes(64).toString('base64url')}`;

    expect(verifyAppleJws(jws).valid).toBe(false);
  });

  it('an unsigned "alg: none" Apple payload is rejected', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', x5c: [] })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ notificationType: 'REFUND' })).toString('base64url');

    expect(verifyAppleJws(`${header}.${payload}.`).valid).toBe(false);
  });
});

describe('wagered matches conserve coins under every ending', () => {
  async function playedMatch(wager: number, aCorrect: number, bCorrect: number) {
    const a = await makeUser();
    const b = await makeUser();

    const questionSet = Array.from({ length: 10 }, (_, i) => ({
      questionId: new mongoose.Types.ObjectId(),
      difficulty: 'easy' as const,
      order: i,
    }));
    const answers = (n: number) =>
      Array.from({ length: 10 }, (_, i) => ({
        questionId: questionSet[i].questionId,
        selected: 0,
        isCorrect: i < n,
        answeredAt: new Date(),
      }));

    const match = await PvPMatch.create({
      category: 'math',
      state: 'ACTIVE',
      wager,
      questionSet,
      matchmakingExpiresAt: new Date(Date.now() + 60_000),
      players: [
        { userId: a._id, usernameSnapshot: 'a', avatarSnapshot: 'avatar0', levelSnapshot: 1, answers: answers(aCorrect), answeredMs: 5000 },
        { userId: b._id, usernameSnapshot: 'b', avatarSnapshot: 'avatar0', levelSnapshot: 1, answers: answers(bCorrect), answeredMs: 6000 },
      ],
    });

    await lockWager(a._id.toString(), b._id.toString(), wager, match._id.toString());
    return { a, b, match };
  }

  it.each([
    ['a normal win', 'normal'],
    ['a disconnect forfeit', 'forfeit'],
    ['a ready-grace forfeit', 'not_ready'],
    ['an abandoned match', 'abandoned'],
  ])('conserves the pot on %s', async (_label, reason) => {
    const { a, b, match } = await playedMatch(300, 8, 4);
    const before = (await getBalance(a._id.toString())) + (await getBalance(b._id.toString()));

    await settleMatch(fakeIo(), match._id.toString(), {
      kind: 'winner',
      winnerUserId: a._id.toString(),
      reason: reason as any,
    });

    const after = (await getBalance(a._id.toString())) + (await getBalance(b._id.toString()));
    // Both stakes are already out of the wallets; settling returns exactly 2x.
    expect(after).toBe(before + 600);
  });

  it('cannot be settled twice by racing terminal paths', async () => {
    const { a, b, match } = await playedMatch(300, 8, 4);

    await Promise.all([
      settleMatch(fakeIo(), match._id.toString(), { kind: 'winner', winnerUserId: a._id.toString(), reason: 'normal' }),
      settleMatch(fakeIo(), match._id.toString(), { kind: 'winner', winnerUserId: a._id.toString(), reason: 'forfeit' }),
      settleMatch(fakeIo(), match._id.toString(), { kind: 'draw' }),
    ]);

    const total = (await getBalance(a._id.toString())) + (await getBalance(b._id.toString()));
    expect(total).toBe(2000); // the two 1000-coin wallets, unchanged in total
  });

  it('a player cannot stake coins they do not have', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await CoinWallet.updateOne({ userId: b._id }, { $set: { coins: 5 } });

    const result = await lockWager(a._id.toString(), b._id.toString(), 500, 'm1');

    expect(result.success).toBe(false);
    expect(await getBalance(a._id.toString())).toBe(1000);
    expect(await getBalance(b._id.toString())).toBe(5);
  });

  it('a wallet cannot be driven negative by racing spends', async () => {
    const user = await makeUser();
    await CoinWallet.updateOne({ userId: user._id }, { $set: { coins: 100 } });

    await Promise.all(
      Array.from({ length: 20 }, () => debitCoins(user._id.toString(), 10, 'hint_used')),
    );

    expect(await getBalance(user._id.toString())).toBe(0);
  });
});

describe('payout eligibility cannot be talked around', () => {
  it('holds a payout while the address is fresh', async () => {
    const user = await makeUser({
      usdtAddress: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
      usdtType: 'TRC20',
      withdrawalEnabled: true,
      usdtAddressChangedAt: new Date(),
      createdAt: new Date(Date.now() - 60 * 86_400_000),
    });

    const result = await checkPayoutEligibility(user._id.toString());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('address_recently_changed');
  });

  it('holds a payout for an account under review', async () => {
    const user = await makeUser({
      usdtAddress: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
      usdtType: 'TRC20',
      withdrawalEnabled: true,
      usdtAddressChangedAt: new Date(Date.now() - 30 * 86_400_000),
      createdAt: new Date(Date.now() - 60 * 86_400_000),
    });
    await FlaggedAccount.create({
      userId: user._id,
      reason: 'Suspiciously high accuracy',
      flaggedAt: new Date(),
      resolved: false,
    });

    const result = await checkPayoutEligibility(user._id.toString());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('flagged_for_review');
  });

  it('holds a payout for a banned account', async () => {
    const user = await makeUser({
      isBanned: true,
      usdtAddress: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
      usdtType: 'TRC20',
      withdrawalEnabled: true,
    });

    const result = await checkPayoutEligibility(user._id.toString());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('banned');
  });

  it('will not pay the same period twice', async () => {
    const period = previousPeriod('weekly');
    await PrizePool.create({
      type: 'weekly',
      periodLabel: period.label,
      totalAmount: 100,
      paidRanks: 3,
      tiers: [{ rank: 1, amount: 50 }],
      setByAdmin: 'test',
    });

    const first = await processPeriodPayouts('weekly', period);
    const second = await processPeriodPayouts('weekly', period);

    expect(first.skipped).toBeUndefined();
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('already_locked');
    expect(await Payout.countDocuments({})).toBe(0); // nobody qualified
    expect(await AccumulatedPrize.countDocuments({})).toBe(0);
  });
});
