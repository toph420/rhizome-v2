/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
    '**/tests/**/*.+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        allowJs: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        // Support for TypeScript 5.x import type syntax
        verbatimModuleSyntax: false,
        isolatedModules: false
      }
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'processors/**/*.{js,ts}',
    'handlers/**/*.{js,ts}',
    'engines/**/*.{js,ts}',
    'lib/**/*.{js,ts}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/tests/**',
    '!**/dist/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  globals: {
    // Provide __dirname for tests that need it
    __dirname: __dirname
  },
  // Handle module name mapping if needed
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  // Increase timeout for integration tests
  testTimeout: 30000,
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};