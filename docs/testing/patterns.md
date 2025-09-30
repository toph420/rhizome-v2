# Testing Patterns & Examples

> Practical code examples for common testing scenarios in Rhizome V2

## Table of Contents
1. [Unit Test Patterns](#unit-test-patterns)
2. [Integration Test Patterns](#integration-test-patterns)
3. [E2E Test Patterns](#e2e-test-patterns)
4. [Mocking Patterns](#mocking-patterns)
5. [Async Testing Patterns](#async-testing-patterns)
6. [Error Testing Patterns](#error-testing-patterns)

## Unit Test Patterns

### Testing Pure Functions

```typescript
// processors/markdown-chunker.test.ts
import { chunkMarkdown } from '../markdown-chunker'

describe('chunkMarkdown', () => {
  it('splits content at heading boundaries', () => {
    const markdown = '# Title\nContent\n## Section\nMore content'
    const chunks = chunkMarkdown(markdown)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].content).toContain('Title')
    expect(chunks[1].content).toContain('Section')
  })

  it('handles code blocks without splitting', () => {
    const markdown = '```js\nconst long = "code";\n```'
    const chunks = chunkMarkdown(markdown, { maxSize: 10 })

    expect(chunks).toHaveLength(1) // Not split despite size
    expect(chunks[0].content).toContain('```')
  })
})
```

### Testing Classes

```typescript
// processors/pdf-processor.test.ts
import { PDFProcessor } from '../pdf-processor'
import { factories } from '@/tests/factories'

describe('PDFProcessor', () => {
  let processor: PDFProcessor

  beforeEach(() => {
    processor = new PDFProcessor()
  })

  describe('transform', () => {
    it('extracts text from PDF buffer', async () => {
      const pdfBuffer = factories.TestFiles.pdf()
      const metadata = { source_type: 'pdf' as const, fileName: 'test.pdf' }

      const result = await processor.transform(pdfBuffer, metadata)

      expect(result.markdown).toBeDefined()
      expect(result.chunks).toHaveLength(greaterThan(0))
      expect(result.metadata.source_type).toBe('pdf')
    })

    it('handles corrupted PDFs gracefully', async () => {
      const badBuffer = Buffer.from('not a pdf')
      const metadata = { source_type: 'pdf' as const }

      await expect(processor.transform(badBuffer, metadata))
        .rejects.toThrow('Invalid PDF')
    })
  })
})
```

### Testing React Components

```typescript
// components/reader/DocumentViewer.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentViewer } from '../DocumentViewer'
import { factories } from '@/tests/factories'

describe('DocumentViewer', () => {
  it('renders markdown content', () => {
    const doc = factories.document.createProcessed({
      content: '# Test Document'
    })

    render(<DocumentViewer document={doc} />)

    expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('Test Document')
  })

  it('handles text selection for annotations', async () => {
    const onSelect = jest.fn()
    const doc = factories.document.create()

    render(<DocumentViewer document={doc} onTextSelect={onSelect} />)

    const text = screen.getByText(/test content/i)
    await userEvent.selectText(text)

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.any(String),
        range: expect.any(Object)
      })
    )
  })
})
```

## Integration Test Patterns

### Testing Database Operations

```typescript
// lib/ecs/__tests__/ecs-integration.test.ts
import { ecs } from '../ecs'
import { createClient } from '@supabase/supabase-js'
import { factories } from '@/tests/factories'

describe('ECS Integration', () => {
  let supabase: ReturnType<typeof createClient>
  let testUserId: string

  beforeAll(() => {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  })

  beforeEach(async () => {
    const user = factories.user.create()
    testUserId = user.id

    // Setup test user
    await supabase.from('users').insert(user)
  })

  afterEach(async () => {
    // Cleanup
    await supabase.from('entities')
      .delete()
      .eq('user_id', testUserId)
  })

  it('creates and retrieves entities with components', async () => {
    // Create entity
    const entityId = await ecs.createEntity(testUserId, {
      flashcard: { question: 'Q1', answer: 'A1' },
      study: { ease: 2.5, due: new Date() }
    })

    // Retrieve entity
    const entities = await ecs.query(
      ['flashcard', 'study'],
      testUserId
    )

    expect(entities).toHaveLength(1)
    expect(entities[0].id).toBe(entityId)
    expect(entities[0].flashcard.question).toBe('Q1')
  })
})
```

### Testing API Endpoints

```typescript
// app/api/documents/__tests__/upload.test.ts
import { POST } from '../upload/route'
import { factories } from '@/tests/factories'

