/**
 * The admin panel's data surface.
 *
 * The panel is the only tool for spotting foul play and for answering "how is
 * the game doing", so gaps here are invisible until someone needs them
 * urgently. These cover the things an operator actually asks for: who the
 * players are, how they score, how retention looks through streaks, and that
 * ban and delete really take effect.
 */
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import Admin from '../models/Admin';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import { initDefaultSettings } from '../models/AppSettings';
import { signAdminToken } from '../utils/adminJwt';

let app: Express;
let adminToken: string;

beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

/** Streak values chosen to land one player in every bucket. */
const STREAKS = [0, 0, 1, 2, 4, 6, 9, 13, 20, 29, 45, 100];

beforeEach(async () => {
  await initDefaultSettings();

  const admin = await Admin.create({
    email: 'root@example.com',
    passwordHash: 'not-used — the token is signed directly',
    role: 'SUPER_ADMIN',
  });
  adminToken = signAdminToken({ _id: admin._id.toString(), role: 'SUPER_ADMIN' });

  for (let i = 0; i < STREAKS.length; i++) {
    const u = await User.create({
      email: `p${i}@example.com`,
      provider: 'google',
      providerId: `p-${i}`,
      username: `player${i}`,
      avatar: 'avatar0',
    });
    await Promise.all([
      Progress.create({
        userId: u._id,
        points: i * 10,
        level: 1 + i,
        totalQuizzes: i,
        correctAnswers: i * 2,
        totalAnswers: i * 4,
      }),
      CoinWallet.create({ userId: u._id, coins: 100 + i }),
      Streak.create({ userId: u._id, streak: STREAKS[i], lastCheckIn: new Date() }),
    ]);
  }
});

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

describe('user list', () => {
  it('carries score and streak, so the list is usable without opening each user', async () => {
    const res = await auth(request(app).get('/api/admin/users?limit=100')).expect(200);
    const byName = new Map<string, any>(res.body.users.map((u: any) => [u.username, u]));

    expect(byName.size).toBe(STREAKS.length);
    const p5 = byName.get('player5');
    expect(p5.points).toBe(50);
    expect(p5.streak).toBe(6);
    expect(p5.coins).toBe(105);
    expect(p5.accuracy).toBe(50); // 10 correct of 20
    expect(p5.level).toBe(6);
  });

  it('reports total player count', async () => {
    const res = await auth(request(app).get('/api/admin/stats/users')).expect(200);
    expect(res.body.total).toBe(STREAKS.length);
  });
});

describe('streak ranking', () => {
  it('places every player in a bucket and the shares add up', async () => {
    const res = await auth(request(app).get('/api/admin/stats/streaks')).expect(200);

    expect(res.body.total).toBe(STREAKS.length);
    expect(res.body.active).toBe(STREAKS.filter((s) => s > 0).length);
    expect(res.body.longestStreak).toBe(100);

    const counted = res.body.distribution.reduce((n: number, b: any) => n + b.count, 0);
    expect(counted).toBe(STREAKS.length);

    // Percentages are the point of the ranking — they must describe the whole
    // base, not a subset.
    const pct = res.body.distribution.reduce((n: number, b: any) => n + b.percent, 0);
    expect(pct).toBeGreaterThan(99);
    expect(pct).toBeLessThan(101);

    const labels = res.body.distribution.map((b: any) => b.label);
    expect(labels).toEqual([
      'No streak', '1–2 days', '3–6 days', '7–13 days', '14–29 days', '30+ days',
    ]);
    const byLabel = new Map(res.body.distribution.map((b: any) => [b.label, b.count]));
    expect(byLabel.get('No streak')).toBe(2);   // 0, 0
    expect(byLabel.get('1–2 days')).toBe(2);    // 1, 2
    expect(byLabel.get('3–6 days')).toBe(2);    // 4, 6
    expect(byLabel.get('7–13 days')).toBe(2);   // 9, 13
    expect(byLabel.get('14–29 days')).toBe(2);  // 20, 29
    expect(byLabel.get('30+ days')).toBe(2);    // 45, 100
  });

  it('ranks top holders highest-first with usable identities', async () => {
    const res = await auth(request(app).get('/api/admin/stats/streaks')).expect(200);
    expect(res.body.top[0]).toMatchObject({ username: 'player11', streak: 100 });
    expect(res.body.top[1]).toMatchObject({ username: 'player10', streak: 45 });
    const streaks = res.body.top.map((t: any) => t.streak);
    expect([...streaks].sort((a, b) => b - a)).toEqual(streaks);
  });

  it('gives a single user their rank and percentile', async () => {
    const top = await User.findOne({ username: 'player11' }).lean();
    const res = await auth(request(app).get(`/api/admin/users/${top!._id}`)).expect(200);

    expect(res.body.user.streak.current).toBe(100);
    expect(res.body.user.streak.rank).toBe(1);
    expect(res.body.user.streak.of).toBe(STREAKS.length);
    expect(res.body.user.streak.percentile).toBeLessThanOrEqual(9);

    const bottom = await User.findOne({ username: 'player0' }).lean();
    const low = await auth(request(app).get(`/api/admin/users/${bottom!._id}`)).expect(200);
    // Tied at zero with one other player, so rank is behind everyone with a streak.
    expect(low.body.user.streak.rank).toBe(11);
    expect(low.body.user.streak.percentile).toBeGreaterThan(80);
  });
});

describe('foul play controls', () => {
  it('ban revokes existing sessions and blocks withdrawals', async () => {
    const u = await User.findOne({ username: 'player3' });
    const before = u!.tokenVersion ?? 0;

    await auth(request(app).patch(`/api/admin/users/${u!._id}/ban`)).expect(200);

    const after = await User.findById(u!._id).lean();
    expect(after!.isBanned).toBe(true);
    expect(after!.withdrawalEnabled).toBe(false);
    // Bumping tokenVersion is what makes the ban immediate rather than
    // waiting for their current token to expire.
    expect(after!.tokenVersion).toBe(before + 1);
  });

  it('ban is reversible', async () => {
    const u = await User.findOne({ username: 'player3' });
    await auth(request(app).patch(`/api/admin/users/${u!._id}/ban`)).expect(200);
    await auth(request(app).patch(`/api/admin/users/${u!._id}/ban`)).expect(200);
    expect((await User.findById(u!._id).lean())!.isBanned).toBe(false);
  });

  it('delete removes the account from listings', async () => {
    const u = await User.findOne({ username: 'player4' });
    await auth(request(app).delete(`/api/admin/users/${u!._id}`)).expect(200);

    const res = await auth(request(app).get('/api/admin/users?limit=100')).expect(200);
    const names = res.body.users.map((x: any) => x.username);
    expect(names).not.toContain('player4');
    expect(res.body.total).toBe(STREAKS.length - 1);

    // And the headline player count must agree — a tombstone that still counts
    // would quietly inflate the dashboard forever.
    const stats = await auth(request(app).get('/api/admin/stats/users')).expect(200);
    expect(stats.body.total).toBe(STREAKS.length - 1);
  });

  it('flagged accounts are filterable for review', async () => {
    const res = await auth(request(app).get('/api/admin/users?filter=flagged')).expect(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });
});
