/**
 * A player's own points must be live, never read off the cached board.
 *
 * The leaderboard snapshot is rebuilt by cron once a minute. Serving the
 * caller's own total from it meant that finishing a quiz and opening the
 * leaderboard showed the total from *before* that quiz — and the next visit
 * showed the previous quiz's score, so scores appeared to lag by one run.
 * Ranks and cutoffs describe other players and may stay cached.
 */
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizQuestion from '../models/QuizQuestion';
import { initDefaultSettings } from '../models/AppSettings';
import { buildLeaderboard } from '../services/leaderboardService';
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
        category: 'math', difficulty: d, question: `${d} lb ${i}?`,
        options: ['a', 'b', 'c', 'd'], answer: i % 4,
      });
  };
  add('easy', 20); add('medium', 20); add('hard', 10);
  await QuizQuestion.insertMany(docs);

  const u = await User.create({
    email: 'lb@example.com', provider: 'google', providerId: 'lb-1',
    username: 'boarder', avatar: 'avatar0',
  });
  userId = u._id.toString();
  await Promise.all([
    Progress.create({ userId: u._id, points: 35 }),
    CoinWallet.create({ userId: u._id, coins: 100 }),
    Streak.create({ userId: u._id }),
  ]);
  ({ token } = issueSession(userId, 0));
});

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

it('reports live points even while the cached board is stale', async () => {
  // Board built at 35 — this is the snapshot the cron would have left behind.
  await buildLeaderboard('all');

  const before = await auth(request(app).get('/api/leaderboard/all')).expect(200);
  expect(before.body.me.points).toBe(35);
  expect(before.body.me.inTopList).toBe(true);

  // Score a quiz. The snapshot is deliberately NOT rebuilt, exactly as it
  // would not be within the cron's one-minute window.
  const s = (
    await auth(request(app).post('/api/quiz/start').send({ category: 'math' })).expect(200)
  ).body;
  for (let i = 0; i < 7; i++) {
    const q = await QuizQuestion.findById(s.questions[i].id).lean();
    await auth(request(app).post('/api/quiz/answer')
      .send({ sessionId: s.sessionId, questionId: s.questions[i].id, selected: q!.answer })).expect(200);
  }
  const bad = await QuizQuestion.findById(s.questions[7].id).lean();
  await auth(request(app).post('/api/quiz/answer')
    .send({ sessionId: s.sessionId, questionId: s.questions[7].id, selected: (bad!.answer + 1) % 4 })).expect(200);
  const fin = await auth(request(app).post('/api/quiz/finish').send({ sessionId: s.sessionId })).expect(200);
  expect(fin.body.points).toBe(7);

  // The cron has not rebuilt, yet the caller's own figures — both the summary
  // and their row on the board — must already reflect the run they just
  // finished. Other players' rows may still be cached.
  const after = await auth(request(app).get('/api/leaderboard/all')).expect(200);
  expect(after.body.me.points).toBe(42);
  expect(after.body.data[0].points).toBe(42);
  expect(after.body.me.inTopList).toBe(true);
  expect(after.body.me.rank).toBe(1);
});

it('still reports live points for a player who is off the board', async () => {
  await buildLeaderboard('all');
  const res = await auth(request(app).get('/api/leaderboard/all')).expect(200);
  expect(res.body.me.points).toBe(35);
});

describe('the board itself reflects the caller immediately', () => {
  it('updates the caller\'s own row without waiting for the cron', async () => {
    await buildLeaderboard('all');

    const s = (
      await auth(request(app).post('/api/quiz/start').send({ category: 'math' })).expect(200)
    ).body;
    for (let i = 0; i < 7; i++) {
      const q = await QuizQuestion.findById(s.questions[i].id).lean();
      await auth(request(app).post('/api/quiz/answer')
        .send({ sessionId: s.sessionId, questionId: s.questions[i].id, selected: q!.answer })).expect(200);
    }
    const bad = await QuizQuestion.findById(s.questions[7].id).lean();
    await auth(request(app).post('/api/quiz/answer')
      .send({ sessionId: s.sessionId, questionId: s.questions[7].id, selected: (bad!.answer + 1) % 4 })).expect(200);
    await auth(request(app).post('/api/quiz/finish').send({ sessionId: s.sessionId })).expect(200);

    // Snapshot deliberately NOT rebuilt — this is the cron's blind minute.
    const res = await auth(request(app).get('/api/leaderboard/all')).expect(200);
    const myRow = res.body.data.find((e: any) => e.userId === userId);
    expect(myRow.points).toBe(42);
    expect(res.body.me.points).toBe(42);
  });

  it('re-ranks when the new score overtakes another player', async () => {
    // A rival sits above at 40; the caller is on 35.
    const rival = await User.create({
      email: 'rival@example.com', provider: 'google', providerId: 'rival-1',
      username: 'rival', avatar: 'avatar0',
    });
    await Progress.create({ userId: rival._id, points: 40 });
    await buildLeaderboard('all');

    const before = await auth(request(app).get('/api/leaderboard/all')).expect(200);
    expect(before.body.data[0].username).toBe('rival');
    expect(before.body.me.rank).toBe(2);

    // Caller scores 7, reaching 42 — past the rival.
    const s = (
      await auth(request(app).post('/api/quiz/start').send({ category: 'math' })).expect(200)
    ).body;
    for (let i = 0; i < 7; i++) {
      const q = await QuizQuestion.findById(s.questions[i].id).lean();
      await auth(request(app).post('/api/quiz/answer')
        .send({ sessionId: s.sessionId, questionId: s.questions[i].id, selected: q!.answer })).expect(200);
    }
    const bad = await QuizQuestion.findById(s.questions[7].id).lean();
    await auth(request(app).post('/api/quiz/answer')
      .send({ sessionId: s.sessionId, questionId: s.questions[7].id, selected: (bad!.answer + 1) % 4 })).expect(200);
    await auth(request(app).post('/api/quiz/finish').send({ sessionId: s.sessionId })).expect(200);

    // Still no cron rebuild — the order must already be right.
    const after = await auth(request(app).get('/api/leaderboard/all')).expect(200);
    expect(after.body.data[0].username).toBe('boarder');
    expect(after.body.data[0].points).toBe(42);
    expect(after.body.data[0].rank).toBe(1);
    expect(after.body.data[1].username).toBe('rival');
    expect(after.body.data[1].rank).toBe(2);
    expect(after.body.me.rank).toBe(1);
  });
});

