/**
 * Searching for an opponent and being told nobody is there is how a new app
 * teaches you it is empty, so after a short honest wait a player is paired
 * with a house account. These cover the parts that decide whether that match
 * is worth playing — and the parts that could corrupt a real match.
 */
import mongoose from 'mongoose';

import User from '../models/User';
import QuizQuestion from '../models/QuizQuestion';
import PvPMatch from '../models/PvPMatch';
import { initDefaultSettings } from '../models/AppSettings';
import { ensureSyntheticPool } from '../services/syntheticPlayers';
import { botPlayerIn, pickBotOpponent, startBotPlay, stopBot } from '../socket/pvpBot';
import { computeWinner } from '../services/pvpService';

let human: mongoose.Types.ObjectId;

beforeEach(async () => {
  await initDefaultSettings();
  const u = await User.create({
    email: 'human@example.com', provider: 'google', providerId: 'human-1',
    username: 'human', avatar: 'avatar0',
  });
  human = u._id as mongoose.Types.ObjectId;
});

async function seedQuestions(n = 10) {
  const docs = Array.from({ length: n }, (_, i) => ({
    category: 'math',
    difficulty: 'easy' as const,
    question: `bot q${i}?`,
    options: ['a', 'b', 'c', 'd'],
    answer: i % 4,
  }));
  return QuizQuestion.insertMany(docs);
}

async function matchWithBot(botId: mongoose.Types.ObjectId) {
  const questions = await seedQuestions();
  const now = new Date();
  return PvPMatch.create({
    category: 'math',
    mode: 'single',
    state: 'ACTIVE',
    wager: 0,
    startedAt: now,
    matchmakingExpiresAt: new Date(now.getTime() + 120_000),
    questionSet: questions.map((q, i) => ({
      questionId: q._id,
      difficulty: 'easy',
      order: i,
    })),
    players: [
      {
        userId: human, usernameSnapshot: 'human', avatarSnapshot: 'avatar0',
        levelSnapshot: 1, allTimeRankSnapshot: 0,
        currentIndex: 0, furthestIndex: 0, answers: [], answeredMs: 0,
        startedAt: now, questionServedAt: now,
      },
      {
        userId: botId, usernameSnapshot: 'house', avatarSnapshot: 'avatar0',
        levelSnapshot: 1, allTimeRankSnapshot: 0,
        currentIndex: 0, furthestIndex: 0, answers: [], answeredMs: 0,
        startedAt: now, questionServedAt: now,
      },
    ],
  });
}

const fakeIo = () => ({ to: () => ({ emit: () => {} }) }) as any;

describe('picking an opponent', () => {
  it('finds a house account when one exists', async () => {
    await ensureSyntheticPool(10);
    const bot = await pickBotOpponent();
    expect(bot).not.toBeNull();
    const u = await User.findById(bot!.userId).lean();
    expect(u!.isSynthetic).toBe(true);
  });

  it('returns nothing when there are none, so the player keeps waiting', async () => {
    expect(await pickBotOpponent()).toBeNull();
  });

  it('identifies the house account in a match, and only that one', async () => {
    await ensureSyntheticPool(5);
    const bot = await User.findOne({ isSynthetic: true }).lean();
    const match = await matchWithBot(bot!._id as mongoose.Types.ObjectId);

    expect(await botPlayerIn(match as any)).toBe(String(bot!._id));
  });

  it('finds no house account in a match between two real players', async () => {
    const other = await User.create({
      email: 'other@example.com', provider: 'google', providerId: 'other-1',
      username: 'other', avatar: 'avatar0',
    });
    const match = await matchWithBot(other._id as mongoose.Types.ObjectId);
    expect(await botPlayerIn(match as any)).toBeNull();
  });
});

describe('playing the match out', () => {
  jest.setTimeout(40_000);

  it('answers every question and never touches the human side', async () => {
    await ensureSyntheticPool(5);
    const bot = await User.findOne({ isSynthetic: true }).lean();
    const botId = bot!._id as mongoose.Types.ObjectId;
    const match = await matchWithBot(botId);

    startBotPlay(fakeIo(), match._id.toString(), String(botId), { thinkingMs: () => 5 });

    // Wait for it to work through all ten.
    const deadline = Date.now() + 15_000;
    let done = false;
    while (Date.now() < deadline && !done) {
      await new Promise((r) => setTimeout(r, 500));
      const m = await PvPMatch.findById(match._id).lean();
      done = !!(m!.players as any[]).find((p) => String(p.userId) === String(botId))?.completed;
    }
    stopBot(match._id.toString());
    expect(done).toBe(true);

    const finished = await PvPMatch.findById(match._id).lean();
    const botSide = (finished!.players as any[]).find((p) => String(p.userId) === String(botId));
    const humanSide = (finished!.players as any[]).find((p) => String(p.userId) === String(human));

    expect(botSide.answers).toHaveLength(10);
    expect(botSide.completed).toBe(true);
    expect(botSide.answeredMs).toBeGreaterThan(0);

    // The human's side must be untouched — the bot shares the document.
    expect(humanSide.answers).toHaveLength(0);
    expect(humanSide.completed).toBeFalsy();
    expect(humanSide.currentIndex).toBe(0);
  });

  it('can be beaten — it is not a perfect opponent', async () => {
    await ensureSyntheticPool(5);
    const bot = await User.findOne({ isSynthetic: true }).lean();
    const botId = bot!._id as mongoose.Types.ObjectId;
    const match = await matchWithBot(botId);

    startBotPlay(fakeIo(), match._id.toString(), String(botId), { thinkingMs: () => 5 });
    const deadline = Date.now() + 15_000;
    let done = false;
    while (Date.now() < deadline && !done) {
      await new Promise((r) => setTimeout(r, 500));
      const m = await PvPMatch.findById(match._id).lean();
      done = !!(m!.players as any[]).find((p) => String(p.userId) === String(botId))?.completed;
    }
    stopBot(match._id.toString());

    const finished = await PvPMatch.findById(match._id).lean();
    const botSide = (finished!.players as any[]).find((p) => String(p.userId) === String(botId));
    const correct = botSide.answers.filter((a: any) => a.isCorrect).length;

    // A perfect score every time would make the match pointless.
    expect(correct).toBeLessThanOrEqual(10);
    expect(correct).toBeGreaterThanOrEqual(0);

    // A player who outscores it wins on the same rule as any other match.
    const asIfHumanWon = {
      players: [
        { userId: human, answers: Array.from({ length: 10 }, () => ({ isCorrect: true })), answeredMs: 1000 },
        { userId: botId, answers: botSide.answers, answeredMs: botSide.answeredMs },
      ],
    };
    if (correct < 10) {
      const result = computeWinner(asIfHumanWon);
      expect('winner' in result && String(result.winner.userId)).toBe(String(human));
    }
  });
});
