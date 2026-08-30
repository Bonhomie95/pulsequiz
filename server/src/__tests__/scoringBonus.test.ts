import request from 'supertest';
import type { Express } from 'express';
import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import QuizQuestion from '../models/QuizQuestion';
import { initDefaultSettings } from '../models/AppSettings';
import { issueSession } from '../utils/jwt';

let app: Express; let token: string; let userId: string;
beforeAll(async () => { process.env.FRONTEND_ORIGIN='http://localhost:5173'; ({ default: app } = await import('../app')); });
beforeEach(async () => {
  await initDefaultSettings();
  const docs = [];
  for (let i = 0; i < 60; i++) docs.push({ category:'math', question:`Bonus q ${i}?`, options:['a','b','c','d'], answer:i%4,
    difficulty:(['easy','easy','medium','medium','hard'] as const)[i%5] });
  await QuizQuestion.insertMany(docs);
  const u = await User.create({ email:'b@e.com', provider:'google', providerId:'b1', username:'bonususer', avatar:'avatar0' });
  userId = u._id.toString();
  await Promise.all([Progress.create({userId:u._id}), CoinWallet.create({userId:u._id,coins:500}), Streak.create({userId:u._id})]);
  ({ token } = issueSession(userId, 0));
});
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
const start = async () => (await auth(request(app).post('/api/quiz/start').send({category:'math'})).expect(200)).body;
const ans = (s:string,q:string,sel:number|null) => auth(request(app).post('/api/quiz/answer').send({sessionId:s,questionId:q,selected:sel}));

it('perfect run scores exactly 20', async () => {
  const { sessionId, questions } = await start();
  expect(questions.length).toBe(10);
  for (const r of questions) {
    const q = await QuizQuestion.findById(r.id).lean();
    await ans(sessionId, r.id, q!.answer).expect(200);
  }
  const fin = await auth(request(app).post('/api/quiz/finish').send({sessionId})).expect(200);
  expect(fin.body.correct).toBe(10);
  expect(fin.body.points).toBe(20);
  expect((await Progress.findOne({userId}).lean())!.points).toBe(20);
});

it('abandoning after correct answers earns NO perfect bonus', async () => {
  const { sessionId, questions } = await start();
  // Answer 3 correctly then walk away and finish — total stays 10, so the
  // run is not perfect and must score 3, not 13.
  for (let i = 0; i < 3; i++) {
    const q = await QuizQuestion.findById(questions[i].id).lean();
    await ans(sessionId, questions[i].id, q!.answer).expect(200);
  }
  const fin = await auth(request(app).post('/api/quiz/finish').send({sessionId})).expect(200);
  expect(fin.body.correct).toBe(3);
  expect(fin.body.points).toBe(3);
});

it('nine correct then one wrong scores 9, not 19', async () => {
  const { sessionId, questions } = await start();
  for (let i = 0; i < 9; i++) {
    const q = await QuizQuestion.findById(questions[i].id).lean();
    await ans(sessionId, questions[i].id, q!.answer).expect(200);
  }
  const last = await QuizQuestion.findById(questions[9].id).lean();
  await ans(sessionId, questions[9].id, (last!.answer + 1) % 4).expect(200);
  const fin = await auth(request(app).post('/api/quiz/finish').send({sessionId})).expect(200);
  expect(fin.body.points).toBe(9);
});
