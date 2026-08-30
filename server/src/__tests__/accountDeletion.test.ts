/**
 * In-app account deletion.
 *
 * App Store Guideline 5.1.1(v) and Google Play both require an account created
 * in the app to be deletable from the app, and reviewers test this path
 * directly. It is also destructive and irreversible, so the confirmation guard
 * matters as much as the deletion itself.
 */
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
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
  const user = await User.create({
    email: 'leaving@example.com',
    provider: 'google',
    providerId: 'leaving-1',
    username: 'leavingplayer',
    avatar: 'avatar0',
  });
  userId = user._id.toString();
  await Promise.all([
    Progress.create({ userId: user._id, points: 120 }),
    CoinWallet.create({ userId: user._id, coins: 300 }),
    Streak.create({ userId: user._id, streak: 9 }),
  ]);
  ({ token } = issueSession(userId, 0));
});

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

describe('DELETE /api/auth/account', () => {
  it('requires authentication', async () => {
    await request(app).delete('/api/auth/account').send({ confirm: 'DELETE' }).expect(401);
  });

  it('refuses without the exact confirmation token', async () => {
    for (const body of [{}, { confirm: 'delete' }, { confirm: 'yes' }]) {
      await auth(request(app).delete('/api/auth/account').send(body)).expect(400);
    }
    // Still present after every refused attempt.
    const still = await User.findById(userId).lean();
    expect(still?.deletedAt ?? null).toBeNull();
  });

  it('deletes the account and revokes the session', async () => {
    const res = await auth(
      request(app).delete('/api/auth/account').send({ confirm: 'DELETE' }),
    ).expect(200);
    expect(res.body.ok).toBe(true);

    // The token that authorised the deletion must not still work afterwards.
    await auth(request(app).get('/api/auth/me')).expect(401);
  });

  it('removes the player from listings and leaves no live profile', async () => {
    await auth(
      request(app).delete('/api/auth/account').send({ confirm: 'DELETE' }),
    ).expect(200);

    const after = await User.findById(userId).lean();
    // A tombstone may remain for referential integrity, but it must not be a
    // usable account: reviewers check that the data is actually gone.
    if (after) {
      expect(after.deletedAt).toBeTruthy();
      expect(after.email).not.toBe('leaving@example.com');
    }
    expect(await User.countDocuments({ deletedAt: null })).toBe(0);
  });
});
