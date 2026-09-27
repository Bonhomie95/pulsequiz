/**
 * The 50/50 in a 1v1.
 *
 * It is free and capped at one per match on purpose: both players answer the
 * same ten questions with coins staked on the outcome, so a hint that can be
 * bought is a win that can be bought. What must hold is that it never leaks
 * the answer and never gives one player a second one.
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
      question: `hint q${i}?`, options: ['a', 'b', 'c', 'd'], answer: i % 4,
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
  // Closing a client socket schedules a forfeit timer that reaches for Mongo
  // when it fires. Left pending, it fires after the run has torn Mongo down —
  // which Jest reports as logging after teardown and exits non-zero on, with
  // every test passing.
  stopPvpTimers();
  stop?.();
  await new Promise<void>((r) => server.close(() => r()));
});

afterEach(async () => {
  await PvPMatch.deleteMany({});
  await User.deleteMany({ username: { $in: ['hinta', 'hintb'] } });
});

it('greys out a wrong option, once, and never the right one', async () => {
  const a = await makePlayer('hinta');
  const b = await makePlayer('hintb');
  const sa = await connect(a.token);
  const sb = await connect(b.token);

  try {
    const foundA = once<any>(sa, SOCKET_EVENTS.MATCH_FOUND);
    sa.emit(SOCKET_EVENTS.JOIN_QUEUE, { category: 'math', wager: 0 });
    sb.emit(SOCKET_EVENTS.JOIN_QUEUE, { category: 'math', wager: 0 });
    const fa = await foundA;

    const startA = once<any>(sa, SOCKET_EVENTS.MATCH_START);
    sa.emit(SOCKET_EVENTS.MATCH_START, { matchId: fa.matchId });
    sb.emit(SOCKET_EVENTS.MATCH_START, { matchId: fa.matchId });
    const qa = await startA;

    const first = once<any>(sa, SOCKET_EVENTS.HINT_RESULT);
    sa.emit(SOCKET_EVENTS.HINT, { matchId: fa.matchId });
    const hint = await first;

    expect(hint.questionIndex).toBe(0);
    expect(typeof hint.disabledIndex).toBe('number');

    // It must be a wrong option — handing over the answer would be the whole
    // game.
    const served = await QuizQuestion.findById(qa.questions[0].id).select('answer').lean();
    expect(hint.disabledIndex).not.toBe(served!.answer);

    // A second ask on the same question repeats the same option rather than
    // greying out a second one.
    const again = once<any>(sa, SOCKET_EVENTS.HINT_RESULT);
    sa.emit(SOCKET_EVENTS.HINT, { matchId: fa.matchId });
    expect((await again).disabledIndex).toBe(hint.disabledIndex);

    // And the opponent's own 50/50 is untouched by A spending theirs.
    const bHint = once<any>(sb, SOCKET_EVENTS.HINT_RESULT);
    sb.emit(SOCKET_EVENTS.HINT, { matchId: fa.matchId });
    expect(typeof (await bHint).disabledIndex).toBe('number');

    const match = await PvPMatch.findById(fa.matchId).lean();
    for (const p of match!.players as any[]) {
      expect(p.hintUsedAtIndex).toBe(0);
    }
  } finally {
    sa.close();
    sb.close();
  }
});
