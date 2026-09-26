/**
 * Admin accounts, question upload, and tournament administration.
 */
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import type { Express } from 'express';

import Admin from '../models/Admin';
import User from '../models/User';
import CoinWallet from '../models/CoinWallet';
import Tournament from '../models/Tournament';
import QuizQuestion from '../models/QuizQuestion';
import { initDefaultSettings } from '../models/AppSettings';
import { signAdminToken } from '../utils/adminJwt';
import { joinTournament } from '../services/tournamentService';
import { ensureIndexes } from './setup';

let app: Express;
let superToken: string;
let modToken: string;
let superId: string;

beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

beforeEach(async () => {
  await initDefaultSettings();
  await ensureIndexes(Admin, QuizQuestion);
  const root = await Admin.create({ email: 'root@example.com', passwordHash: 'x', role: 'SUPER_ADMIN' });
  const mod = await Admin.create({ email: 'mod@example.com', passwordHash: 'x', role: 'MODERATOR' });
  superId = root._id.toString();
  superToken = signAdminToken({ _id: superId, role: 'SUPER_ADMIN' });
  modToken = signAdminToken({ _id: mod._id.toString(), role: 'MODERATOR' });
});

const as = (token: string, r: request.Test) => r.set('Authorization', `Bearer ${token}`);

describe('admin management', () => {
  it('a super admin creates a moderator who can then log in', async () => {
    await as(superToken, request(app).post('/api/admin/admins'))
      .send({ email: 'New@Example.com', password: 'longpassword123', role: 'MODERATOR' })
      .expect(201);
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'new@example.com', password: 'longpassword123' })
      .expect(200);
    expect(res.body.admin.role).toBe('MODERATOR');
  });

  it('moderators cannot manage admins', async () => {
    await as(modToken, request(app).get('/api/admin/admins')).expect(403);
    await as(modToken, request(app).post('/api/admin/admins'))
      .send({ email: 'x@example.com', password: 'longpassword123', role: 'SUPER_ADMIN' })
      .expect(403);
  });

  it('rejects weak passwords', async () => {
    await as(superToken, request(app).post('/api/admin/admins'))
      .send({ email: 'weak@example.com', password: 'short', role: 'MODERATOR' })
      .expect(400);
  });

  it('never leaves the platform without an active super admin', async () => {
    await as(superToken, request(app).patch(`/api/admin/admins/${superId}`)).send({ role: 'MODERATOR' }).expect(400);
    await as(superToken, request(app).patch(`/api/admin/admins/${superId}`)).send({ isActive: false }).expect(400);
  });

  it('a deactivated admin loses access on the next request', async () => {
    const mod = await Admin.findOne({ email: 'mod@example.com' });
    await as(superToken, request(app).patch(`/api/admin/admins/${mod!._id}`)).send({ isActive: false }).expect(200);
    await as(modToken, request(app).get('/api/admin/me')).expect(401);
  });

  it('locks an account after repeated wrong passwords', async () => {
    await Admin.create({ email: 'lock@example.com', passwordHash: await bcrypt.hash('rightpassword1', 4), role: 'MODERATOR' });
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/admin/login').send({ email: 'lock@example.com', password: 'wrong' }).expect(401);
    }
    await request(app).post('/api/admin/login').send({ email: 'lock@example.com', password: 'rightpassword1' }).expect(429);
  });
});

