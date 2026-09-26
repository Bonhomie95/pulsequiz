/**
 * Relaxed / daily / duel modes, leagues, the guest taster, report de-dupe and
 * prize regions — driven through HTTP the way the app drives them.
 */
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizQuestion from '../models/QuizQuestion';
import QuizSession from '../models/QuizSession';
import { DailyAttempt } from '../models/DailyQuiz';
import { LeagueGroup, LeagueMember } from '../models/League';
import { initDefaultSettings, setSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { issueSession } from '../utils/jwt';
import { ensureIndexes } from './setup';
import { outcomeFor, settleFinishedWeeks, zoneSizes } from '../services/leagueService';
import { isPlayableDate, utcDateKey } from '../services/dailyService';
import { checkPayoutEligibility } from '../services/payoutService';
import { getBalance } from '../services/coinService';

let app: Express;

beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

let n = 0;
async function makeUser() {
  n += 1;
  const user = await User.create({
    email: `modes${n}@example.com`,
    provider: 'google',
    providerId: `modes-${n}`,
    username: `modes${n}`,
    avatar: 'avatar0',
  });
  await Promise.all([
    Progress.create({ userId: user._id }),
    CoinWallet.create({ userId: user._id, coins: 500 }),
    Streak.create({ userId: user._id }),
  ]);
  const { token } = issueSession(user._id.toString(), 0);
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return { id: user._id.toString(), auth };
}

beforeEach(async () => {
  await initDefaultSettings();
  await Promise.all([
    ensureIndexes(QuizSession),
    ensureIndexes(DailyAttempt),
    ensureIndexes(LeagueMember),
  ]);
  const docs = [];
  for (let i = 0; i < 40; i++) {
    docs.push({
      category: 'science',
      question: `Mode question number ${i}?`,
      options: ['a', 'b', 'c', 'd'],
      answer: i % 4,
      difficulty: (['easy', 'easy', 'medium', 'medium', 'hard'] as const)[i % 5],
      explanation: i === 0 ? 'Because a is first.' : undefined,
    });
  }
  await QuizQuestion.insertMany(docs);
});

type Auth = (r: request.Test) => request.Test;

/** Play every question; `wrongAt` indexes get a wrong answer. */
async function playAll(auth: Auth, start: any, wrongAt: number[] = []) {
  const { sessionId, questions } = start;
  for (let i = 0; i < questions.length; i++) {
    const q = await QuizQuestion.findById(questions[i].id).lean();
    const selected = wrongAt.includes(i) ? (q!.answer + 1) % 4 : q!.answer;
    const res = await auth(
      request(app).post('/api/quiz/answer').send({ sessionId, questionId: questions[i].id, selected }),
    ).expect(200);
    expect(res.body.finished).toBe(i === questions.length - 1);
  }
  return (await auth(request(app).post('/api/quiz/finish').send({ sessionId })).expect(200)).body;
}

describe('relaxed mode', () => {
  it('keeps going after a wrong answer, ranks nothing, but earns league XP', async () => {
    const u = await makeUser();
    const start = (
      await u.auth(request(app).post('/api/quiz/start').send({ category: 'science', mode: 'relaxed' })).expect(200)
    ).body;
    expect(start.mode).toBe('relaxed');

    const result = await playAll(u.auth, start, [1, 4]);
    expect(result.correct).toBe(start.questions.length - 2);
    expect(result.points).toBe(0);
    expect(result.leagueXp).toBe(start.questions.length - 2);
    expect(result.results.filter(Boolean)).toHaveLength(start.questions.length - 2);

    expect((await Progress.findOne({ userId: u.id }).lean())?.points).toBe(0);
    const member = await LeagueMember.findOne({ userId: u.id }).lean();
    expect(member?.xp).toBe(start.questions.length - 2);
  });

  it('a wrong answer still returns the explanation and the next deadline', async () => {
    const u = await makeUser();
    const start = (
      await u.auth(request(app).post('/api/quiz/start').send({ category: 'science', mode: 'relaxed' })).expect(200)
    ).body;
    const res = await u.auth(
      request(app).post('/api/quiz/answer').send({
        sessionId: start.sessionId,
        questionId: start.questions[0].id,
        selected: null,
      }),
    ).expect(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.finished).toBe(false);
    expect(res.body.nextQuestionId).toBe(start.questions[1].id);
    expect(new Date(res.body.deadlineAt).getTime()).toBeGreaterThan(Date.now() + 15_000);
  });
});

describe('classic mode', () => {
  it('ranked points also count as league XP', async () => {
    const u = await makeUser();
    const start = (
      await u.auth(request(app).post('/api/quiz/start').send({ category: 'science' })).expect(200)
    ).body;
    const result = await playAll(u.auth, start);
    expect(result.points).toBe(start.questions.length + 10);
    expect(result.leagueXp).toBe(result.points);
  });
});

describe('daily quiz', () => {
  const today = utcDateKey();

  it('serves one shared puzzle, one attempt, and records the grid', async () => {
    const a = await makeUser();
    const b = await makeUser();

    const sa = (
      await a.auth(request(app).post('/api/quiz/start').send({ mode: 'daily', date: today })).expect(200)
    ).body;
    const sb = (
      await b.auth(request(app).post('/api/quiz/start').send({ mode: 'daily', date: today })).expect(200)
    ).body;
    expect(sb.questions.map((q: any) => q.id)).toEqual(sa.questions.map((q: any) => q.id));

    // No bought help in shared modes.
    const hint = await a.auth(
      request(app).post('/api/quiz/hint').send({ sessionId: sa.sessionId, questionId: sa.questions[0].id }),
    ).expect(200);
    expect(hint.body.disabledIndex).toBeNull();

    const result = await playAll(a.auth, sa, [2]);
    expect(result.points).toBe(0);
    expect(result.dailyDate).toBe(today);

    await a.auth(request(app).post('/api/quiz/start').send({ mode: 'daily', date: today })).expect(409);

    const view = (await a.auth(request(app).get(`/api/daily?date=${today}`)).expect(200)).body;
    expect(view.finished).toBe(true);
    expect(view.result.results[2]).toBe(false);
    expect(view.myRank).toBe(1);
    expect(view.top[0].isMe).toBe(true);
  });

  it('pays coins for finishing, whatever the score', async () => {
    // Turning up has to be worth something: finishing the daily and seeing the
    // balance unchanged reads as the run not having counted.
    const u = await makeUser();
    const before = await getBalance(u.id);

    const start = (
      await u.auth(request(app).post('/api/quiz/start').send({ mode: 'daily', date: today })).expect(200)
    ).body;
    const result = await playAll(u.auth, start, [0, 1, 2, 3]);

    expect(result.correct).toBeLessThan(result.total);
    expect(result.dailyCoins).toBe(10);
    expect(await getBalance(u.id)).toBe(before + 10);
  });

  it('pays more for a clean sweep', async () => {
    const u = await makeUser();
    const before = await getBalance(u.id);

    const start = (
      await u.auth(request(app).post('/api/quiz/start').send({ mode: 'daily', date: today })).expect(200)
    ).body;
    const result = await playAll(u.auth, start);

    expect(result.correct).toBe(result.total);
    expect(result.dailyCoins).toBe(50);
    expect(await getBalance(u.id)).toBe(before + 50);
  });

  it('pays once, however many times finish is replayed', async () => {
    const u = await makeUser();
    const before = await getBalance(u.id);

    const start = (
      await u.auth(request(app).post('/api/quiz/start').send({ mode: 'daily', date: today })).expect(200)
    ).body;
    await playAll(u.auth, start, [0]);
    const balance = await getBalance(u.id);
    expect(balance).toBe(before + 10);

    await u.auth(request(app).post('/api/quiz/finish').send({ sessionId: start.sessionId }));
    expect(await getBalance(u.id)).toBe(balance);
  });

  it('rejects a date no timezone is on yet', async () => {
    const u = await makeUser();
    const future = utcDateKey(new Date(Date.now() + 3 * 24 * 3600 * 1000));
    await u.auth(request(app).post('/api/quiz/start').send({ mode: 'daily', date: future })).expect(400);
    expect(isPlayableDate(today)).toBe(true);
    expect(isPlayableDate('2020-01-01')).toBe(false);
  });
});

describe('friend duels', () => {
  it('creator and one friend play the same set; a third player is refused', async () => {
    const creator = await makeUser();
    const friend = await makeUser();
    const stranger = await makeUser();

    const { code } = (
      await creator.auth(request(app).post('/api/duels').send({ category: 'science' })).expect(201)
    ).body;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const s1 = (
      await creator.auth(request(app).post('/api/quiz/start').send({ mode: 'duel', duelCode: code })).expect(200)
    ).body;
    await playAll(creator.auth, s1, [0]);

    // The friend can't see the score to beat before playing.
    const before = (await friend.auth(request(app).get(`/api/duels/${code}`)).expect(200)).body;
    expect(before.canPlay).toBe(true);
    expect(before.players[0].correct).toBeNull();

    const s2 = (
      await friend.auth(request(app).post('/api/quiz/start').send({ mode: 'duel', duelCode: code })).expect(200)
    ).body;
    expect(s2.questions.map((q: any) => q.id)).toEqual(s1.questions.map((q: any) => q.id));
    await playAll(friend.auth, s2);

    await stranger.auth(request(app).post('/api/quiz/start').send({ mode: 'duel', duelCode: code })).expect(409);
    await creator.auth(request(app).post('/api/quiz/start').send({ mode: 'duel', duelCode: code })).expect(409);

    const after = (await creator.auth(request(app).get(`/api/duels/${code}`)).expect(200)).body;
    expect(after.complete).toBe(true);
    expect(after.winnerId).toBe(friend.id);

    const list = (await friend.auth(request(app).get('/api/duels')).expect(200)).body.duels;
    expect(list[0]).toMatchObject({ code, myStatus: 'done', theirStatus: 'done' });
  });
});

describe('guest taster', () => {
  it('needs no account and includes the answers', async () => {
    const res = await request(app).get('/api/quiz/guest').expect(200);
    expect(res.body.questions).toHaveLength(5);
    expect(typeof res.body.questions[0].answer).toBe('number');
  });
});

describe('question reports', () => {
  it('counts one report per player', async () => {
    const u = await makeUser();
    const q = await QuizQuestion.findOne().lean();
    const body = { questionId: String(q!._id), reason: 'wrong_answer' };
    await u.auth(request(app).post('/api/reports/question').send(body)).expect(200);
    await u.auth(request(app).post('/api/reports/question').send(body)).expect(200);
    expect((await QuizQuestion.findById(q!._id).lean())?.reportCount).toBe(1);
  });
});

describe('sign-in providers', () => {
  it('refuses Facebook while it is switched off', async () => {
    const res = await request(app)
      .post('/api/auth/oauth')
      .send({ provider: 'facebook', token: 'x'.repeat(40) });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/Apple or Google/);
  });
});

