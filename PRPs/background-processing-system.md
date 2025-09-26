# Implementation Plan: Background Processing System

## Overview

Refactor document processing pipeline from synchronous Edge Functions to asynchronous background worker pattern to eliminate timeout limitations, improve observability, and establish generic infrastructure for future background operations.

**Target**: Handle documents of any size (500+ pages, 2+ hour processing) with real-time progress updates and automatic error recovery.

## Requirements Summary

### Functional Requirements
- Process documents without timeout constraints (eliminate 150s Edge Function limit)
- Real-time progress updates to frontend via Supabase Realtime
- Graceful failure recovery with stage-based checkpoints
- Progressive document availability (read markdown before embeddings complete)
- Auto-retry transient errors (rate limits, network issues)
- Manual retry for permanent errors (corrupted PDFs, API issues)
- Generic infrastructure supporting future job types (connections, exports)

### Non-Functional Requirements
- **Observability**: Full visibility into processing stages with progress tracking
- **Reliability**: Resume from checkpoint on failure (avoid re-doing expensive work)
- **Scalability**: Handle documents of any size without architectural changes
- **Maintainability**: Simple local development workflow (two terminals)
- **Extensibility**: Easy to add new job types via handler pattern

## Research Findings

### Codebase Analysis
- **ECS Architecture**: Entities with flexible components for maximum extensibility
- **Hybrid Storage**: Large files (PDFs, markdown) in Supabase Storage, queryable data (chunks, embeddings) in PostgreSQL
- **Server Actions Pattern**: Atomic operations with rollback on failure
- **Real-time Updates**: Supabase subscriptions for processing status in ProcessingDock
- **AI-First Processing**: Gemini 2.5 Flash for extraction, text-embedding-004 for embeddings
- **No Modals Pattern**: Dock-based UI (ProcessingDock at bottom, RightPanel for connections)

### Critical Gap Identified
The `background_jobs` table is referenced in `src/app/actions/documents.ts` but doesn't exist in migrations. This breaks the upload→processing flow.

### Technology Stack
- **Worker Runtime**: Node.js with tsx for TypeScript execution
- **Database**: PostgreSQL (Supabase) with pgvector for similarity search
- **Realtime**: Supabase Realtime subscriptions (already used in ProcessingDock)
- **AI Processing**: Google Gemini 2.5 Flash + text-embedding-004
- **Process Management**: npm scripts for integrated dev experience

## Implementation Tasks

### Phase 1: Database Schema (30 minutes)

#### Task 1.1: Create Background Jobs Table
**Description**: Create migration for generic background job tracking

**Files to create**:
- `supabase/migrations/008_background_jobs.sql`

**Implementation**:
```sql
-- Generic job tracking table
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Job type discrimination
  job_type TEXT NOT NULL,  -- 'process_document', 'detect_connections', etc.
  entity_type TEXT,         -- 'document', 'deck', 'spark'
  entity_id UUID,
  
  -- Job state
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  progress JSONB DEFAULT '{}',   -- { stage: 'extract', percent: 30, stage_data: {...} }
  input_data JSONB DEFAULT '{}', -- Job-specific parameters
  
  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient polling
CREATE INDEX idx_background_jobs_status ON background_jobs(status);
CREATE INDEX idx_background_jobs_user ON background_jobs(user_id);
CREATE INDEX idx_background_jobs_entity ON background_jobs(entity_type, entity_id);
CREATE INDEX idx_background_jobs_retry ON background_jobs(status, next_retry_at) 
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- Enable Realtime for frontend subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE background_jobs;
```

**Dependencies**: None

**Estimated effort**: 15 minutes

#### Task 1.2: Add Document Processing Status Fields
**Description**: Add stage tracking to documents table

**Files to modify**:
- `supabase/migrations/009_document_availability.sql`

**Implementation**:
```sql
ALTER TABLE documents 
  ADD COLUMN markdown_available BOOLEAN DEFAULT false,
  ADD COLUMN embeddings_available BOOLEAN DEFAULT false,
  ADD COLUMN processing_stage TEXT, -- 'download', 'extract', 'embed', 'complete'
  ADD COLUMN processing_error TEXT;

CREATE INDEX idx_documents_processing ON documents(processing_status);
```

