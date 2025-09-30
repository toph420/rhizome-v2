# Current Testing Setup for Rhizome V2

## Overview

This document reflects the **actual current state** of testing infrastructure in Rhizome V2 as of September 2025. The project uses Jest for testing across both the main application and the worker module.

## Testing Stack

### Main Application

```json
{
  "devDependencies": {
    // Testing Framework
    "@types/jest": "^30.0.0",
    "jest": "^30.1.3",
    "jest-environment-jsdom": "^30.1.2",
    "ts-jest": "^29.4.4",
    
    // Testing Libraries
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0"
  }
}
```

### Worker Module

```json
{
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0"
  }
}
```

## Current Test Structure

```
rhizome-v2/
├── jest.config.js                          # Main Jest configuration
├── src/
│   ├── test-setup.ts                       # Test environment setup
│   ├── app/actions/__tests__/
│   │   └── documents.test.ts               # Document actions tests
│   └── stores/__tests__/                   # Store tests (directory exists)
├── tests/
│   └── integration/
│       └── annotation-flow.test.ts         # Annotation integration tests
├── worker/
│   ├── __tests__/                          # Worker unit tests
│   ├── lib/__tests__/                      # Library unit tests
│   └── tests/
│       ├── integration/                    # Worker integration tests
│       └── validation/                     # Validation suites
└── __mocks__/
    └── @google/
        └── genai.ts                        # Gemini SDK mock
```

## Jest Configuration

### Main Application (jest.config.js)

```javascript
/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@google/genai$': '<rootDir>/__mocks__/@google/genai.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testMatch: [
    '**/__tests__/**/*.(ts|tsx)',
    '**/*.(test|spec).(ts|tsx)'
  ],
  collectCoverageFrom: [
    'src/**/*.(ts|tsx)',
    '!src/**/*.d.ts',
    '!src/test-setup.ts'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(@google/genai|.*\\.mjs$))'
  ]
}
```

### Test Setup (src/test-setup.ts)

```typescript
import '@testing-library/jest-dom'

// Environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

// Polyfills for Node test environment
global.crypto = { randomUUID: () => 'test-uuid-...' }
global.fetch = jest.fn()
global.TextEncoder = util.TextEncoder
global.TextDecoder = util.TextDecoder
```

## Available Test Scripts

### Main Application

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# No coverage or E2E scripts currently configured
```

### Worker Module

```bash
# Basic testing
npm test                          # Run all tests
npm run test:watch               # Watch mode
npm run test:unit                # Unit tests only
npm run test:integration         # Integration tests only

# Specialized test suites
npm run test:all-sources         # Test all document sources
npm run test:youtube-videos      # YouTube processor tests
npm run test:web-articles        # Web scraping tests
npm run test:text-processing     # Text processor tests
npm run test:retry-scenarios     # Retry logic tests
npm run test:database-batching   # Batch operation tests
npm run test:cache-metrics       # Cache performance tests

# Validation suites
npm run validate:metadata        # Validate metadata extraction
npm run validate:metadata:real   # With real AI API
npm run test:validate            # Run validation suite

