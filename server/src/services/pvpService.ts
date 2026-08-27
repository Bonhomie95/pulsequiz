/**
 * PvP match settlement.
 *
 * Every path that ends a match — the last answer, a ready-grace timeout, a
 * disconnect forfeit, or the stale-match sweeper — funnels through
 * `settleMatch`. Wagers are debited from both wallets when the match is
 * created, so any terminal path that does *not* settle silently destroys both
 * stakes. Routing them all through one guarded function is what prevents that.
 *
 * The guard is a conditional update on `settledAt`: only the first caller to
 * claim the match performs the payout, so concurrent terminal events (both
 * players' final answers landing at once, a forfeit timer firing as the last
 * answer arrives) can never double-pay.
 */
import type { Server } from 'socket.io';
import { Types } from 'mongoose';

import PvPMatch from '../models/PvPMatch';
import Progress from '../models/Progress';
import QuizSession from '../models/QuizSession';
import User from '../models/User';
import { SOCKET_EVENTS } from '../socket/events';
import { awardWagerToWinner, refundWager } from './coinService';
import { isDailyCapExceeded } from './antiCheatService';
import { applyMatchRating } from './ratingService';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { logger } from '../utils/logger';

export type SettleOutcome =
  | { kind: 'winner'; winnerUserId: string; reason: 'normal' | 'forfeit' | 'not_ready' | 'abandoned' }
  | { kind: 'draw' }
  | { kind: 'cancelled'; reason: string };

export interface SettleResult {
  settled: boolean;
  reason?: string;
}

/** Points a player earns from their own answers, independent of the result. */
function pointsFor(player: any, totalQuestions: number) {
  const correct = (player.answers ?? []).filter((a: any) => a.isCorrect).length;
  const bonus = totalQuestions > 0 && correct === totalQuestions ? 10 : 0;
  return { correct, bonus, total: correct + bonus };
}

/**
 * Award leaderboard points and write the session history row for both players.
 * Idempotent: `QuizSession` carries a unique index on (userId, sessionId), so a
 * retry inserts nothing.
 */
async function awardPoints(match: any) {
  const totalQuestions = match.questionSet?.length ?? 0;
  const cap = Number(await getSetting(SETTINGS_KEYS.DAILY_SESSION_CAP, 20));

  await Promise.all(
    match.players.map(async (player: any) => {
      const uid = player.userId.toString();
      const { correct, bonus, total } = pointsFor(player, totalQuestions);

      // A player who never answered gets a history row but no points.
      const capExceeded = await isDailyCapExceeded(uid, cap);
      const leaderboardPoints = capExceeded ? 0 : total;

      const inserted = await QuizSession.updateOne(
        { userId: uid, sessionId: match._id },
        {
          $setOnInsert: {
            userId: uid,
            sessionId: match._id,
            category: match.category,
            score: correct,
            bonus,
            totalPoints: leaderboardPoints,
            correctAnswers: correct,
            totalQuestions,
            levelAtTime: player.levelSnapshot ?? 1,
          },
        },
        { upsert: true },
      );

      // Only move the leaderboard when we actually created the history row —
      // otherwise a re-settle would inflate points without a matching session.
      if (inserted.upsertedCount > 0 && leaderboardPoints > 0) {
        await Progress.updateOne({ userId: uid }, { $inc: { points: leaderboardPoints } });
      }
    }),
  );
}

/**
 * Claim and settle a match exactly once.
 *
 * Returns `{ settled: false }` when another caller got there first, or when the
 * match no longer exists — both are normal, not errors.
 */
