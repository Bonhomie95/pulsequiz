import mongoose from 'mongoose';
import type { Server } from 'socket.io';

import PvPMatch from '../models/PvPMatch';
import QuizSession from '../models/QuizSession';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import { settleMatch, computeWinner, sweepStaleMatches } from '../services/pvpService';
import { lockWager, getBalance } from '../services/coinService';
import { ensureIndexes } from './setup';

const userA = new mongoose.Types.ObjectId();
const userB = new mongoose.Types.ObjectId();

/** Minimal io stub — settlement only ever emits. */
function fakeIo() {
  const emitted: { room: string; event: string; payload: any }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => emitted.push({ room, event, payload }),
    }),
  } as unknown as Server;
  return { io, emitted };
}

async function seedWallets(coins: number) {
  await CoinWallet.create([
    { userId: userA, coins },
    { userId: userB, coins },
  ]);
  await Progress.create([{ userId: userA }, { userId: userB }]);
}

async function createMatch(opts: {
  wager: number;
  aCorrect: number;
  bCorrect: number;
  aMs?: number;
  bMs?: number;
}) {
  const questionSet = Array.from({ length: 10 }, (_, i) => ({
    questionId: new mongoose.Types.ObjectId(),
    difficulty: 'easy' as const,
    order: i,
  }));

  const answers = (correct: number) =>
    Array.from({ length: 10 }, (_, i) => ({
      questionId: questionSet[i].questionId,
      selected: 0,
      isCorrect: i < correct,
      answeredAt: new Date(),
    }));

  return PvPMatch.create({
    category: 'math',
    state: 'ACTIVE',
    wager: opts.wager,
    questionSet,
    matchmakingExpiresAt: new Date(Date.now() + 60_000),
    players: [
      {
        userId: userA,
        usernameSnapshot: 'a',
        avatarSnapshot: 'avatar0',
        levelSnapshot: 1,
        answers: answers(opts.aCorrect),
        answeredMs: opts.aMs ?? 5000,
      },
      {
        userId: userB,
        usernameSnapshot: 'b',
        avatarSnapshot: 'avatar0',
        levelSnapshot: 1,
        answers: answers(opts.bCorrect),
        answeredMs: opts.bMs ?? 5000,
      },
    ],
  });
}

beforeEach(async () => {
  await ensureIndexes(QuizSession);
});

