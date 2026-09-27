/**
 * Two real clients finishing a match and replaying it.
 *
 * "I agreed to the rematch and it says getting the match ready forever" is the
 * symptom. What that screen needs is a MATCH_FOUND carrying both players and a
 * MATCH_START carrying the questions, so those are what this asserts — for
 * both sides, not just the one that pressed first.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import QuizQuestion from '../models/QuizQuestion';
import PvPMatch from '../models/PvPMatch';
import { initDefaultSettings } from '../models/AppSettings';
import { issueSession } from '../utils/jwt';
import { SOCKET_EVENTS } from '../socket/events';

jest.setTimeout(60_000);

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

function once<T = any>(
  s: ClientSocket, event: string,
  match: (p: T) => boolean = () => true, timeoutMs = 15_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    const handler = (p: T) => {
      if (!match(p)) return;
      clearTimeout(t);
      s.off(event, handler);
      resolve(p);
    };
    s.on(event, handler);
  });
}

/** Queue, start, and answer every question on both sides. */
async function playAMatch(sa: ClientSocket, sb: ClientSocket, a: string, b: string) {
  const foundA = once<any>(sa, SOCKET_EVENTS.MATCH_FOUND);
  const foundB = once<any>(sb, SOCKET_EVENTS.MATCH_FOUND);
  sa.emit(SOCKET_EVENTS.JOIN_QUEUE, { category: 'math', wager: 0 });
  sb.emit(SOCKET_EVENTS.JOIN_QUEUE, { category: 'math', wager: 0 });
  const [fa] = await Promise.all([foundA, foundB]);

  const startA = once<any>(sa, SOCKET_EVENTS.MATCH_START);
  const startB = once<any>(sb, SOCKET_EVENTS.MATCH_START);
  sa.emit(SOCKET_EVENTS.MATCH_START, { matchId: fa.matchId });
  sb.emit(SOCKET_EVENTS.MATCH_START, { matchId: fa.matchId });
  const [qa] = await Promise.all([startA, startB]);

  for (let i = 0; i < qa.questions.length; i++) {
    const updA = once<any>(sa, SOCKET_EVENTS.PLAYER_UPDATE, (p) => p.userId === a);
    const updB = once<any>(sb, SOCKET_EVENTS.PLAYER_UPDATE, (p) => p.userId === b);
    await new Promise((r) => setTimeout(r, 400));
    for (const s of [sa, sb]) {
      s.emit(SOCKET_EVENTS.ANSWER, {
        matchId: fa.matchId, questionId: qa.questions[i].id,
        selected: 0, index: i, elapsedMs: 2_000,
      });
    }
    await Promise.all([updA, updB]);
  }
  return fa.matchId;
}

beforeAll(async () => {
  await initDefaultSettings();
  await QuizQuestion.insertMany(
    Array.from({ length: 60 }, (_, i) => ({
      category: 'math',
      difficulty: (['easy', 'easy', 'medium', 'medium', 'hard'] as const)[i % 5],
      question: `rematch q${i}?`, options: ['a', 'b', 'c', 'd'], answer: i % 4,
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
  stop?.();
  await new Promise<void>((r) => server.close(() => r()));
});

afterEach(async () => {
  await PvPMatch.deleteMany({});
  await User.deleteMany({ username: { $in: ['rema', 'remb'] } });
});

it('deals a fresh match to both players when they agree to a rematch', async () => {
  const a = await makePlayer('rema');
  const b = await makePlayer('remb');
  const sa = await connect(a.token);
  const sb = await connect(b.token);

  sa.on(SOCKET_EVENTS.ERROR, (e: any) => console.log('A error:', e?.message, e?.event));
  sb.on(SOCKET_EVENTS.ERROR, (e: any) => console.log('B error:', e?.message, e?.event));

  try {
    const firstMatchId = await playAMatch(sa, sb, a.id, b.id);
    await Promise.all([
      once(sa, SOCKET_EVENTS.MATCH_FINISHED),
      once(sb, SOCKET_EVENTS.MATCH_FINISHED),
    ]);

    // A asks, B accepts — the exact sequence the result screen produces.
    const askedB = once<any>(sb, SOCKET_EVENTS.REMATCH_REQUEST);
    sa.emit(SOCKET_EVENTS.REMATCH_REQUEST, { opponentId: b.id, category: 'math', wager: 0 });
    await askedB;

    const newFoundA = once<any>(sa, SOCKET_EVENTS.MATCH_FOUND);
    const newFoundB = once<any>(sb, SOCKET_EVENTS.MATCH_FOUND);
    sb.emit(SOCKET_EVENTS.REMATCH_ACCEPTED, { opponentId: a.id, category: 'math', wager: 0 });

    const [na, nb] = await Promise.all([newFoundA, newFoundB]);

    // Both sides need the pairing: the VS screen draws from it, and with it
    // missing the screen has nothing but a spinner.
    expect(na.matchId).toBeTruthy();
    expect(na.matchId).toBe(nb.matchId);
    expect(na.matchId).not.toBe(firstMatchId);
    for (const found of [na, nb]) {
      expect(Array.isArray(found.players)).toBe(true);
      expect(found.players).toHaveLength(2);
      expect(found.players.map((p: any) => String(p.userId)).sort()).toEqual([a.id, b.id].sort());
    }

    // And the questions have to actually arrive.
    const sA = once<any>(sa, SOCKET_EVENTS.MATCH_START);
    const sB = once<any>(sb, SOCKET_EVENTS.MATCH_START);
    sa.emit(SOCKET_EVENTS.MATCH_START, { matchId: na.matchId });
    sb.emit(SOCKET_EVENTS.MATCH_START, { matchId: na.matchId });
    const [qa, qb] = await Promise.all([sA, sB]);

    expect(qa.questions.length).toBeGreaterThan(0);
    expect(qb.questions.map((q: any) => q.id)).toEqual(qa.questions.map((q: any) => q.id));
  } finally {
    sa.close();
    sb.close();
  }
});