**Dependencies**: Task 1.1 completed

**Estimated effort**: 15 minutes

**Success Criteria**:
- ✅ Migrations run cleanly with `npx supabase db reset`
- ✅ Realtime enabled for `background_jobs` table
- ✅ Indexes improve query performance (verify with EXPLAIN)
- ✅ No errors in Supabase logs

---

### Phase 2: Worker Infrastructure (2-3 hours)

#### Task 2.1: Create Worker Directory Structure
**Description**: Set up worker workspace with TypeScript support

**Files to create**:
- `worker/package.json`
- `worker/tsconfig.json`
- `worker/.env.example`

**Implementation**:
```json
// worker/package.json
{
  "name": "rhizome-worker",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx watch index.ts",
    "build": "tsc",
    "dev": "tsx watch index.ts"
  },
  "dependencies": {
    "@google/genai": "^0.25.0",
    "@supabase/supabase-js": "^2.45.0",
    "tsx": "^4.7.0"
  }
}
```

**Dependencies**: None

**Estimated effort**: 20 minutes

#### Task 2.2: Implement Generic Job Polling Loop
**Description**: Create main worker with job polling and handler dispatch

**Files to create**:
- `worker/index.ts`
- `worker/types.ts`

**Implementation**:
```typescript
// worker/index.ts
import { createClient } from '@supabase/supabase-js'
import { processDocumentHandler } from './handlers/process-document.js'

const JOB_HANDLERS = {
  'process_document': processDocumentHandler,
  // Future: 'detect_connections', 'generate_export'
}

async function processNextJob() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Find next pending job or retry-eligible failed job
  const { data: job, error } = await supabase
    .from('background_jobs')
    .select('*')
    .or('status.eq.pending,and(status.eq.failed,next_retry_at.lte.now())')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!job || error) {
    return // No jobs available
  }

  // 2. Mark as processing
  await supabase
    .from('background_jobs')
    .update({ 
      status: 'processing',
      started_at: new Date().toISOString()
    })
    .eq('id', job.id)

  // 3. Execute handler
  const handler = JOB_HANDLERS[job.job_type as keyof typeof JOB_HANDLERS]
  if (!handler) {
    console.error(`Unknown job type: ${job.job_type}`)
    await markJobFailed(supabase, job.id, 'Unknown job type')
    return
  }

  try {
    await handler(supabase, job)
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error)
    await handleJobError(supabase, job, error as Error)
  }
}

async function handleJobError(supabase: any, job: any, error: Error) {
  const isTransient = isTransientError(error)
  const canRetry = job.retry_count < job.max_retries

  if (isTransient && canRetry) {
    // Exponential backoff: 5s, 25s, 125s
    const delayMs = 5000 * Math.pow(5, job.retry_count)
    const nextRetry = new Date(Date.now() + delayMs)
    
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        retry_count: job.retry_count + 1,
        next_retry_at: nextRetry.toISOString(),
        last_error: error.message
      })
      .eq('id', job.id)
    
    console.log(`Job ${job.id} scheduled for retry at ${nextRetry}`)
  } else {
    await markJobFailed(supabase, job.id, error.message)
  }
}

function isTransientError(error: Error): boolean {
  const transientPatterns = [
    'rate limit',
    'timeout',
    'unavailable',
    'ECONNRESET',
    '429',
    '503',
    '504'
  ]
  return transientPatterns.some(pattern => 
    error.message.toLowerCase().includes(pattern.toLowerCase())
  )
}

async function markJobFailed(supabase: any, jobId: string, error: string) {
  await supabase
    .from('background_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      last_error: error
    })
    .eq('id', jobId)
}

// Main loop
async function main() {
  console.log('🚀 Background worker started')
  
  while (true) {
    try {
      await processNextJob()
    } catch (error) {
      console.error('Worker error:', error)
    }
    
    // Poll every 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}

main()
```

**Dependencies**: Task 2.1 completed

**Estimated effort**: 45 minutes

#### Task 2.3: Implement Document Processing Handler
**Description**: Create stage-based processor with checkpoints

**Files to create**:
- `worker/handlers/process-document.ts`
- `worker/lib/progress.ts`
- `worker/lib/checkpoint.ts`

