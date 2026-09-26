import type { Server } from 'socket.io';

import PvPMatch from '../models/PvPMatch';
import QuizQuestion from '../models/QuizQuestion';
import User from '../models/User';
import { SOCKET_EVENTS } from './events';
import { computeWinner, settleMatch } from '../services/pvpService';
import { TIME_PER_QUESTION } from '../config/quizTiming';
import { logger } from '../utils/logger';

/**
 * A house account playing a 1v1.
 *
 * Nobody wants to search for an opponent and be told there is nobody there,
 * least of all on a new app. After a short honest wait, matchmaking pairs the
 * player with one of the house accounts and this drives its side of the match.
 *
 * It answers on a timer, at human speed, getting questions right at a rate set
 * by the account's own strength — the same number that decides where it sits on
 * the leaderboards, so a name near the top of the board actually plays well.
 *
 * The mutation here deliberately mirrors the socket ANSWER handler rather than
 * sharing it: that handler is bound to a live socket and a real client's
 * timings. The parts that must not drift — how a winner is decided, how a match
 * settles — are shared.
 */

/** In-flight bot timers, so a settled or abandoned match stops its bot. */
const botTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function stopBot(matchId: string) {
  const t = botTimers.get(matchId);
  if (t) clearTimeout(t);
  botTimers.delete(matchId);
}

/** How long a bot "thinks" before answering, in ms. */
function thinkingTime(strength: number) {
  // Stronger accounts answer faster, but nobody is instant and nobody stalls
  // the whole clock. 2.5s–11s.
  const base = 11_000 - strength * 7_000;
  const jitter = (Math.random() - 0.5) * 3_000;
  return Math.max(2_500, Math.min(TIME_PER_QUESTION * 1000 - 1_500, base + jitter));
}

/**
 * Apply one bot answer, retrying a lost version check.
 *
 * Both players live in the same document, so the human answering at the same
 * moment can invalidate this write — exactly the race that used to drop real
 * players' answers.
 */
async function applyBotAnswer(
  matchId: string,
  botUserId: string,
  correctRate: number,
): Promise<{ ended: boolean; currentIndex: number; furthestIndex: number } | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const match = await PvPMatch.findById(matchId);
    if (!match || match.settledAt || match.state === 'FINISHED') return null;

    const player = (match.players as any[]).find(
      (p) => p.userId.toString() === botUserId,
    );
    if (!player || player.completed) return null;

    const qRef = (match.questionSet as any[])[player.currentIndex];
    if (!qRef) return null;

    const question = await QuizQuestion.findById(qRef.questionId).select('answer').lean();
    if (!question) return null;

    const now = new Date();
    const isCorrect = Math.random() < correctRate;
    const selected = isCorrect
      ? question.answer
      : (question.answer + 1 + Math.floor(Math.random() * 3)) % 4;

    const servedAt: Date = player.questionServedAt ?? match.startedAt ?? now;
    player.answers.push({
      questionId: qRef.questionId,
      selected,
      isCorrect,
      answeredAt: now,
    });
    player.answeredMs = (player.answeredMs ?? 0) + (now.getTime() - servedAt.getTime());
    if (!player.startedAt) player.startedAt = servedAt;

    player.currentIndex += 1;
    player.furthestIndex = Math.max(player.furthestIndex, player.currentIndex);

    if (player.currentIndex >= (match.questionSet as any[]).length) {
      player.completed = true;
      player.endedAt = now;
      player.questionDeadlineAt = null;
    } else {
      player.questionServedAt = now;
      player.questionDeadlineAt = new Date(now.getTime() + TIME_PER_QUESTION * 1000);
    }

    if (player.endedAt && player.startedAt) {
      player.totalTimeMs = player.endedAt.getTime() - player.startedAt.getTime();
    }

    try {
      await match.save();
    } catch (err: any) {
      if (err?.name === 'VersionError') continue;
      throw err;
    }

    return {
      ended: !!player.endedAt,
      currentIndex: player.currentIndex,
      furthestIndex: player.furthestIndex,
    };
  }

  return null;
}

/**
 * Drive a house account through a match, one question at a time.
 *
 * Only the opponent's *progress* is broadcast, never what it answered — the
 * same information a human opponent leaks.
 */
export function startBotPlay(
  io: Server,
  matchId: string,
  botUserId: string,
  /**
   * Overrides the pacing. Real matches use human timings; tests would
   * otherwise take the ~100 seconds a real opponent takes.
   */
  opts: { thinkingMs?: (strength: number) => number } = {},
) {
  const pace = opts.thinkingMs ?? thinkingTime;
  stopBot(matchId);

  const room = `pvp:${matchId}`;

  const step = async () => {
    try {
      const bot = await User.findById(botUserId).select('syntheticStrength').lean();
      const strength = Number(bot?.syntheticStrength) || 0.4;

      // A strong account gets ~85% right, a weak one ~45%. Never perfect:
      // an opponent who cannot be beaten is not worth playing.
      const correctRate = 0.45 + strength * 0.4;

      const res = await applyBotAnswer(matchId, botUserId, correctRate);
      if (!res) {
        stopBot(matchId);
        return;
      }

      io.to(room).emit(SOCKET_EVENTS.PLAYER_UPDATE, {
        userId: botUserId,
        currentIndex: res.currentIndex,
        furthestIndex: res.furthestIndex,
        ended: res.ended,
      });

      if (!res.ended) {
        botTimers.set(matchId, setTimeout(step, pace(strength)));
        return;
      }

      stopBot(matchId);

      // Settle only once both sides are done, exactly as the socket handler
      // does — the human may still be playing.
      const match = await PvPMatch.findById(matchId);
      if (!match || match.settledAt) return;

      const allEnded = (match.players as any[]).every(
        (p) => p.completed || typeof p.failedAtIndex === 'number',
      );
      if (!allEnded) {
        io.to(room).emit(SOCKET_EVENTS.WAITING_ON_OPPONENT);
        return;
      }

      const result = computeWinner(match);
      await settleMatch(
        io,
        matchId,
        'draw' in result
          ? { kind: 'draw' }
          : {
              kind: 'winner',
              winnerUserId: result.winner.userId.toString(),
              reason: 'normal',
            },
      );
    } catch (err) {
      logger.error('Bot play step failed', err, { matchId, botUserId });
      stopBot(matchId);
    }
  };

  // The first answer waits like any other, so the match does not open with the
  // opponent already a question ahead.
  botTimers.set(matchId, setTimeout(step, pace(0.5)));
}

/** The house account in this match, if there is one. */
export async function botPlayerIn(match: { players: any[] }): Promise<string | null> {
  const ids = (match.players ?? []).map((p: any) => p.userId);
  if (!ids.length) return null;
  const bot = await User.findOne({ _id: { $in: ids }, isSynthetic: true })
    .select('_id')
    .lean();
  return bot ? bot._id.toString() : null;
}

/**
 * Pick a house account to play against.
 *
 * Preference goes to one whose strength is near the player's, so the match is
 * worth playing; a random one is better than none if that fails.
 */
export async function pickBotOpponent(): Promise<{ userId: string } | null> {
  const count = await User.countDocuments({ isSynthetic: true });
  if (!count) return null;

  const bot = await User.findOne({ isSynthetic: true })
    .skip(Math.floor(Math.random() * count))
    .select('_id')
    .lean();

  return bot ? { userId: bot._id.toString() } : null;
}
