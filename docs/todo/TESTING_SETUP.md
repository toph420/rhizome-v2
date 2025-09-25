## Testing Stack for Rhizome V2

### Core Testing Tools

```json
{
  "devDependencies": {
    // Unit & Integration Testing
    "vitest": "^1.6.0",              // Fast, Vite-native test runner
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    
    // E2E Testing
    "playwright": "^1.45.0",          // Better than Cypress for your use case
    "@playwright/test": "^1.45.0",
    
    // Mocking
    "@supabase/supabase-js": "^2.45.0",  // Has built-in mocks
    "msw": "^2.3.0",                  // Mock Service Worker for API mocking
    
    // Testing Utilities
    "happy-dom": "^14.0.0",           // Faster than jsdom
    "@faker-js/faker": "^8.4.0",     // Generate test data
    "zod": "^3.23.0"                  // Schema validation for test data
  }
}
```

### Test Structure

```
tests/
├── unit/                    # Pure functions, utils
│   ├── ecs/
│   │   ├── simple-ecs.test.ts
│   │   └── entity-manager.test.ts
│   ├── study/
│   │   └── fsrs.test.ts
│   └── processing/
│       └── chunker.test.ts
│
├── integration/             # Components with mocked dependencies
│   ├── components/
│   │   ├── document-reader.test.tsx
│   │   ├── study-card.test.tsx
│   │   └── annotation-toolbar.test.tsx
│   └── hooks/
│       ├── use-document.test.ts
│       └── use-study-session.test.ts
│
├── e2e/                     # Full user flows
│   ├── upload-document.spec.ts
│   ├── reading-flow.spec.ts
│   ├── study-session.spec.ts
│   └── export-data.spec.ts
│
├── fixtures/                # Test data
│   ├── documents/
│   │   ├── sample.pdf
│   │   └── sample.md
│   ├── database/
│   │   └── seed.sql
│   └── mocks/
│       └── gemini-responses.json
│
└── setup/
    ├── vitest.config.ts
    ├── playwright.config.ts
    └── test-utils.tsx
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup/test-setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.ts',
        '**/ui/**' // Skip shadcn components
      ]
    },
    alias: {
      '@/': path.resolve(__dirname, './src'),
    }
  }
})
```

### Test Patterns

#### 1. ECS Testing

```typescript
// tests/unit/ecs/simple-ecs.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ECS } from '@/lib/ecs/simple-ecs'
import { createMockSupabase } from '@/tests/mocks/supabase'

describe('ECS', () => {
  let ecs: ECS
  let supabase: MockSupabaseClient
  
  beforeEach(() => {
    supabase = createMockSupabase()
    ecs = new ECS(supabase)
  })
  
  describe('createEntity', () => {
    it('creates entity with components', async () => {
      const components = {
        flashcard: { question: 'Q1', answer: 'A1' },
        study: { due: new Date(), ease: 2.5 }
      }
      
      const entityId = await ecs.createEntity('user-123', components)
      
      expect(supabase.from).toHaveBeenCalledWith('entities')
      expect(supabase.from).toHaveBeenCalledWith('components')
      expect(entityId).toBeTruthy()
    })
    
    it('handles component denormalization', async () => {
      const components = {
        annotation: { text: 'test' },
        source: { chunk_id: 'chunk-1', document_id: 'doc-1' }
      }
      
      await ecs.createEntity('user-123', components)
      
      const insertCall = supabase.from.mock.calls[1]
      expect(insertCall[0]).toEqual('components')
      expect(insertCall[1].chunk_id).toEqual('chunk-1')
    })
  })
})
```

#### 2. FSRS Algorithm Testing

```typescript
// tests/unit/study/fsrs.test.ts
describe('FSRS Algorithm', () => {
  let fsrs: FSRS
  
  beforeEach(() => {
    fsrs = new FSRS()
  })
  
  it('calculates correct interval for first review', () => {
    const card = {
      due: new Date(),
      ease: 2.5,
      interval: 0,
      reviews: 0
    }
    
    const scheduled = fsrs.schedule(card, new Date(), Rating.Good)
    
    expect(scheduled.interval).toBe(1)
    expect(scheduled.reviews).toBe(1)
  })
  
  it('reduces ease for Again rating', () => {
    const card = { ease: 2.5, interval: 10, reviews: 5 }
    const scheduled = fsrs.schedule(card, new Date(), Rating.Again)
    
    expect(scheduled.ease).toBeLessThan(card.ease)
    expect(scheduled.interval).toBe(1)
  })
  
  // Test edge cases
  it('respects maximum interval', () => {
    const card = { ease: 2.5, interval: 30000, reviews: 10 }
    const scheduled = fsrs.schedule(card, new Date(), Rating.Easy)
    
    expect(scheduled.interval).toBeLessThanOrEqual(36500)
  })
})
```

#### 3. Component Testing

