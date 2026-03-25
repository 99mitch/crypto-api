module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dashboard/'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/database.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};
