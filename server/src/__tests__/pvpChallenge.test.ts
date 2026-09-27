/**
 * Challenging a friend directly — no room, no code.
 *
 * The code exists for inviting someone you cannot reach in the app. It had no
 * business standing between two people who are already friends here, which is
 * what it did. These cover the parts that decide whether the invite is safe:
 * it must reach only a friend, and accepting must produce a real match.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

import User from '../models/User';
import Friend from '../models/Friend';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import QuizQuestion from '../models/QuizQuestion';
import PvPMatch from '../models/PvPMatch';
import { initDefaultSettings } from '../models/AppSettings';
import { issueSession } from '../utils/jwt';
import { SOCKET_EVENTS } from '../socket/events';
import { stopPvpTimers } from '../socket/pvp.handlers';

jest.setTimeout(120_000);

let server: http.Server;
let url: string;
let stop: (() => void) | undefined;

async function makePlayer(tag: string) {
  const u = await User.create({
    email: `${tag}@example.com`, provider: 'google', providerId: `${tag}-1`,
    username: tag, avatar: 'avatar0',
  });
  await Promise.all([
    Progress.create({ userId: u._id, points: 0 }),
    CoinWallet.create({ userId: u._id, coins: 500 }),
  ]);
  return { id: u._id.toString(), token: issueSession(u._id.toString(), 0).token };
}

function connect(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function once<T = any>(s: ClientSocket, event: string, timeoutMs = 40_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    s.once(event, (p: T) => { clearTimeout(t); resolve(p); });
  });
}

beforeAll(async () => {
  await initDefaultSettings();
  await QuizQuestion.insertMany(
    Array.from({ length: 40 }, (_, i) => ({
      category: 'math',
      difficulty: (['easy', 'easy', 'medium', 'medium', 'hard'] as const)[i % 5],
      question: `challenge q${i}?`, options: ['a', 'b', 'c', 'd'], answer: i % 4,
    })),
  );
  const { createSocketServer } = await import('../socket');
  server = http.createServer();
  const io = createSocketServer(server as any);
  stop = () => io.close();
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  stopPvpTimers();
  stop?.();
  await new Promise<void>((r) => server.close(() => r()));
});

afterEach(async () => {
  await Promise.all([
    PvPMatch.deleteMany({}),
    Friend.deleteMany({}),
    User.deleteMany({ username: { $in: ['chala', 'chalb'] } }),
  ]);
});

it('reaches a friend and starts a real match when they accept', async () => {
  const a = await makePlayer('chala');
  const b = await makePlayer('chalb');
  await Friend.create({ requesterId: a.id, recipientId: b.id, status: 'accepted' });

  const sa = await connect(a.token);
  const sb = await connect(b.token);

  try {
    const incoming = once<any>(sb, SOCKET_EVENTS.CHALLENGE_INCOMING);
    const sent = once<any>(sa, SOCKET_EVENTS.CHALLENGE_SENT);

    sa.emit(SOCKET_EVENTS.CHALLENGE_SEND, { opponentId: b.id, category: 'math', wager: 0 });

    const invite = await incoming;
    expect(invite.fromUsername).toBe('chala');
    expect(invite.challengeId).toBeTruthy();
    expect((await sent).online).toBe(true);

    // Accepting builds the match through the same path a rematch uses, so
    // both sides land in it.
    const foundA = once<any>(sa, SOCKET_EVENTS.MATCH_FOUND);
    const foundB = once<any>(sb, SOCKET_EVENTS.MATCH_FOUND);
    sb.emit(SOCKET_EVENTS.CHALLENGE_ACCEPT, { challengeId: invite.challengeId });

    const [fa, fb] = await Promise.all([foundA, foundB]);
    expect(fa.matchId).toBe(fb.matchId);
    expect(fa.players).toHaveLength(2);
    // The category has to survive: without it the result screen refuses a
    // rematch.
    expect(fa.category).toBe('math');

    // And it is a real match with real questions.
    const start = once<any>(sa, SOCKET_EVENTS.MATCH_START);
    sa.emit(SOCKET_EVENTS.MATCH_START, { matchId: fa.matchId });
    sb.emit(SOCKET_EVENTS.MATCH_START, { matchId: fa.matchId });
    expect((await start).questions.length).toBeGreaterThan(0);
  } finally {
    sa.close();
    sb.close();
  }
});

it('refuses to challenge someone who is not a friend', async () => {
  const a = await makePlayer('chala');
  const b = await makePlayer('chalb');

  const sa = await connect(a.token);
  const sb = await connect(b.token);

  try {
    let reached = false;
    sb.on(SOCKET_EVENTS.CHALLENGE_INCOMING, () => { reached = true; });

    const err = once<any>(sa, SOCKET_EVENTS.ERROR);
    sa.emit(SOCKET_EVENTS.CHALLENGE_SEND, { opponentId: b.id, category: 'math', wager: 0 });

    expect((await err).message).toMatch(/friend/i);
    await new Promise((r) => setTimeout(r, 300));
    expect(reached).toBe(false);
  } finally {
    sa.close();
    sb.close();
  }
});

it('tells the challenger when the invite is declined', async () => {
  const a = await makePlayer('chala');
  const b = await makePlayer('chalb');
  await Friend.create({ requesterId: a.id, recipientId: b.id, status: 'accepted' });

  const sa = await connect(a.token);
  const sb = await connect(b.token);

  try {
    const incoming = once<any>(sb, SOCKET_EVENTS.CHALLENGE_INCOMING);
    sa.emit(SOCKET_EVENTS.CHALLENGE_SEND, { opponentId: b.id, category: 'math', wager: 0 });
    const invite = await incoming;

    const cancelled = once<any>(sa, SOCKET_EVENTS.CHALLENGE_CANCELLED);
    sb.emit(SOCKET_EVENTS.CHALLENGE_DECLINE, { challengeId: invite.challengeId });

    expect((await cancelled).reason).toBe('declined');
  } finally {
    sa.close();
    sb.close();
  }
});