**Implementation**:
```typescript
// worker/handlers/process-document.ts
import { GoogleGenAI } from '@google/genai'

const STAGES = {
  DOWNLOAD: { name: 'download', percent: 10 },
  EXTRACT: { name: 'extract', percent: 30 },
  SAVE_MARKDOWN: { name: 'save_markdown', percent: 50 }, // CHECKPOINT
  EMBED: { name: 'embed', percent: 99 },
  COMPLETE: { name: 'complete', percent: 100 }
}

export async function processDocumentHandler(supabase: any, job: any) {
  const { document_id } = job.input_data
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! })

  // Get document metadata
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path, user_id')
    .eq('id', document_id)
    .single()

  const storagePath = doc.storage_path

  try {
    // Check for checkpoint resume
    const completedStages = job.progress?.completed_stages || []
    let markdown: string
    let chunks: any[]

    // STAGE 1: Download (or resume from checkpoint)
    if (!completedStages.includes(STAGES.SAVE_MARKDOWN.name)) {
      await updateProgress(supabase, job.id, STAGES.DOWNLOAD.percent, 'download')
      
      const { data: pdfBlob } = await supabase.storage
        .from('documents')
        .download(`${storagePath}/source.pdf`)
      
      const pdfBuffer = await pdfBlob.arrayBuffer()
      const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')

      // STAGE 2: Extract with Gemini
      await updateProgress(supabase, job.id, STAGES.EXTRACT.percent, 'extract')
      
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 }},
            { text: EXTRACTION_PROMPT }
          ]
        }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: EXTRACTION_SCHEMA
        }
      })

      const extracted = JSON.parse(result.text)
      markdown = extracted.markdown
      chunks = extracted.chunks

      // STAGE 3: Save markdown (CHECKPOINT)
      await updateProgress(supabase, job.id, STAGES.SAVE_MARKDOWN.percent, 'save_markdown')
      
      await supabase.storage
        .from('documents')
        .upload(`${storagePath}/content.md`, markdown, { upsert: true })

      await supabase
        .from('documents')
        .update({ 
          processing_status: 'extracted',
          markdown_available: true,
          processing_stage: 'save_markdown'
        })
        .eq('id', document_id)

      // Mark checkpoint
      await updateProgress(supabase, job.id, STAGES.SAVE_MARKDOWN.percent, 'save_markdown', {
        completed_stages: [...completedStages, STAGES.SAVE_MARKDOWN.name]
      })
    } else {
      // Resume from checkpoint: Load saved markdown
      console.log('Resuming from checkpoint: markdown already saved')
      const { data: mdBlob } = await supabase.storage
        .from('documents')
        .download(`${storagePath}/content.md`)
      markdown = await mdBlob.text()
      
      // Re-generate chunks from markdown (cheaper than re-extracting PDF)
      chunks = await rechunkMarkdown(ai, markdown)
    }

    // STAGE 4: Generate embeddings
    await updateProgress(supabase, job.id, STAGES.EMBED.percent, 'embed')
    
    const chunkCount = chunks.length
    for (let i = 0; i < chunkCount; i++) {
      const chunk = chunks[i]
      
      const embedResult = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: chunk.content,
        config: { outputDimensionality: 768 }
      })

      await supabase.from('chunks').insert({
        document_id,
        content: chunk.content,
        embedding: embedResult.embedding.values,
        chunk_index: i,
        themes: chunk.themes,
        importance_score: chunk.importance_score
      })

      // Update progress every 10 chunks
      if (i % 10 === 0) {
        const embedPercent = STAGES.EMBED.percent + (i / chunkCount) * 49
        await updateProgress(supabase, job.id, Math.floor(embedPercent), 'embed')
      }
    }

    // STAGE 5: Complete
    await updateProgress(supabase, job.id, STAGES.COMPLETE.percent, 'complete')
    
    await supabase
      .from('documents')
      .update({
        processing_status: 'completed',
        embeddings_available: true,
        processing_stage: 'complete'
      })
      .eq('id', document_id)

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

  } catch (error) {
    throw error // Let main loop handle retry logic
  }
}

async function updateProgress(
  supabase: any, 
  jobId: string, 
  percent: number, 
  stage: string,
  additionalData: any = {}
) {
  await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent,
        stage,
        updated_at: new Date().toISOString(),
        ...additionalData
      }
    })
    .eq('id', jobId)
}

const EXTRACTION_PROMPT = `
Extract this PDF to perfect markdown preserving all formatting.
Then break into semantic chunks (complete thoughts, 200-500 words each).
For each chunk, identify 1-3 themes and estimate importance (0-1 scale).
Return JSON with full markdown and chunk array.
`

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    markdown: { type: 'string' },
    chunks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          themes: { type: 'array', items: { type: 'string' }},
          importance_score: { type: 'number' }
        }
      }
    }
  }
}
```

