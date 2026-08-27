import mongoose from 'mongoose';

import AdReward from '../models/AdReward';
import CoinWallet from '../models/CoinWallet';
import User from '../models/User';
import Challenge from '../models/Challenge';
import Progress from '../models/Progress';
import Referral from '../models/Referral';
import Tournament from '../models/Tournament';
import AppSettings, { clearSettingsCache, SETTINGS_KEYS } from '../models/AppSettings';

import { creditVerifiedAdReward } from '../services/adRewardService';
import { claimChallengeReward } from '../services/challengeService';
import { grantReferralOnFirstQuiz } from '../controllers/referralController';
import { joinTournament, finaliseTournament } from '../services/tournamentService';
import { getBalance } from '../services/coinService';
import { ensureIndexes } from './setup';

async function makeUser() {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    provider: 'google',
    providerId: new mongoose.Types.ObjectId().toString(),
    username: `u${Date.now()}${Math.floor(Math.random() * 1e6)}`,
  });
  await CoinWallet.create({ userId: user._id, coins: 0 });
  await Progress.create({ userId: user._id });
  return user;
}

beforeEach(async () => {
  clearSettingsCache();
  await ensureIndexes(AdReward, Referral);
});

describe('rewarded ads', () => {
  it('credits a verified impression exactly once', async () => {
    const user = await makeUser();

    const first = await creditVerifiedAdReward({
      userId: user._id.toString(),
      transactionId: 'txn-1',
    });
    // Same transaction id replayed — Google retries, and so do attackers.
    const second = await creditVerifiedAdReward({
      userId: user._id.toString(),
      transactionId: 'txn-1',
    });

    expect(first.credited).toBe(true);
    expect(second.credited).toBe(false);
    expect(second.reason).toBe('duplicate');
    expect(await getBalance(user._id.toString())).toBe(first.coinsAdded);
  });

  it('enforces the daily cap that the setting always described but nothing applied', async () => {
    await AppSettings.updateOne(
      { key: SETTINGS_KEYS.DAILY_AD_REWARD_MAX },
      { $set: { value: 3 } },
      { upsert: true },
    );
    clearSettingsCache();

    const user = await makeUser();

    const outcomes = [];
    for (let i = 0; i < 5; i++) {
      outcomes.push(
        await creditVerifiedAdReward({
          userId: user._id.toString(),
          transactionId: `cap-${i}`,
        }),
      );
    }

    expect(outcomes.filter((o) => o.credited)).toHaveLength(3);
    expect(outcomes[3].reason).toBe('daily_cap');
    expect(outcomes[4].reason).toBe('daily_cap');
  });

  it('refuses to credit a banned account', async () => {
    const user = await makeUser();
    await User.updateOne({ _id: user._id }, { $set: { isBanned: true } });

    const outcome = await creditVerifiedAdReward({
      userId: user._id.toString(),
      transactionId: 'banned-1',
    });

    expect(outcome.credited).toBe(false);
    expect(outcome.reason).toBe('user_missing');
  });
});

