/**
 * What happens when the world is not ideal: the network drops mid-answer, the
 * player backgrounds the app, the response to a successful write is lost.
 *
 * The rule the server enforces is that the question window is wall-clock and
 * authoritative. These pin the recovery paths that let a client realign with
 * it instead of guessing.
 */
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizQuestion from '../models/QuizQuestion';
import ActiveQuizSession from '../models/ActiveQuizSession';
import { initDefaultSettings } from '../models/AppSettings';
import { ANSWER_GRACE_MS, TIME_PER_QUESTION } from '../config/quizTiming';
import { issueSession } from '../utils/jwt';

let app: Express;
let token: string;

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
        category: 'math', difficulty: d, question: `${d} res ${i}?`,
        options: ['a', 'b', 'c', 'd'], answer: i % 4,
      });
  };
  add('easy', 20); add('medium', 20); add('hard', 10);
  await QuizQuestion.insertMany(docs);

  const u = await User.create({
    email: 'res@example.com', provider: 'google', providerId: 'res-1',
    username: 'resilient', avatar: 'avatar0',
  });
  await Promise.all([
    Progress.create({ userId: u._id }),
    CoinWallet.create({ userId: u._id, coins: 100 }),
    Streak.create({ userId: u._id }),
  ]);
  ({ token } = issueSession(u._id.toString(), 0));
});

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
const start = async () =>
  (await auth(request(app).post('/api/quiz/start').send({ category: 'math' })).expect(200)).body;

describe('the client can always find out where the run is', () => {
  it('start hands over the first question deadline', async () => {
    const s = await start();
    expect(s.deadlineAt).toBeDefined();
    const ms = new Date(s.deadlineAt).getTime() - Date.now();
    // Roughly one question window — this is what the countdown anchors to.
    expect(ms).toBeGreaterThan((TIME_PER_QUESTION - 2) * 1000);
    expect(ms).toBeLessThanOrEqual(TIME_PER_QUESTION * 1000);
  });

  it('state reports the live position and deadline', async () => {
    const s = await start();
    const q = await QuizQuestion.findById(s.questions[0].id).lean();
    await auth(request(app).post('/api/quiz/answer')
      .send({ sessionId: s.sessionId, questionId: s.questions[0].id, selected: q!.answer })).expect(200);

    const st = await auth(request(app).get(`/api/quiz/state/${s.sessionId}`)).expect(200);
    expect(st.body.currentIndex).toBe(1);
    expect(st.body.answeredCount).toBe(1);
    expect(st.body.correctCount).toBe(1);
    expect(st.body.finished).toBe(false);
    expect(st.body.currentQuestionId).toBe(s.questions[1].id);
    expect(st.body.deadlineAt).toBeTruthy();
  });

  it('a lost response is recoverable: retry gives 409, state says move on', async () => {
    const s = await start();
    const q = await QuizQuestion.findById(s.questions[0].id).lean();

    // First submit lands.
    await auth(request(app).post('/api/quiz/answer')
      .send({ sessionId: s.sessionId, questionId: s.questions[0].id, selected: q!.answer })).expect(200);

    // Client never saw the response and retries the same question.
    await auth(request(app).post('/api/quiz/answer')
      .send({ sessionId: s.sessionId, questionId: s.questions[0].id, selected: q!.answer })).expect(409);

    // …and can still discover it should be on question 2.
    const st = await auth(request(app).get(`/api/quiz/state/${s.sessionId}`)).expect(200);
    expect(st.body.currentIndex).toBe(1);
    expect(st.body.finished).toBe(false);
  });

  it('state tells the client when the run already ended', async () => {
    const s = await start();
    const q = await QuizQuestion.findById(s.questions[0].id).lean();
    await auth(request(app).post('/api/quiz/answer')
      .send({ sessionId: s.sessionId, questionId: s.questions[0].id, selected: (q!.answer + 1) % 4 })).expect(200);

    const st = await auth(request(app).get(`/api/quiz/state/${s.sessionId}`)).expect(200);
    expect(st.body.finished).toBe(true);
    expect(st.body.correctCount).toBe(0);
  });

  it("refuses to leak another player's session", async () => {
    const s = await start();
    const other = await User.create({
      email: 'nosy@example.com', provider: 'google', providerId: 'nosy-1',
      username: 'nosy', avatar: 'avatar0',
    });
    const { token: otherToken } = issueSession(other._id.toString(), 0);
    await request(app)
      .get(`/api/quiz/state/${s.sessionId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });
});

describe('backgrounding does not buy extra time', () => {
  it('the window is wall-clock, so time away still counts against it', async () => {
    const s = await start();

    // Simulate the app being away long enough for the window to close.
    await ActiveQuizSession.updateOne(
      { _id: s.sessionId },
      { $set: { questionDeadlineAt: new Date(Date.now() - ANSWER_GRACE_MS - 5_000) } },
    );

    const q = await QuizQuestion.findById(s.questions[0].id).lean();
    const res = await auth(request(app).post('/api/quiz/answer')
      .send({ sessionId: s.sessionId, questionId: s.questions[0].id, selected: q!.answer })).expect(400);
    expect(res.body.message).toMatch(/too late/i);

    // And state reports a deadline already in the past, so the client can show
    // the true remaining time (zero) instead of a frozen countdown.
    const st = await auth(request(app).get(`/api/quiz/state/${s.sessionId}`)).expect(200);
    expect(new Date(st.body.deadlineAt).getTime()).toBeLessThan(Date.now());
  });
});