**Dependencies**: Task 2.2 completed

**Estimated effort**: 90 minutes

**Success Criteria**:
- ✅ Worker successfully polls for jobs
- ✅ Document processing completes all 5 stages
- ✅ Progress updates visible in `background_jobs` table
- ✅ Transient errors trigger auto-retry with backoff
- ✅ Permanent errors marked as failed
- ✅ Resume from checkpoint works correctly

---

### Phase 3: Upload Flow Refactor (1 hour)

#### Task 3.1: Update Upload Action to Create Jobs
**Description**: Modify uploadDocument to create background job instead of invoking Edge Function

**Files to modify**:
- `src/app/actions/documents.ts`

**Changes**:
```typescript
// BEFORE: Direct Edge Function invocation
// await supabase.functions.invoke('process-document', { 
//   body: { documentId } 
// })

// AFTER: Create background job
const { error: jobError } = await supabase
  .from('background_jobs')
  .insert({
    user_id: user.id,
    job_type: 'process_document',
    entity_type: 'document',
    entity_id: documentId,
    input_data: { 
      document_id: documentId,
      storage_path: storagePath
    }
  })

if (jobError) {
  // Rollback document and storage on job creation failure
  await supabase.from('documents').delete().eq('id', documentId)
  await supabase.storage.from('documents').remove([`${storagePath}/source.pdf`])
  return { success: false, error: jobError.message }
}

return { success: true, documentId, jobCreated: true }
```

**Dependencies**: Phase 1 completed

**Estimated effort**: 30 minutes

#### Task 3.2: Archive Edge Function (Keep for Reference)
**Description**: Move Edge Function to archive folder for future reference

**Files to move**:
- `supabase/functions/process-document/` → `supabase/functions/_archive/process-document/`

**Add README**:
```markdown
# Archived: process-document Edge Function

This Edge Function is archived as processing has moved to background workers.
Kept for reference and potential emergency fallback.

See: worker/handlers/process-document.ts for current implementation
```

**Dependencies**: Task 3.1 completed

**Estimated effort**: 10 minutes

**Success Criteria**:
- ✅ Upload creates job record in `background_jobs`
- ✅ Worker picks up job automatically
- ✅ No Edge Function timeout errors
- ✅ Processing completes successfully end-to-end

---

### Phase 4: Frontend Integration (1-2 hours)

#### Task 4.1: Add Realtime Subscription to ProcessingDock
**Description**: Subscribe to job updates for real-time progress display

**Files to modify**:
- `src/components/layout/ProcessingDock.tsx`

**Changes**:
```typescript
useEffect(() => {
  const supabase = createClient()
  
  const channel = supabase
    .channel('job-updates')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'background_jobs',
      filter: `user_id=eq.${user.id}`
    }, (payload) => {
      const job = payload.new as BackgroundJob
      
      if (payload.eventType === 'INSERT') {
        addJob({
          id: job.id,
          title: getJobTitle(job),
          status: job.status,
          progress: job.progress?.percent || 0,
          stage: job.progress?.stage
        })
      } else if (payload.eventType === 'UPDATE') {
        updateJob(job.id, {
          status: job.status,
          progress: job.progress?.percent || 0,
          stage: job.progress?.stage,
          error: job.last_error
        })
      }
    })
    .subscribe()
  
  return () => {
    supabase.removeChannel(channel)
  }
}, [user.id])

function getJobTitle(job: BackgroundJob): string {
  if (job.job_type === 'process_document') {
    return `Processing ${job.input_data.document_id}`
  }
  return job.job_type
}
```

**Dependencies**: Phase 2 completed

**Estimated effort**: 30 minutes

