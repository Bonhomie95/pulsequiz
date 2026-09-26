/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // SDK 57 stopped hoisting Expo's own packages to the top level, so
  // expo-modules-core (and friends) only exist under expo/node_modules.
  // jest-expo's preset requires them by bare name, which Node resolution
  // cannot reach from inside node_modules/jest-expo.
  moduleDirectories: ['node_modules', 'node_modules/expo/node_modules'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|native-base|react-native-svg|@react-native-async-storage|zustand))',
  ],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
};
