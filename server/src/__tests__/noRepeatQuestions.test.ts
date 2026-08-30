/**
 * The anti-repeat guarantee, exercised against a realistically-sized bank.
 *
 * Seeing the same question twice is the fastest way to make a quiz feel cheap,
 * and in a game with real-money leaderboards it is also an unfair advantage —
 * a player who has already seen a question answers it instantly.
 */
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizQuestion from '../models/QuizQuestion';
import UserQuestion from '../models/UserQuestion';
import { initDefaultSettings } from '../models/AppSettings';
import { issueSession } from '../utils/jwt';

let app: Express;

beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

/** Mirrors the real bank: 80 easy / 80 medium / 40 hard = 20 clean rounds. */
async function seedBank() {
  const docs: any[] = [];
  const add = (difficulty: string, n: number) => {
    for (let i = 0; i < n; i++) {
      docs.push({
        category: 'math',
        difficulty,
        question: `${difficulty} question ${i}?`,
        options: ['a', 'b', 'c', 'd'],
        answer: i % 4,
      });
    }
  };
  add('easy', 80);
  add('medium', 80);
  add('hard', 40);
  await QuizQuestion.insertMany(docs);
}

async function makePlayer(tag: string) {
  const u = await User.create({
    email: `${tag}@example.com`,
    provider: 'google',
    providerId: `p-${tag}`,
    username: `player${tag}`,
    avatar: 'avatar0',
  });
  await Promise.all([
    Progress.create({ userId: u._id }),
    CoinWallet.create({ userId: u._id, coins: 500 }),
    Streak.create({ userId: u._id }),
  ]);
  const { token } = issueSession(u._id.toString(), 0);
  return { id: u._id.toString(), token };
}

const startFor = async (token: string) =>
  (
    await request(app)
      .post('/api/quiz/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'math' })
      .expect(200)
  ).body as { sessionId: string; questions: { id: string; difficulty: string }[] };

beforeEach(async () => {
  await initDefaultSettings();
  await seedBank();
});

describe('within a single quiz', () => {
  it('never serves the same question twice', async () => {
    const p = await makePlayer('single');
    const { questions } = await startFor(p.token);
    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(10);
  });

  it('serves the intended 4 easy / 4 medium / 2 hard mix', async () => {
    const p = await makePlayer('mix');
    const { questions } = await startFor(p.token);
    const by = questions.reduce<Record<string, number>>((a, q) => {
      a[q.difficulty] = (a[q.difficulty] ?? 0) + 1;
      return a;
    }, {});
    expect(by).toEqual({ easy: 4, medium: 4, hard: 2 });
  });
});

describe('across quizzes', () => {
  it('never repeats until the pool is genuinely exhausted', async () => {
    const p = await makePlayer('many');
    const seen = new Set<string>();
    const repeats: string[] = [];

    // 20 rounds is exactly the bank: 80/4, 80/4, 40/2.
    for (let round = 0; round < 20; round++) {
      const { questions } = await startFor(p.token);
      for (const q of questions) {
        if (seen.has(q.id)) repeats.push(`round ${round + 1}: ${q.id}`);
        seen.add(q.id);
      }
    }

    expect(repeats).toEqual([]);
    expect(seen.size).toBe(200);
  });

  it('records exposure at start, so abandoning does not free a question', async () => {
    const p = await makePlayer('abandon');
    const first = await startFor(p.token);
    // No answers submitted at all — just walk away.
    const second = await startFor(p.token);

    const overlap = second.questions
      .map((q) => q.id)
      .filter((id) => first.questions.some((f) => f.id === id));
    expect(overlap).toEqual([]);

    expect(await UserQuestion.countDocuments({ userId: p.id })).toBe(20);
  });
});

describe('question selection variety', () => {
  it('does not hand two different players the identical quiz', async () => {
    const a = await makePlayer('a');
    const b = await makePlayer('b');

    const qa = (await startFor(a.token)).questions.map((q) => q.id);
    const qb = (await startFor(b.token)).questions.map((q) => q.id);

    const shared = qa.filter((id) => qb.includes(id));
    // Some overlap is fine and expected from a shared pool; being *identical*
    // means selection is deterministic, which makes every player's first quiz
    // the same and lets answers be shared around.
    expect(shared.length).toBeLessThan(10);
  });
});
