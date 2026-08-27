/**
 * Shared harness for the integration tests.
 *
 * Everything runs against a real in-memory mongod, because the behaviour under
 * test IS the database behaviour — conditional updates, unique indexes and
 * atomic increments are exactly what the bugs these tests cover came down to.
 * A mocked Mongoose would pass while the production code still double-paid.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.setTimeout(30_000);

let mongod: MongoMemoryServer;

process.env.JWT_SECRET ||= 'test-secret-that-is-at-least-32-chars-long';
process.env.ADMIN_JWT_SECRET ||= 'admin-test-secret-at-least-32-chars-long';
process.env.NODE_ENV = 'test';
// Keep the test output readable; individual tests can raise this when they are
// asserting on log behaviour.
process.env.LOG_LEVEL ||= 'error';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
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
  await mongoose.disconnect();
  await mongod?.stop();
});

/** Force index creation for a model — call in tests that depend on a unique index. */
export async function ensureIndexes(...models: mongoose.Model<any>[]) {
  await Promise.all(models.map((m) => m.syncIndexes()));
}
