/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  // An in-memory mongod takes a moment to download and boot on a cold cache.
  testTimeout: 30_000,
  // Integration tests share one mongod; running files in parallel against it
  // makes collection resets race.
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/controllers/**/*.ts',
    'src/utils/**/*.ts',
  ],
};
