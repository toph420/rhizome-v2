/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
    '**/tests/**/*.+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        allowJs: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        // Support for TypeScript 5.x import type syntax
        verbatimModuleSyntax: false,
        isolatedModules: true,
        moduleResolution: 'node',
        module: 'ESNext',
        target: 'ES2022'
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
      branches: 50,
      functions: 55,
      lines: 55,
      statements: 55
    },
    // Higher thresholds for critical modules
    'engines/': {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70
    },
    'processors/': {
      branches: 40,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globals: {
    // Provide __dirname for tests that need it
    __dirname: __dirname
  },
  // Handle module name mapping if needed
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  // ESM support
  transformIgnorePatterns: [
    'node_modules/(?!(chalk)/)'
  ],
  // Increase timeout for integration tests
  testTimeout: 30000,
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};