import mongoose from 'mongoose';
import CoinWallet from '../models/CoinWallet';
import CoinTransaction from '../models/CoinTransaction';
import {
  creditCoins,
  debitCoins,
  getBalance,
  lockWager,
  awardWagerToWinner,
  refundWager,
} from '../services/coinService';

const userA = new mongoose.Types.ObjectId().toString();
const userB = new mongoose.Types.ObjectId().toString();

async function seedWallet(userId: string, coins: number) {
  await CoinWallet.findOneAndUpdate(
    { userId },
    { $set: { coins } },
    { upsert: true },
  );
}

/** Wallet balance must always equal the sum of the ledger's deltas. */
async function ledgerSum(userId: string): Promise<number> {
  const rows = await CoinTransaction.aggregate<{ total: number }>([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, total: { $sum: '$delta' } } },
  ]);
  return rows[0]?.total ?? 0;
}

describe('coinService', () => {
  it('credits and records a matching ledger entry', async () => {
    const balance = await creditCoins(userA, 100, 'ad_reward');

    expect(balance).toBe(100);
    expect(await ledgerSum(userA)).toBe(100);
  });

  it('refuses to overdraw', async () => {
    await seedWallet(userA, 50);

    const result = await debitCoins(userA, 80, 'hint_used');

    expect(result.success).toBe(false);
    expect(result.balance).toBe(50);
    expect(await getBalance(userA)).toBe(50);
  });

  it('does not overdraw under concurrent debits', async () => {
    // The guard lives in the query (coins >= amount), so only one of these
    // can match. A read-check-write would let both through.
    await seedWallet(userA, 100);

    const results = await Promise.all([
      debitCoins(userA, 100, 'hint_used'),
      debitCoins(userA, 100, 'hint_used'),
    ]);

    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(await getBalance(userA)).toBe(0);
    expect(await ledgerSum(userA)).toBe(-100);
  });

  it('does not lose increments under concurrent credits', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () => creditCoins(userA, 5, 'ad_reward')),
    );

    expect(await getBalance(userA)).toBe(100);
    expect(await ledgerSum(userA)).toBe(100);
  });
});

describe('lockWager', () => {
  it('stakes both players when both can cover', async () => {
    await seedWallet(userA, 500);
    await seedWallet(userB, 500);

    const result = await lockWager(userA, userB, 200, 'match1');

    expect(result.success).toBe(true);
    expect(await getBalance(userA)).toBe(300);
    expect(await getBalance(userB)).toBe(300);
  });

  it("compensates player A when B can't cover", async () => {
    await seedWallet(userA, 500);
    await seedWallet(userB, 10);

    const result = await lockWager(userA, userB, 200, 'match2');

    expect(result.success).toBe(false);
    expect(result.error).toBe('player_b_insufficient');
    // A must be made whole — the wager never happened.
    expect(await getBalance(userA)).toBe(500);
    expect(await getBalance(userB)).toBe(10);
  });

  it('conserves coins across a full stake-and-award cycle', async () => {
    await seedWallet(userA, 500);
    await seedWallet(userB, 500);

    await lockWager(userA, userB, 200, 'match3');
    await awardWagerToWinner(userA, 200, 'match3');

    // Winner takes the pot; the total in circulation is unchanged.
    expect(await getBalance(userA)).toBe(700);
    expect(await getBalance(userB)).toBe(300);
    expect((await getBalance(userA)) + (await getBalance(userB))).toBe(1000);
  });

  it('conserves coins across a stake-and-refund cycle', async () => {
    await seedWallet(userA, 500);
    await seedWallet(userB, 500);

    await lockWager(userA, userB, 200, 'match4');
    await refundWager(userA, userB, 200, 'match4');

    expect(await getBalance(userA)).toBe(500);
    expect(await getBalance(userB)).toBe(500);
  });
});
