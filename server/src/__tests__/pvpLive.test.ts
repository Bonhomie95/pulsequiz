/**
 * Two real socket clients playing a 1v1 end to end.
 *
 * Written after three separate attempts to fix "the screen is blank" and "my
 * taps do nothing" from reading the code alone. Those are the two things this
 * asserts: that the question set actually arrives, and that both players can
 * answer every question — including when they answer at the same instant,
 * which is the race that silently dropped one of them.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import mongoose from 'mongoose';

import User from '../models/User';
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
  const { token } = issueSession(u._id.toString(), 0);
  return { id: u._id.toString(), token };
}

function connect(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

/** Resolve on the next occurrence of `event`, optionally matching a predicate. */
function once<T = any>(
  s: ClientSocket,
  event: string,
  match: (payload: T) => boolean = () => true,
  timeoutMs = 40_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    const handler = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(t);
      s.off(event, handler);
      resolve(payload);
    };
    s.on(event, handler);
  });
}

beforeAll(async () => {
  await initDefaultSettings();

  const docs = Array.from({ length: 40 }, (_, i) => ({
    category: 'math',
    difficulty: (['easy', 'easy', 'medium', 'medium', 'hard'] as const)[i % 5],
    question: `live pvp q${i}?`,
    options: ['a', 'b', 'c', 'd'],
    answer: i % 4,
  }));
  await QuizQuestion.insertMany(docs);

  const { createSocketServer } = await import('../socket');
  server = http.createServer();
  const io = createSocketServer(server as any);
  stop = () => io.close();
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  // Closing a client socket schedules a forfeit timer that reaches for Mongo
  // when it fires. Left pending, it fires after the run has torn Mongo down —
  // which Jest reports as logging after teardown and exits non-zero on, with
  // every test passing.
  stopPvpTimers();
  stop?.();
  await new Promise<void>((r) => server.close(() => r()));
});

it('deals the question set to both players and lets each answer all ten', async () => {
  const a = await makePlayer('livea');
  const b = await makePlayer('liveb');

  const sa = await connect(a.token);
  const sb = await connect(b.token);

  sa.on(SOCKET_EVENTS.ERROR, (e: any) => console.log('A error:', e?.message));
  sb.on(SOCKET_EVENTS.ERROR, (e: any) => console.log('B error:', e?.message));

  // "You're done, waiting for your opponent" must not reach anyone who is
  // still playing. This used to be broadcast to the room on every accepted
  // answer, so both players carried that banner from question one.
  const earlyWaits: string[] = [];
  let finished = false;
  sa.on(SOCKET_EVENTS.WAITING_ON_OPPONENT, () => {
    if (!finished) earlyWaits.push('A');
  });
  sb.on(SOCKET_EVENTS.WAITING_ON_OPPONENT, () => {
    if (!finished) earlyWaits.push('B');
  });

  try {
    const foundA = once<any>(sa, SOCKET_EVENTS.MATCH_FOUND);
    const foundB = once<any>(sb, SOCKET_EVENTS.MATCH_FOUND);

    sa.emit(SOCKET_EVENTS.JOIN_QUEUE, { category: 'math', wager: 0 });
    sb.emit(SOCKET_EVENTS.JOIN_QUEUE, { category: 'math', wager: 0 });

    const [fa] = await Promise.all([foundA, foundB]);
    const matchId = fa.matchId;
    expect(matchId).toBeTruthy();

    // This is what the client does on MATCH_FOUND. Without it the question set
    // never arrives and the screen has nothing to draw — the blank screen.
    const startA = once<any>(sa, SOCKET_EVENTS.MATCH_START);
    const startB = once<any>(sb, SOCKET_EVENTS.MATCH_START);
    sa.emit(SOCKET_EVENTS.MATCH_START, { matchId });
    sb.emit(SOCKET_EVENTS.MATCH_START, { matchId });

    const [qa, qb] = await Promise.all([startA, startB]);
    expect(Array.isArray(qa.questions)).toBe(true);
    expect(qa.questions.length).toBeGreaterThan(0);
    expect(qb.questions.map((q: any) => q.id)).toEqual(qa.questions.map((q: any) => q.id));

    // Both answer every question, simultaneously — the race that used to drop
    // whichever save lost the version check.
    const total = qa.questions.length;
    for (let i = 0; i < total; i++) {
      // Each client also hears the opponent's progress, so wait for our own
      // update or the loop races ahead of the server.
      const updA = once<any>(sa, SOCKET_EVENTS.PLAYER_UPDATE, (p) => p.userId === a.id);
      const updB = once<any>(sb, SOCKET_EVENTS.PLAYER_UPDATE, (p) => p.userId === b.id);

      // Answer at human speed. Anything under a quarter of a second is
      // refused outright, and rightly so.
      await new Promise((r) => setTimeout(r, 400));

      const payload = (s: ClientSocket) =>
        s.emit(SOCKET_EVENTS.ANSWER, {
          matchId,
          questionId: qa.questions[i].id,
          selected: 0,
          index: i,
          elapsedMs: 2_000,
        });

      payload(sa);
      payload(sb);

      await Promise.all([updA, updB]);

      // Everything up to the final answer is mid-match for both of them.
      if (i < total - 1) expect(earlyWaits).toEqual([]);
    }
    finished = true;

    // Every answer landed for both sides — none silently dropped.
    const match = await PvPMatch.findById(matchId).lean();
    for (const p of match!.players as any[]) {
      expect(p.answers).toHaveLength(total);
      expect(p.completed).toBe(true);
    }
  } finally {
    sa.close();
    sb.close();
  }
});

afterEach(async () => {
  await PvPMatch.deleteMany({});
  await User.deleteMany({ username: { $in: ['livea', 'liveb'] } });
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) await PvPMatch.deleteMany({});
});