describe('question upload', () => {
  it('a moderator can create a question with the answer as an index', async () => {
    const res = await as(modToken, request(app).post('/api/admin/questions'))
      .send({ category: 'Science', question: 'What is H2O commonly called?', options: ['Salt', 'Water', 'Air', 'Fire'], answer: 1, difficulty: 'easy' })
      .expect(201);
    expect(res.body.question.answer).toBe(1);
    expect(res.body.question.category).toBe('science');
  });

  it('rejects duplicate options on create', async () => {
    await as(modToken, request(app).post('/api/admin/questions'))
      .send({ category: 'science', question: 'Pick the odd one out please', options: ['a', 'a', 'b', 'c'], answer: 0 })
      .expect(400);
  });

  it('imports a JSON file body larger than the global 256kb limit', async () => {
    const questions = Array.from({ length: 1500 }, (_, i) => ({
      category: 'bulk',
      difficulty: 'medium',
      question: `Bulk upload question number ${i} with some padding text to make it long enough?`,
      options: [`A${i}`, `B${i}`, `C${i}`, `D${i}`],
      answer: `A${i}`,
    }));
    const res = await as(modToken, request(app).post('/api/admin/questions/import')).send({ questions }).expect(200);
    expect(res.body.inserted).toBe(1500);
  });

  it('the large-body parser is not reachable without admin auth', async () => {
    await request(app).post('/api/admin/questions/import').send({ questions: [] }).expect(401);
  });

  it('only a super admin can delete, and a missing id is a 404', async () => {
    const q = await QuizQuestion.create({ category: 'x', question: 'Delete me please?', options: ['1', '2', '3', '4'], answer: 0 });
    await as(modToken, request(app).delete(`/api/admin/questions/${q._id}`)).expect(403);
    await as(superToken, request(app).delete(`/api/admin/questions/${q._id}`)).expect(200);
    await as(superToken, request(app).delete(`/api/admin/questions/${q._id}`)).expect(404);
  });
});

describe('tournament admin', () => {
  const body = () => ({
    title: 'Friday Cup',
    category: 'general knowledge',
    entryFeeCoins: 50,
    prizePoolCoins: 1000,
    maxParticipants: 10,
    startsAt: new Date(Date.now() + 3600e3).toISOString(),
    endsAt: new Date(Date.now() + 7200e3).toISOString(),
  });

  it('saves the fee and pool, and ignores mass-assigned fields', async () => {
    const res = await as(superToken, request(app).post('/api/admin/tournaments'))
      .send({ ...body(), participants: [{ userId: new mongoose.Types.ObjectId(), usernameSnapshot: 'x' }], settledAt: new Date() })
      .expect(201);
    const t = await Tournament.findById(res.body._id).lean();
    expect(t?.entryFeeCoins).toBe(50);
    expect(t?.prizePoolCoins).toBe(1000);
    expect(t?.participants).toHaveLength(0);
    expect(t?.settledAt).toBeNull();
  });

  it('a partial PATCH (Start now) does not wipe other fields', async () => {
    const res = await as(superToken, request(app).post('/api/admin/tournaments'))
      .send({ ...body(), description: 'Keep me', winnersCount: 5 })
      .expect(201);
    await as(superToken, request(app).patch(`/api/admin/tournaments/${res.body._id}`)).send({ status: 'active' }).expect(200);
    const t = await Tournament.findById(res.body._id).lean();
    expect(t?.status).toBe('active');
    expect(t?.description).toBe('Keep me');
    expect(t?.winnersCount).toBe(5);
  });

  it('cancel refunds every entry fee exactly once', async () => {
    const res = await as(superToken, request(app).post('/api/admin/tournaments')).send(body()).expect(201);
    const u = await User.create({ email: 't@e.com', provider: 'google', providerId: 't1', username: 'tplayer', avatar: 'avatar0' });
    await CoinWallet.create({ userId: u._id, coins: 100 });
    expect((await joinTournament(res.body._id, u._id.toString())).ok).toBe(true);
    expect((await CoinWallet.findOne({ userId: u._id }).lean())?.coins).toBe(50);

    await as(superToken, request(app).delete(`/api/admin/tournaments/${res.body._id}`)).expect(409);
    await as(superToken, request(app).post(`/api/admin/tournaments/${res.body._id}/cancel`)).expect(200);
    await as(superToken, request(app).post(`/api/admin/tournaments/${res.body._id}/cancel`)).expect(409);
    expect((await CoinWallet.findOne({ userId: u._id }).lean())?.coins).toBe(100);
  });
});
