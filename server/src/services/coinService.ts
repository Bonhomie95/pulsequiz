import CoinWallet from '../models/CoinWallet';
import CoinTransaction, { CoinReason } from '../models/CoinTransaction';
import { Types } from 'mongoose';

/**
 * Credit coins to a user and log the transaction.
 */
export async function creditCoins(
  userId: string | Types.ObjectId,
  amount: number,
  reason: CoinReason,
  meta?: { sessionId?: string; matchId?: string; note?: string }
): Promise<number> {
  const wallet = await CoinWallet.findOneAndUpdate(
    { userId },
    { $inc: { coins: amount } },
    { upsert: true, new: true }
  );

  await CoinTransaction.create({
    userId,
    delta: amount,
    balanceAfter: wallet.coins,
    reason,
    sessionId: meta?.sessionId,
    matchId: meta?.matchId,
    meta: meta?.note,
  });

  return wallet.coins;
}

/**
 * Debit coins from a user. Returns false if insufficient balance.
 */
export async function debitCoins(
  userId: string | Types.ObjectId,
  amount: number,
  reason: CoinReason,
  meta?: { sessionId?: string; matchId?: string; note?: string }
): Promise<{ success: boolean; balance: number }> {
  const wallet = await CoinWallet.findOne({ userId });
  if (!wallet || wallet.coins < amount) {
    return { success: false, balance: wallet?.coins ?? 0 };
  }

  wallet.coins -= amount;
  await wallet.save();

  await CoinTransaction.create({
    userId,
    delta: -amount,
    balanceAfter: wallet.coins,
    reason,
    sessionId: meta?.sessionId,
    matchId: meta?.matchId,
    meta: meta?.note,
  });

  return { success: true, balance: wallet.coins };
}

/**
 * Get current coin balance.
 */
export async function getBalance(userId: string | Types.ObjectId): Promise<number> {
  const wallet = await CoinWallet.findOne({ userId }).lean();
  return wallet?.coins ?? 0;
}

/**
 * Transfer coins atomically for PvP wager (lock both, then award winner).
 * Returns { success: boolean, error?: string }
 */
export async function lockWager(
  userAId: string,
  userBId: string,
  amount: number,
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  if (amount <= 0) return { success: true }; // no wager

  const [walletA, walletB] = await Promise.all([
    CoinWallet.findOne({ userId: userAId }),
    CoinWallet.findOne({ userId: userBId }),
  ]);

  if (!walletA || walletA.coins < amount) {
    return { success: false, error: 'player_a_insufficient' };
  }
  if (!walletB || walletB.coins < amount) {
    return { success: false, error: 'player_b_insufficient' };
  }

  walletA.coins -= amount;
  walletB.coins -= amount;
  await Promise.all([walletA.save(), walletB.save()]);

  await CoinTransaction.insertMany([
    { userId: userAId, delta: -amount, balanceAfter: walletA.coins, reason: 'pvp_wager_stake', matchId },
    { userId: userBId, delta: -amount, balanceAfter: walletB.coins, reason: 'pvp_wager_stake', matchId },
  ]);

  return { success: true };
}

/**
 * Award wager pot to winner (2 * amount).
 */
export async function awardWagerToWinner(
  winnerId: string,
  amount: number,
  matchId: string
): Promise<void> {
  if (amount <= 0) return;
  const pot = amount * 2;
  await creditCoins(winnerId, pot, 'pvp_wager_win', { matchId });
}

/**
 * Refund wager to both players (draw).
 */
export async function refundWager(
  userAId: string,
  userBId: string,
  amount: number,
  matchId: string
): Promise<void> {
  if (amount <= 0) return;
  await Promise.all([
    creditCoins(userAId, amount, 'pvp_wager_refund', { matchId }),
    creditCoins(userBId, amount, 'pvp_wager_refund', { matchId }),
  ]);
}