#### Task 4.2: Update ProcessingDock UI for Stage Display
**Description**: Show stage-based progress with descriptive labels

**Files to modify**:
- `src/components/layout/ProcessingDock.tsx`

**Changes**:
```typescript
const STAGE_LABELS = {
  download: '📥 Downloading',
  extract: '🤖 Extracting with AI',
  save_markdown: '💾 Saving markdown',
  embed: '🧮 Generating embeddings',
  complete: '✅ Complete'
}

// In render
{jobs.map(job => (
  <div key={job.id} className="flex items-center gap-4 p-4">
    <div className="flex-1">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium">{job.title}</span>
        <span className="text-sm text-muted-foreground">
          {STAGE_LABELS[job.stage] || job.stage}
        </span>
      </div>
      <Progress value={job.progress} />
      <span className="text-xs text-muted-foreground">{job.progress}%</span>
    </div>
    
    {job.status === 'failed' && (
      <Button 
        size="sm" 
        variant="outline"
        onClick={() => retryJob(job.id)}
      >
        Retry
      </Button>
    )}
  </div>
))}
```

**Dependencies**: Task 4.1 completed

**Estimated effort**: 30 minutes

#### Task 4.3: Implement Progressive Document Loading
**Description**: Show document reader when markdown is ready, banner for embedding progress

**Files to modify**:
- `src/app/read/[id]/page.tsx`

**Changes**:
```typescript
export default async function ReaderPage({ params }: { params: { id: string }}) {
  const supabase = createClient()
  
  const { data: doc } = await supabase
    .from('documents')
    .select('*, markdown_available, embeddings_available, processing_status')
    .eq('id', params.id)
    .single()
  
  // Show reader if markdown is available
  if (doc.markdown_available) {
    const { data: { signedUrl }} = await supabase.storage
      .from('documents')
      .createSignedUrl(`${doc.storage_path}/content.md`, 3600)
    
    return (
      <div className="flex flex-col h-screen">
        {!doc.embeddings_available && (
          <Banner variant="info">
            <Loader2 className="animate-spin" />
            Processing connections: 
            <JobProgressIndicator documentId={params.id} />
          </Banner>
        )}
        
        <DocumentReader markdownUrl={signedUrl} />
      </div>
    )
  }
  
  // Show processing status if not ready
  return (
    <div className="flex items-center justify-center h-screen">
      <Card>
        <CardHeader>
          <CardTitle>Processing Document</CardTitle>
        </CardHeader>
        <CardContent>
          <JobProgressIndicator documentId={params.id} />
        </CardContent>
      </Card>
    </div>
  )
}
```

**Dependencies**: Task 4.2 completed

**Estimated effort**: 45 minutes

**Success Criteria**:
- ✅ Real-time progress updates visible in ProcessingDock
- ✅ User can read document after markdown stage completes
- ✅ Connection banner appears during embedding stage
- ✅ Banner disappears when embeddings complete
- ✅ Retry button works for failed jobs

---

### Phase 5: Dev Workflow (30 minutes)

#### Task 5.1: Update Package.json Scripts
**Description**: Add worker scripts for integrated development

**Files to modify**:
- `package.json`

**Changes**:
```json
{
  "scripts": {
    "dev": "./scripts/dev.sh",
    "dev:next": "next dev",
    "dev:worker": "cd worker && npm run dev",
    "worker": "cd worker && npm start",
    "build": "next build",
    "build:worker": "cd worker && npm run build"
  }
}
```

**Dependencies**: Phase 2 completed

**Estimated effort**: 10 minutes

#### Task 5.2: Update Development Script
**Description**: Modify dev.sh to start worker alongside Next.js

**Files to modify**:
- `scripts/dev.sh`

**Changes**:
```bash
#!/bin/bash

echo "🚀 Starting Rhizome V2 development environment..."

# Start Supabase
npx supabase start

# Start Worker in background
(cd worker && npm run dev) &
WORKER_PID=$!

# Start Next.js (foreground)
npm run dev:next

# Cleanup on exit
trap "kill $WORKER_PID" EXIT
```

**Dependencies**: Task 5.1 completed

**Estimated effort**: 10 minutes

#### Task 5.3: Update Documentation
**Description**: Document two-terminal workflow

**Files to modify**:
- `docs/QUICK_START.md`