describe('settleMatch', () => {
  it('pays the staked pot to the winner on a normal finish', async () => {
    await seedWallets(500);
    const match = await createMatch({ wager: 100, aCorrect: 8, bCorrect: 5 });
    await lockWager(userA.toString(), userB.toString(), 100, match._id.toString());

    expect(await getBalance(userA.toString())).toBe(400);
    expect(await getBalance(userB.toString())).toBe(400);

    const { io } = fakeIo();
    const result = await settleMatch(io, match._id.toString(), {
      kind: 'winner',
      winnerUserId: userA.toString(),
      reason: 'normal',
    });

    expect(result.settled).toBe(true);
    expect(await getBalance(userA.toString())).toBe(600); // 400 + 200 pot
    expect(await getBalance(userB.toString())).toBe(400);
  });

  it('pays out on a FORFEIT — the stakes are not destroyed', async () => {
    // This is the regression: both forfeit paths used to mark the match
    // FORFEITED and return without ever settling, burning 2x the wager.
    await seedWallets(500);
    const match = await createMatch({ wager: 100, aCorrect: 3, bCorrect: 0 });
    await lockWager(userA.toString(), userB.toString(), 100, match._id.toString());

    const { io } = fakeIo();
    await settleMatch(io, match._id.toString(), {
      kind: 'winner',
      winnerUserId: userA.toString(),
      reason: 'forfeit',
    });

    expect(await getBalance(userA.toString())).toBe(600);
    expect(await getBalance(userB.toString())).toBe(400);
    // Nothing vanished: 600 + 400 === the 1000 they started with.
    expect(
      (await getBalance(userA.toString())) + (await getBalance(userB.toString())),
    ).toBe(1000);
  });

  it('refunds both stakes on a draw', async () => {
    await seedWallets(500);
    const match = await createMatch({ wager: 100, aCorrect: 5, bCorrect: 5 });
    await lockWager(userA.toString(), userB.toString(), 100, match._id.toString());

    const { io } = fakeIo();
    await settleMatch(io, match._id.toString(), { kind: 'draw' });

    expect(await getBalance(userA.toString())).toBe(500);
    expect(await getBalance(userB.toString())).toBe(500);
  });

  it('refunds both stakes when a match is cancelled unplayed', async () => {
    await seedWallets(500);
    const match = await createMatch({ wager: 100, aCorrect: 0, bCorrect: 0 });
    await lockWager(userA.toString(), userB.toString(), 100, match._id.toString());

    const { io } = fakeIo();
    await settleMatch(io, match._id.toString(), { kind: 'cancelled', reason: 'abandoned' });

    expect(await getBalance(userA.toString())).toBe(500);
    expect(await getBalance(userB.toString())).toBe(500);
  });

  it('settles exactly once even when called concurrently', async () => {
    await seedWallets(500);
    const match = await createMatch({ wager: 100, aCorrect: 8, bCorrect: 5 });
    await lockWager(userA.toString(), userB.toString(), 100, match._id.toString());

    const { io } = fakeIo();
    const results = await Promise.all([
      settleMatch(io, match._id.toString(), {
        kind: 'winner',
        winnerUserId: userA.toString(),
        reason: 'normal',
      }),
      settleMatch(io, match._id.toString(), {
        kind: 'winner',
        winnerUserId: userA.toString(),
        reason: 'normal',
      }),
    ]);

    expect(results.filter((r) => r.settled)).toHaveLength(1);
    // Pot paid once, not twice.
    expect(await getBalance(userA.toString())).toBe(600);
  });

  it('awards leaderboard points and writes one session row per player', async () => {
    await seedWallets(0);
    const match = await createMatch({ wager: 0, aCorrect: 10, bCorrect: 4 });

    const { io } = fakeIo();
    await settleMatch(io, match._id.toString(), {
      kind: 'winner',
      winnerUserId: userA.toString(),
      reason: 'normal',
    });

    const sessions = await QuizSession.find({ sessionId: match._id }).lean();
    expect(sessions).toHaveLength(2);

    const progressA = await Progress.findOne({ userId: userA }).lean();
    // 10 correct + 10 perfect-score bonus.
    expect(progressA?.points).toBe(20);

    const progressB = await Progress.findOne({ userId: userB }).lean();
    expect(progressB?.points).toBe(4);
  });
});

describe('computeWinner', () => {
  const build = (aCorrect: number, bCorrect: number, aMs: number, bMs: number) => ({
    players: [
      { userId: userA, answers: Array.from({ length: aCorrect }, () => ({ isCorrect: true })), answeredMs: aMs },
      { userId: userB, answers: Array.from({ length: bCorrect }, () => ({ isCorrect: true })), answeredMs: bMs },
    ],
  });

  it('prefers more correct answers', () => {
    const result = computeWinner(build(7, 3, 9999, 1));
    expect('winner' in result && result.winner.userId).toEqual(userA);
  });

  it('breaks ties on server-measured answer time', () => {
    const result = computeWinner(build(5, 5, 4000, 9000));
    expect('winner' in result && result.winner.userId).toEqual(userA);
  });

  it('declares a draw on identical score and time', () => {
    expect(computeWinner(build(5, 5, 4000, 4000))).toEqual({ draw: true });
  });
});

describe('sweepStaleMatches', () => {
  it('settles a match stranded by a restart, refunding an unplayed one', async () => {
    await seedWallets(500);
    const match = await createMatch({ wager: 100, aCorrect: 0, bCorrect: 0 });
    await lockWager(userA.toString(), userB.toString(), 100, match._id.toString());

    // Clear the answers so it looks genuinely unplayed, and age it out.
    await PvPMatch.updateOne(
      { _id: match._id },
      { $set: { 'players.0.answers': [], 'players.1.answers': [], updatedAt: new Date(Date.now() - 60 * 60_000) } },
      { timestamps: false },
    );

    const { io } = fakeIo();
    const swept = await sweepStaleMatches(io, 10 * 60_000);

    expect(swept).toBe(1);
    expect(await getBalance(userA.toString())).toBe(500);
    expect(await getBalance(userB.toString())).toBe(500);
  });
});