export async function settleMatch(
  io: Server,
  matchId: string,
  outcome: SettleOutcome,
): Promise<SettleResult> {
  const terminalState =
    outcome.kind === 'cancelled'
      ? 'CANCELLED'
      : outcome.kind === 'draw'
        ? 'FINISHED'
        : outcome.reason === 'normal'
          ? 'FINISHED'
          : 'FORFEITED';

  const finishReason =
    outcome.kind === 'draw'
      ? 'draw'
      : outcome.kind === 'cancelled'
        ? 'cancelled'
        : outcome.reason;

  // ── The guard ─────────────────────────────────────────────────────────────
  // Claim the match by stamping settledAt, but only if nobody has yet.
  const match = await PvPMatch.findOneAndUpdate(
    { _id: matchId, settledAt: null },
    {
      $set: {
        settledAt: new Date(),
        state: terminalState,
        finishedAt: new Date(),
        finishReason,
        winnerUserId:
          outcome.kind === 'winner' ? new Types.ObjectId(outcome.winnerUserId) : null,
      },
    },
    { returnDocument: 'after' },
  ).lean();

  if (!match) {
    return { settled: false, reason: 'already_settled_or_missing' };
  }

  const wager = match.wager ?? 0;
  const [a, b] = match.players as any[];

  try {
    if (outcome.kind === 'cancelled') {
      // Nothing was played — return both stakes and award nothing.
      if (wager > 0 && a && b) {
        await refundWager(a.userId.toString(), b.userId.toString(), wager, matchId);
      }
    } else {
      await awardPoints(match);

      // Skill rating — only for genuine head-to-heads. A forfeit or an
      // abandoned match says nothing about who is the better player, so it
      // must not move anyone's rating.
      if (a && b && (outcome.kind === 'draw' || outcome.reason === 'normal')) {
        const scoreA: 0 | 0.5 | 1 =
          outcome.kind === 'draw'
            ? 0.5
            : outcome.winnerUserId === a.userId.toString()
              ? 1
              : 0;
        await applyMatchRating(a.userId.toString(), b.userId.toString(), scoreA);
      }

      if (wager > 0 && a && b) {
        if (outcome.kind === 'draw') {
          await refundWager(a.userId.toString(), b.userId.toString(), wager, matchId);
        } else {
          // Winner takes the whole pot (both stakes).
          await awardWagerToWinner(outcome.winnerUserId, wager, matchId);
        }
      }

      await User.updateMany(
        { _id: { $in: (match.players as any[]).map((p) => p.userId) } },
        { $inc: { sessionsSinceLastAd: 1 } },
      );
    }
  } catch (err) {
    // The match is already marked settled, so we must not leave the payout
    // half-done silently. Record it loudly for manual reconciliation.
    logger.error('Match settlement payout failed after claim', err, {
      matchId,
      outcome: outcome.kind,
      wager,
    });
    throw err;
  }

  // ── Notify ────────────────────────────────────────────────────────────────
  const room = `pvp:${matchId}`;
  if (outcome.kind === 'draw') {
    io.to(room).emit(SOCKET_EVENTS.MATCH_DRAW, { matchId });
  } else if (outcome.kind === 'cancelled') {
    io.to(room).emit(SOCKET_EVENTS.MATCH_CANCELLED, { matchId, reason: outcome.reason });
  } else {
    io.to(room).emit(SOCKET_EVENTS.MATCH_FINISHED, {
      matchId,
      winnerUserId: outcome.winnerUserId,
      reason: outcome.reason,
    });
  }

  logger.info('Match settled', {
    matchId,
    outcome: outcome.kind,
    reason: finishReason,
    wager,
  });

  return { settled: true };
}

/**
 * Decide a finished match.
 * More correct answers wins; ties break on server-measured answer time.
 */
export function computeWinner(
  match: any,
): { winner: any; loser: any } | { draw: true } {
  const [a, b] = match.players;

  const aCorrect = a.answers.filter((x: any) => x.isCorrect).length;
  const bCorrect = b.answers.filter((x: any) => x.isCorrect).length;

  if (aCorrect !== bCorrect) {
    return aCorrect > bCorrect ? { winner: a, loser: b } : { winner: b, loser: a };
  }

  // `answeredMs` is accumulated from server timestamps only.
  const ta = a.answeredMs ?? Number.MAX_SAFE_INTEGER;
  const tb = b.answeredMs ?? Number.MAX_SAFE_INTEGER;

  if (ta === tb) return { draw: true };
  return ta < tb ? { winner: a, loser: b } : { winner: b, loser: a };
}

/**
 * Sweep matches that were stranded by a process restart.
 *
 * Forfeit and ready-grace timers are in-process `setTimeout` handles, so a
 * deploy mid-match would otherwise leave the match hanging forever with both
 * players' coins locked. This runs on an interval and settles anything that
 * has clearly been abandoned.
 */
export async function sweepStaleMatches(io: Server, staleAfterMs = 10 * 60 * 1000) {
  const cutoff = new Date(Date.now() - staleAfterMs);

  const stale = await PvPMatch.find({
    settledAt: null,
    state: { $in: ['MATCHED', 'ACTIVE', 'WAITING_ON_OPPONENT'] },
    updatedAt: { $lt: cutoff },
  })
    .limit(100)
    .lean();

  for (const match of stale) {
    const matchId = match._id.toString();
    const players = match.players as any[];

    // Whoever answered more is credited the win; if neither played, cancel and
    // refund rather than handing one player a pot they didn't earn.
    const [a, b] = players;
    const aAnswers = a?.answers?.length ?? 0;
    const bAnswers = b?.answers?.length ?? 0;

    let outcome: SettleOutcome;
    if (aAnswers === 0 && bAnswers === 0) {
      outcome = { kind: 'cancelled', reason: 'abandoned' };
    } else if (aAnswers === bAnswers) {
      outcome = { kind: 'draw' };
    } else {
      outcome = {
        kind: 'winner',
        winnerUserId: (aAnswers > bAnswers ? a : b).userId.toString(),
        reason: 'abandoned',
      };
    }

    try {
      await settleMatch(io, matchId, outcome);
      logger.warn('Swept stale match', { matchId, outcome: outcome.kind });
    } catch (err) {
      logger.error('Failed to sweep stale match', err, { matchId });
    }
  }

  return stale.length;
}