**Add section**:
```markdown
## Running with Background Processing

### Option 1: Integrated (Recommended)
```bash
npm run dev  # Starts Supabase + Worker + Next.js
```

### Option 2: Separate Terminals
```bash
# Terminal 1: Next.js + Supabase
npm run dev:next

# Terminal 2: Background Worker
npm run worker
```

### Checking Worker Status
- Worker logs appear in Terminal 2
- Check `background_jobs` table in Supabase Studio
- View real-time progress in ProcessingDock (bottom of screen)
```

**Dependencies**: Task 5.2 completed

**Estimated effort**: 10 minutes

**Success Criteria**:
- ✅ `npm run dev` starts Next.js, Supabase, and Worker
- ✅ Both run simultaneously without conflicts
- ✅ Documentation clear for new developers

---

### Phase 6: Error Handling & Polish (1 hour)

#### Task 6.1: Add Retry Button to ProcessingDock
**Description**: Allow manual retry for failed jobs

**Files to modify**:
- `src/components/layout/ProcessingDock.tsx`

**Implementation**:
```typescript
async function retryJob(jobId: string) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('background_jobs')
    .update({
      status: 'pending',
      retry_count: 0,
      next_retry_at: null,
      last_error: null
    })
    .eq('id', jobId)
  
  if (error) {
    toast.error('Failed to retry job')
  } else {
    toast.success('Job queued for retry')
  }
}
```

**Dependencies**: Phase 4 completed

**Estimated effort**: 20 minutes

#### Task 6.2: Enhance Error Messages
**Description**: Provide user-friendly error descriptions

**Files to create**:
- `worker/lib/errors.ts`

**Implementation**:
```typescript
export function getUserFriendlyError(error: Error): string {
  const message = error.message.toLowerCase()
  
  if (message.includes('rate limit')) {
    return 'AI service rate limit reached. Will retry automatically in a few minutes.'
  }
  
  if (message.includes('invalid pdf')) {
    return 'PDF file appears corrupted or password-protected. Please try a different file.'
  }
  
  if (message.includes('timeout')) {
    return 'Request timed out. Will retry automatically.'
  }
  
  if (message.includes('quota')) {
    return 'AI service quota exceeded. Please check your API limits.'
  }
  
  return `Processing error: ${error.message}`
}
```

**Dependencies**: Phase 2 completed

**Estimated effort**: 20 minutes

#### Task 6.3: Add Graceful Shutdown
**Description**: Handle Ctrl+C cleanly in worker

**Files to modify**:
- `worker/index.ts`

**Changes**:
```typescript
let isShuttingDown = false

process.on('SIGINT', () => {
  console.log('\n🛑 Graceful shutdown initiated...')
  isShuttingDown = true
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Graceful shutdown initiated...')
  isShuttingDown = true
})

async function main() {
  console.log('🚀 Background worker started')
  
  while (!isShuttingDown) {
    try {
      await processNextJob()
    } catch (error) {
      console.error('Worker error:', error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  
  console.log('✅ Worker shut down cleanly')
  process.exit(0)
}
```

**Dependencies**: Phase 2 completed

**Estimated effort**: 20 minutes

**Success Criteria**:
- ✅ Failed jobs display helpful error messages
- ✅ Retry button successfully restarts processing
- ✅ Worker shuts down cleanly on Ctrl+C
- ✅ No orphaned jobs in processing state

---

## Timeline Summary

| Phase | Duration | Critical Path |
|-------|----------|---------------|
| Phase 1: Database | 30 min | ✅ Yes |
| Phase 2: Worker | 2-3 hours | ✅ Yes |
| Phase 3: Upload Flow | 1 hour | ✅ Yes |
| Phase 4: Frontend | 1-2 hours | ✅ Yes |
| Phase 5: Dev Workflow | 30 min | No |
| Phase 6: Polish | 1 hour | No |
| **Total** | **5-7 hours** | |

## Risk Mitigation

### Technical Risks

**Risk 1: Worker Process Management**
- **Mitigation**: Start simple with manual restart, add health checks later
- **Fallback**: Can temporarily revert to Edge Function if worker fails

**Risk 2: Database Connection Pool Exhaustion**
- **Mitigation**: Use short-lived connections per job, monitor connection count
- **Detection**: Add logging for connection pool usage

