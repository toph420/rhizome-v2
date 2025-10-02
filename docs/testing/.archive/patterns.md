# Testing Patterns & Examples

> **Code examples for common testing scenarios in Rhizome V2**  
> Updated for development-friendly testing strategy

## Table of Contents
1. [Test Category Patterns](#test-category-patterns)
2. [Unit Test Patterns](#unit-test-patterns)
3. [Integration Test Patterns](#integration-test-patterns)
4. [E2E Test Patterns](#e2e-test-patterns)
5. [Mocking Patterns](#mocking-patterns)
6. [Async Testing Patterns](#async-testing-patterns)
7. [Error Testing Patterns](#error-testing-patterns)
8. [Performance Testing Patterns](#performance-testing-patterns)

## Test Category Patterns

### 🔴 Critical Test Examples

#### E2E User Journey (tests/critical/upload-process-flow.test.ts)
```typescript
import { test, expect } from '@playwright/test'

test('Complete document upload and processing workflow', async ({ page }) => {
  // Navigate to upload page
  await page.goto('/upload')
  
  // Upload document
  await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample.pdf')
  
  // Wait for processing to complete
  await expect(page.locator('[data-testid="processing-status"]'))
    .toHaveText('completed', { timeout: 60000 })
  
  // Navigate to reader
  await page.click('[data-testid="read-document"]')
  await expect(page).toHaveURL(/\/read\//)
  
  // Verify document content is displayed
  await expect(page.locator('[data-testid="document-content"]'))
    .toBeVisible()
  
  // Verify collision detection is working
  await expect(page.locator('[data-testid="connections-panel"]'))
    .toContainText('connections found')
})
```

#### Integration Smoke Test (tests/critical/system-connectivity.test.ts)
```typescript
import { supabase } from '@/lib/supabase'
import { processDocument } from '@/worker/handlers/process-document'

describe('System Connectivity', () => {
  test('Database connection works', async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('count(*)')
      .single()
    
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
  
  test('Document processing pipeline works', async () => {
    const testDoc = {
      id: 'test-doc',
      user_id: 'test-user',
      source_type: 'text',
      content: 'Test content for processing'
    }
    
    const result = await processDocument(testDoc)
    
    expect(result.status).toBe('completed')
    expect(result.chunks.length).toBeGreaterThan(0)
    expect(result.embeddingsGenerated).toBe(true)
  })
})
```

### 🟡 Stable Test Examples

#### API Contract Test (tests/stable/document-crud.test.ts)
```typescript
import { createDocument, getDocument, updateDocument } from '@/app/actions/documents'
import { factories } from '@/tests/factories'

describe('Document CRUD Operations', () => {
  test('createDocument returns valid document ID', async () => {
    const documentData = factories.document.createFormData()
    
    const result = await createDocument(documentData)
    
    expect(result.success).toBe(true)
    expect(result.documentId).toMatch(/^[a-z0-9-]+$/)
  })
  
  test('getDocument returns complete document data', async () => {
    const doc = factories.document.createProcessed()
    
    const result = await getDocument(doc.id)
    
    expect(result).toMatchObject({
      id: doc.id,
      title: expect.any(String),
      processing_status: 'completed',
      chunks: expect.arrayContaining([
        expect.objectContaining({
          content: expect.any(String),
          metadata: expect.any(Object)
        })
      ])
    })
  })
})
```

#### System Integration Test (tests/stable/background-jobs.test.ts)
```typescript
import { supabase } from '@/lib/supabase'
import { processBackgroundJobs } from '@/worker/job-processor'

describe('Background Job Processing', () => {
  test('processes document upload job successfully', async () => {
    // Create job
    const { data: job } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'process-document',
        input_data: { document_id: 'test-doc' },
        status: 'pending'
      })
      .select()
      .single()
    
    // Process jobs
    await processBackgroundJobs()
    
    // Verify job completion
    const { data: updatedJob } = await supabase
      .from('background_jobs')
      .select()
      .eq('id', job.id)
      .single()
    
    expect(updatedJob.status).toBe('completed')
    expect(updatedJob.completed_at).toBeDefined()
  })
})
```

### 🟢 Flexible Test Examples

#### Component Test (tests/flexible/upload-zone.test.tsx)
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { UploadZone } from '@/components/library/UploadZone'

describe('UploadZone Component', () => {
  test('shows drag state when file is dragged over', () => {
    render(<UploadZone onFileSelect={() => {}} />)
    
    const dropZone = screen.getByRole('button')
    
    fireEvent.dragEnter(dropZone)
    
    expect(screen.getByText('Drop files here')).toBeVisible()
    expect(dropZone).toHaveClass('drag-active')
  })
  
  test('calls onFileSelect when file is dropped', () => {
    const onFileSelect = jest.fn()
    render(<UploadZone onFileSelect={onFileSelect} />)
    
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    const dropZone = screen.getByRole('button')
    
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] }
    })
    
    expect(onFileSelect).toHaveBeenCalledWith(file)
  })
})
```

#### Utility Function Test (tests/flexible/chunk-utilities.test.ts)
```typescript
import { chunkMarkdown, calculateChunkScore } from '@/lib/chunk-utilities'

describe('Chunk Utilities', () => {
  test('chunkMarkdown splits content by headers', () => {
    const markdown = `
# Header 1
Content 1

## Header 2
Content 2

### Header 3
Content 3
    `
    
    const chunks = chunkMarkdown(markdown)
    
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toMatchObject({
      content: expect.stringContaining('Header 1'),
      level: 1
    })
  })
  
  test('calculateChunkScore returns normalized score', () => {
    const chunk = {
      wordCount: 150,
      importanceScore: 0.8,
      themes: ['technology', 'innovation']
    }
    
    const score = calculateChunkScore(chunk)
    
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})
```

### 🔵 Experimental Test Examples

#### Feature Spike Test (tests/experimental/ai-summarization.test.ts)
```typescript
// NOTE: Experimental feature - not included in CI
import { generateAISummary } from '@/lib/experimental/ai-summarization'

describe('AI Summarization (Experimental)', () => {
  test('generates coherent summary for document', async () => {
    const document = {
      content: 'Long document content...',
      chunks: [/* chunk data */]
    }
    
    const summary = await generateAISummary(document)
    
    // Basic validation for experimental feature
    expect(summary).toBeDefined()
    expect(summary.length).toBeGreaterThan(10)
    expect(summary.length).toBeLessThan(500)
  })
})
```

## Unit Test Patterns

### Testing Pure Functions

```typescript
// worker/processors/markdown-chunker.test.ts
import { chunkMarkdown } from '../markdown-chunker'

describe('Markdown Chunker', () => {
  test('preserves code blocks during chunking', () => {
    const markdown = `
# Introduction

Here's some code:

\`\`\`javascript
function hello() {
  console.log('world')
}
\`\`\`

## Next Section
More content here.
    `
    
    const chunks = chunkMarkdown(markdown, { maxChunkSize: 200 })
    
    expect(chunks[0].content).toContain('```javascript')
    expect(chunks[0].content).toContain('function hello()')
    expect(chunks[0].content).toContain('```')
  })
})
```

### Testing Classes and Objects

```typescript
// src/lib/ecs/__tests__/ecs.test.ts
import { ecs } from '../ecs'
import { factories } from '@/tests/factories'

describe('ECS System', () => {
  beforeEach(() => {
    factories.entity.reset()
  })
  
  test('createEntity generates unique ID', async () => {
    const userId = 'test-user'
    const components = { flashcard: { question: 'Q?', answer: 'A.' } }
    
    const entityId1 = await ecs.createEntity(userId, components)
    const entityId2 = await ecs.createEntity(userId, components)
    
    expect(entityId1).not.toBe(entityId2)
    expect(typeof entityId1).toBe('string')
    expect(entityId1.length).toBeGreaterThan(10)
  })
  
  test('query returns entities with specified components', async () => {
    const userId = 'test-user'
    
    // Create entities with different components
    await ecs.createEntity(userId, { 
      flashcard: { question: 'Q1', answer: 'A1' },
      study: { due: new Date(), ease: 2.5 }
    })
    await ecs.createEntity(userId, { 
      annotation: { text: 'Note', range: { start: 0, end: 10 } }
    })
    
    const flashcards = await ecs.query(['flashcard', 'study'], userId)
    
    expect(flashcards).toHaveLength(1)
    expect(flashcards[0].components.flashcard.question).toBe('Q1')
  })
})
```

## Integration Test Patterns

### Testing Database Operations

```typescript
// tests/integration/database/embeddings.test.ts
import { supabase } from '@/lib/supabase'
import { generateEmbeddings } from '@/worker/lib/embeddings'

describe('Embeddings Integration', () => {
  test('stores and retrieves embeddings correctly', async () => {
    const chunk = {
      id: 'test-chunk',
      content: 'Test content for embedding',
      document_id: 'test-doc'
    }
    
    // Generate embedding
    const embedding = await generateEmbeddings(chunk.content)
    
    // Store in database
    await supabase.from('chunks').upsert({
      ...chunk,
      embedding: embedding
    })
    
    // Retrieve and verify
    const { data } = await supabase
      .from('chunks')
      .select('embedding')
      .eq('id', chunk.id)
      .single()
    
    expect(data.embedding).toHaveLength(768) // Gemini embedding dimension
    expect(data.embedding[0]).toBeTypeOf('number')
  })
  
  test('similarity search returns relevant chunks', async () => {
    const queryEmbedding = await generateEmbeddings('machine learning')
    
    const { data } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 5
    })
    
    expect(data).toBeInstanceOf(Array)
    data.forEach(chunk => {
      expect(chunk).toMatchObject({
        id: expect.any(String),
        content: expect.any(String),
        similarity: expect.any(Number)
      })
      expect(chunk.similarity).toBeGreaterThan(0.7)
    })
  })
})
```

### Testing Worker Processes

```typescript
// worker/tests/integration/processor-integration.test.ts
import { processDocument } from '../handlers/process-document'
import { factories } from '../tests/factories'

describe('Document Processor Integration', () => {
  test('processes PDF end-to-end', async () => {
    const document = factories.document.createPDF({
      storage_path: 'test-files/sample.pdf'
    })
    
    const result = await processDocument(document)
    
    expect(result).toMatchObject({
      status: 'completed',
      markdown: expect.stringContaining('#'),
      chunks: expect.arrayContaining([
        expect.objectContaining({
          content: expect.any(String),
          metadata: expect.objectContaining({
            wordCount: expect.any(Number),
            importanceScore: expect.any(Number)
          })
        })
      ]),
      embeddingsGenerated: true
    })
  })
  
  test('handles processing errors gracefully', async () => {
    const document = factories.document.create({
      storage_path: 'nonexistent-file.pdf'
    })
    
    const result = await processDocument(document)
    
    expect(result.status).toBe('failed')
    expect(result.error).toContain('File not found')
  })
})
```

## E2E Test Patterns

### Page Object Model

```typescript
// tests/e2e/page-objects/DocumentReaderPage.ts
import { Page, Locator } from '@playwright/test'

export class DocumentReaderPage {
  readonly page: Page
  readonly documentContent: Locator
  readonly connectionsPanel: Locator
  readonly annotationButton: Locator
  
  constructor(page: Page) {
    this.page = page
    this.documentContent = page.locator('[data-testid="document-content"]')
    this.connectionsPanel = page.locator('[data-testid="connections-panel"]')
    this.annotationButton = page.locator('[data-testid="create-annotation"]')
  }
  
  async navigateToDocument(documentId: string) {
    await this.page.goto(`/read/${documentId}`)
  }
  
  async selectText(text: string) {
    await this.documentContent.locator(`text=${text}`).first().dblclick()
  }
  
  async createAnnotation(note: string) {
    await this.annotationButton.click()
    await this.page.fill('[data-testid="annotation-input"]', note)
    await this.page.click('[data-testid="save-annotation"]')
  }
  
  async getConnections() {
    return await this.connectionsPanel
      .locator('[data-testid="connection-item"]')
      .all()
  }
}
```

### Complete User Journeys

```typescript
// tests/e2e/journeys/annotation-creation.spec.ts
import { test, expect } from '@playwright/test'
import { DocumentReaderPage } from '../page-objects/DocumentReaderPage'

test('User creates and views annotation', async ({ page }) => {
  const readerPage = new DocumentReaderPage(page)
  
  // Navigate to processed document
  await readerPage.navigateToDocument('test-document-id')
  
  // Select text and create annotation
  await readerPage.selectText('important concept')
  await readerPage.createAnnotation('This is a key insight about the topic')
  
  // Verify annotation appears
  await expect(page.locator('[data-testid="annotation-marker"]')).toBeVisible()
  
  // Verify annotation in sidebar
  await expect(page.locator('[data-testid="annotations-list"]'))
    .toContainText('This is a key insight')
  
  // Verify annotation persists after reload
  await page.reload()
  await expect(page.locator('[data-testid="annotation-marker"]')).toBeVisible()
})
```

## Mocking Patterns

### Supabase Client Mocking

```typescript
// tests/mocks/supabase.ts
export function createMockSupabaseClient() {
  const mockFrom = jest.fn()
  const mockSelect = jest.fn()
  const mockInsert = jest.fn()
  const mockUpdate = jest.fn()
  const mockDelete = jest.fn()
  const mockEq = jest.fn()
  const mockSingle = jest.fn()
  
  // Create chainable mock
  const createChainableMock = () => ({
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    delete: mockDelete.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    single: mockSingle.mockResolvedValue({ data: {}, error: null })
  })
  
  mockFrom.mockReturnValue(createChainableMock())
  
  return {
    from: mockFrom,
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
        download: jest.fn().mockResolvedValue({ data: new Blob(), error: null })
      }))
    },
    rpc: jest.fn().mockResolvedValue({ data: [], error: null })
  }
}
```

### External API Mocking

```typescript
// worker/tests/mocks/gemini.ts
export const mockGeminiClient = {
  generateContent: jest.fn(),
  generateEmbedding: jest.fn()
}