# Benchmarks (using Node, not Jest)
npm run benchmark:all            # All benchmarks
npm run benchmark:pdf            # PDF processing
npm run benchmark:semantic-engine # Semantic analysis
```

## Current Test Examples

### 1. ECS Testing (from annotation-flow.test.ts)

```typescript
// Current mock pattern using Jest
const mockAnnotations: any[] = []
jest.mock('@/lib/ecs', () => ({
  createECS: jest.fn(() => ({
    createEntity: jest.fn(async (userId: string, components: any) => {
      const id = `entity-${Date.now()}`
      if (components.annotation) {
        mockAnnotations.push({
          id,
          userId,
          ...components.annotation
        })
      }
      return id
    }),
    query: jest.fn(async () => mockAnnotations),
    updateComponent: jest.fn(),
    deleteEntity: jest.fn()
  }))
}))
```

### 2. Supabase Mocking Pattern

```typescript
jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(() => Promise.resolve({ id: 'dev-user-123' })),
  getSupabaseClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: null }))
        }))
      })),
      insert: jest.fn(() => ({ 
        data: [], 
        error: null 
      })),
      delete: jest.fn(() => ({ 
        data: [], 
        error: null 
      }))
    }))
  }))
}))
```

### 3. Next.js Mocking

```typescript
// Mock next/cache
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/read/test-doc',
}))
```

## What's Currently Tested

### ✅ Implemented Tests
- **Document Actions** (`src/app/actions/__tests__/documents.test.ts`)
- **Annotation Flow** (`tests/integration/annotation-flow.test.ts`)
- **Worker Module**:
  - Document processing for all formats
  - Semantic engine operations
  - Cache operations
  - Batch processing
  - Retry logic

### ❌ Missing Test Coverage
- **ECS Core**: No direct unit tests for `src/lib/ecs/ecs.ts`
- **UI Components**: No component tests for reader, study system
- **E2E Tests**: No Playwright or similar E2E testing
- **Store Tests**: Directory exists but no test files
- **FSRS Algorithm**: Not implemented yet
- **Export/Import**: Feature not built

## Missing Infrastructure

### 1. Test Data Generators
Currently no test data generators. Would benefit from:
```typescript
// Not currently implemented but would be useful:
export function generateDocument() { /* ... */ }
export function generateChunk() { /* ... */ }
export function generateFlashcard() { /* ... */ }
```

### 2. E2E Testing
No E2E testing framework installed. Options:
- Playwright (recommended in original docs)
- Cypress
- Puppeteer

### 3. Mock Service Worker
MSW not installed for API mocking. Currently using Jest mocks directly.

### 4. Visual Testing
No visual regression testing tools.

## Environment Requirements

### Local Development
```bash
# Required for integration tests
npx supabase start

# Check Supabase is running
npx supabase status

# Environment variables needed
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>
GOOGLE_AI_API_KEY=<your key> # For worker tests
```

## Common Testing Patterns

### Server Action Testing
```typescript
// Test server actions with mocked dependencies
import { uploadDocument } from '@/app/actions/documents'

test('uploadDocument creates document record', async () => {
  const formData = new FormData()
  formData.append('file', new File(['content'], 'test.pdf'))
  
  const result = await uploadDocument(formData)
  
  expect(result.success).toBe(true)
  expect(result.documentId).toBeDefined()
})
```

### Component Testing (When Implemented)
```typescript
// Use React Testing Library patterns
import { render, screen } from '@testing-library/react'
import { DocumentViewer } from '@/components/reader/document-viewer'

test('renders document content', () => {
  render(<DocumentViewer document={mockDocument} />)
  expect(screen.getByText(mockDocument.title)).toBeInTheDocument()
})
```

## CI/CD Considerations

Currently no CI test scripts configured. Recommended additions to package.json:

```json
{
  "scripts": {
    "test:ci": "jest --ci --coverage --maxWorkers=2",
    "test:coverage": "jest --coverage",
    "test:all": "npm test && cd worker && npm test"
  }
}
```

## Migration Path from Current State

### Option 1: Enhance Jest Setup (Recommended Short-term)
1. Add missing test utilities and generators
2. Implement component testing with React Testing Library
3. Add E2E tests with Playwright
4. Improve mock patterns with MSW

### Option 2: Migrate to Vitest (As Originally Planned)
1. Install Vitest and related dependencies
2. Convert Jest configs to Vitest
3. Update test syntax (minimal changes needed)
4. Benefit from faster execution and better ESM support

### Option 3: Hybrid Approach
1. Keep Jest for existing tests
2. Use Vitest for new tests
3. Gradually migrate as tests are updated

## Recommended Next Steps

1. **Immediate** (No breaking changes):
   - Add test data generators
   - Create ECS unit tests
   - Add more integration tests

2. **Short-term** (Minor refactoring):
   - Install and configure MSW for better mocking
   - Add component tests for critical UI
   - Set up coverage reporting

3. **Medium-term** (Larger effort):
   - Add E2E testing framework
   - Consider Vitest migration
   - Implement visual regression tests

4. **Testing Priorities**:
   ```
   1. ECS operations (core functionality)
   2. Document processing pipeline
   3. Collision detection system  
   4. User interactions (selection, annotation)
   5. Study system (when implemented)
   ```

## Notes

- The worker module has more comprehensive testing than the main app
- Jest v30 is quite recent (main app), worker uses v29
- TypeScript and type checking are properly configured
- No performance benchmarking in main app (worker has benchmarks)
- Test database setup required for integration tests

This documentation reflects the current reality. The original `TESTING_SETUP.md` appears to be a planning document for a Vitest-based setup that was never implemented.