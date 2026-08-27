/**
 * Tournament lifecycle.
 *
 * Entry fees were being collected and prizes were never distributed — there
 * was no code path anywhere that paid a tournament out. `finaliseTournament`
 * is that path, and like PvP settlement it is guarded so it can only run once.
 */
import { Types } from 'mongoose';

import Tournament from '../models/Tournament';
import User from '../models/User';
import { creditCoins, debitCoins } from './coinService';
import { logger } from '../utils/logger';

export interface JoinResult {
  ok: boolean;
  error?: 'not_found' | 'closed' | 'already_joined' | 'full' | 'insufficient_coins';
}

/**
 * Join a tournament.
 *
 * The membership check, the capacity check and the insert are one conditional
 * update, so two parallel requests can't both pass the check and double-charge
 * the entry fee (the previous read-check-write version could, and offered no
 * refund when the second write lost the version race).
 */
export async function joinTournament(
  tournamentId: string,
  userId: string,
): Promise<JoinResult> {
  const tournament = await Tournament.findById(tournamentId).lean();
  if (!tournament) return { ok: false, error: 'not_found' };
  if (tournament.status !== 'upcoming' && tournament.status !== 'active') {
    return { ok: false, error: 'closed' };
  }
  if (tournament.participants.some((p) => p.userId.toString() === userId)) {
    return { ok: false, error: 'already_joined' };
  }
  if (tournament.participants.length >= tournament.maxParticipants) {
    return { ok: false, error: 'full' };
  }

  const fee = tournament.entryFeeCoins ?? 0;

  // Debit first — an atomic conditional debit that either succeeds or reports
  // insufficient funds; never partially applies.
  if (fee > 0) {
    const debit = await debitCoins(userId, fee, 'tournament_entry', {
      note: `tournament:${tournamentId}`,
    });
    if (!debit.success) return { ok: false, error: 'insufficient_coins' };
  }

  const user = await User.findById(userId).select('username avatar').lean();

  const joined = await Tournament.findOneAndUpdate(
    {
      _id: tournamentId,
      status: { $in: ['upcoming', 'active'] },
      'participants.userId': { $ne: new Types.ObjectId(userId) },
      $expr: { $lt: [{ $size: '$participants' }, '$maxParticipants'] },
    },
    {
      $push: {
        participants: {
          userId: new Types.ObjectId(userId),
          usernameSnapshot: user?.username ?? 'Player',
          avatarSnapshot: user?.avatar ?? 'avatar0',
          score: 0,
          joinedAt: new Date(),
        },
      },
    },
    { returnDocument: 'after' },
  );

  if (!joined) {
    // We lost the race (full, closed, or already joined by a concurrent
    // request). Give the fee back rather than pocketing it.
    if (fee > 0) {
      await creditCoins(userId, fee, 'tournament_entry', {
        note: `refund_failed_join:${tournamentId}`,
      });
    }
    return { ok: false, error: 'full' };
  }

  return { ok: true };
}

export interface FinaliseResult {
  settled: boolean;
  reason?: string;
  paid?: { userId: string; rank: number; coins: number }[];
}

/**
 * Rank participants, pay prizes, and close the tournament.
 *
 * Claimed with a conditional update on `settledAt`, so a re-run (or two cron
 * replicas racing) pays exactly once.
 */
export async function finaliseTournament(tournamentId: string): Promise<FinaliseResult> {
  const claimed = await Tournament.findOneAndUpdate(
    { _id: tournamentId, settledAt: null },
    { $set: { settledAt: new Date(), status: 'finished' } },
    { returnDocument: 'after' },
  );

  if (!claimed) return { settled: false, reason: 'already_settled_or_missing' };

  // Rank: highest score wins; earlier join breaks ties, so a player who
  // committed earlier isn't beaten by a late entrant on equal points.
  const ranked = [...claimed.participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });

  // Fall back to a sensible split when no explicit distribution was configured.
  const distribution =
    claimed.prizeDistribution.length > 0
      ? claimed.prizeDistribution
      : defaultDistribution(claimed.prizePoolCoins ?? 0, claimed.winnersCount ?? 3);

  const paid: FinaliseResult['paid'] = [];

  for (let i = 0; i < ranked.length; i++) {
    const rank = i + 1;
    ranked[i].rank = rank;

    const tier = distribution.find((d) => d.rank === rank);
    if (!tier || tier.coins <= 0) continue;

    // A player who scored nothing didn't compete; don't pay them.
    if (ranked[i].score <= 0) continue;

    await creditCoins(ranked[i].userId.toString(), tier.coins, 'tournament_prize', {
      note: `tournament:${tournamentId}:rank${rank}`,
    });

    paid.push({ userId: ranked[i].userId.toString(), rank, coins: tier.coins });
  }

  // Persist the computed ranks so the results screen can show final standings.
  await Tournament.updateOne({ _id: tournamentId }, { $set: { participants: ranked } });

  logger.info('Tournament finalised', {
    tournamentId,
    participants: ranked.length,
    winnersPaid: paid.length,
    coinsPaid: paid.reduce((s, p) => s + p.coins, 0),
  });

  return { settled: true, paid };
}

/** 50 / 30 / 20 across the configured number of winners, largest share first. */
function defaultDistribution(pool: number, winners: number) {
  if (pool <= 0 || winners <= 0) return [];

  const weights = Array.from({ length: winners }, (_, i) => 1 / (i + 1));
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  return weights.map((w, i) => ({
    rank: i + 1,
    coins: Math.floor((w / totalWeight) * pool),
  }));
}
