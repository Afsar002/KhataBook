/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)', '**/?(*.)+(spec|test).(ts|tsx)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**',
  ],
  coverageDirectory: 'coverage',
  // The jest-expo preset provides the react-native test environment and the
  // babel transform for TS/TSX. Overriding either (e.g. jsdom + ts-jest) breaks
  // RN module mocking, so only our module mocks and the path alias are added.
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // CSS must be listed BEFORE the @/ alias so `import '@/global.css'` maps to
    // the stub (the alias would otherwise win and produce a raw .css path).
    '\\.(css)$': '<rootDir>/jest.css-stub.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },
};