```typescript
// tests/integration/components/annotation-toolbar.test.tsx
import { render, screen, userEvent } from '@/tests/setup/test-utils'
import { AnnotationToolbar } from '@/components/reader/annotation-toolbar'

describe('AnnotationToolbar', () => {
  const mockSelection = {
    text: 'Selected text',
    range: { top: 100, left: 200, bottom: 120, right: 400 }
  }
  
  it('shows color options for highlighting', async () => {
    render(
      <AnnotationToolbar
        selection={mockSelection}
        onHighlight={vi.fn()}
        onNote={vi.fn()}
      />
    )
    
    expect(screen.getByRole('button', { name: /yellow/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /green/i })).toBeInTheDocument()
  })
  
  it('switches to note mode', async () => {
    const user = userEvent.setup()
    render(<AnnotationToolbar selection={mockSelection} />)
    
    await user.click(screen.getByRole('button', { name: /note/i }))
    
    expect(screen.getByPlaceholderText('Add a note...')).toBeInTheDocument()
  })
  
  it('creates flashcard from selection', async () => {
    const onFlashcard = vi.fn()
    const user = userEvent.setup()
    
    render(
      <AnnotationToolbar
        selection={mockSelection}
        onFlashcard={onFlashcard}
      />
    )
    
    await user.click(screen.getByRole('button', { name: /flashcard/i }))
    
    expect(onFlashcard).toHaveBeenCalledWith(mockSelection)
  })
})
```

#### 4. E2E Testing with Playwright

```typescript
// tests/e2e/reading-flow.spec.ts
import { test, expect } from '@playwright/test'
import { uploadTestDocument, loginTestUser } from './helpers'

test.describe('Reading Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page)
    await uploadTestDocument(page, 'sample.pdf')
  })
  
  test('can select text and create annotation', async ({ page }) => {
    // Open document
    await page.click('text=sample.pdf')
    await page.waitForSelector('.document-reader')
    
    // Select text
    await page.mouse.move(100, 200)
    await page.mouse.down()
    await page.mouse.move(300, 200)
    await page.mouse.up()
    
    // Annotation toolbar appears
    await expect(page.locator('.annotation-toolbar')).toBeVisible()
    
    // Create highlight
    await page.click('button[aria-label="Yellow highlight"]')
    
    // Verify highlight saved
    await expect(page.locator('.highlight-yellow')).toBeVisible()
  })
  
  test('can create flashcard from annotation', async ({ page }) => {
    // Create annotation first
    await page.selectText('Important concept')
    await page.click('button[aria-label="Create note"]')
    await page.fill('textarea', 'My note about this')
    await page.click('text=Save')
    
    // Convert to flashcard
    await page.click('.annotation-marker')
    await page.click('text=Create flashcard')
    
    await page.fill('input[name="question"]', 'What is the concept?')
    await page.click('text=Create')
    
    // Verify in study queue
    await page.click('button[aria-label="Study queue"]')
    await expect(page.locator('text=1 card due')).toBeVisible()
  })
})
```

#### 5. Mock Supabase for Testing

```typescript
// tests/mocks/supabase.ts
export function createMockSupabase() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { id: 'mock-id' }
          }))
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { id: 'mock-id' }
          }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn()
      }))
    })),
    
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => ({ 
          data: { path: 'mock-path' } 
        })),
        download: vi.fn(() => ({
          data: new Blob(['mock content'])
        }))
      }))
    },
    
    rpc: vi.fn()
  }
}
```

### What to Test vs Skip

#### Priority Testing
```typescript
// ✅ TEST THESE:
- ECS entity creation and querying
- FSRS scheduling calculations  
- Text selection and position tracking
- Annotation persistence and recovery
- Document chunking logic
- Export/import data integrity
- Study session state management
- Connection detection thresholds

// ⚠️ INTEGRATION TEST THESE:
- Document upload flow
- Processing pipeline stages
- Study card rendering
- Annotation layer positioning

// ❌ SKIP THESE:
- shadcn/ui components (already tested)
- Gemini API calls (mock instead)
- Supabase internals
- PDF.js library functions
- Simple getters/setters
```

### Test Data Generation

```typescript
// tests/fixtures/generators.ts
import { faker } from '@faker-js/faker'

export function generateDocument() {
  return {
    id: faker.string.uuid(),
    title: faker.lorem.sentence(),
    author: faker.person.fullName(),
    storage_path: `user-123/doc-${faker.string.uuid()}`,
    processing_status: 'complete'
  }
}

export function generateChunk() {
  return {
    id: faker.string.uuid(),
    content: faker.lorem.paragraphs(3),
    themes: faker.helpers.arrayElements(['capitalism', 'economics', 'philosophy'], 2),
    embedding: Array(768).fill(0).map(() => Math.random())
  }
}

export function generateFlashcard() {
  return {
    question: faker.lorem.sentence().replace('.', '?'),
    answer: faker.lorem.paragraph(),
    due: faker.date.future(),
    ease: faker.number.float({ min: 1.3, max: 2.5 })
  }
}
```

### CI Testing Script

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "npm run test:run && npm run test:e2e"
  }
}
```

This testing setup gives you:
- Fast unit tests with Vitest
- Component testing with Testing Library
- E2E testing with Playwright
- Proper mocking for Supabase
- Good coverage without over-testing

Start with unit tests for FSRS and ECS, then add E2E tests for critical user flows.











## ECS Pattern - ALWAYS USE THIS

```typescript
// lib/ecs/simple-ecs.ts - YOUR ONLY ENTITY MANAGER

class ECS {
  async createEntity(userId: string, components: Record<string, any>) {
    // Create entity
    const entity = await supabase.from('entities').insert({ user_id: userId })
    
    // Add components
    for (const [type, data] of Object.entries(components)) {
      await supabase.from('components').insert({
        entity_id: entity.id,
        component_type: type,
        data,
        document_id: data.document_id // Denormalize for queries
      })
    }
    
    return entity.id
  }
}

// ALWAYS create entities this way:
ecs.createEntity(userId, {
  flashcard: { question, answer },
  study: { due: new Date() },
  source: { chunk_id, document_id }
})

// NEVER create type-specific services:
❌ flashcardService.create()
❌ annotationService.create()  
✅ ecs.createEntity()
```