describe('prize regions', () => {
  it('offers prizes only in listed countries', async () => {
    const u = await makeUser();
    await setSetting(SETTINGS_KEYS.PRIZE_COUNTRIES, 'US,CA');

    const gb = await u.auth(request(app).get('/api/auth/me').set('X-Region', 'GB')).expect(200);
    expect(gb.body.user).toMatchObject({ country: 'GB', prizesAvailable: false });
    expect((await checkPayoutEligibility(u.id)).reason).toBe('region_not_eligible');

    const us = await u.auth(request(app).get('/api/auth/me').set('X-Region', 'US')).expect(200);
    expect(us.body.user.prizesAvailable).toBe(true);

    await setSetting(SETTINGS_KEYS.PRIZES_ENABLED, false);
    const off = await u.auth(request(app).get('/api/auth/me').set('X-Region', 'US')).expect(200);
    expect(off.body.user.prizesAvailable).toBe(false);
  });
});

describe('leagues', () => {
  it('zones scale with group size', () => {
    expect(zoneSizes(30, 0)).toEqual({ promote: 6, demote: 0 });
    expect(zoneSizes(30, 3)).toEqual({ promote: 6, demote: 6 });
    expect(zoneSizes(1, 2)).toEqual({ promote: 1, demote: 0 });
    expect(zoneSizes(30, 6).promote).toBe(0);
    expect(outcomeFor(30, 30, 3)).toBe('demoted');
    expect(outcomeFor(7, 30, 3)).toBe('stayed');
  });

  it('settles a finished week once: moves tiers and pays the podium', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    const group = await LeagueGroup.create({ week: '2020-W01', tier: 2, size: 6 });
    await LeagueMember.insertMany(
      users.map((u, i) => ({ userId: u.id, week: '2020-W01', tier: 2, groupId: group._id, xp: 100 - i })),
    );

    expect(await settleFinishedWeeks()).toBe(1);
    expect(await settleFinishedWeeks()).toBe(0);

    const top = await User.findById(users[0].id).lean();
    const bottom = await User.findById(users[5].id).lean();
    const middle = await User.findById(users[2].id).lean();
    expect(top?.leagueTier).toBe(3);
    expect(bottom?.leagueTier).toBe(1);
    expect(middle?.leagueTier).toBe(2);
    // 100 base + 50% per tier above Bronze, on top of the 500 starting coins.
    expect(await getBalance(users[0].id)).toBe(500 + 200);

    const view = (await users[0].auth(request(app).get('/api/leagues/current')).expect(200)).body;
    expect(view.tierName).toBe('Platinum');
    expect(view.lastResult).toMatchObject({ outcome: 'promoted', rank: 1, reward: 200 });
  });
});
