/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  globalSetup: '<rootDir>/src/__tests__/globalSetup.ts',
  globalTeardown: '<rootDir>/src/__tests__/globalTeardown.ts',
  // An in-memory mongod takes a moment to download and boot on a cold cache.
  testTimeout: 30_000,
  // Integration tests share one mongod; running files in parallel against it
  // makes collection resets race.
  maxWorkers: 1,
  // Recycle the worker when it balloons.
  //
  // One worker running all 36 suites accumulates — models, connections, the
  // documents each suite inserts — and on CI it reached the 4GB heap ceiling
  // and aborted the run with every test up to that point passing. Restarting
  // the worker once it crosses this costs a second or two per recycle.
  workerIdleMemoryLimit: '768MB',
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/controllers/**/*.ts',
    'src/utils/**/*.ts',
  ],
};
