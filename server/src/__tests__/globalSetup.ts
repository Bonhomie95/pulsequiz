/**
 * One in-memory mongod for the whole run.
 *
 * Booting a fresh mongod per test file raced on ports: the next file's server
 * could pick the port the previous one was still releasing ("Port already in
 * use"), failing a whole file at random. Each file now gets its own database
 * on this single server instead (see setup.ts).
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  (globalThis as any).__MONGOD__ = mongod;
  process.env.MONGO_TEST_URI = mongod.getUri();
}
