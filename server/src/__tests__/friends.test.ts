/**
 * The social graph.
 *
 * The bugs here were quiet ones: a mis-joined list that would befriend the
 * wrong person, and an aggregation that silently matched nothing.
 */
import mongoose from 'mongoose';

import Friend from '../models/Friend';
import User from '../models/User';
import QuizSession from '../models/QuizSession';
import Progress from '../models/Progress';
import {
  searchUsers,
  sendFriendRequest,
  acceptRequest,
  declineRequest,
  unfriendUser,
  blockUser,
  unblockUser,
  getPendingRequests,
  getMyFriends,
} from '../controllers/friendController';
import { ensureIndexes } from './setup';

function res() {
  const out: any = { statusCode: 200, body: null };
  out.status = (c: number) => { out.statusCode = c; return out; };
  out.json = (b: any) => { out.body = b; return out; };
  return out;
}

async function makeUser(username: string, overrides: Record<string, unknown> = {}) {
  const user = await User.create({
    email: `${username}@example.com`,
    provider: 'google',
    providerId: username,
    username,
    avatar: 'avatar0',
    ...overrides,
  });
  await Progress.create({ userId: user._id, level: 5 });
  return user;
}

beforeEach(async () => {
  await ensureIndexes(Friend, User, QuizSession);
});

describe('getPendingRequests', () => {
  it('pairs each request with the right requester', async () => {
    // The old code zipped users to requests by array index. Mongo does not
    // promise $in returns documents in input order, so accepting a request
    // could befriend a different person entirely.
    const me = await makeUser('me');
    const askers = await Promise.all(
      ['alpha', 'bravo', 'charlie', 'delta'].map((n) => makeUser(n)),
    );

    const created = [];
    for (const a of askers) {
      created.push(await Friend.create({ requesterId: a._id, recipientId: me._id }));
    }

    const r = res();
    await getPendingRequests({ userId: me._id.toString() } as any, r);

    expect(r.body.requests).toHaveLength(4);
    for (const entry of r.body.requests) {
      const row = created.find((c) => c._id.toString() === entry.friendId);
      expect(row).toBeDefined();
      // The friendId must belong to the user shown next to it.
      expect(row!.requesterId.toString()).toBe(entry._id);
    }
  });

  it('drops a request whose sender deleted their account', async () => {
    const me = await makeUser('me2');
    const ghost = await makeUser('ghost');
    const real = await makeUser('real');

    await Friend.create({ requesterId: ghost._id, recipientId: me._id });
    await Friend.create({ requesterId: real._id, recipientId: me._id });
    await User.updateOne({ _id: ghost._id }, { $set: { deletedAt: new Date() } });

    const r = res();
    await getPendingRequests({ userId: me._id.toString() } as any, r);

    expect(r.body.requests).toHaveLength(1);
    expect(r.body.requests[0]._id).toBe(real._id.toString());
  });
});

describe('searchUsers', () => {
  it('counts sessions correctly — the aggregation needs real ObjectIds', async () => {
    const me = await makeUser('searcher');
    const target = await makeUser('targetplayer');

    for (let i = 0; i < 3; i++) {
      await QuizSession.create({
        userId: target._id,
        sessionId: new mongoose.Types.ObjectId(),
        category: 'math',
        score: 5,
        bonus: 0,
        totalPoints: 5,
        correctAnswers: 5,
        totalQuestions: 10,
        levelAtTime: 1,
      });
    }

    const r = res();
    await searchUsers(
      { userId: me._id.toString(), query: { q: 'targetpl' } } as any,
      r,
    );

    expect(r.body.users).toHaveLength(1);
    // Passing strings into an aggregation $match matched nothing, so this
    // used to be 0 for everybody.
    expect(r.body.users[0].totalSessions).toBe(3);
    expect(r.body.users[0].level).toBe(5);
  });

  it('is case-insensitive from the caller’s point of view', async () => {
    const me = await makeUser('searcher2');
    await makeUser('mixedcaseuser');

    const r = res();
    await searchUsers(
      { userId: me._id.toString(), query: { q: 'MixedCase' } } as any,
      r,
    );

    expect(r.body.users).toHaveLength(1);
  });

  it('hides banned and deleted accounts', async () => {
    const me = await makeUser('searcher3');
    // Search is prefix-anchored, so these all share a leading token.
    await makeUser('playerbanned', { isBanned: true });
    await makeUser('playerdeleted', { deletedAt: new Date() });
    await makeUser('playergood');

    const r = res();
    await searchUsers({ userId: me._id.toString(), query: { q: 'player' } } as any, r);

    expect(r.body.users.map((u: any) => u.username)).toEqual(['playergood']);
  });

  it('matches on a prefix, not a substring', async () => {
    // Deliberate: an anchored regex can use an index, a floating one cannot.
    const me = await makeUser('searcher5');
    await makeUser('goodplayer');

    const r = res();
    await searchUsers({ userId: me._id.toString(), query: { q: 'goodpl' } } as any, r);
    expect(r.body.users).toHaveLength(1);

    const r2 = res();
    await searchUsers({ userId: me._id.toString(), query: { q: 'player' } } as any, r2);
    expect(r2.body.users).toHaveLength(0);
  });

  it('requires a real query', async () => {
    const me = await makeUser('searcher4');
    const r = res();
    await searchUsers({ userId: me._id.toString(), query: { q: 'ab' } } as any, r);
    expect(r.statusCode).toBe(400);
  });
});

