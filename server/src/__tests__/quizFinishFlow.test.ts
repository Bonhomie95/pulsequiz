/**
 * The finish path as a real client actually drives it.
 *
 * A quiz ends inside the ANSWER handler — a wrong answer or the last correct
 * one marks the session finished — and only *then* does the client call
 * /quiz/finish to collect the result. Any claim marker used to make finish
 * idempotent therefore must NOT be the `finished` flag, or the normal flow
 * takes the "already finished" branch and awards nothing.
 */
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizQuestion from '../models/QuizQuestion';
import QuizSession from '../models/QuizSession';
import { initDefaultSettings } from '../models/AppSettings';
import { issueSession } from '../utils/jwt';
import { ensureIndexes } from './setup';

let app: Express;
let token: string;
let userId: string;

beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

beforeEach(async () => {
  await initDefaultSettings();
  await ensureIndexes(QuizSession);

  const docs = [];
  for (let i = 0; i < 40; i++) {
    docs.push({
      category: 'math',
      question: `Flow question number ${i}?`,
      options: ['a', 'b', 'c', 'd'],
      answer: i % 4,
      difficulty: (['easy', 'easy', 'medium', 'medium', 'hard'] as const)[i % 5],
    });
  }
  await QuizQuestion.insertMany(docs);

  const user = await User.create({
    email: 'flow@example.com',
    provider: 'google',
    providerId: 'flow-1',
    username: 'flowtester',
    avatar: 'avatar0',
  });
  userId = user._id.toString();
  await Promise.all([
    Progress.create({ userId: user._id }),
    CoinWallet.create({ userId: user._id, coins: 500 }),
    Streak.create({ userId: user._id }),
  ]);
  ({ token } = issueSession(userId, 0));
});

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

async function startQuiz() {
  const res = await auth(request(app).post('/api/quiz/start').send({ category: 'math' })).expect(200);
  return res.body as { sessionId: string; questions: { id: string }[] };
}

function answer(sessionId: string, questionId: string, selected: number | null) {
  return auth(
    request(app).post('/api/quiz/answer').send({ sessionId, questionId, selected }),
  );
}

describe('finish after the run has already ended', () => {
  it('awards points when the run ended on a WRONG answer', async () => {
    const { sessionId, questions } = await startQuiz();

    // Get the first two right, then miss the third — the ordinary way a run ends.
    for (let i = 0; i < 2; i++) {
      const q = await QuizQuestion.findById(questions[i].id).lean();
      await answer(sessionId, questions[i].id, q!.answer).expect(200);
    }
    const third = await QuizQuestion.findById(questions[2].id).lean();
    const wrong = (third!.answer + 1) % 4;
    const ended = await answer(sessionId, questions[2].id, wrong).expect(200);
    expect(ended.body.finished).toBe(true);

    // The client now collects the result.
    const finished = await auth(
      request(app).post('/api/quiz/finish').send({ sessionId }),
    ).expect(200);

    expect(finished.body.alreadyFinished).toBeUndefined();
    expect(finished.body.correct).toBe(2);
    expect(finished.body.points).toBe(2);

    const progress = await Progress.findOne({ userId }).lean();
    expect(progress?.points).toBe(2);
    expect(progress?.totalQuizzes).toBe(1);
    expect(await QuizSession.countDocuments({ userId })).toBe(1);
  });

  it('awards points when the run ended on a TIMEOUT', async () => {
    const { sessionId, questions } = await startQuiz();

    const first = await QuizQuestion.findById(questions[0].id).lean();
    await answer(sessionId, questions[0].id, first!.answer).expect(200);
    await answer(sessionId, questions[1].id, null).expect(200);

    const finished = await auth(
      request(app).post('/api/quiz/finish').send({ sessionId }),
    ).expect(200);

    expect(finished.body.correct).toBe(1);
    expect(finished.body.points).toBe(1);
  });

  it('awards the perfect-run bonus after all ten are correct', async () => {
    const { sessionId, questions } = await startQuiz();

    for (const ref of questions) {
      const q = await QuizQuestion.findById(ref.id).lean();
      await answer(sessionId, ref.id, q!.answer).expect(200);
    }

    const finished = await auth(
      request(app).post('/api/quiz/finish').send({ sessionId }),
    ).expect(200);

    expect(finished.body.correct).toBe(questions.length);
    // 10 correct + 10 perfect-run bonus.
    expect(finished.body.points).toBe(questions.length + 10);
  });

  it('does not award twice when finish is retried', async () => {
    const { sessionId, questions } = await startQuiz();

    const q = await QuizQuestion.findById(questions[0].id).lean();
    await answer(sessionId, questions[0].id, (q!.answer + 1) % 4).expect(200);

    await auth(request(app).post('/api/quiz/finish').send({ sessionId })).expect(200);
    const replay = await auth(
      request(app).post('/api/quiz/finish').send({ sessionId }),
    ).expect(200);

    expect(replay.body.alreadyFinished).toBe(true);

    const progress = await Progress.findOne({ userId }).lean();
    expect(progress?.totalQuizzes).toBe(1);
    expect(await QuizSession.countDocuments({ userId })).toBe(1);
  });

  it('does not award twice under concurrent finish calls', async () => {
    const { sessionId, questions } = await startQuiz();

    const q = await QuizQuestion.findById(questions[0].id).lean();
    await answer(sessionId, questions[0].id, q!.answer).expect(200);

    await Promise.all([
      auth(request(app).post('/api/quiz/finish').send({ sessionId })),
      auth(request(app).post('/api/quiz/finish').send({ sessionId })),
      auth(request(app).post('/api/quiz/finish').send({ sessionId })),
    ]);

    const progress = await Progress.findOne({ userId }).lean();
    expect(progress?.totalQuizzes).toBe(1);
    expect(progress?.points).toBe(1);
    expect(await QuizSession.countDocuments({ userId })).toBe(1);
  });

  it('404s for a session that does not exist', async () => {
    await auth(
      request(app)
        .post('/api/quiz/finish')
        .send({ sessionId: '000000000000000000000000' }),
    ).expect(404);
  });
});