**Risk 3: Realtime Subscription Reliability**
- **Mitigation**: Add fallback polling every 5 seconds if no updates received
- **Detection**: Show "last updated" timestamp in UI

**Risk 4: Checkpoint Resume Failures**
- **Mitigation**: Thorough testing of resume scenarios, validation of checkpoint data
- **Fallback**: Accept full restart if resume fails

### Operational Risks

**Risk 5: Local Worker Not Running**
- **Mitigation**: Clear documentation, status indicator in UI
- **Detection**: Show worker health status in ProcessingDock

**Risk 6: Gemini API Quota Exhaustion**
- **Mitigation**: Quota monitoring, clear error messages, auto-retry with longer backoff
- **Detection**: Parse quota errors specifically

## Testing Strategy

### Unit Tests
- ECS entity creation with background job components
- Error classification (transient vs permanent)
- Progress tracking calculations
- Checkpoint save/resume logic

### Integration Tests
- Upload → Job Creation → Worker Processing → Completion
- Failure scenarios with retry logic
- Progress updates via Realtime
- Checkpoint resume from markdown stage

### Manual Testing Scenarios
1. **Happy Path**: 5-page PDF → complete processing
2. **Large Document**: 50+ page PDF → checkpoint usage
3. **Network Failure**: Kill worker during extraction → resume from checkpoint
4. **Rate Limit**: Trigger rate limit → auto-retry
5. **Corrupted PDF**: Upload invalid file → user-friendly error

## Success Criteria

### Technical Metrics
- ✅ Processing Reliability: >95% of jobs complete successfully
- ✅ Resume Success Rate: >90% of failed jobs resume correctly
- ✅ Processing Time: <5% overhead vs direct processing
- ✅ Progress Update Latency: <2 seconds from worker to UI

### User Experience Metrics
- ✅ Time to First Read: User can read document within 30% of total processing time
- ✅ Error Recovery Time: Failed jobs auto-recover within 5 minutes (transient errors)
- ✅ Progress Visibility: User sees progress update every 10 seconds

### Operational Metrics
- ✅ Worker Uptime: >99% during development (manual restarts acceptable)
- ✅ Database Connection Usage: <5 concurrent connections
- ✅ Realtime Message Rate: <10 messages per processing job

## Implementation Notes

### Critical Patterns to Follow
1. **Atomic Operations**: All database changes use transactions with rollback
2. **Server Actions**: All mutations go through `src/app/actions/`
3. **No Modals**: Use ProcessingDock for status, not modal dialogs
4. **ECS Pattern**: Use `ecs.createEntity()` for user-generated content
5. **Hybrid Storage**: Files in Storage, queryable data in DB

### Files That Must Be Read Before Implementation
- `src/app/actions/documents.ts` - Upload action pattern
- `src/components/layout/ProcessingDock.tsx` - Realtime subscription pattern
- `supabase/functions/process-document/index.ts` - Current Gemini integration
- `src/lib/ecs/ecs.ts` - ECS implementation
- `docs/lib/REACT_GUIDELINES.md` - Server vs Client component rules

### Key Architectural Decisions
1. **Generic background_jobs table** - Future-proofing for connections, exports
2. **Local worker for development** - Simplest path, easy cloud migration later
3. **Stage-level checkpoints** - Balances complexity with recovery efficiency
4. **Hybrid error handling** - Auto-retry transient, manual for permanent
5. **Progressive availability** - Users can read before embeddings complete

## Next Steps

1. **Immediate** (Today):
   - Create Phase 1 migrations
   - Test migrations with `npx supabase db reset`
   - Verify Realtime publication

2. **Short Term** (This Week):
   - Implement worker infrastructure (Phase 2)
   - Refactor upload flow (Phase 3)
   - Test end-to-end processing

3. **Medium Term** (Next Week):
   - Frontend integration (Phase 4)
   - Dev workflow setup (Phase 5)
   - Error handling polish (Phase 6)

4. **Validation** (After Implementation):
   - Test with large documents (100+ pages)
   - Verify checkpoint resume works
   - Load test with multiple concurrent jobs

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-26  
**Status**: Ready for Execution  
**Execute Command**: `/execute-plan PRPs/background-processing-system.md`