export function mockGeminiSuccess(response: any) {
  mockGeminiClient.generateContent.mockResolvedValue({
    response: { text: () => JSON.stringify(response) }
  })
}

export function mockGeminiError(message: string) {
  mockGeminiClient.generateContent.mockRejectedValue(
    new Error(message)
  )
}

// Usage in tests
beforeEach(() => {
  jest.clearAllMocks()
  mockGeminiSuccess({
    markdown: '# Processed Content',
    chunks: [{ content: 'Test chunk', metadata: {} }]
  })
})
```

## Async Testing Patterns

### Testing Promises and Async Operations

```typescript
describe('Async Document Processing', () => {
  test('waits for processing completion', async () => {
    const document = factories.document.create()
    
    // Start async operation
    const processingPromise = processDocument(document)
    
    // Assert intermediate state
    expect(document.processing_status).toBe('processing')
    
    // Wait for completion
    const result = await processingPromise
    
    // Assert final state
    expect(result.status).toBe('completed')
    expect(result.processingTime).toBeGreaterThan(0)
  })
  
  test('handles concurrent processing requests', async () => {
    const documents = factories.document.createMany(3)
    
    // Start all processes concurrently
    const promises = documents.map(doc => processDocument(doc))
    
    // Wait for all to complete
    const results = await Promise.all(promises)
    
    // Verify all succeeded
    results.forEach(result => {
      expect(result.status).toBe('completed')
    })
  })
})
```

### Testing with Timeouts

```typescript
describe('Processing Timeouts', () => {
  test('respects processing timeout', async () => {
    const document = factories.document.create()
    
    // Mock slow processing
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(30000) // 30 seconds later
    
    await expect(
      processDocument(document, { timeout: 10000 })
    ).rejects.toThrow('Processing timeout')
  }, 35000) // Extend Jest timeout
})
```

## Error Testing Patterns

### Testing Error Boundaries

```typescript
// tests/integration/error-handling.test.ts
describe('Error Handling', () => {
  test('handles database connection failures', async () => {
    // Mock database failure
    const supabase = createMockSupabaseClient()
    supabase.from().select.mockRejectedValue(
      new Error('Connection timeout')
    )
    
    const result = await getDocuments('user-id')
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection timeout')
  })
  
  test('handles malformed API responses', async () => {
    mockGeminiClient.generateContent.mockResolvedValue({
      response: { text: () => 'Invalid JSON {' }
    })
    
    await expect(processDocument(document))
      .rejects
      .toThrow('Invalid response format')
  })
})
```

### Testing User Input Validation

```typescript
describe('Input Validation', () => {
  test('rejects invalid file types', async () => {
    const invalidFile = new File(['content'], 'test.exe', {
      type: 'application/x-msdownload'
    })
    
    await expect(validateFileUpload(invalidFile))
      .rejects
      .toThrow('Unsupported file type')
  })
  
  test('rejects oversized files', async () => {
    const oversizedFile = new File(['x'.repeat(100_000_000)], 'huge.pdf', {
      type: 'application/pdf'
    })
    
    await expect(validateFileUpload(oversizedFile))
      .rejects
      .toThrow('File too large')
  })
})
```

## Performance Testing Patterns

### Testing Response Times

```typescript
// worker/tests/performance/processing-speed.test.ts
describe('Processing Performance', () => {
  test('processes small documents under 30 seconds', async () => {
    const document = factories.document.create({
      size: 'small' // < 10 pages
    })
    
    const startTime = performance.now()
    await processDocument(document)
    const endTime = performance.now()
    
    const processingTime = endTime - startTime
    expect(processingTime).toBeLessThan(30000) // 30 seconds
  })
  
  test('handles batch processing efficiently', async () => {
    const documents = factories.document.createMany(5)
    
    const startTime = performance.now()
    await Promise.all(documents.map(processDocument))
    const endTime = performance.now()
    
    const averageTime = (endTime - startTime) / documents.length
    expect(averageTime).toBeLessThan(60000) // 1 minute per doc
  })
})
```

### Testing Memory Usage

```typescript
describe('Memory Management', () => {
  test('cleans up resources after processing', async () => {
    const initialMemory = process.memoryUsage().heapUsed
    
    // Process large document
    const largeDocument = factories.document.createLarge()
    await processDocument(largeDocument)
    
    // Force garbage collection (if available)
    if (global.gc) {
      global.gc()
    }
    
    const finalMemory = process.memoryUsage().heapUsed
    const memoryIncrease = finalMemory - initialMemory
    
    // Memory increase should be reasonable
    expect(memoryIncrease).toBeLessThan(100_000_000) // 100MB
  })
})
```

---

**See Also**:
- [README.md](./README.md) - Primary testing guide
- [development-workflow.md](./development-workflow.md) - Testing strategy and workflows
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues and solutions