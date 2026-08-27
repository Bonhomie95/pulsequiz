import mongoose from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import Purchase from '../models/Purchase';
import { issueSession, signAccessToken } from '../utils/jwt';
import { anonymiseUser } from '../services/accountService';
import { isTextOffensive, checkAvatar } from '../utils/moderation';
import { validateUsdtAddress } from '../utils/validateWallet';
import { ensureIndexes } from './setup';

let app: Express;

beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    provider: 'google',
    providerId: new mongoose.Types.ObjectId().toString(),
    username: `u${Math.floor(Math.random() * 1e9)}`,
    avatar: 'avatar0',
    ...overrides,
  });
  await Promise.all([
    Progress.create({ userId: user._id }),
    CoinWallet.create({ userId: user._id }),
    Streak.create({ userId: user._id }),
  ]);
  return user;
}

describe('authentication', () => {
  it('rejects a request with no token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ userId: new mongoose.Types.ObjectId().toString(), tv: 0, typ: 'access' }, 'not-the-secret');

    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('rejects a token whose version no longer matches — this is what makes logout real', async () => {
    const user = await makeUser();
    const { token } = issueSession(user._id.toString(), 0);

    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    // Simulate logout / forced sign-out.
    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });

    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('rejects a banned account with 403 so the client knows to sign out', async () => {
    const user = await makeUser({ isBanned: true });
    const token = signAccessToken(user._id.toString(), 0);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(res.body.message).toMatch(/banned/i);
  });

  it('rejects a refresh token used as an access token', async () => {
    const user = await makeUser();
    const { refreshToken } = issueSession(user._id.toString(), 0);

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(401);
  });

  it('still accepts a pre-versioning token, and swaps it for a modern pair', async () => {
    // Old tokens were signed with a ten-year expiry and no typ/tv claim, so
    // bumping tokenVersion cannot revoke them. /auth/me hands back a fresh
    // short-lived pair so the client can stop using the old one.
    const jwt = require('jsonwebtoken');
    const user = await makeUser();
    const legacy = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET!, {
      expiresIn: '3650d',
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${legacy}`)
      .expect(200);

    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    // And the replacement is a modern token that carries the version claim.
    const decoded: any = jwt.decode(res.body.token);
    expect(decoded.typ).toBe('access');
    expect(decoded.tv).toBe(0);
    // 30 days, not ten years.
    expect(decoded.exp - decoded.iat).toBeLessThan(40 * 24 * 60 * 60);
  });

  it('does not re-issue for a token that is already modern', async () => {
    const user = await makeUser();
    const token = signAccessToken(user._id.toString(), 0);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.token).toBeUndefined();
  });

  it('can refuse legacy tokens outright once the fleet has rolled over', async () => {
    const jwt = require('jsonwebtoken');
    const user = await makeUser();
    const legacy = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET!, {
      expiresIn: '3650d',
    });

    process.env.REJECT_LEGACY_TOKENS = '1';
    try {
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${legacy}`)
        .expect(401);
    } finally {
      delete process.env.REJECT_LEGACY_TOKENS;
    }
  });

  it('rejects a deleted account', async () => {
    const user = await makeUser();
    const token = signAccessToken(user._id.toString(), 0);
    await anonymiseUser(user._id.toString());

    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });
});

describe('admin surface', () => {
  it('refuses every admin route without a cookie or bearer', async () => {
    for (const path of [
      '/api/admin/users',
      '/api/admin/payouts',
      '/api/admin/settings',
      '/api/admin/audit',
    ]) {
      await request(app).get(path).expect(401);
    }
  });

  it('does not accept a user token as an admin token', async () => {
    const user = await makeUser();
    const token = signAccessToken(user._id.toString(), 0);

    await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});

describe('input handling', () => {
  it('returns 400, not 500, for malformed JSON', async () => {
    await request(app)
      .post('/api/auth/oauth')
      .set('Content-Type', 'application/json')
      .send('{"provider":')
      .expect(400);
  });

  it('rejects an oversized body', async () => {
    const user = await makeUser();
    const token = signAccessToken(user._id.toString(), 0);

    await request(app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'x', avatar: 'a'.repeat(400_000) })
      .expect(413);
  });

  it('returns 404 for an unknown route rather than leaking a stack', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);
    expect(res.body).toEqual({ message: 'Not found' });
  });

  it('attaches a request id to every response for support triage', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('purchase idempotency', () => {
  it('will not let a second account claim the same store transaction', async () => {
    await ensureIndexes(Purchase);
    const userA = await makeUser();
    const userB = await makeUser();

    await Purchase.create({
      userId: userA._id,
      store: 'apple',
      sku: 'pq_coins_500',
      coins: 500,
      priceUsd: 0.99,
      uniqueKey: 'apple:shared-txn',
      appleTransactionId: 'shared-txn',
      state: 'CREDITED',
      creditedCoins: 500,
    });

    // The unique index on uniqueKey is what enforces this.
    await expect(
      Purchase.create({
        userId: userB._id,
        store: 'apple',
        sku: 'pq_coins_500',
        coins: 500,
        priceUsd: 0.99,
        uniqueKey: 'apple:shared-txn',
        appleTransactionId: 'shared-txn',
        state: 'PENDING',
      }),
    ).rejects.toThrow();
  });
});

describe('moderation and validation helpers', () => {
  it('catches leet-speak and separator evasion', () => {
    expect(isTextOffensive('fuck')).toBe(true);
    expect(isTextOffensive('f_u-c.k')).toBe(true);
    expect(isTextOffensive('fvck')).toBe(false); // documented limitation
    expect(isTextOffensive('sh1t')).toBe(true);
  });

  it('does not flag innocent words (no Scunthorpe problem)', () => {
    for (const word of ['scunthorpe', 'assassin', 'classic', 'analysis', 'cockpit']) {
      expect(isTextOffensive(word)).toBe(false);
    }
  });

  it('accepts preset avatars and single emoji, rejects the rest', () => {
    expect(checkAvatar('avatar0')).toEqual({ ok: true });
    expect(checkAvatar('🎯')).toEqual({ ok: true });
    expect(checkAvatar('🖕')).toEqual({ ok: false, reason: 'offensive' });
    expect(checkAvatar('<script>')).toEqual({ ok: false, reason: 'invalid' });
    expect(checkAvatar('🎯🎯')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('validates USDT addresses per network', () => {
    expect(validateUsdtAddress('TRC20', 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9')).toBe(true);
    expect(validateUsdtAddress('TRC20', '0x0000000000000000000000000000000000000000')).toBe(false);
    expect(validateUsdtAddress('ERC20', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e')).toBe(true);
    expect(validateUsdtAddress('ERC20', 'not-an-address')).toBe(false);
    expect(validateUsdtAddress('BEP20', '')).toBe(false);
  });
});
