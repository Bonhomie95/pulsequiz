/**
 * A finished quiz must remain auditable.
 *
 * ActiveQuizSession holds the per-answer detail during play, but a TTL index
 * removes it minutes after the quiz starts, and the history row used to keep
 * only totals. A player disputing their score therefore could not be answered
 * either way. On a leaderboard that pays out, that cuts both directions: you
 * cannot investigate a complaint, and you cannot show a score was earned.
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

let app: Express;
let token: string;
let userId: string;

beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

beforeEach(async () => {
  await initDefaultSettings();
  const docs: any[] = [];
  const add = (d: string, n: number) => {
    for (let i = 0; i < n; i++)
      docs.push({
        category: 'math', difficulty: d, question: `${d} audit ${i}?`,
        options: ['a', 'b', 'c', 'd'], answer: i % 4,
      });
  };
  add('easy', 20); add('medium', 20); add('hard', 10);
  await QuizQuestion.insertMany(docs);

  const u = await User.create({
    email: 'audit@example.com', provider: 'google', providerId: 'audit-1',
    username: 'auditor', avatar: 'avatar0',
  });
  userId = u._id.toString();
  await Promise.all([
    Progress.create({ userId: u._id }),
    CoinWallet.create({ userId: u._id, coins: 100 }),
    Streak.create({ userId: u._id }),
  ]);
  ({ token } = issueSession(userId, 0));
});

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

it('records every answer, so a disputed score can be reconstructed', async () => {
  const s = (
    await auth(request(app).post('/api/quiz/start').send({ category: 'math' })).expect(200)
  ).body;

  // Two right, then a miss — the run ends there.
  const q1 = await QuizQuestion.findById(s.questions[0].id).lean();
  await auth(request(app).post('/api/quiz/answer')
    .send({ sessionId: s.sessionId, questionId: s.questions[0].id, selected: q1!.answer })).expect(200);

  const q2 = await QuizQuestion.findById(s.questions[1].id).lean();
  await auth(request(app).post('/api/quiz/answer')
    .send({ sessionId: s.sessionId, questionId: s.questions[1].id, selected: q2!.answer })).expect(200);

  const q3 = await QuizQuestion.findById(s.questions[2].id).lean();
  const wrong = (q3!.answer + 1) % 4;
  await auth(request(app).post('/api/quiz/answer')
    .send({ sessionId: s.sessionId, questionId: s.questions[2].id, selected: wrong })).expect(200);

  const fin = await auth(request(app).post('/api/quiz/finish').send({ sessionId: s.sessionId })).expect(200);
  expect(fin.body.points).toBe(2);

  const history = await QuizSession.findOne({ userId }).lean();
  expect(history!.answers).toHaveLength(3);

  // The stored detail must actually reconcile with the score awarded — that is
  // the whole point of keeping it.
  const correctCount = history!.answers.filter((a: any) => a.isCorrect).length;
  expect(correctCount).toBe(history!.correctAnswers);
  expect(correctCount).toBe(2);

  expect(history!.answers[2].isCorrect).toBe(false);
  expect(history!.answers[2].selected).toBe(wrong);
  expect(String(history!.answers[0].questionId)).toBe(String(s.questions[0].id));
});

it('records a timeout as an unanswered question rather than losing it', async () => {
  const s = (
    await auth(request(app).post('/api/quiz/start').send({ category: 'math' })).expect(200)
  ).body;

  await auth(request(app).post('/api/quiz/answer')
    .send({ sessionId: s.sessionId, questionId: s.questions[0].id, selected: null })).expect(200);

  await auth(request(app).post('/api/quiz/finish').send({ sessionId: s.sessionId })).expect(200);

  const history = await QuizSession.findOne({ userId }).lean();
  expect(history!.answers).toHaveLength(1);
  expect(history!.answers[0].selected).toBeNull();
  expect(history!.answers[0].isCorrect).toBe(false);
});
