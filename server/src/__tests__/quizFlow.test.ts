import mongoose from 'mongoose';

import QuizQuestion from '../models/QuizQuestion';
import ActiveQuizSession from '../models/ActiveQuizSession';
import QuizSession from '../models/QuizSession';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import User from '../models/User';
import { startQuizSession } from '../services/quizService';
import { submitQuizAnswer } from '../services/quizAnswerService';
import { applyQuizResult } from '../services/progressService';
import { useHintService } from '../services/quizHintService';
import { getBalance } from '../services/coinService';
import { ensureIndexes } from './setup';
import { ANSWER_GRACE_MS } from '../config/quizTiming';

const CATEGORY = 'math';

async function seedQuestions(count = 40) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    docs.push({
      category: CATEGORY,
      question: `Q${i}`,
      options: ['a', 'b', 'c', 'd'],
      answer: i % 4,
      difficulty: (['easy', 'easy', 'medium', 'medium', 'hard'] as const)[i % 5],
    });
  }
  await QuizQuestion.insertMany(docs);
}

async function makeUser() {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    provider: 'google',
    providerId: new mongoose.Types.ObjectId().toString(),
  });
  await CoinWallet.create({ userId: user._id, coins: 1000 });
  await Progress.create({ userId: user._id });
  return user._id.toString();
}

beforeEach(async () => {
  await ensureIndexes(QuizSession);
  await seedQuestions();
});

describe('quiz answering', () => {
  it('rejects an answer submitted after the server deadline', async () => {
    const userId = await makeUser();
    const session = await startQuizSession({ userId, category: CATEGORY });

    // Push the deadline clear of the round-trip grace — the client's own clock
    // is irrelevant. (Inside the grace it is accepted on purpose; that edge is
    // covered in quizAnswerDeadline.test.ts.)
    await ActiveQuizSession.updateOne(
      { _id: session.sessionId },
      {
        $set: {
          questionDeadlineAt: new Date(Date.now() - ANSWER_GRACE_MS - 1_000),
        },
      },
    );

    await expect(
      submitQuizAnswer({
        userId,
        sessionId: session.sessionId,
        questionId: session.questions[0].id,
        selected: 0,
      }),
    ).rejects.toThrow('Answer too late');
  });

  it('rejects an answer to a question that is not the current one', async () => {
    const userId = await makeUser();
    const session = await startQuizSession({ userId, category: CATEGORY });

    await expect(
      submitQuizAnswer({
        userId,
        sessionId: session.sessionId,
        questionId: session.questions[3].id,
        selected: 0,
      }),
    ).rejects.toThrow('Not current question');
  });

  it('ends the run on a wrong answer', async () => {
    const userId = await makeUser();
    const session = await startQuizSession({ userId, category: CATEGORY });

    const q = await QuizQuestion.findById(session.questions[0].id).lean();
    const wrong = (q!.answer + 1) % 4;

    const result = await submitQuizAnswer({
      userId,
      sessionId: session.sessionId,
      questionId: session.questions[0].id,
      selected: wrong,
    });

    expect(result.correct).toBe(false);
    expect(result.finished).toBe(true);
  });

  it('never leaks the correct answer in the question payload', async () => {
    const userId = await makeUser();
    const session = await startQuizSession({ userId, category: CATEGORY });

    for (const q of session.questions) {
      expect(q).not.toHaveProperty('answer');
      expect(q).not.toHaveProperty('correctIndex');
    }
  });
});

describe('applyQuizResult', () => {
  it('awards points and writes one history row', async () => {
    const userId = await makeUser();
    const sessionId = new mongoose.Types.ObjectId();

    const result = await applyQuizResult({
      userId,
      sessionId,
      category: CATEGORY,
      correct: 7,
      total: 10,
    });

    expect(result.pointsAdded).toBe(7);
    expect(await QuizSession.countDocuments({ userId })).toBe(1);
  });

  it('is idempotent — a retried finish does not double-award', async () => {
    const userId = await makeUser();
    const sessionId = new mongoose.Types.ObjectId();

    await applyQuizResult({ userId, sessionId, category: CATEGORY, correct: 7, total: 10 });
    await applyQuizResult({ userId, sessionId, category: CATEGORY, correct: 7, total: 10 });

    const progress = await Progress.findOne({ userId }).lean();
    expect(progress?.points).toBe(7);
    expect(progress?.totalQuizzes).toBe(1);
    expect(await QuizSession.countDocuments({ userId })).toBe(1);
  });

  it('adds the perfect-score bonus', async () => {
    const userId = await makeUser();

    const result = await applyQuizResult({
      userId,
      sessionId: new mongoose.Types.ObjectId(),
      category: CATEGORY,
      correct: 10,
      total: 10,
    });

    expect(result.bonus).toBe(10);
    expect(result.pointsAdded).toBe(20);
  });
});

describe('hints', () => {
  it('charges once and disables a wrong option', async () => {
    const userId = await makeUser();
    const session = await startQuizSession({ userId, category: CATEGORY });
    const before = await getBalance(userId);

    const result = await useHintService({
      userId,
      sessionId: session.sessionId,
      questionId: session.questions[0].id,
    });

    const q = await QuizQuestion.findById(session.questions[0].id).lean();
    expect(result.disabledIndex).not.toBe(q!.answer);
    expect(await getBalance(userId)).toBe(before - 10);
  });

  it('charges once under concurrent requests for the same question', async () => {
    // The old read-modify-write on the wallet lost one of two concurrent
    // writes, so the second hint was effectively free.
    const userId = await makeUser();
    const session = await startQuizSession({ userId, category: CATEGORY });
    const before = await getBalance(userId);

    const results = await Promise.all([
      useHintService({ userId, sessionId: session.sessionId, questionId: session.questions[0].id }),
      useHintService({ userId, sessionId: session.sessionId, questionId: session.questions[0].id }),
      useHintService({ userId, sessionId: session.sessionId, questionId: session.questions[0].id }),
    ]);

    expect(results.filter((r) => r.disabledIndex !== null)).toHaveLength(1);
    expect(await getBalance(userId)).toBe(before - 10);
  });

  it('refuses when the wallet cannot cover the cost', async () => {
    const userId = await makeUser();
    await CoinWallet.updateOne({ userId }, { $set: { coins: 0 } });
    const session = await startQuizSession({ userId, category: CATEGORY });

    const result = await useHintService({
      userId,
      sessionId: session.sessionId,
      questionId: session.questions[0].id,
    });

    expect(result.disabledIndex).toBeNull();
    expect(result.message).toBe('Not enough coins');
    // And the hint slot was released, not consumed.
    const session2 = await ActiveQuizSession.findById(session.sessionId).lean();
    expect(session2?.hintsUsed).toBe(0);
  });
});

describe('question selection with a small pool', () => {
  it('still produces a session when the category is nearly exhausted', async () => {
    // Seven of the shipped categories have only 20 questions; a player used to
    // exhaust them in two sessions.
    await QuizQuestion.deleteMany({});
    await seedQuestions(12);

    const userId = await makeUser();

    for (let i = 0; i < 5; i++) {
      const session = await startQuizSession({ userId, category: CATEGORY });
      expect(session.questions.length).toBeGreaterThan(0);
    }
  });
});
