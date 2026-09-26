/**
 * Shared harness for the integration tests.
 *
 * Everything runs against a real in-memory mongod, because the behaviour under
 * test IS the database behaviour — conditional updates, unique indexes and
 * atomic increments are exactly what the bugs these tests cover came down to.
 * A mocked Mongoose would pass while the production code still double-paid.
 */
import http from 'http';
import mongoose from 'mongoose';

// Node 19+ turns keep-alive on for the global agent. supertest starts a fresh
// ephemeral server per request, so a pooled socket could be reused against a
// server that had already closed — a random "socket hang up".
http.globalAgent = new http.Agent({ keepAlive: false });

jest.setTimeout(30_000);

// supertest(app) boots a throwaway server for EVERY request and closes it
// straight after — under load that occasionally surfaced as ECONNRESET. Give
// each app one server per test file instead; supertest reuses a listening
// server and leaves it open.
const openServers: http.Server[] = [];
jest.mock('supertest', () => {
  const actual = jest.requireActual('supertest');
  const byApp = new WeakMap<object, http.Server>();
  const wrapped = (app: any) => {
    if (typeof app !== 'function') return actual(app);
    let server = byApp.get(app);
    if (!server) {
      server = http.createServer(app).listen(0);
      byApp.set(app, server);
      openServers.push(server);
    }
    return actual(server);
  };
  return Object.assign(wrapped, actual);
});

// A unique database per test file on the shared server from globalSetup.
const dbName = `t_${process.env.JEST_WORKER_ID ?? '0'}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

process.env.JWT_SECRET ||= 'test-secret-that-is-at-least-32-chars-long';
process.env.ADMIN_JWT_SECRET ||= 'admin-test-secret-at-least-32-chars-long';
process.env.NODE_ENV = 'test';
// Keep the test output readable; individual tests can raise this when they are
// asserting on log behaviour.
process.env.LOG_LEVEL ||= 'error';

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_TEST_URI!, { dbName });
  // Build the indexes the production code relies on for correctness — the
  // unique constraints are load-bearing, not just performance.
  await mongoose.connection.asPromise();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({})),
  );
});

afterAll(async () => {
  await Promise.all(openServers.map((srv) => new Promise((r) => srv.close(() => r(null)))));
  // Let fire-and-forget work from the last test (activity logs, anti-cheat
  // checks) settle before dropping the database under it.
  await new Promise((r) => setTimeout(r, 50));
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
});

/** Force index creation for a model — call in tests that depend on a unique index. */
export async function ensureIndexes(...models: mongoose.Model<any>[]) {
  await Promise.all(models.map((m) => m.syncIndexes()));
}