describe('challenge rewards', () => {
  async function completedChallenge(userId: mongoose.Types.ObjectId) {
    return Challenge.create({
      userId,
      type: 'daily',
      title: 'Test',
      description: 'Test',
      metric: 'quizzes_played',
      targetValue: 1,
      currentValue: 1,
      rewardCoins: 1000,
      rewardPoints: 100,
      status: 'completed',
      periodLabel: '2026-01-01',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
  }

  it('pays once, no matter how many parallel claims arrive', async () => {
    // The old read-check-write let ten concurrent claims all observe
    // status='completed' and all pay out.
    const user = await makeUser();
    const challenge = await completedChallenge(user._id);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        claimChallengeReward(user._id.toString(), challenge._id.toString()),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(await getBalance(user._id.toString())).toBe(1000);
  });

  it('rejects a second claim with a clear message', async () => {
    const user = await makeUser();
    const challenge = await completedChallenge(user._id);

    await claimChallengeReward(user._id.toString(), challenge._id.toString());

    await expect(
      claimChallengeReward(user._id.toString(), challenge._id.toString()),
    ).rejects.toThrow('Reward already claimed');
  });
});

describe('referrals', () => {
  it('pays the referrer only on the first quiz, and only once', async () => {
    const referrer = await makeUser();
    const referred = await makeUser();

    await Referral.create({
      referrerId: referrer._id,
      referredId: referred._id,
      rewardGranted: false,
      rewardCoins: 100,
    });

    // Nothing paid until the referred player actually finishes a quiz.
    expect(await getBalance(referrer._id.toString())).toBe(0);

    await grantReferralOnFirstQuiz(referred._id.toString());
    await grantReferralOnFirstQuiz(referred._id.toString()); // replayed

    expect(await getBalance(referrer._id.toString())).toBe(100);
  });

  it('does not pay a banned referrer', async () => {
    const referrer = await makeUser();
    const referred = await makeUser();
    await User.updateOne({ _id: referrer._id }, { $set: { isBanned: true } });

    await Referral.create({
      referrerId: referrer._id,
      referredId: referred._id,
      rewardGranted: false,
      rewardCoins: 100,
    });

    await grantReferralOnFirstQuiz(referred._id.toString());

    expect(await getBalance(referrer._id.toString())).toBe(0);
  });
});

describe('tournaments', () => {
  async function makeTournament(entryFee: number, max = 10) {
    return Tournament.create({
      title: 'Test Cup',
      category: 'math',
      status: 'active',
      entryFeeCoins: entryFee,
      prizePoolCoins: 1000,
      maxParticipants: max,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 60_000),
      winnersCount: 3,
    });
  }

  it('charges the entry fee once under concurrent joins', async () => {
    const user = await makeUser();
    await CoinWallet.updateOne({ userId: user._id }, { $set: { coins: 1000 } });
    const tournament = await makeTournament(100);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        joinTournament(tournament._id.toString(), user._id.toString()),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await getBalance(user._id.toString())).toBe(900);

    const after = await Tournament.findById(tournament._id).lean();
    expect(after?.participants).toHaveLength(1);
  });

  it('refuses to join without the entry fee', async () => {
    const user = await makeUser();
    const tournament = await makeTournament(100);

    const result = await joinTournament(tournament._id.toString(), user._id.toString());

    expect(result.ok).toBe(false);
    expect(result.error).toBe('insufficient_coins');
  });

  it('respects maxParticipants under concurrent joins', async () => {
    const tournament = await makeTournament(0, 3);
    const users = await Promise.all(Array.from({ length: 6 }, () => makeUser()));

    const results = await Promise.all(
      users.map((u) => joinTournament(tournament._id.toString(), u._id.toString())),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    const after = await Tournament.findById(tournament._id).lean();
    expect(after?.participants).toHaveLength(3);
  });

  it('distributes prizes on finalisation, exactly once', async () => {
    // Prizes were previously never paid at all — the cron only flipped a flag.
    const tournament = await makeTournament(0);
    const users = await Promise.all(Array.from({ length: 3 }, () => makeUser()));

    for (const u of users) {
      await joinTournament(tournament._id.toString(), u._id.toString());
    }
    // Give them distinct scores.
    await Tournament.updateOne(
      { _id: tournament._id },
      {
        $set: {
          'participants.0.score': 30,
          'participants.1.score': 20,
          'participants.2.score': 10,
        },
      },
    );

    const first = await finaliseTournament(tournament._id.toString());
    const second = await finaliseTournament(tournament._id.toString());

    expect(first.settled).toBe(true);
    expect(second.settled).toBe(false);
    expect(first.paid).toHaveLength(3);

    // Winner gets the largest share.
    const balances = await Promise.all(users.map((u) => getBalance(u._id.toString())));
    expect(balances[0]).toBeGreaterThan(balances[1]);
    expect(balances[1]).toBeGreaterThan(balances[2]);
    expect(balances.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1000);
  });

  it('pays nothing to a participant who never scored', async () => {
    const tournament = await makeTournament(0);
    const user = await makeUser();
    await joinTournament(tournament._id.toString(), user._id.toString());

    await finaliseTournament(tournament._id.toString());

    expect(await getBalance(user._id.toString())).toBe(0);
  });
});