describe('POST /api/documents/upload', () => {
  it('processes uploaded document', async () => {
    const formData = new FormData()
    const file = factories.createMockFile(
      'Test content',
      'test.pdf',
      'application/pdf'
    )
    formData.append('file', file)

    const request = new Request('http://localhost/api/documents/upload', {
      method: 'POST',
      body: formData
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.documentId).toBeDefined()
    expect(data.status).toBe('processing')
  })

  it('validates file types', async () => {
    const formData = new FormData()
    const file = factories.createMockFile(
      'Bad content',
      'test.exe',
      'application/x-msdownload'
    )
    formData.append('file', file)

    const request = new Request('http://localhost/api/documents/upload', {
      method: 'POST',
      body: formData
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('Invalid file type')
    })
  })
})
```

## E2E Test Patterns

### Page Object Model

```typescript
// tests/e2e/page-objects/LibraryPage.ts
export class LibraryPage extends BasePage {
  readonly selectors = {
    documentCard: '[data-testid="document-card"]',
    readButton: '[data-testid="read-button"]',
    emptyState: '[data-testid="library-empty"]'
  }

  async navigate(): Promise<void> {
    await this.goto('/')
    await this.waitForLibraryLoaded()
  }

  async waitForLibraryLoaded(): Promise<void> {
    await Promise.race([
      this.waitForVisible(this.selectors.documentCard),
      this.waitForVisible(this.selectors.emptyState)
    ])
  }

  async openDocumentInReader(title: string): Promise<void> {
    const card = await this.getDocumentByTitle(title)
    if (!card) {
      throw new Error(`Document not found: ${title}`)
    }
    
    await this.readDocument(card)
    await this.waitForUrl(/\/read\//)
  }
  }

  async getDocumentId() {
    const element = await this.page.locator('[data-testid="document-id"]')
    return element.getAttribute('data-value')
  }
}

// tests/e2e/upload.spec.ts
import { test, expect } from '@playwright/test'
import { UploadPage } from './pages/UploadPage'

test('complete upload flow', async ({ page }) => {
  const uploadPage = new UploadPage(page)

  await uploadPage.goto()
  await uploadPage.uploadFile('tests/fixtures/sample.pdf')
  await uploadPage.waitForProcessing()

  const docId = await uploadPage.getDocumentId()
  expect(docId).toBeTruthy()

  // Navigate to reader
  await page.goto(`/read/${docId}`)
  await expect(page.locator('[data-testid="document-viewer"]')).toBeVisible()
})
```

### Testing User Flows

```typescript
// tests/e2e/annotation-flow.spec.ts
test('create and save annotation', async ({ page }) => {
  // Setup: Navigate to document
  await page.goto('/read/test-doc-001')

  // Select text
  const content = page.locator('[data-testid="document-content"]')
  await content.evaluate(el => {
    const range = document.createRange()
    const textNode = el.firstChild
    range.setStart(textNode, 0)
    range.setEnd(textNode, 20)

    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })

  // Create annotation
  await page.click('[data-testid="create-annotation"]')
  await page.fill('[data-testid="annotation-note"]', 'Important point')
  await page.click('[data-testid="save-annotation"]')

  // Verify annotation saved
  await expect(page.locator('[data-testid="annotation-marker"]')).toBeVisible()
  await expect(page.locator('[data-testid="annotation-list"]')).toContainText('Important point')
})
```

## Mocking Patterns

### Mocking External APIs

```typescript
// tests/mocks/gemini.ts
export function mockGeminiAPI() {
  return {
    generateContent: jest.fn().mockResolvedValue({
      response: {
        text: () => '# Processed Document\n\nContent here'
      }
    }),
    generateEmbedding: jest.fn().mockResolvedValue({
      embedding: Array(768).fill(0).map(() => Math.random())
    })
  }
}

// In test file
jest.mock('@google/genai', () => ({
  GoogleGenerativeAI: jest.fn(() => mockGeminiAPI())
}))
```

### Mocking Supabase

```typescript
// tests/mocks/supabase.ts
export function mockSupabaseClient() {
  const mockFrom = (table: string) => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue({ data: [], error: null }),
    update: jest.fn().mockResolvedValue({ data: [], error: null }),
    delete: jest.fn().mockResolvedValue({ data: [], error: null }),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: {}, error: null })
  })

  return {
    from: mockFrom,
    storage: {
      from: (bucket: string) => ({
        upload: jest.fn().mockResolvedValue({
          data: { path: 'test/path' },
          error: null
        }),
        download: jest.fn().mockResolvedValue({
          data: Buffer.from('test'),
          error: null
        })
      })
    },
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user' } },
        error: null
      })
    }
  }
}
```

## Async Testing Patterns

### Testing with Promises

```typescript
describe('Async Operations', () => {
  it('waits for processing to complete', async () => {
    const doc = factories.document.create()
    const processPromise = processDocument(doc)

    // Check initial state
    expect(doc.processing_status).toBe('processing')

    // Wait for completion
    const result = await processPromise

    // Check final state
    expect(result.success).toBe(true)
    expect(doc.processing_status).toBe('completed')
  })

  it('handles concurrent operations', async () => {
    const docs = factories.document.createMany(3)

    const results = await Promise.all(
      docs.map(doc => processDocument(doc))
    )

    expect(results).toHaveLength(3)
    results.forEach(result => {
      expect(result.success).toBe(true)
    })
  })
})
```

### Testing with Timers

```typescript
describe('Timer-based Operations', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('retries with exponential backoff', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValueOnce('Success')

    const promise = retryWithBackoff(operation)

    // First attempt immediately
    expect(operation).toHaveBeenCalledTimes(1)

    // Second attempt after 1s
    jest.advanceTimersByTime(1000)
    await Promise.resolve() // Let microtasks run
    expect(operation).toHaveBeenCalledTimes(2)

    // Third attempt after 2s
    jest.advanceTimersByTime(2000)
    await Promise.resolve()
    expect(operation).toHaveBeenCalledTimes(3)

    const result = await promise
    expect(result).toBe('Success')
  })
})
```

## Error Testing Patterns

### Testing Error Boundaries

```typescript
describe('Error Handling', () => {
  it('recovers from processing errors', async () => {
    const doc = factories.document.create()
    const error = new Error('Processing failed')

    mockGeminiAPI.generateContent.mockRejectedValueOnce(error)

    const result = await processDocument(doc)

    expect(result.success).toBe(false)
    expect(result.error).toBe(error.message)
    expect(doc.processing_status).toBe('failed')
    expect(doc.error_message).toContain('Processing failed')
  })

  it('validates input before processing', async () => {
    const invalidDoc = { id: null } // Missing required fields

    await expect(processDocument(invalidDoc as any))
      .rejects.toThrow('Invalid document')
  })

  it('handles network timeouts', async () => {
    const doc = factories.document.create()

    mockGeminiAPI.generateContent.mockImplementation(() =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    )

    await expect(processDocument(doc, { timeout: 1000 }))
      .rejects.toThrow('Timeout')
  })
})
```

### Testing Validation

```typescript
describe('Input Validation', () => {
  it('validates required fields', () => {
    const validate = (input: any) => {
      if (!input.id) throw new Error('ID required')
      if (!input.title) throw new Error('Title required')
      return true
    }

    expect(() => validate({})).toThrow('ID required')
    expect(() => validate({ id: '1' })).toThrow('Title required')
    expect(validate({ id: '1', title: 'Test' })).toBe(true)
  })

  it('sanitizes user input', () => {
    const input = '<script>alert("XSS")</script>Hello'
    const sanitized = sanitizeInput(input)

    expect(sanitized).toBe('Hello')
    expect(sanitized).not.toContain('<script>')
  })
})
```

## Performance Testing Patterns

```typescript
describe('Performance', () => {
  it('processes documents within time limit', async () => {
    const doc = factories.document.create()
    const start = performance.now()

    await processDocument(doc)

    const duration = performance.now() - start
    expect(duration).toBeLessThan(5000) // 5 seconds max
  })

  it('handles large documents efficiently', async () => {
    const largeContent = 'x'.repeat(1_000_000) // 1MB
    const doc = factories.document.create({ content: largeContent })

    const memBefore = process.memoryUsage().heapUsed

    await processDocument(doc)

    const memAfter = process.memoryUsage().heapUsed
    const memIncrease = memAfter - memBefore

    expect(memIncrease).toBeLessThan(50_000_000) // <50MB increase
  })
})
```