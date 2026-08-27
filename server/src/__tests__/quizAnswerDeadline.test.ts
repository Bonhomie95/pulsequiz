/**
 * The question deadline, from the player's side.
 *
 * The server writes `questionDeadlineAt` when it hands a question out, but the
 * player's 15-second countdown only starts once that response has crossed the
 * network and rendered — and their answer has to cross back. A strict deadline
 * charges the player for both legs, so someone who taps with time visibly left
 * on screen gets a 400 and, because a late answer ends the run, loses it to
 * latency alone. That is what `ANSWER_GRACE_MS` exists to absorb.
 *
 * These tests pin both edges: the grace must be honoured, and it must not
 * become an open window.
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
import { issueSession } from '../utils/jwt';
import { ANSWER_GRACE_MS, TIME_PER_QUESTION } from '../config/quizTiming';

let app: Express;
let token: string;

beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

beforeEach(async () => {
  await initDefaultSettings();

  const docs = [];
  for (let i = 0; i < 40; i++) {
    docs.push({
      category: 'math',
      question: `Deadline question number ${i}?`,
      options: ['a', 'b', 'c', 'd'],
      answer: i % 4,
      difficulty: (['easy', 'easy', 'medium', 'medium', 'hard'] as const)[i % 5],
    });
  }
  await QuizQuestion.insertMany(docs);

  const user = await User.create({
    email: 'deadline@example.com',
    provider: 'google',
    providerId: 'deadline-1',
    username: 'deadlinetester',
    avatar: 'avatar0',
  });
  await Promise.all([
    Progress.create({ userId: user._id }),
    CoinWallet.create({ userId: user._id, coins: 500 }),
    Streak.create({ userId: user._id }),
  ]);
  ({ token } = issueSession(user._id.toString(), 0));
});

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

async function startQuiz() {
  const res = await auth(
    request(app).post('/api/quiz/start').send({ category: 'math' }),
  ).expect(200);
  return res.body as { sessionId: string; questions: { id: string }[] };
}

/** Move the current question's deadline to `msAgo` milliseconds in the past. */
async function expireBy(sessionId: string, msAgo: number) {
  await ActiveQuizSession.updateOne(
    { _id: sessionId },
    { $set: { questionDeadlineAt: new Date(Date.now() - msAgo) } },
  );
}

function answer(sessionId: string, questionId: string, selected: number | null) {
  return auth(
    request(app).post('/api/quiz/answer').send({ sessionId, questionId, selected }),
  );
}

describe('answer deadline', () => {
  it('accepts an answer that arrives inside the round-trip grace', async () => {
    const { sessionId, questions } = await startQuiz();
    const q = await QuizQuestion.findById(questions[0].id).lean();

    // The player tapped in time; the request landed just past the deadline.
    await expireBy(sessionId, ANSWER_GRACE_MS / 2);

    const res = await answer(sessionId, questions[0].id, q!.answer).expect(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.finished).toBe(false);
  });

  it('rejects an answer that arrives past the grace', async () => {
    const { sessionId, questions } = await startQuiz();
    const q = await QuizQuestion.findById(questions[0].id).lean();

    await expireBy(sessionId, ANSWER_GRACE_MS + 2_000);

    const res = await answer(sessionId, questions[0].id, q!.answer).expect(400);
    expect(res.body.message).toMatch(/too late/i);
  });

  it('gives the next question a full window, not a grace-extended one', async () => {
    const { sessionId, questions } = await startQuiz();
    const first = await QuizQuestion.findById(questions[0].id).lean();

    const before = Date.now();
    await answer(sessionId, questions[0].id, first!.answer).expect(200);

    const session = await ActiveQuizSession.findById(sessionId).lean();
    const window = session!.questionDeadlineAt!.getTime() - before;

    // The grace is applied when checking, never when granting — otherwise each
    // question would quietly be 17.5s long and the grace would compound.
    // `before` is taken ahead of the request, so the window carries the
    // handler's own processing time; the point is that it is nowhere near
    // a full grace period longer.
    expect(window).toBeGreaterThan(TIME_PER_QUESTION * 1000 - 1_000);
    expect(window).toBeLessThan(TIME_PER_QUESTION * 1000 + ANSWER_GRACE_MS);
  });

  it('the controller and the service agree on the cutoff', async () => {
    // The controller checks the deadline before delegating. If it were stricter
    // than the service, the service's grace would be unreachable — this pins
    // that the request actually reaches the service and scores.
    const { sessionId, questions } = await startQuiz();
    const q = await QuizQuestion.findById(questions[0].id).lean();

    await expireBy(sessionId, ANSWER_GRACE_MS - 500);

    const res = await answer(sessionId, questions[0].id, q!.answer).expect(200);
    expect(res.body.correct).toBe(true);

    const session = await ActiveQuizSession.findById(sessionId).lean();
    expect(session!.answers).toHaveLength(1);
  });
});
