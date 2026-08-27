/**
 * End-to-end smoke test.
 *
 * Boots the real Express app against an in-memory mongod, seeds the actual
 * question files, and walks the surface a client touches — including a full
 * quiz round-trip. This is the test that catches "it compiles but the app
 * doesn't start", which unit tests never do.
 */
import path from 'path';
import fs from 'fs';
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizQuestion from '../models/QuizQuestion';
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

  // Load the real seed data, exactly as `npm run seed` would.
  const dir = path.join(__dirname, '..', 'seed');
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('questions.') && x.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    await QuizQuestion.insertMany(
      data.map((q: any) => ({ ...q, category: String(q.category).toLowerCase() })),
      { ordered: false },
    ).catch(() => {});
  }

  const user = await User.create({
    email: 'smoke@example.com',
    provider: 'google',
    providerId: 'smoke-1',
    username: 'smoketester',
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

describe('the app boots and serves its surface', () => {
  it('seeds a usable question bank', async () => {
    const total = await QuizQuestion.countDocuments({});
    expect(total).toBeGreaterThan(1000);

    // Every category must support at least a few distinct quizzes before it
    // starts recycling — seven of them used to manage two.
    const categories = await QuizQuestion.distinct('category');
    for (const category of categories) {
      const [easy, medium, hard] = await Promise.all([
        QuizQuestion.countDocuments({ category, difficulty: 'easy' }),
        QuizQuestion.countDocuments({ category, difficulty: 'medium' }),
        QuizQuestion.countDocuments({ category, difficulty: 'hard' }),
      ]);
      const sessions = Math.min(Math.floor(easy / 4), Math.floor(medium / 4), Math.floor(hard / 2));
      expect(sessions).toBeGreaterThanOrEqual(5);
    }
  });

  it.each([
    ['/health', 200],
    ['/metrics', 200],
  ])('serves %s', async (route, status) => {
    await request(app).get(route).expect(status);
  });

  it.each([
    '/api/auth/me',
    '/api/home/summary',
    '/api/home/ready-players',
    '/api/ads/config',
    '/api/coins/wallet',
    '/api/leaderboard/weekly',
    '/api/leaderboard/my-rank',
    '/api/payouts/mine',
    '/api/settings/payout-eligibility',
    '/api/profile',
    '/api/challenges',
    '/api/referrals/code',
    '/api/tournaments',
    '/api/auth/export',
  ])('serves %s to an authenticated user', async (route) => {
    await auth(request(app).get(route)).expect(200);
  });

  it('records a daily check-in', async () => {
    const res = await auth(request(app).post('/api/streak/check-in')).expect(200);
    expect(res.body.streak).toBe(1);
    expect(res.body.coinsAdded).toBeGreaterThan(0);
  });
});

describe('a full quiz round-trip', () => {
  it('starts, answers and finishes without leaking the answer key', async () => {
    const start = await auth(
      request(app).post('/api/quiz/start').send({ category: 'math' }),
    ).expect(200);

    const { sessionId, questions } = start.body;
    expect(questions.length).toBeGreaterThan(0);

    // The client must never receive the correct answer.
    for (const q of questions) {
      expect(q).not.toHaveProperty('answer');
      expect(q).not.toHaveProperty('correctIndex');
    }

    const first = await QuizQuestion.findById(questions[0].id).lean();
    const answered = await auth(
      request(app)
        .post('/api/quiz/answer')
        .send({ sessionId, questionId: questions[0].id, selected: first!.answer }),
    ).expect(200);
    expect(answered.body.correct).toBe(true);

    const finished = await auth(
      request(app).post('/api/quiz/finish').send({ sessionId }),
    ).expect(200);
    expect(finished.body.correct).toBe(1);
    expect(finished.body.points).toBe(1);

    // A retried finish must not award a second time.
    const replay = await auth(
      request(app).post('/api/quiz/finish').send({ sessionId }),
    ).expect(200);
    expect(replay.body.alreadyFinished).toBe(true);

    const progress = await Progress.findOne({ userId }).lean();
    expect(progress?.points).toBe(1);
    expect(progress?.totalQuizzes).toBe(1);
  });

  it('lets a player report a bad question', async () => {
    const q = await QuizQuestion.findOne({ category: 'math' }).lean();

    await auth(
      request(app)
        .post('/api/reports/question')
        .send({ questionId: q!._id.toString(), reason: 'wrong_answer' }),
    ).expect(200);

    const after = await QuizQuestion.findById(q!._id).lean();
    expect(after?.reportCount).toBe(1);
  });
});