describe('friend requests', () => {
  it('rejects a malformed user id instead of throwing a 500', async () => {
    const me = await makeUser('req1');
    const r = res();
    await sendFriendRequest({ userId: me._id.toString(), body: { userId: 'not-an-id' } } as any, r);
    expect(r.statusCode).toBe(400);
  });

  it('rejects a request to a user who does not exist', async () => {
    const me = await makeUser('req2');
    const r = res();
    await sendFriendRequest(
      { userId: me._id.toString(), body: { userId: new mongoose.Types.ObjectId().toString() } } as any,
      r,
    );
    expect(r.statusCode).toBe(404);
  });

  it('lets a declined pair try again', async () => {
    // A decline used to be permanent — the pair could never connect again.
    const a = await makeUser('again_a');
    const b = await makeUser('again_b');

    const r1 = res();
    await sendFriendRequest({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, r1);
    const pending = await Friend.findOne({ requesterId: a._id });

    const r2 = res();
    await declineRequest({ userId: b._id.toString(), body: { friendId: pending!._id.toString() } } as any, r2);
    expect(r2.body.status).toBe('declined');

    const r3 = res();
    await sendFriendRequest({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, r3);
    expect(r3.statusCode).toBe(200);
    expect(r3.body.status).toBe('pending');
  });

  it('treats a reciprocal request as an acceptance', async () => {
    const a = await makeUser('recip_a');
    const b = await makeUser('recip_b');

    await sendFriendRequest({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, res());
    const r = res();
    await sendFriendRequest({ userId: b._id.toString(), body: { userId: a._id.toString() } } as any, r);

    expect(r.body.status).toBe('accepted');
    expect(await Friend.countDocuments({ status: 'accepted' })).toBe(1);
  });

  it('resolves a request exactly once under a double-tap', async () => {
    const a = await makeUser('race_a');
    const b = await makeUser('race_b');
    await sendFriendRequest({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, res());
    const pending = await Friend.findOne({ requesterId: a._id });

    const results = await Promise.all([
      (async () => { const r = res(); await acceptRequest({ userId: b._id.toString(), body: { friendId: pending!._id.toString() } } as any, r); return r; })(),
      (async () => { const r = res(); await declineRequest({ userId: b._id.toString(), body: { friendId: pending!._id.toString() } } as any, r); return r; })(),
    ]);

    // One wins, the other is told the request is gone — never both applied.
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
  });

  it('will not let a blocked user send a request', async () => {
    const a = await makeUser('block_a');
    const b = await makeUser('block_b');

    await blockUser({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, res());

    const r = res();
    await sendFriendRequest({ userId: b._id.toString(), body: { userId: a._id.toString() } } as any, r);
    expect(r.statusCode).toBe(403);
  });
});

describe('blocking', () => {
  it('collapses an existing friendship into a single block row', async () => {
    const a = await makeUser('bl_a');
    const b = await makeUser('bl_b');

    // Both directions exist — the unique index permits it, and the old
    // "normalise the direction" path could collide with the mirror row.
    await Friend.create({ requesterId: a._id, recipientId: b._id, status: 'accepted' });
    await Friend.create({ requesterId: b._id, recipientId: a._id, status: 'declined' });

    const r = res();
    await blockUser({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, r);
    expect(r.statusCode).toBe(200);

    const rows = await Friend.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('blocked');
    expect(rows[0].requesterId.toString()).toBe(a._id.toString());
  });

  it('can be undone', async () => {
    const a = await makeUser('ub_a');
    const b = await makeUser('ub_b');

    await blockUser({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, res());
    const r = res();
    await unblockUser({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, r);

    expect(r.statusCode).toBe(200);
    expect(await Friend.countDocuments({})).toBe(0);
  });

  it('hides a blocker from the blocked user’s search results', async () => {
    const a = await makeUser('hide_a');
    const b = await makeUser('hide_b');
    await blockUser({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, res());

    const r = res();
    await searchUsers({ userId: b._id.toString(), query: { q: 'hide_a' } } as any, r);
    expect(r.body.users).toHaveLength(0);
  });
});

describe('getMyFriends', () => {
  it('lists both directions of an accepted friendship', async () => {
    const me = await makeUser('mf_me');
    const x = await makeUser('mf_x');
    const y = await makeUser('mf_y');

    await Friend.create({ requesterId: me._id, recipientId: x._id, status: 'accepted' });
    await Friend.create({ requesterId: y._id, recipientId: me._id, status: 'accepted' });

    const r = res();
    await getMyFriends({ userId: me._id.toString() } as any, r);

    expect(r.body.friends.map((f: any) => f.username).sort()).toEqual(['mf_x', 'mf_y']);
  });

  it('unfriending removes the row in either direction', async () => {
    const a = await makeUser('uf_a');
    const b = await makeUser('uf_b');
    await Friend.create({ requesterId: b._id, recipientId: a._id, status: 'accepted' });

    const r = res();
    await unfriendUser({ userId: a._id.toString(), body: { userId: b._id.toString() } } as any, r);

    expect(r.statusCode).toBe(200);
    expect(await Friend.countDocuments({})).toBe(0);
  });
});
