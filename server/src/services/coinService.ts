import { Types } from 'mongoose';
import CoinWallet from '../models/CoinWallet';
import CoinTransaction, { CoinReason } from '../models/CoinTransaction';

type CoinMeta = { sessionId?: string; matchId?: string; note?: string };

function ledgerDoc(
  userId: string | Types.ObjectId,
  delta: number,
  balanceAfter: number,
  reason: CoinReason,
  meta?: CoinMeta,
) {
  return {
    userId,
    delta,
    balanceAfter,
    reason,
    sessionId: meta?.sessionId,
    matchId: meta?.matchId,
    meta: meta?.note,
  };
}

/**
 * Credit coins to a user and log the transaction.
 * The `$inc` is atomic; `balanceAfter` is read from the updated document.
 */
export async function creditCoins(
  userId: string | Types.ObjectId,
  amount: number,
  reason: CoinReason,
  meta?: CoinMeta,
): Promise<number> {
  const wallet = await CoinWallet.findOneAndUpdate(
    { userId },
    { $inc: { coins: amount } },
    { upsert: true, returnDocument: 'after' },
  );

  await CoinTransaction.create(ledgerDoc(userId, amount, wallet!.coins, reason, meta));

  return wallet!.coins;
}

/**
 * Debit coins from a user. Returns false if insufficient balance.
 *
 * The balance guard lives in the query (`coins: { $gte: amount }`), so the
 * check-and-decrement is a single atomic operation. Two concurrent debits can
 * no longer both pass the check and overdraw the wallet — the second finds no
 * matching document and fails cleanly. (No multi-doc transaction needed, so
 * this also works on a standalone mongod.)
 */
export async function debitCoins(
  userId: string | Types.ObjectId,
  amount: number,
  reason: CoinReason,
  meta?: CoinMeta,
): Promise<{ success: boolean; balance: number }> {
  const wallet = await CoinWallet.findOneAndUpdate(
    { userId, coins: { $gte: amount } },
    { $inc: { coins: -amount } },
    { returnDocument: 'after' },
  );

  if (!wallet) {
    return { success: false, balance: await getBalance(userId) };
  }

  await CoinTransaction.create(ledgerDoc(userId, -amount, wallet.coins, reason, meta));

  return { success: true, balance: wallet.coins };
}

/**
 * Get current coin balance.
 */
export async function getBalance(
  userId: string | Types.ObjectId,
): Promise<number> {
  const wallet = await CoinWallet.findOne({ userId }).lean();
  return wallet?.coins ?? 0;
}

/**
 * Lock coins for a PvP wager. Each debit is an atomic conditional `$inc`, so
 * neither wallet can be overdrawn by a concurrent request. If player B can't
 * cover the stake after A was debited, A's debit is compensated (refunded)
 * so the operation leaves both wallets untouched.
 */
export async function lockWager(
  userAId: string,
  userBId: string,
  amount: number,
  matchId: string,
): Promise<{ success: boolean; error?: string }> {
  if (amount <= 0) return { success: true }; // no wager

  const walletA = await CoinWallet.findOneAndUpdate(
    { userId: userAId, coins: { $gte: amount } },
    { $inc: { coins: -amount } },
    { returnDocument: 'after' },
  );
  if (!walletA) {
    return { success: false, error: 'player_a_insufficient' };
  }

  const walletB = await CoinWallet.findOneAndUpdate(
    { userId: userBId, coins: { $gte: amount } },
    { $inc: { coins: -amount } },
    { returnDocument: 'after' },
  );
  if (!walletB) {
    // Compensate A's debit — the wager never happened.
    await CoinWallet.updateOne({ userId: userAId }, { $inc: { coins: amount } });
    return { success: false, error: 'player_b_insufficient' };
  }

  await CoinTransaction.insertMany([
    ledgerDoc(userAId, -amount, walletA.coins, 'pvp_wager_stake', { matchId }),
    ledgerDoc(userBId, -amount, walletB.coins, 'pvp_wager_stake', { matchId }),
  ]);

  return { success: true };
}

/**
 * Award wager pot to winner (2 * amount).
 */
export async function awardWagerToWinner(
  winnerId: string,
  amount: number,
  matchId: string,
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
  matchId: string,
): Promise<void> {
  if (amount <= 0) return;
  await Promise.all([
    creditCoins(userAId, amount, 'pvp_wager_refund', { matchId }),
    creditCoins(userBId, amount, 'pvp_wager_refund', { matchId }),
  ]);
}
