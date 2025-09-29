# Code Examples & User Flows

## Table of Contents
1. [Document Upload Flow](#document-upload-flow)
2. [Document Processing](#document-processing)
3. [Collision Detection](#collision-detection)
4. [ECS Operations](#ecs-operations)
5. [User Preferences](#user-preferences)
6. [Common Patterns](#common-patterns)

## Document Upload Flow

### Complete User Flow: PDF Upload
```typescript
// 1. User selects file in UI (components/upload/UploadZone.tsx)
const handleDrop = async (files: FileList) => {
  const file = files[0]
  
  // 2. Detect source type
  const sourceType = detectSourceType(file.name) // 'pdf'
  
  // 3. Create FormData
  const formData = new FormData()
  formData.append('file', file)
  formData.append('source_type', sourceType)
  
  // 4. Call Server Action
  const result = await uploadDocument(formData)
  
  // 5. Show processing dock
  setProcessingJobs([result.jobId])
}

// Server Action (app/actions/documents.ts)
'use server'
export async function uploadDocument(formData: FormData) {
  const file = formData.get('file') as File
  const sourceType = formData.get('source_type') as SourceType
  const userId = 'dev-user-123' // MVP hardcode
  const documentId = crypto.randomUUID()
  
  // Upload to storage
  const storagePath = `${userId}/${documentId}`
  const { error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(`${storagePath}/source.pdf`, file)
  
  if (uploadError) throw uploadError
  
  // Create document record
  const { error: dbError } = await supabaseAdmin
    .from('documents')
    .insert({
      id: documentId,
      user_id: userId,
      title: file.name.replace(/\.[^/.]+$/, ''),
      storage_path: storagePath,
      source_type: sourceType,
      processing_status: 'pending',
      created_at: new Date().toISOString()
    })
  
  if (dbError) throw dbError
  
  // Queue processing job
  const { data: job, error: jobError } = await supabaseAdmin
    .from('background_jobs')
    .insert({
      job_type: 'process-document',
      status: 'pending',
      input_data: {
        document_id: documentId,
        source_type: sourceType,
        user_id: userId
      },
      created_at: new Date().toISOString()
    })
    .select()
    .single()
  
  if (jobError) throw jobError
  
  // Trigger processing
  await triggerProcessing(job.id)
  
  revalidatePath('/')
  return { success: true, documentId, jobId: job.id }
}
```

### YouTube URL Processing
```typescript
// User enters YouTube URL
const handleYouTubeSubmit = async (url: string) => {
  // Extract video ID
  const videoId = extractVideoId(url) // Uses regex patterns
  
  // Create "file-like" object for consistency
  const pseudoFile = {
    name: `youtube_${videoId}.txt`,
    content: url
  }
  
  // Process same as file upload
  const formData = new FormData()
  formData.append('url', url)
  formData.append('source_type', 'youtube')
  
  const result = await uploadDocument(formData)
}

// Backend processing (worker/processors/youtube-processor.ts)
export class YouTubeProcessor extends BaseProcessor {
  async process(): Promise<ProcessResult> {
    // 1. Extract video ID
    const videoId = extractVideoId(this.job.input_data.url)
    
    // 2. Fetch transcript
    const transcript = await fetchYouTubeTranscript(videoId)
    
    // 3. Clean with AI (remove timestamps)
    const cleanedTranscript = await this.cleanTranscript(transcript)
    
    // 4. Chunk and extract metadata
    const chunks = await this.extractChunks(cleanedTranscript)
    
    // 5. Generate embeddings
    for (const chunk of chunks) {
      chunk.embedding = await generateEmbedding(chunk.content)
    }
    
    // 6. Save everything
    await this.uploadToStorage(cleanedTranscript)
    await this.insertChunksBatch(chunks)
    
    return { 
      markdown: cleanedTranscript,
      chunks,
      metadata: { videoId, duration, channelName }
    }
  }
}
```

## Document Processing

### Processor Router Pattern
```typescript
// worker/processors/index.ts
export class ProcessorRouter {
  static createProcessor(
    sourceType: SourceType,
    ai: GoogleGenAI,
    supabase: SupabaseClient,
    job: BackgroundJob
  ): BaseProcessor {
    switch (sourceType) {
      case 'pdf':
        return new PDFProcessor(ai, supabase, job)
      case 'youtube':
        return new YouTubeProcessor(ai, supabase, job)
      case 'web_url':
        return new WebProcessor(ai, supabase, job)
      case 'markdown_asis':
        return new MarkdownProcessor(ai, supabase, job, false)
      case 'markdown_clean':
        return new MarkdownProcessor(ai, supabase, job, true)
      case 'txt':
        return new TextProcessor(ai, supabase, job)
      case 'paste':
        return new PasteProcessor(ai, supabase, job)
      default:
        throw new Error(`Unknown source type: ${sourceType}`)
    }
  }
}

// Usage in handler
const processor = ProcessorRouter.createProcessor(
  sourceType,
  ai,
  supabase,
  job
)
const result = await processor.process()
```

### Gemini AI Processing
```typescript
// worker/processors/pdf-processor.ts
export class PDFProcessor extends BaseProcessor {
  async process(): Promise<ProcessResult> {
    // 1. Download PDF from storage
    const pdfBuffer = await this.downloadFromStorage()
    
    // 2. Upload to Gemini Files API (for large files)
    const file = await this.uploadToGeminiFiles(pdfBuffer)
    
    // 3. Process with Gemini
    const model = this.ai.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        maxOutputTokens: 65536,
        temperature: 0.3
      }
    })
    
    const prompt = `
      Process this document in three phases:
      
      PHASE 1 - EXTRACTION:
      Extract all text content, preserving structure.
      
      PHASE 2 - SEMANTIC CHUNKING:
      Break into semantic chunks of 500-1500 tokens.
      
      PHASE 3 - ANALYSIS:
      For each chunk, extract:
      - themes (2-4 key concepts)
      - importance (0-1 score)
      - summary (1-2 sentences)
      
      Output as JSON.
    `
    
    const result = await model.generateContent([
      { fileData: { mimeType: 'application/pdf', fileUri: file.uri } },
      { text: prompt }
    ])
    
    // 4. Parse and validate result
    const processed = JSON.parse(result.response.text())
    
    // 5. Generate embeddings (using Vercel AI SDK)
    const chunks = await this.addEmbeddings(processed.chunks)
    
    // 6. Store results
    await this.uploadToStorage(processed.markdown)
    await this.insertChunksBatch(chunks)
    
    return { 
      markdown: processed.markdown,
      chunks,
      metadata: processed.metadata
    }
  }
}
```

## Collision Detection

### Running All 7 Engines
```typescript
// worker/engines/orchestrator.ts
export class CollisionOrchestrator {
  private engines: CollisionEngine[]
  
  constructor(supabase: SupabaseClient) {
    // Initialize all engines
    this.engines = [
      new SemanticSimilarityEngine(supabase),
      new ConceptualDensityEngine(supabase),
      new StructuralPatternEngine(supabase),
      new CitationNetworkEngine(supabase),
      new TemporalProximityEngine(supabase),
      new ContradictionDetectionEngine(supabase),
      new EmotionalResonanceEngine(supabase)
    ]
  }
  
  async detectCollisions(
    sourceChunks: Chunk[],
    targetChunks: Chunk[],
    userWeights: EngineWeights
  ): Promise<CollisionResult[]> {
    // Run all engines in parallel
    const engineResults = await Promise.all(
      this.engines.map(engine => 
        engine.analyze(sourceChunks, targetChunks)
      )
    )
    
    // Apply user weights
    const weightedScores = this.applyWeights(
      engineResults,
      userWeights
    )
    
    // Normalize and rank
    const normalized = this.normalizeScores(
      weightedScores,
      userWeights.normalization_method
    )
    
    // Filter and sort
    return normalized
      .filter(r => r.score > 0.3) // Threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, 20) // Top 20 connections
  }
}
```

### Individual Engine Example
```typescript
// worker/engines/semantic-similarity.ts
export class SemanticSimilarityEngine extends BaseEngine {
  async analyze(
    sourceChunks: Chunk[],
    targetChunks: Chunk[]
  ): Promise<EngineResult> {
    const similarities: SimilarityPair[] = []
    
    // Check cache first
    const cacheKey = this.getCacheKey(sourceChunks, targetChunks)
    const cached = await this.cache.get(cacheKey)
    if (cached) return cached
    
    // Calculate similarities using embeddings
    for (const source of sourceChunks) {
      for (const target of targetChunks) {
        const similarity = cosineSimilarity(
          source.embedding,
          target.embedding
        )
        
        if (similarity > 0.7) { // Threshold
          similarities.push({
            sourceChunkId: source.id,
            targetChunkId: target.id,
            score: similarity,
            explanation: `High semantic similarity (${(similarity * 100).toFixed(1)}%)`
          })
        }
      }
    }
    
    // Cache result
    const result = { 
      engineName: 'semantic-similarity',
      similarities,
      metadata: { threshold: 0.7 }
    }
    await this.cache.set(cacheKey, result, 3600) // 1 hour TTL
    
    return result
  }
}
```

## ECS Operations

### Creating Entities with Components
```typescript
// Creating a flashcard from selection
import { ecs } from '@/lib/ecs'

export async function createFlashcardFromSelection(
  selection: TextSelection,
  chunkId: string,
  documentId: string
) {
  const userId = 'dev-user-123'
  
  // Create entity with multiple components
  const entityId = await ecs.createEntity(userId, {
    // Flashcard component
    flashcard: {
      question: selection.text,
      answer: '', // User will fill in
      created_from: 'selection'
    },
    
    // Study component (FSRS data)
    study: {
      due: new Date(),
      interval: 0,
      ease: 2.5,
      reviews: 0,
      lapses: 0
    },
    
    // Source component (links to document)
    source: {
      chunk_id: chunkId,
      document_id: documentId,
      selection_range: {
        start: selection.start,
        end: selection.end
      }
    }
  })
  
  return entityId
}
```

### Querying Entities
```typescript
// Find all flashcards due for review
export async function getDueFlashcards(userId: string) {
  // Query entities with both flashcard and study components
  const entities = await ecs.query(
    ['flashcard', 'study'],
    userId,
    { /* optional filters */ }
  )
  
  // Filter for due cards
  const now = new Date()
  const dueCards = entities.filter(entity => {
    const studyComponent = entity.components?.find(
      c => c.component_type === 'study'
    )
    return studyComponent && 
           new Date(studyComponent.data.due) <= now
  })
  
  return dueCards
}

// Find all annotations for a document
export async function getDocumentAnnotations(
  documentId: string,
  userId: string
) {
  return await ecs.query(
    ['annotation'],
    userId,
    { document_id: documentId }
  )
}
```

### Updating Components
```typescript
// Update flashcard after review
export async function updateFlashcardAfterReview(
  entityId: string,
  componentId: string,
  rating: number // 1-5 rating from user
) {
  const userId = 'dev-user-123'
  
  // Get current study data
  const entity = await ecs.getEntity(entityId, userId)
  const studyComponent = entity?.components?.find(
    c => c.component_type === 'study'
  )
  
  if (!studyComponent) throw new Error('No study component')
  
  // Calculate new FSRS values
  const newStudyData = calculateFSRS(
    studyComponent.data,
    rating
  )
  
  // Update component
  await ecs.updateComponent(
    componentId,
    newStudyData,
    userId
  )
}
```

## User Preferences

### Configuring Engine Weights
```typescript
// app/actions/preferences.ts
'use server'

export async function updateEngineWeights(
  weights: Partial<EngineWeights>
) {
  const userId = 'dev-user-123'
  
  // Validate weights sum to 1.0
  const sum = Object.values(weights).reduce(
    (acc, val) => acc + val, 
    0
  )
  
  if (Math.abs(sum - 1.0) > 0.01) {
    throw new Error('Weights must sum to 1.0')
  }
  
  // Update using database function
  const { data, error } = await supabaseAdmin.rpc(
    'update_engine_weights',
    {
      p_user_id: userId,
      p_weights: weights,
      p_normalization_method: 'sigmoid',
      p_preset_name: 'custom'
    }
  )
  
  if (error) throw error
  
  // Clear cache to apply new weights immediately
  await clearCollisionCache(userId)
  
  revalidatePath('/settings')
  return { success: true, weights: data }
}
```

### Using Preset Configurations
```typescript
// Preset weight configurations
const WEIGHT_PRESETS = {
  balanced: {
    'semantic-similarity': 0.25,
    'conceptual-density': 0.20,
    'structural-pattern': 0.15,
    'citation-network': 0.15,
    'temporal-proximity': 0.10,
    'contradiction-detection': 0.10,
    'emotional-resonance': 0.05
  },
  academic: {
    'semantic-similarity': 0.20,
    'conceptual-density': 0.15,
    'structural-pattern': 0.10,
    'citation-network': 0.35, // Boost citations
    'temporal-proximity': 0.05,
    'contradiction-detection': 0.15, // Value opposing views
    'emotional-resonance': 0.00
  },
  narrative: {
    'semantic-similarity': 0.20,
    'conceptual-density': 0.20,
    'structural-pattern': 0.20, // Story structure
    'citation-network': 0.05,
    'temporal-proximity': 0.15, // Timeline matters
    'contradiction-detection': 0.05,
    'emotional-resonance': 0.15 // Emotional arcs
  }
}

// Apply preset
export async function applyWeightPreset(
  presetName: keyof typeof WEIGHT_PRESETS
) {
  const weights = WEIGHT_PRESETS[presetName]
  return updateEngineWeights(weights)
}
```

## Common Patterns

### Server Components with Data Fetching
```typescript
// app/read/[id]/page.tsx
export default async function DocumentPage({ 
  params 
}: { 
  params: { id: string } 
}) {
  // Direct database access in Server Component
  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .select(`
      id,
      title,
      storage_path,
      processing_status,
      chunks (
        id,
        content,
        themes,
        chunk_index
      )
    `)
    .eq('id', params.id)
    .single()
  
  if (error || !doc) {
    notFound()
  }
  
  // Generate signed URL for markdown
  const { data: signedUrl } = await supabaseAdmin.storage
    .from('documents')
    .createSignedUrl(
      `${doc.storage_path}/content.md`,
      3600 // 1 hour
    )
  
  return (
    <div className="grid grid-cols-[1fr,400px]">
      <DocumentReader 
        markdownUrl={signedUrl}
        chunks={doc.chunks}
      />
      <RightPanel documentId={doc.id} />
    </div>
  )
}
```

### Client Components with Interactivity
```typescript
// components/reader/DocumentReader.tsx
'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

export function DocumentReader({ 
  markdownUrl,
  chunks 
}: {
  markdownUrl: string
  chunks: Chunk[]
}) {
  const [selectedText, setSelectedText] = useState<Selection | null>(null)
  
  // Fetch markdown content
  const { data: markdown } = useQuery({
    queryKey: ['markdown', markdownUrl],
    queryFn: async () => {
      const res = await fetch(markdownUrl)
      return res.text()
    },
    staleTime: Infinity // Markdown never changes
  })
  
  // Handle text selection
  const handleMouseUp = () => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim()) {
      setSelectedText({
        text: selection.toString(),
        range: {
          start: selection.anchorOffset,
          end: selection.focusOffset
        }
      })
    }
  }
  
  return (
    <article 
      onMouseUp={handleMouseUp}
      className="prose prose-lg max-w-none"
    >
      <MarkdownRenderer content={markdown} />
      {selectedText && (
        <QuickCaptureBar 
          selection={selectedText}
          onClose={() => setSelectedText(null)}
        />
      )}
    </article>
  )
}
```

### Zustand Store for Client State
```typescript
// stores/processing-store.ts
import { create } from 'zustand'

interface ProcessingStore {
  jobs: ProcessingJob[]
  addJob: (job: ProcessingJob) => void
  updateJob: (id: string, update: Partial<ProcessingJob>) => void
  removeJob: (id: string) => void
}

export const useProcessingStore = create<ProcessingStore>((set) => ({
  jobs: [],
  
  addJob: (job) => set((state) => ({
    jobs: [...state.jobs, job]
  })),
  
  updateJob: (id, update) => set((state) => ({
    jobs: state.jobs.map(j => 
      j.id === id ? { ...j, ...update } : j
    )
  })),
  
  removeJob: (id) => set((state) => ({
    jobs: state.jobs.filter(j => j.id !== id)
  }))
}))
```

### Error Handling Pattern
```typescript
// lib/errors.ts
export class ProcessingError extends Error {
  constructor(
    message: string,
    public code: string,
    public isRetryable: boolean = false
  ) {
    super(message)
    this.name = 'ProcessingError'
  }
}

// Usage in processor
try {
  const result = await processor.process()
  return result
} catch (error) {
  if (error instanceof ProcessingError) {
    if (error.isRetryable) {
      // Queue for retry
      await queueRetry(job.id, error.message)
    } else {
      // Permanent failure
      await markFailed(job.id, error.message)
    }
  } else {
    // Unknown error
    console.error('Unexpected error:', error)
    await markFailed(job.id, 'An unexpected error occurred')
  }
}
```

## Testing Patterns

### Testing Processors
```typescript
// worker/tests/processors/pdf-processor.test.ts
describe('PDFProcessor', () => {
  let processor: PDFProcessor
  let mockAI: jest.Mocked<GoogleGenAI>
  let mockSupabase: jest.Mocked<SupabaseClient>
  
  beforeEach(() => {
    mockAI = createMockAI()
    mockSupabase = createMockSupabase()
    processor = new PDFProcessor(
      mockAI,
      mockSupabase,
      mockJob
    )
  })
  
  it('should process PDF and return chunks', async () => {
    // Mock Gemini response
    mockAI.generateContent.mockResolvedValue({
      response: {
        text: JSON.stringify({
          markdown: '# Test Document',
          chunks: [
            { content: 'Test chunk', themes: ['test'] }
          ]
        })
      }
    })
    
    // Process
    const result = await processor.process()
    
    // Assertions
    expect(result.markdown).toBe('# Test Document')
    expect(result.chunks).toHaveLength(1)
    expect(mockSupabase.storage.upload).toHaveBeenCalled()
    expect(mockSupabase.from).toHaveBeenCalledWith('chunks')
  })
})
```

### Testing Collision Engines
```typescript
// worker/tests/engines/semantic-similarity.test.ts
describe('SemanticSimilarityEngine', () => {
  it('should find similar chunks', async () => {
    const engine = new SemanticSimilarityEngine(supabase)
    
    const sourceChunks = [
      { 
        id: '1',
        content: 'Machine learning algorithms',
        embedding: [0.1, 0.2, 0.3, ...] // 768d
      }
    ]
    
    const targetChunks = [
      {
        id: '2', 
        content: 'Deep learning models',
        embedding: [0.1, 0.21, 0.29, ...] // Similar
      }
    ]
    
    const result = await engine.analyze(
      sourceChunks,
      targetChunks
    )
    
    expect(result.similarities).toHaveLength(1)
    expect(result.similarities[0].score).toBeGreaterThan(0.7)
  })
})
```

## Debugging Tips

### Check Processing Status
```sql
-- Check job status
SELECT 
  id,
  status,
  progress,
  last_error,
  created_at
FROM background_jobs
WHERE job_type = 'process-document'
ORDER BY created_at DESC
LIMIT 10;

-- Check document processing status
SELECT 
  d.id,
  d.title,
  d.processing_status,
  d.processing_error,
  COUNT(c.id) as chunk_count
FROM documents d
LEFT JOIN chunks c ON c.document_id = d.id
GROUP BY d.id
ORDER BY d.created_at DESC;
```

### Monitor Engine Performance
```typescript
// Add timing to engines
const startTime = performance.now()
const result = await engine.analyze(source, target)
const duration = performance.now() - startTime

console.log(`${engine.name} took ${duration}ms`)

// Check cache hit rate
const cacheStats = await getCacheStats()
console.log(`Cache hit rate: ${cacheStats.hitRate}%`)
```

### Common Issues & Solutions

**Issue**: Processing hangs
```typescript
// Add timeout to Gemini calls
const result = await Promise.race([
  model.generateContent(prompt),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 60000)
  )
])
```

**Issue**: Embeddings mismatch
```typescript
// Validate embedding dimensions
if (embedding.length !== 768) {
  throw new Error(`Invalid embedding dimension: ${embedding.length}`)
}
```

**Issue**: Memory pressure with large documents
```typescript
// Process in batches
const BATCH_SIZE = 50
for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE)
  await insertChunksBatch(batch)
  
  // Allow GC between batches
  await new Promise(resolve => setTimeout(resolve, 100))
}
```