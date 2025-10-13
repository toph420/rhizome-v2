# PRP: Storage-First Portability System

**Status**: Draft
**Priority**: P0 (Critical)
**Confidence Score**: 9/10
**Estimated Effort**: 4-5 weeks
**Created**: 2025-10-12
**Last Updated**: 2025-10-12

---

## Executive Summary

### Problem
Current architecture violates the stated principle: "Storage for source of truth + portability, Database for queryable cache." Enriched chunks (costing $0.20-0.60 and 5-25 minutes per document) exist only in the database. Database resets during development cause permanent data loss of expensive AI-enriched content.

### Solution
Implement storage-first architecture with:
1. **Automatic Export**: Save chunks.json, cached_chunks.json, metadata.json, manifest.json to Storage after each processing stage
2. **Centralized Admin Panel**: Slide-down Sheet from top header with tabs for Export, Import, Scanner, Connections, and Jobs
3. **Import Workflow**: Restore chunks from Storage with intelligent conflict resolution UI
4. **Storage Scanner**: Compare Storage vs Database, show differences, enable sync operations
5. **Connection Reprocessing**: Three modes (Reprocess All, Add New, Smart Mode) with user-validation preservation
6. **Integration Hub**: Move Obsidian and Readwise operations to Admin Panel for unified document management

### Impact
- **Development Velocity**: DB reset in 1 minute, restore from Storage in 5 minutes (vs 5-25 min reprocessing)
- **Cost Savings**: Never reprocess chunks unnecessarily ($0.20-0.60 per document saved)
- **Data Safety**: Zero data loss, Storage is source of truth
- **Portability**: Complete document bundles for backup, migration, sharing
- **User Control**: Pause/resume processing, intelligent conflict resolution, connection preservation

---

## Background & Motivation

### Current Architecture Gap

**CLAUDE.md Philosophy**:
> "Storage for source of truth + portability, Database for queryable cache + derived data"

**Current Reality**:

| Data Type | Cost to Generate | Time to Generate | Location | Portable? |
|-----------|------------------|------------------|----------|-----------|
| Source PDF | N/A | N/A | ✅ Storage | ✅ Yes |
| Cleaned Markdown | $0.10-0.20 | 2-5 min | ✅ Storage | ✅ Yes |
| **Enriched Chunks** | **$0.20-0.60** | **5-25 min** | **❌ Database Only** | **❌ No** |
| Cached Chunks | N/A | N/A | ✅ Storage + DB | ✅ Yes |
| Embeddings | $0 (local) | 2-3 sec | Database | ♻️ Regenerable |
| Connections | $0-0.20 | 5-15 min | Database | ♻️ Regenerable |

**The Gap**: Enriched chunks contain expensive AI metadata (concepts, themes, summaries, importance scores) but aren't saved to Storage. They're treated as "derived data" when they're actually "expensive source data."

### Development Pain Points

**Scenario 1: Schema Migration**
```
Day 1: Process 10 documents (2 hours processing, $5 cost)
Day 2: Add column to chunks table → requires DB reset
Result: All chunks lost, must reprocess (2 hours, $5)
```

**Scenario 2: Feature Experimentation**
```
Developer wants to test new metadata extraction
Needs clean DB to validate
Can't reset without losing all processed documents
```

**Scenario 3: Environment Setup**
```
New developer joins project
DB is empty, no test data
Must process documents from scratch
Takes hours to get usable test corpus
```

### User Request Context

From discussion with user:
1. **Incremental Saves**: Save after each processing stage to enable pause/resume
2. **Conflict Resolution**: Prompt with data examples, let user choose strategy
3. **Connection Preservation**: Protect user-validated connections, multiple reprocess modes
4. **Centralized UI**: Admin Panel as slide-down sheet (separate from sidebars)
5. **Comparison View**: Show Storage vs DB differences for transparency

---

## Solution Architecture

### 1. Storage Structure

**Expanded Directory Layout**:
```
documents/{userId}/{documentId}/
├── source.pdf                    # Original file ✅ (exists)
├── content.md                    # Cleaned markdown ✅ (exists)
├── chunks.json                   # 🆕 Enriched chunks with metadata
├── cached_chunks.json            # 🆕 Docling extraction (LOCAL mode)
├── metadata.json                 # 🆕 Document-level metadata
├── manifest.json                 # 🆕 Processing manifest
├── annotations.json              # User annotations ✅ (exists, cron backup)
├── export-{timestamp}.zip        # 🆕 Full document bundle
├── validated-connections-{ts}.json  # 🆕 Backup before reprocess
└── stage-{stageName}.json        # 🆕 Incremental saves (optional)
```

### 2. JSON Schemas

#### chunks.json
```typescript
interface ChunksExport {
  version: "1.0"
  document_id: string
  processing_mode: "local" | "cloud"
  created_at: string  // ISO timestamp
  chunks: Array<{
    // Core content
    content: string
    chunk_index: number

    // Position tracking
    start_offset?: number
    end_offset?: number
    word_count?: number

    // Docling structural metadata (LOCAL mode)
    page_start?: number | null
    page_end?: number | null
    heading_level?: number | null
    section_marker?: string | null
    bboxes?: Array<{
      page: number
      l: number  // left
      t: number  // top
      r: number  // right
      b: number  // bottom
    }> | null
    position_confidence?: "exact" | "high" | "medium" | "synthetic"
    position_method?: string
    position_validated?: boolean

    // AI-extracted metadata
    themes?: string[]
    importance_score?: number
    summary?: string | null

    // Flat JSONB metadata (migration 015)
    emotional_metadata?: {
      polarity: number
      primaryEmotion: string
      intensity: number
    }
    conceptual_metadata?: {
      concepts: Array<{ text: string; importance: number }>
    }
    domain_metadata?: {
      primaryDomain: string
      confidence: number
    } | null

    metadata_extracted_at?: string | null
  }>
}
```

**Excluded from export**:
- `id` (UUID, regenerated on import)
- `document_id` (set during import)
- `embedding` (768 dimensions, 1.2MB per document, regenerate in 2-3 seconds)

#### cached_chunks.json
```typescript
interface CachedChunksExport {
  version: "1.0"
  document_id: string
  extraction_mode: "pdf" | "epub"
  markdown_hash: string  // SHA256 of cleaned markdown
  docling_version: string  // e.g., "2.55.1"
  chunks: Array<DoclingChunk>  // Full DoclingChunk objects from extraction
  structure: {
    headings: Array<{ level: number; text: string; page: number }>
    total_pages: number
  }
  created_at: string
}
```

#### metadata.json
```typescript
interface MetadataExport {
  version: "1.0"
  document_id: string
  title: string
  author?: string | null
  source: "pdf" | "epub" | "youtube" | "web" | "markdown" | "text" | "paste"
  processing_mode: "local" | "cloud"
  word_count: number
  page_count?: number | null
  language?: string | null
  created_at: string
  processed_at: string
}
```

#### manifest.json
```typescript
interface ManifestExport {
  version: "1.0"
  document_id: string
  created_at: string
  processing_mode: "local" | "cloud"
  files: {
    source: { path: string; size: number; hash: string }
    content: { path: string; size: number; hash: string }
    chunks: { path: string; size: number; hash: string; count: number }
    cached_chunks?: { path: string; size: number; hash: string }
    metadata: { path: string; size: number; hash: string }
  }
  processing_cost: {
    extraction: number
    metadata: number
    embeddings: number
    connections: number
    total: number
  }
  processing_time: {
    extraction: number  // seconds
    cleanup: number
    chunking: number
    metadata: number
    embeddings: number
    total: number
  }
}
```

### 3. Admin Panel UI Architecture

**Component Hierarchy**:
```
TopNav (src/components/layout/TopNav.tsx)
  └─ AdminPanelButton (Database icon)
      └─ AdminPanel (Sheet component, side="top", h-[80vh])
          └─ Tabs (shadcn Tabs)
              ├─ ExportTab
              │   ├─ DocumentSelector (multi-select)
              │   ├─ ExportOptions (include connections, annotations)
              │   ├─ ProgressTracker
              │   └─ DownloadButton (signed URL)
              │
              ├─ ImportTab
              │   ├─ FileUploader (ZIP or select from Storage)
              │   ├─ StorageDocumentList
              │   ├─ ConflictResolutionDialog
              │   ├─ ImportOptions (regenerate embeddings, reprocess connections)
              │   └─ ProgressTracker
              │
              ├─ ScannerTab
              │   ├─ StorageScanner (scan button)
              │   ├─ ComparisonTable
              │   │   ├─ Columns: Title, Storage Files, DB Status, Actions
              │   │   ├─ Filters: Missing from DB, Missing from Storage, Out of Sync
              │   │   └─ Row Actions: Import, Sync, Export, Details
              │   └─ BulkActions (Import All, Sync All)
              │
              ├─ ConnectionsTab
              │   ├─ ReprocessControls
              │   │   ├─ ModeSelector (All, Add New, Smart)
              │   │   ├─ EngineSelector (Semantic, Contradiction, Thematic)
              │   │   ├─ SmartModeOptions (preserve validated, backup first)
              │   │   └─ EstimateDisplay (time, cost)
              │   ├─ DocumentSelector (single or batch)
              │   ├─ ProgressTracker
              │   └─ ConnectionStats (before/after)
              │
              ├─ IntegrationsTab
              │   ├─ ObsidianControls (Export to Obsidian, Sync from Obsidian)
              │   ├─ ReadwiseControls (Import highlights)
              │   └─ OperationHistory (log of all operations)
              │
              └─ JobsTab (existing job management)
                  ├─ QuickActions (clear completed, clear failed)
                  └─ EmergencyControls (stop all, nuclear reset)
```

**UI Mockup - Scanner Tab**:
```
╔══════════════════════════════════════════════════════════════════╗
║  STORAGE SCANNER                                    [Scan] [Sync All] ║
╠══════════════════════════════════════════════════════════════════╣
║  Status: 47 documents in Storage | 12 documents in DB           ║
║  Missing from DB: 35 | Out of Sync: 2 | Healthy: 12            ║
║                                                                  ║
║  Filters: [All] [Missing from DB] [Out of Sync] [Healthy]      ║
║                                                                  ║
║  ┌────────────────────────────────────────────────────────────┐ ║
║  │ Title              Storage Files    DB Status    Actions    │ ║
║  ├────────────────────────────────────────────────────────────┤ ║
║  │ Gravity's Rainbow  ✓ All (6 files)  ✓ Synced    [Details]  │ ║
║  │   382 chunks • $0.42 saved • LOCAL mode                     │ ║
║  ├────────────────────────────────────────────────────────────┤ ║
║  │ The Stack          ✓ All (6 files)  ⚠️ Missing  [Import]   │ ║
║  │   156 chunks • $0.18 saved • Cloud mode                     │ ║
║  ├────────────────────────────────────────────────────────────┤ ║
║  │ Surveillance Cap.  ⚠️ Partial (4/6) ⚠️ Out of   [Sync]     │ ║
║  │   Missing: chunks.json, manifest.json          Sync        │ ║
║  └────────────────────────────────────────────────────────────┘ ║
║                                                                  ║
║  [Import Missing (35)] [Sync Out of Sync (2)]                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**UI Mockup - Conflict Resolution Dialog**:
```
╔══════════════════════════════════════════════════════════════════╗
║  IMPORT CONFLICT DETECTED: "Gravity's Rainbow"                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Existing in Database          Import from Storage              ║
║  ────────────────────          ──────────────────               ║
║  382 chunks                    382 chunks                       ║
║  Processed: 2025-10-10         Processed: 2025-10-12           ║
║  Mode: LOCAL                   Mode: LOCAL                      ║
║  Hash: abc123...               Hash: def456...                  ║
║                                                                  ║
║  Sample Chunks (first 3):                                       ║
║  ┌──────────────────────────────────────────────────────────┐  ║
║  │ Existing Chunk 0                                          │  ║
║  │ "Gravity's Rainbow begins in London during..."           │  ║
║  │ Importance: 0.8 | Concepts: [paranoia, war, systems]    │  ║
║  │                                                            │  ║
║  │ Import Chunk 0                                            │  ║
║  │ "Gravity's Rainbow begins in London during..."           │  ║
║  │ Importance: 0.85 | Concepts: [paranoia, war, control]   │  ║
║  └──────────────────────────────────────────────────────────┘  ║
║                                                                  ║
║  Resolution Options:                                             ║
║  ○ Skip Import (keep existing data, ignore import)              ║
║  ○ Replace All (delete existing, use import data)               ║
║  ○ Merge Smart (update metadata, preserve chunk IDs/annotations)║
║                                                                  ║
║  ⚠️ Warning: Replace will reset all annotation positions        ║
║  ⚠️ Warning: Skip means import data will be ignored             ║
║  ℹ️ Info: Merge Smart preserves annotations by keeping chunk IDs║
║                                                                  ║
║  [Cancel Import] [Apply Resolution]                             ║
╚══════════════════════════════════════════════════════════════════╝
```

**UI Mockup - Reprocess Connections**:
```
╔══════════════════════════════════════════════════════════════════╗
║  REPROCESS CONNECTIONS                                           ║
╠══════════════════════════════════════════════════════════════════╣
║  Document: Gravity's Rainbow                                     ║
║  Current Connections: 85 (12 user-validated)                     ║
║                                                                  ║
║  Reprocess Mode:                                                 ║
║  ○ Reprocess All (delete all, regenerate from scratch)          ║
║  ○ Add New (keep existing, add connections to newer documents)  ║
║  ● Smart Mode (preserve validated, update rest intelligently)   ║
║                                                                  ║
║  Engines to Run:                                                 ║
║  ☑ Semantic Similarity (embeddings-based, fast, free)           ║
║  ☑ Contradiction Detection (metadata-based, fast, free)         ║
║  ☑ Thematic Bridge (AI-powered, slow, $0.20 cost)              ║
║                                                                  ║
║  Smart Mode Options:                                             ║
║  ☑ Preserve user-validated connections (12 connections)         ║
║  ☑ Only process updated chunks (since last run)                 ║
║  ☑ Save backup before reprocessing                              ║
║                                                                  ║
║  Estimated: ~8 minutes, $0.20                                   ║
║                                                                  ║
║  [Cancel] [Start Reprocessing]                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 4. Data Flow Diagrams

#### Export Flow (Automatic)
```
Processing Pipeline
  ├─ Stage 1: Extraction Complete
  │   └─> saveToStorage("stage-extraction.json")
  │   └─> updateProgress(15%, "extraction")
  │
  ├─ Stage 2: Cleanup Complete
  │   └─> saveToStorage("stage-cleanup.json")
  │   └─> updateProgress(55%, "cleanup")
  │
  ├─ Stage 3: Chunking Complete
  │   └─> saveToStorage("chunks.json")  ← FINAL
  │   └─> updateProgress(75%, "chunking")
  │
  ├─ Stage 4: Metadata Complete
  │   └─> saveToStorage("metadata.json")  ← FINAL
  │   └─> updateProgress(90%, "metadata")
  │
  └─ Stage 5: Finalize
      └─> saveToStorage("manifest.json")  ← FINAL
      └─> saveToStorage("cached_chunks.json") (LOCAL mode)
      └─> updateProgress(100%, "complete")
```

#### Import Flow (Manual)
```
User clicks "Import" in Scanner Tab
  │
  ├─> Start Import Job (background_jobs table)
  │   ├─ Read chunks.json from Storage
  │   ├─ Validate schema (version, required fields)
  │   └─ Check for conflicts
  │       │
  │       ├─ No Conflict Found
  │       │   └─> Import directly
  │       │       ├─ Insert chunks
  │       │       ├─ Regenerate embeddings (if enabled)
  │       │       ├─ Reprocess connections (if enabled)
  │       │       └─> Complete
  │       │
  │       └─ Conflict Detected
  │           └─> Show ConflictResolutionDialog
  │               └─ User chooses strategy
  │                   │
  │                   ├─ Skip: Do nothing
  │                   ├─ Replace: DELETE + INSERT
  │                   └─ Merge Smart: UPDATE metadata
  │
  └─> Poll job status → Show results → Reload UI
```

#### Reprocess Connections Flow
```
User clicks "Reprocess Connections"
  │
  ├─> Select Mode (All / Add New / Smart)
  ├─> Select Engines (Semantic / Contradiction / Thematic)
  └─> Start Reprocess Job
      │
      ├─ Smart Mode
      │   ├─ Query user-validated connections
      │   ├─ Save to Storage ("validated-connections-backup.json")
      │   ├─ Identify updated chunks (metadata_extracted_at > last_run)
      │   ├─ Delete non-validated connections for updated chunks
      │   ├─ Run orchestrator with selected engines
      │   └─ Restore validated connections (remap by content if needed)
      │
      ├─ Add New Mode
      │   ├─ Get documents created after current document
      │   ├─ Run orchestrator with crossDocumentOnly: true
      │   └─ Only process connections to newer documents
      │
      └─ Reprocess All Mode
          ├─ DELETE all connections (no backup)
          ├─ Run orchestrator with selected engines
          └─ Generate fresh connections
```

---

## Technical Specifications

### 1. Storage Helper Functions

**Location**: `worker/lib/storage-helpers.ts` (new file)

```typescript
import { createHash } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Save JSON data to Supabase Storage
 * CRITICAL: Wrap in Blob to preserve formatting
 */
export async function saveToStorage(
  supabase: SupabaseClient,
  path: string,
  data: any,
  options?: { upsert?: boolean }
): Promise<void> {
  const jsonBlob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  })

  const { error } = await supabase.storage
    .from('documents')
    .upload(path, jsonBlob, {
      contentType: 'application/json',
      upsert: options?.upsert ?? true
    })

  if (error) {
    throw new Error(`Storage save failed: ${error.message}`)
  }
}

/**
 * Read JSON data from Supabase Storage
 */
export async function readFromStorage<T = any>(
  supabase: SupabaseClient,
  path: string
): Promise<T> {
  const { data: signedUrlData } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 3600)  // 1 hour expiry

  if (!signedUrlData?.signedUrl) {
    throw new Error('Failed to create signed URL')
  }

  const response = await fetch(signedUrlData.signedUrl)
  if (!response.ok) {
    throw new Error(`Storage read failed: ${response.statusText}`)
  }

  return await response.json()
}

/**
 * Hash file content for comparison
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * List all files in a storage directory
 */
export async function listStorageFiles(
  supabase: SupabaseClient,
  path: string
): Promise<Array<{ name: string; size: number; updated_at: string }>> {
  const { data, error } = await supabase.storage
    .from('documents')
    .list(path)

  if (error) {
    throw new Error(`Storage list failed: ${error.message}`)
  }

  return data || []
}
```

### 2. Processor Integration

**Modify**: `worker/processors/base.ts`

Add storage save hooks after each stage:

```typescript
protected async saveStageResult(
  stage: string,
  data: any,
  options?: { final?: boolean }
): Promise<void> {
  try {
    const storagePath = this.getStoragePath()
    const stagePath = options?.final
      ? `${storagePath}/${stage}.json`  // e.g., chunks.json
      : `${storagePath}/stage-${stage}.json`  // e.g., stage-extraction.json

    await saveToStorage(this.supabase, stagePath, {
      version: '1.0',
      document_id: this.job.document_id,
      stage,
      timestamp: new Date().toISOString(),
      data
    })
  } catch (error) {
    // Non-fatal: Log but don't fail processing
    console.warn(`Failed to save stage ${stage}:`, error)
  }
}
```

**Modify**: `worker/processors/pdf-processor.ts`

Add saves at key checkpoints:

```typescript
// After extraction (line ~140)
await this.saveStageResult('extraction', {
  markdown: result.markdown,
  doclingChunks: result.chunks,
  structure: result.structure
})

// After cleanup (line ~185)
await this.saveStageResult('cleanup', {
  markdown: cleanedMarkdown
})

// After matching (line ~230)
await this.saveStageResult('chunking', {
  chunks: remappedChunks
}, { final: true })  // This is chunks.json

// After metadata (line ~260)
await this.saveStageResult('metadata', {
  chunks: enrichedChunks
}, { final: true })  // Update chunks.json with metadata

// After finalization (line ~285)
await this.saveStageResult('manifest', manifestData, { final: true })
```

### 3. Server Actions

**Location**: `src/app/actions/documents.ts` (new file)

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Start export job for document(s)
 */
export async function exportDocuments(
  documentIds: string[],
  options: {
    includeConnections?: boolean
    includeAnnotations?: boolean
    format?: 'storage' | 'zip'
  } = {}
) {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || process.env.NEXT_PUBLIC_DEV_USER_ID

    // Create background job
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: userId,
        job_type: 'export_documents',
        entity_type: 'document',
        status: 'pending',
        input_data: {
          document_ids: documentIds,
          options
        }
      })
      .select()
      .single()

    if (jobError) throw new Error(`Job creation failed: ${jobError.message}`)

    return { success: true, jobId: job.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Start import job from storage
 */
export async function importFromStorage(
  documentId: string,
  options: {
    strategy?: 'skip' | 'replace' | 'merge_smart'
    regenerateEmbeddings?: boolean
    reprocessConnections?: boolean
  } = {}
) {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || process.env.NEXT_PUBLIC_DEV_USER_ID

    // Check for conflicts
    const { data: existing } = await supabase
      .from('chunks')
      .select('id')
      .eq('document_id', documentId)
      .limit(1)
      .single()

    if (existing && !options.strategy) {
      // Conflict detected, need user resolution
      return {
        success: false,
        needsResolution: true,
        existingId: existing.id
      }
    }

    // Create import job
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: userId,
        job_type: 'import_document',
        entity_type: 'document',
        entity_id: documentId,
        status: 'pending',
        input_data: {
          document_id: documentId,
          options
        }
      })
      .select()
      .single()

    if (jobError) throw new Error(`Job creation failed: ${jobError.message}`)

    return { success: true, jobId: job.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Scan storage for all documents
 */
export async function scanStorage() {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || process.env.NEXT_PUBLIC_DEV_USER_ID

    // List all document directories in storage
    const { data: folders, error: listError } = await supabase.storage
      .from('documents')
      .list(`${userId}`)

    if (listError) throw listError

    const results = []

    for (const folder of folders || []) {
      const docId = folder.name

      // List files in document directory
      const { data: files } = await supabase.storage
        .from('documents')
        .list(`${userId}/${docId}`)

      // Check DB status
      const { data: dbDoc } = await supabase
        .from('documents')
        .select('id, title, created_at')
        .eq('id', docId)
        .single()

      const { count: chunkCount } = await supabase
        .from('chunks')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', docId)

      results.push({
        documentId: docId,
        title: dbDoc?.title || 'Unknown',
        storageFiles: files?.map(f => f.name) || [],
        inDatabase: !!dbDoc,
        chunkCount: chunkCount || 0,
        createdAt: dbDoc?.created_at
      })
    }

    return { success: true, documents: results }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Start connection reprocessing job
 */
export async function reprocessConnections(
  documentId: string,
  options: {
    mode: 'all' | 'add_new' | 'smart'
    engines: Array<'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'>
    preserveValidated?: boolean
    backupFirst?: boolean
  }
) {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || process.env.NEXT_PUBLIC_DEV_USER_ID

    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: userId,
        job_type: 'reprocess_connections',
        entity_type: 'document',
        entity_id: documentId,
        status: 'pending',
        input_data: {
          document_id: documentId,
          options
        }
      })
      .select()
      .single()

    if (jobError) throw new Error(`Job creation failed: ${jobError.message}`)

    revalidatePath(`/read/${documentId}`)
    return { success: true, jobId: job.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
```

### 4. Background Job Handlers

**Location**: `worker/handlers/export-document.ts` (new file)

```typescript
import JSZip from 'jszip'
import { createClient } from '@supabase/supabase-js'
import { readFromStorage, saveToStorage } from '../lib/storage-helpers'

export async function exportDocumentHandler(supabase: any, job: any): Promise<void> {
  const { document_ids, options } = job.input_data
  const userId = job.user_id

  try {
    await updateProgress(supabase, job.id, 10, 'starting', 'Preparing export')

    const zip = new JSZip()
    let processed = 0

    for (const docId of document_ids) {
      const docFolder = zip.folder(docId)

      // Read all files from storage
      const storagePath = `${userId}/${docId}`
      const files = await listStorageFiles(supabase, storagePath)

      for (const file of files) {
        const content = await readFromStorage(supabase, `${storagePath}/${file.name}`)
        docFolder.file(file.name, JSON.stringify(content, null, 2))
      }

      processed++
      const percent = 10 + (processed / document_ids.length) * 80
      await updateProgress(supabase, job.id, percent, 'exporting', `Exported ${processed}/${document_ids.length}`)
    }

    // Generate ZIP
    await updateProgress(supabase, job.id, 90, 'generating', 'Creating ZIP file')
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    // Save to storage
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const zipPath = `${userId}/exports/export-${timestamp}.zip`
    await saveToStorage(supabase, zipPath, zipBlob, { upsert: true })

    // Get signed URL for download
    const { data: signedUrl } = await supabase.storage
      .from('documents')
      .createSignedUrl(zipPath, 3600)  // 1 hour

    await updateProgress(supabase, job.id, 100, 'complete', 'Export complete')

    // Mark job complete
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: { downloadUrl: signedUrl.signedUrl, path: zipPath },
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

  } catch (error: any) {
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        last_error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    throw error
  }
}

async function updateProgress(supabase: any, jobId: string, percent: number, stage: string, details: string) {
  await supabase
    .from('background_jobs')
    .update({
      status: 'processing',
      progress: { percent, stage, details }
    })
    .eq('id', jobId)
}
```

**Location**: `worker/handlers/import-document.ts` (new file)

```typescript
import { createClient } from '@supabase/supabase-js'
import { readFromStorage } from '../lib/storage-helpers'
import { generateEmbedding } from '../lib/embeddings'

export async function importDocumentHandler(supabase: any, job: any): Promise<void> {
  const { document_id, options } = job.input_data
  const userId = job.user_id

  try {
    await updateProgress(supabase, job.id, 10, 'reading', 'Reading chunks from storage')

    // Read chunks.json
    const storagePath = `${userId}/${document_id}`
    const chunksData = await readFromStorage(supabase, `${storagePath}/chunks.json`)

    // Validate schema
    if (chunksData.version !== '1.0') {
      throw new Error(`Unsupported chunks.json version: ${chunksData.version}`)
    }

    await updateProgress(supabase, job.id, 20, 'validating', 'Validating chunk data')

    // Apply import strategy
    if (options.strategy === 'replace') {
      // Delete existing chunks
      await supabase.from('chunks').delete().eq('document_id', document_id)
    } else if (options.strategy === 'merge_smart') {
      // Update metadata, keep IDs
      for (const chunk of chunksData.chunks) {
        await supabase
          .from('chunks')
          .update({
            themes: chunk.themes,
            importance_score: chunk.importance_score,
            summary: chunk.summary,
            emotional_metadata: chunk.emotional_metadata,
            conceptual_metadata: chunk.conceptual_metadata,
            domain_metadata: chunk.domain_metadata,
            metadata_extracted_at: chunk.metadata_extracted_at
          })
          .eq('document_id', document_id)
          .eq('chunk_index', chunk.chunk_index)
      }

      await updateProgress(supabase, job.id, 100, 'complete', 'Merge complete')
      await completeJob(supabase, job.id, { imported: chunksData.chunks.length })
      return
    }

    // Insert chunks
    await updateProgress(supabase, job.id, 40, 'importing', 'Inserting chunks')

    const chunksToInsert = chunksData.chunks.map((chunk: any) => ({
      document_id,
      ...chunk,
      created_at: new Date().toISOString()
    }))

    const { error: insertError } = await supabase
      .from('chunks')
      .insert(chunksToInsert)

    if (insertError) throw insertError

    // Regenerate embeddings if requested
    if (options.regenerateEmbeddings) {
      await updateProgress(supabase, job.id, 60, 'embeddings', 'Regenerating embeddings')

      for (let i = 0; i < chunksToInsert.length; i++) {
        const chunk = chunksToInsert[i]
        const embedding = await generateEmbedding(chunk.content)

        await supabase
          .from('chunks')
          .update({ embedding })
          .eq('document_id', document_id)
          .eq('chunk_index', chunk.chunk_index)

        if (i % 10 === 0) {
          const percent = 60 + (i / chunksToInsert.length) * 30
          await updateProgress(supabase, job.id, percent, 'embeddings', `${i}/${chunksToInsert.length}`)
        }
      }
    }

    await updateProgress(supabase, job.id, 100, 'complete', 'Import complete')
    await completeJob(supabase, job.id, {
      imported: chunksData.chunks.length,
      embeddingsRegenerated: options.regenerateEmbeddings
    })

  } catch (error: any) {
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        last_error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    throw error
  }
}

async function updateProgress(supabase: any, jobId: string, percent: number, stage: string, details: string) {
  await supabase
    .from('background_jobs')
    .update({
      status: 'processing',
      progress: { percent, stage, details }
    })
    .eq('id', jobId)
}

async function completeJob(supabase: any, jobId: string, result: any) {
  await supabase
    .from('background_jobs')
    .update({
      status: 'completed',
      output_data: result,
      completed_at: new Date().toISOString()
    })
    .eq('id', jobId)
}
```

**Location**: `worker/handlers/reprocess-connections.ts` (new file)

```typescript
import { createClient } from '@supabase/supabase-js'
import { processDocument } from '../engines/orchestrator'
import { saveToStorage, readFromStorage } from '../lib/storage-helpers'

export async function reprocessConnectionsHandler(supabase: any, job: any): Promise<void> {
  const { document_id, options } = job.input_data
  const userId = job.user_id

  try {
    await updateProgress(supabase, job.id, 10, 'preparing', 'Preparing to reprocess')

    // Get current connection stats
    const { count: beforeCount } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`source_chunk.document_id.eq.${document_id},target_chunk.document_id.eq.${document_id}`)

    if (options.mode === 'smart' && options.preserveValidated) {
      // Save validated connections
      await updateProgress(supabase, job.id, 20, 'backup', 'Backing up validated connections')

      const { data: validated } = await supabase
        .from('connections')
        .select('*')
        .not('user_validated', 'is', null)
        .eq('user_validated', true)
        .or(`source_chunk.document_id.eq.${document_id},target_chunk.document_id.eq.${document_id}`)

      if (validated && validated.length > 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        await saveToStorage(
          supabase,
          `${userId}/${document_id}/validated-connections-${timestamp}.json`,
          { connections: validated, timestamp }
        )
      }

      // Delete only non-validated connections
      await supabase
        .from('connections')
        .delete()
        .is('user_validated', null)
        .or(`source_chunk.document_id.eq.${document_id},target_chunk.document_id.eq.${document_id}`)

    } else if (options.mode === 'all') {
      // Delete all connections
      await updateProgress(supabase, job.id, 20, 'clearing', 'Clearing all connections')

      await supabase
        .from('connections')
        .delete()
        .or(`source_chunk.document_id.eq.${document_id},target_chunk.document_id.eq.${document_id}`)

    } else if (options.mode === 'add_new') {
      // Get newer documents
      const { data: currentDoc } = await supabase
        .from('documents')
        .select('created_at')
        .eq('id', document_id)
        .single()

      const { data: newerDocs } = await supabase
        .from('documents')
        .select('id')
        .gt('created_at', currentDoc.created_at)

      // Will only process connections to these documents
      // (Orchestrator needs enhancement to support targetDocumentIds)
    }

    // Run orchestrator
    await updateProgress(supabase, job.id, 40, 'processing', 'Running connection engines')

    const result = await processDocument(document_id, {
      enabledEngines: options.engines,
      onProgress: async (percent: number, stage: string, substage: string) => {
        const adjustedPercent = 40 + (percent / 100) * 50
        await updateProgress(supabase, job.id, adjustedPercent, stage, substage)
      }
    })

    // Get final stats
    const { count: afterCount } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`source_chunk.document_id.eq.${document_id},target_chunk.document_id.eq.${document_id}`)

    await updateProgress(supabase, job.id, 100, 'complete', 'Reprocessing complete')

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: {
          connectionsBefore: beforeCount,
          connectionsAfter: afterCount,
          byEngine: result.byEngine
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

  } catch (error: any) {
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        last_error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    throw error
  }
}

async function updateProgress(supabase: any, jobId: string, percent: number, stage: string, details: string) {
  await supabase
    .from('background_jobs')
    .update({
      status: 'processing',
      progress: { percent, stage, details }
    })
    .eq('id', jobId)
}
```

### 5. UI Components

**Location**: `src/components/admin/AdminPanel.tsx` (major refactor)

**Key Changes**:
1. Convert from sidebar to Sheet component (side="top")
2. Add Tabs for different sections
3. Integrate existing job controls into Jobs tab
4. Add new Export, Import, Scanner, Connections, Integrations tabs

**Pattern from codebase**: Use shadcn Sheet + Tabs components

```typescript
'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ExportTab } from './tabs/ExportTab'
import { ImportTab } from './tabs/ImportTab'
import { ScannerTab } from './tabs/ScannerTab'
import { ConnectionsTab } from './tabs/ConnectionsTab'
import { IntegrationsTab } from './tabs/IntegrationsTab'
import { JobsTab } from './tabs/JobsTab'

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="top" className="h-[85vh] overflow-auto">
        <SheetHeader>
          <SheetTitle>Admin Panel</SheetTitle>
          <SheetDescription>
            Manage documents, storage, connections, and integrations
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="scanner" className="mt-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="scanner">Scanner</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
          </TabsList>

          <TabsContent value="scanner" className="mt-6">
            <ScannerTab />
          </TabsContent>

          <TabsContent value="import" className="mt-6">
            <ImportTab />
          </TabsContent>

          <TabsContent value="export" className="mt-6">
            <ExportTab />
          </TabsContent>

          <TabsContent value="connections" className="mt-6">
            <ConnectionsTab />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsTab />
          </TabsContent>

          <TabsContent value="jobs" className="mt-6">
            <JobsTab />  {/* Existing job controls moved here */}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
```

**Location**: `src/components/layout/TopNav.tsx` (add Admin button)

```typescript
import { Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { useState } from 'react'

export function TopNav({ onMenuClick }: TopNavProps) {
  const [adminOpen, setAdminOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center">
          {/* ... existing content ... */}

          <div className="flex flex-1 items-center justify-end space-x-2">
            <nav className="flex items-center space-x-1">
              {/* NEW: Admin button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAdminOpen(true)}
                title="Admin Panel"
              >
                <Database className="h-5 w-5" />
                <span className="sr-only">Admin</span>
              </Button>

              {/* ... existing buttons ... */}
            </nav>
          </div>
        </div>
      </header>

      {/* Admin panel */}
      <AdminPanel isOpen={adminOpen} onClose={() => setAdminOpen(false)} />
    </>
  )
}
```

---

## Implementation Plan

### Phase 1: Storage Export (Week 1-2)
**Goal**: Automatically save chunks and metadata to Storage during processing

**Tasks**:
1. ✅ Create `worker/lib/storage-helpers.ts` with save/read/hash functions
2. ✅ Define TypeScript interfaces for all JSON schemas (chunks, metadata, manifest)
3. ✅ Modify `worker/processors/base.ts` to add `saveStageResult()` method
4. ✅ Update `worker/processors/pdf-processor.ts` to call saves after each stage
5. ✅ Update `worker/processors/epub-processor.ts` similarly
6. ✅ Test: Process PDF → verify all JSON files exist in Storage
7. ✅ Test: Process EPUB → verify all JSON files exist in Storage
8. ✅ Validate: JSON schemas match TypeScript interfaces

**Validation Gates**:
```bash
# Unit tests
npm run test -- storage-helpers.test.ts

# Integration tests
cd worker && npm run test:integration

# Manual verification
# 1. Process document
# 2. Check Supabase Storage: documents/{userId}/{docId}/
# 3. Verify: chunks.json, metadata.json, manifest.json exist
# 4. Download and validate JSON structure
```

**Success Criteria**:
- Every processed document has 3-6 JSON files in Storage (chunks, metadata, manifest, cached_chunks if LOCAL, stage files)
- JSON files conform to schema (validate with TypeScript types)
- Processing doesn't fail due to storage saves (non-fatal errors logged)

---

### Phase 2: Admin Panel UI (Week 2-3)
**Goal**: Build centralized admin interface with tab navigation

**Tasks**:
1. ✅ Convert `src/components/admin/AdminPanel.tsx` to Sheet component
2. ✅ Add Admin button (Database icon) to `src/components/layout/TopNav.tsx`
3. ✅ Create tab structure with 6 tabs
4. ✅ Move existing job controls to Jobs tab
5. ✅ Create placeholder components for other tabs
6. ✅ Add keyboard shortcut (Cmd+Shift+A) to open Admin Panel
7. ✅ Test: Open panel, navigate tabs, close with Esc
8. ✅ Validate: No layout shift, smooth animations

**Validation Gates**:
```bash
# Component tests
npm test -- AdminPanel.test.tsx

# E2E tests
npm run test:e2e -- admin-panel.spec.ts

# Manual testing
# 1. Click Database icon in header
# 2. Panel slides down from top
# 3. All 6 tabs visible and clickable
# 4. Press Esc to close
# 5. No console errors
```

**Success Criteria**:
- Admin Panel opens from header button
- All tabs render without errors
- Existing job controls work in Jobs tab
- Panel closes with Esc or click outside

---

### Phase 3: Storage Scanner (Week 3)
**Goal**: Show Storage vs Database comparison

**Tasks**:
1. ✅ Create `scanStorage()` Server Action in `src/app/actions/documents.ts`
2. ✅ Create `src/components/admin/tabs/ScannerTab.tsx`
3. ✅ Implement table with columns: Title, Storage Files, DB Status, Actions
4. ✅ Add filters: All, Missing from DB, Out of Sync, Healthy
5. ✅ Add bulk actions: Import All, Sync All
6. ✅ Add row actions: Import, Sync, Export, Details
7. ✅ Add file detail expand (click row to see all files)
8. ✅ Test: Scan with various document states
9. ✅ Validate: Diff detection is accurate

**Validation Gates**:
```bash
# Server Action tests
npm test -- documents.test.ts

# Component tests
npm test -- ScannerTab.test.tsx

# Integration tests
# 1. Process document (creates storage files + DB entries)
# 2. Delete chunks from DB
# 3. Scan → verify shows "Missing from DB"
# 4. Delete storage files
# 5. Scan → verify shows "Missing from Storage"
```

**Success Criteria**:
- Scanner accurately detects Storage vs DB differences
- Filters work correctly (missing, out of sync, healthy)
- Table shows all relevant information (file counts, chunk counts)
- Performance: Scan completes in <5 seconds for 50 documents

---

### Phase 4: Import Workflow (Week 4)
**Goal**: Restore chunks from Storage with conflict resolution

**Tasks**:
1. ✅ Create `importFromStorage()` Server Action
2. ✅ Create `worker/handlers/import-document.ts` background job handler
3. ✅ Create `src/components/admin/tabs/ImportTab.tsx`
4. ✅ Create `src/components/admin/ConflictResolutionDialog.tsx`
5. ✅ Implement conflict detection logic
6. ✅ Show side-by-side comparison of existing vs import data
7. ✅ Implement three strategies: Skip, Replace, Merge Smart
8. ✅ Add embeddings regeneration step (post-import)
9. ✅ Add job polling UI with progress tracking
10. ✅ Test: Import new document (no conflict)
11. ✅ Test: Import existing document (show conflict dialog)
12. ✅ Test: Apply each strategy, verify results
13. ✅ Validate: Annotations still work after import

**Validation Gates**:
```bash
# Handler tests
cd worker && npm test -- import-document.test.ts

# Integration tests
# Test 1: Import new
# 1. Process document A → delete from DB (keep storage)
# 2. Import from storage → verify chunks restored
# 3. Check annotations → verify positions correct

# Test 2: Import conflict - Replace
# 1. Process document B
# 2. Modify metadata manually in DB
# 3. Import with Replace → verify DB matches storage

# Test 3: Import conflict - Merge Smart
# 1. Process document C
# 2. Create annotations
# 3. Import with Merge → verify annotations preserved
```

**Success Criteria**:
- Can import chunks.json from Storage to empty DB
- Conflict resolution UI shows data examples clearly
- All three strategies work correctly
- Embeddings regenerate successfully (768d vectors)
- Annotations remain functional after import

---

### Phase 5: Connection Reprocessing (Week 5)
**Goal**: Reprocess connections with user-validation preservation

**Tasks**:
1. ✅ Create `reprocessConnections()` Server Action
2. ✅ Create `worker/handlers/reprocess-connections.ts` handler
3. ✅ Create `src/components/admin/tabs/ConnectionsTab.tsx`
4. ✅ Implement mode selector: All, Add New, Smart
5. ✅ Implement engine selector: checkboxes for 3 engines
6. ✅ Add Smart Mode options: preserve validated, backup first
7. ✅ Implement validated connection backup to Storage
8. ✅ Implement validated connection restoration after reprocess
9. ✅ Add cost/time estimation display
10. ✅ Test: Reprocess All (fresh connections)
11. ✅ Test: Add New (only newer documents)
12. ✅ Test: Smart Mode (preserve validated)
13. ✅ Validate: Validated connections preserved correctly

**Validation Gates**:
```bash
# Handler tests
cd worker && npm test -- reprocess-connections.test.ts

# Integration tests
# Test 1: Smart Mode preservation
# 1. Process document with connections
# 2. Mark some connections as user_validated=true
# 3. Reprocess in Smart Mode
# 4. Verify validated connections still exist
# 5. Verify validated-connections-{ts}.json in storage

# Test 2: Add New mode
# 1. Process document A (gets connections)
# 2. Process document B (newer)
# 3. Reprocess A in Add New mode
# 4. Verify only A↔B connections added
```

**Success Criteria**:
- All three modes work correctly
- Smart Mode preserves user-validated connections
- Backup files created in Storage before destructive operations
- Connection stats accurate (before/after counts)
- Orchestrator respects engine selection

---

### Phase 6: Export Workflow (Week 5-6)
**Goal**: Export documents as ZIP bundles

**Tasks**:
1. ✅ Create `exportDocuments()` Server Action
2. ✅ Create `worker/handlers/export-document.ts` handler
3. ✅ Create `src/components/admin/tabs/ExportTab.tsx`
4. ✅ Implement document multi-select
5. ✅ Add export options: include connections, include annotations
6. ✅ Implement ZIP generation with JSZip
7. ✅ Save ZIP to Storage, return signed URL
8. ✅ Add download button with progress tracking
9. ✅ Add batch export (select all)
10. ✅ Test: Export single document
11. ✅ Test: Export multiple documents
12. ✅ Test: Download and extract ZIP, validate contents
13. ✅ Validate: ZIP can be imported back

**Validation Gates**:
```bash
# Handler tests
cd worker && npm test -- export-document.test.ts

# Integration tests
# Test 1: Single document export
# 1. Process document
# 2. Export as ZIP
# 3. Download ZIP
# 4. Extract and verify files: chunks.json, metadata.json, etc.
# 5. Validate JSON schemas

# Test 2: Round-trip (export → import)
# 1. Process document A
# 2. Export as ZIP
# 3. Delete from DB
# 4. Import from ZIP
# 5. Verify chunks, metadata, annotations restored
```

**Success Criteria**:
- ZIP contains all expected files (chunks, metadata, manifest, source, content)
- ZIP file size reasonable (<50MB for 500-page book)
- Download works via signed URL
- Exported ZIP can be imported successfully

---

### Phase 7: Integration & Polish (Week 6)
**Goal**: Move Obsidian/Readwise to Admin Panel, improve UX

**Tasks**:
1. ✅ Create `src/components/admin/tabs/IntegrationsTab.tsx`
2. ✅ Move Obsidian export/sync from DocumentHeader to Integrations tab
3. ✅ Move Readwise import from DocumentHeader to Integrations tab
4. ✅ Add operation history log (show recent operations)
5. ✅ Improve progress tracking (real-time updates via polling)
6. ✅ Add keyboard shortcuts help dialog
7. ✅ Add tooltips for all actions
8. ✅ Test: All operations work from Admin Panel
9. ✅ Test: No regressions in existing functionality
10. ✅ Validate: UX is smooth, no confusion

**Validation Gates**:
```bash
# Regression tests
npm run test:e2e

# Manual testing checklist
□ Obsidian export works from Admin Panel
□ Obsidian sync works from Admin Panel
□ Readwise import works from Admin Panel
□ Operation history shows recent actions
□ Progress tracking updates in real-time
□ Keyboard shortcuts work (Cmd+Shift+A, Esc)
□ Tooltips show helpful information
□ No console errors
□ No layout issues on small screens
```

**Success Criteria**:
- Admin Panel is the central hub for all document operations
- Obsidian and Readwise integrations work from Admin Panel
- Operation history provides transparency
- UX is intuitive, no user confusion
- No regressions in existing features

---

## Testing Strategy

### Unit Tests

**Storage Helpers** (`worker/lib/__tests__/storage-helpers.test.ts`):
```typescript
describe('Storage Helpers', () => {
  test('saveToStorage creates file with correct JSON', async () => {
    const data = { version: '1.0', test: true }
    await saveToStorage(supabase, 'test/path.json', data)

    const result = await readFromStorage(supabase, 'test/path.json')
    expect(result).toEqual(data)
  })

  test('hashContent generates consistent SHA256', () => {
    const content = 'test content'
    const hash1 = hashContent(content)
    const hash2 = hashContent(content)
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/)
  })
})
```

**Conflict Resolution** (`src/lib/__tests__/conflict-resolution.test.ts`):
```typescript
describe('Conflict Resolution', () => {
  test('detectConflict identifies existing data', async () => {
    // Setup: Document with chunks in DB
    const hasConflict = await detectConflict(supabase, 'doc-id')
    expect(hasConflict).toBe(true)
  })

  test('applySkip leaves existing data unchanged', async () => {
    const beforeCount = await getChunkCount(supabase, 'doc-id')
    await applyStrategy(supabase, 'doc-id', 'skip', importData)
    const afterCount = await getChunkCount(supabase, 'doc-id')
    expect(afterCount).toBe(beforeCount)
  })

  test('applyReplace deletes old and inserts new', async () => {
    await applyStrategy(supabase, 'doc-id', 'replace', importData)
    const chunks = await getChunks(supabase, 'doc-id')
    expect(chunks[0].importance_score).toBe(importData.chunks[0].importance_score)
  })

  test('applyMergeSmart updates metadata, preserves IDs', async () => {
    const beforeIds = await getChunkIds(supabase, 'doc-id')
    await applyStrategy(supabase, 'doc-id', 'merge_smart', importData)
    const afterIds = await getChunkIds(supabase, 'doc-id')
    expect(afterIds).toEqual(beforeIds)  // IDs unchanged

    const chunks = await getChunks(supabase, 'doc-id')
    expect(chunks[0].importance_score).toBe(importData.chunks[0].importance_score)  // Metadata updated
  })
})
```

**Connection Preservation** (`worker/__tests__/connection-preservation.test.ts`):
```typescript
describe('Connection Preservation', () => {
  test('saveValidatedConnections exports to JSON', async () => {
    const validated = [/* mock connections */]
    await saveValidatedConnections(supabase, 'doc-id', validated)

    const backupExists = await checkStorageFileExists(supabase, 'validated-connections-*.json')
    expect(backupExists).toBe(true)
  })

  test('Smart Mode preserves validated connections', async () => {
    // Setup: Document with validated connections
    const beforeValidated = await getValidatedConnections(supabase, 'doc-id')

    await reprocessConnectionsHandler(supabase, {
      id: 'job-id',
      input_data: {
        document_id: 'doc-id',
        options: { mode: 'smart', preserveValidated: true, engines: ['semantic_similarity'] }
      }
    })

    const afterValidated = await getValidatedConnections(supabase, 'doc-id')
    expect(afterValidated.length).toBe(beforeValidated.length)
    expect(afterValidated[0].user_validated).toBe(true)
  })
})
```

### Integration Tests

**Export → Import Round-Trip** (`worker/tests/integration/export-import.test.ts`):
```typescript
describe('Export → Import Flow', () => {
  test('exported ZIP can be imported back', async () => {
    // 1. Process document
    const docId = await processTestDocument(supabase, 'test.pdf')
    const beforeChunks = await getChunks(supabase, docId)

    // 2. Export as ZIP
    const exportJob = await exportDocumentHandler(supabase, {
      id: 'export-job',
      user_id: 'test-user',
      input_data: { document_ids: [docId], options: {} }
    })
    const zipPath = exportJob.output_data.path

    // 3. Delete from DB
    await supabase.from('chunks').delete().eq('document_id', docId)

    // 4. Import from ZIP
    await importDocumentHandler(supabase, {
      id: 'import-job',
      user_id: 'test-user',
      input_data: {
        document_id: docId,
        options: { strategy: 'replace', regenerateEmbeddings: true }
      }
    })

    // 5. Verify restoration
    const afterChunks = await getChunks(supabase, docId)
    expect(afterChunks.length).toBe(beforeChunks.length)
    expect(afterChunks[0].content).toBe(beforeChunks[0].content)
    expect(afterChunks[0].importance_score).toBe(beforeChunks[0].importance_score)
  })
})
```

**Storage Scanner Accuracy** (`src/app/actions/__tests__/scanner.test.ts`):
```typescript
describe('Storage Scanner', () => {
  test('detects missing from DB', async () => {
    // Setup: Document in storage but not in DB
    await createStorageFiles(supabase, 'doc-id')

    const result = await scanStorage()
    const doc = result.documents.find(d => d.documentId === 'doc-id')

    expect(doc.storageFiles.length).toBeGreaterThan(0)
    expect(doc.inDatabase).toBe(false)
  })

  test('detects out of sync', async () => {
    // Setup: Document in both, but different chunk counts
    await createStorageFiles(supabase, 'doc-id', { chunkCount: 100 })
    await createDbDocument(supabase, 'doc-id', { chunkCount: 50 })

    const result = await scanStorage()
    const doc = result.documents.find(d => d.documentId === 'doc-id')

    expect(doc.inDatabase).toBe(true)
    expect(doc.chunkCount).not.toBe(100)  // Indicates out of sync
  })
})
```

### Manual Testing Checklist

**Phase 1: Storage Export**
- [ ] Process PDF → verify chunks.json, metadata.json, manifest.json in Storage
- [ ] Process EPUB → verify same files created
- [ ] Process LOCAL mode → verify cached_chunks.json also created
- [ ] Verify JSON schemas match TypeScript interfaces
- [ ] Check manifest.json has accurate file inventory and costs

**Phase 2: Admin Panel**
- [ ] Click Database icon → panel slides down from top
- [ ] All 6 tabs visible and clickable
- [ ] Press Esc → panel closes
- [ ] Press Cmd+Shift+A → panel opens
- [ ] Existing job controls work in Jobs tab
- [ ] No layout shift or visual glitches

**Phase 3: Storage Scanner**
- [ ] Click Scanner tab → shows document list
- [ ] Process document → Scanner shows "Healthy"
- [ ] Delete chunks from DB → Scanner shows "Missing from DB"
- [ ] Delete storage files → Scanner shows "Missing from Storage"
- [ ] Click "Import" on missing → verify import starts
- [ ] Filters work correctly (All, Missing, Out of Sync, Healthy)

**Phase 4: Import Workflow**
- [ ] Import new document (no conflict) → chunks restored
- [ ] Import existing → conflict dialog appears
- [ ] Conflict dialog shows data examples side-by-side
- [ ] Choose "Skip" → existing data unchanged
- [ ] Choose "Replace" → existing data replaced
- [ ] Choose "Merge Smart" → metadata updated, IDs preserved
- [ ] Verify annotations still work after import
- [ ] Progress tracking shows real-time updates

**Phase 5: Connection Reprocessing**
- [ ] Reprocess All → all connections deleted and regenerated
- [ ] Add New mode → only connections to newer docs added
- [ ] Smart Mode → validated connections preserved
- [ ] Backup file created in Storage before reprocess
- [ ] Progress tracking shows engine stages
- [ ] Connection stats accurate (before/after counts)

**Phase 6: Export Workflow**
- [ ] Select single document → export → download ZIP
- [ ] Extract ZIP → verify all files present and valid JSON
- [ ] Select multiple documents → batch export → verify ZIP structure
- [ ] Import exported ZIP → verify restoration works
- [ ] Progress tracking shows ZIP generation stage

**Phase 7: Integration & Polish**
- [ ] Obsidian export works from Integrations tab
- [ ] Obsidian sync works from Integrations tab
- [ ] Readwise import works from Integrations tab
- [ ] Operation history shows recent actions
- [ ] Tooltips helpful and accurate
- [ ] No console errors
- [ ] Mobile responsive (test on small screen)

---

## Success Criteria

### Functional Requirements
- ✅ Chunks automatically saved to Storage during processing
- ✅ Admin Panel accessible from header, slide-down UI
- ✅ Storage Scanner shows accurate Storage vs DB comparison
- ✅ Import workflow with intelligent conflict resolution
- ✅ Connection reprocessing with user-validation preservation
- ✅ Export as ZIP with complete document bundles
- ✅ Obsidian and Readwise integrated into Admin Panel

### Performance Requirements
- Storage Scanner: <5 seconds for 50 documents
- Import: <5 minutes for 382 chunks (including embeddings regeneration)
- Export: <2 minutes for single document ZIP
- Reprocess: <15 minutes for 382 chunks, all 3 engines

### Data Integrity Requirements
- Zero data loss: All processed documents have Storage backups
- Annotation preservation: Import operations don't break annotations
- Connection preservation: Smart Mode preserves user-validated connections
- Schema validation: All JSON files conform to defined schemas

### User Experience Requirements
- Clear progress tracking: All long operations show real-time progress
- Helpful error messages: Users understand what went wrong and how to fix
- Intuitive UI: No user confusion about what actions do
- Responsive: UI works on desktop and tablet screens

---

## Risks & Mitigations

### Risk 1: Import Conflicts Cause Data Loss
**Severity**: HIGH
**Probability**: Medium
**Mitigation**:
- Always backup before destructive operations
- Conflict resolution UI shows data before applying
- Default to "Skip" (safest option)
- Save validated connections to Storage before any deletion
- Comprehensive integration tests for conflict scenarios

### Risk 2: JSON Schema Changes Break Imports
**Severity**: Medium
**Probability**: Medium
**Mitigation**:
- Version field in all JSON files (currently "1.0")
- Migration logic for old schemas
- Validate schema on import, show clear error message
- Document schema changes in CHANGELOG

### Risk 3: Reprocess Loses User Validation
**Severity**: HIGH
**Probability**: Low
**Mitigation**:
- Smart Mode preserves validated by default
- Save backup to Storage before reprocess
- UI warns about data loss for "Reprocess All"
- Restore function available if mistakes happen

### Risk 4: Large Documents Cause Memory Issues
**Severity**: Medium
**Probability**: Low
**Mitigation**:
- Stream ZIP generation for large documents
- Background jobs have memory limits
- Show warning for very large exports (>100MB)
- Test with 500-page documents (max expected)

### Risk 5: Concurrent Operations Conflict
**Severity**: Medium
**Probability**: Low
**Mitigation**:
- Lock mechanism: Check if job exists for document
- UI shows "Operation in progress" warning
- Queue operations if concurrent requested
- Example: Can't import while processing same document

### Risk 6: Storage vs DB Gets Out of Sync
**Severity**: Medium
**Probability**: Medium
**Mitigation**:
- Scanner tab shows differences clearly
- Clear "Sync" actions to fix
- Manifest.json tracks last sync timestamp
- Prevention: Auto-save during processing ensures sync

### Risk 7: UI Complexity Overwhelms User
**Severity**: Low
**Probability**: Medium
**Mitigation**:
- Good defaults (Smart mode, preserve validated)
- Progressive disclosure (advanced options collapsed)
- Clear help text and examples
- Keyboard shortcuts for power users
- Tooltips on all actions

### Risk 8: Testing Doesn't Catch Edge Cases
**Severity**: Medium
**Probability**: Medium
**Mitigation**:
- Comprehensive test suite (unit + integration)
- Manual testing checklist
- Gradual rollout (Phase 1 first, validate before Phase 2)
- User can always reprocess if something goes wrong
- Document known limitations clearly

---

## Future Enhancements (Not in Scope)

### V2 Features
1. **Incremental Sync**: Only sync changed files, not full import
2. **Conflict Resolution AI**: Suggest best strategy based on data analysis
3. **Batch Operations**: Parallel processing for multiple documents
4. **Cloud Backup**: Auto-backup to S3/GCS for disaster recovery
5. **Version History**: Track multiple versions of same document
6. **Diff View**: Show exact changes between Storage and DB
7. **Smart Scheduling**: Auto-export nightly, auto-cleanup old backups
8. **Compression**: GZIP JSON files to save storage space
9. **Streaming Import**: Handle very large documents without loading all into memory
10. **Undo/Redo**: Revert import/reprocess operations

### Integration Enhancements
1. **Webhook Support**: Trigger operations from external tools
2. **API Endpoints**: RESTful API for programmatic access
3. **CLI Tools**: Command-line export/import for power users
4. **Git Integration**: Version control for document data
5. **Notion Integration**: Export to Notion pages

---

## Appendix

### A. File Structure Reference

```
src/
├── app/
│   ├── actions/
│   │   └── documents.ts                    # 🆕 Server Actions (export, import, scan, reprocess)
│   └── api/
│       └── jobs/
│           └── [jobId]/
│               └── route.ts                # Job status polling endpoint
├── components/
│   ├── admin/
│   │   ├── AdminPanel.tsx                  # ♻️ Refactored (Sheet + Tabs)
│   │   ├── ConflictResolutionDialog.tsx   # 🆕 Conflict resolution UI
│   │   └── tabs/
│   │       ├── ExportTab.tsx               # 🆕 Export workflow
│   │       ├── ImportTab.tsx               # 🆕 Import workflow
│   │       ├── ScannerTab.tsx              # 🆕 Storage scanner
│   │       ├── ConnectionsTab.tsx          # 🆕 Connection reprocessing
│   │       ├── IntegrationsTab.tsx         # 🆕 Obsidian + Readwise
│   │       └── JobsTab.tsx                 # ♻️ Existing job controls moved here
│   └── layout/
│       └── TopNav.tsx                      # ♻️ Add Admin button

worker/
├── handlers/
│   ├── export-document.ts                  # 🆕 Export background job
│   ├── import-document.ts                  # 🆕 Import background job
│   └── reprocess-connections.ts            # 🆕 Reprocess background job
├── lib/
│   ├── storage-helpers.ts                  # 🆕 Storage operations
│   └── conflict-resolution.ts              # 🆕 Conflict detection & resolution
└── processors/
    ├── base.ts                             # ♻️ Add saveStageResult()
    ├── pdf-processor.ts                    # ♻️ Add storage saves
    └── epub-processor.ts                   # ♻️ Add storage saves
```

### B. Database Schema Changes

**No new tables required**. All functionality uses existing:
- `documents` table (document metadata)
- `chunks` table (chunk data)
- `connections` table (with `user_validated` field)
- `cached_chunks` table (Docling extraction cache)
- `background_jobs` table (job tracking)

**New job types**:
- `export_documents` - Export to ZIP
- `import_document` - Import from Storage
- `reprocess_connections` - Connection reprocessing

### C. Storage Quota Estimates

**Per Document** (500-page book, 382 chunks):
- chunks.json: ~800KB (full metadata)
- cached_chunks.json: ~600KB (LOCAL mode only)
- metadata.json: ~2KB (document metadata)
- manifest.json: ~3KB (file inventory)
- stage-*.json: ~200KB each × 5 stages = 1MB (optional, can be cleaned up)
- **Total**: ~2.4MB per document (LOCAL mode), ~1.8MB (Cloud mode)

**For 100 Documents**:
- LOCAL mode: ~240MB
- Cloud mode: ~180MB

**For 1,000 Documents**:
- LOCAL mode: ~2.4GB
- Cloud mode: ~1.8GB

**Storage Cost** (Supabase Storage pricing: $0.021/GB/month):
- 100 docs: $0.00504/month (LOCAL), $0.00378/month (Cloud)
- 1,000 docs: $0.0504/month (LOCAL), $0.0378/month (Cloud)

**Negligible cost** compared to processing costs ($0.20-0.60 per document).

### D. Related Documentation

- **CLAUDE.md**: Project overview and patterns
- **STORAGE_PATTERNS.md**: Storage usage patterns
- **docs/PROCESSING_PIPELINE.md**: Processing stages
- **docs/processing-pipeline/bulletproof-metadata-extraction.md**: Metadata extraction
- **docs/processing-pipeline/docling-patterns.md**: Docling integration
- **worker/README.md**: Worker module documentation

### E. TypeScript Type Definitions

**Location**: `worker/types/storage.ts` (new file)

```typescript
// Export schemas
export interface ChunksExport {
  version: string
  document_id: string
  processing_mode: 'local' | 'cloud'
  created_at: string
  chunks: Array<ChunkExportData>
}

export interface ChunkExportData {
  content: string
  chunk_index: number
  start_offset?: number
  end_offset?: number
  word_count?: number
  page_start?: number | null
  page_end?: number | null
  heading_level?: number | null
  section_marker?: string | null
  bboxes?: Array<BBox> | null
  position_confidence?: 'exact' | 'high' | 'medium' | 'synthetic'
  position_method?: string
  position_validated?: boolean
  themes?: string[]
  importance_score?: number
  summary?: string | null
  emotional_metadata?: EmotionalMetadata
  conceptual_metadata?: ConceptualMetadata
  domain_metadata?: DomainMetadata | null
  metadata_extracted_at?: string | null
}

export interface CachedChunksExport {
  version: string
  document_id: string
  extraction_mode: 'pdf' | 'epub'
  markdown_hash: string
  docling_version: string
  chunks: Array<DoclingChunk>
  structure: DoclingStructure
  created_at: string
}

export interface MetadataExport {
  version: string
  document_id: string
  title: string
  author?: string | null
  source: DocumentSource
  processing_mode: 'local' | 'cloud'
  word_count: number
  page_count?: number | null
  language?: string | null
  created_at: string
  processed_at: string
}

export interface ManifestExport {
  version: string
  document_id: string
  created_at: string
  processing_mode: 'local' | 'cloud'
  files: {
    source: FileInfo
    content: FileInfo
    chunks: FileInfo & { count: number }
    cached_chunks?: FileInfo
    metadata: FileInfo
  }
  processing_cost: {
    extraction: number
    metadata: number
    embeddings: number
    connections: number
    total: number
  }
  processing_time: {
    extraction: number
    cleanup: number
    chunking: number
    metadata: number
    embeddings: number
    total: number
  }
}

interface FileInfo {
  path: string
  size: number
  hash: string
}

// Conflict resolution types
export type ConflictStrategy = 'skip' | 'replace' | 'merge_smart'

export interface ImportConflict {
  documentId: string
  existingChunkCount: number
  importChunkCount: number
  existingProcessedAt: string
  importProcessedAt: string
  sampleChunks: {
    existing: ChunkExportData[]
    import: ChunkExportData[]
  }
}

// Reprocess types
export type ReprocessMode = 'all' | 'add_new' | 'smart'
export type ConnectionEngine = 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'

export interface ReprocessOptions {
  mode: ReprocessMode
  engines: ConnectionEngine[]
  preserveValidated?: boolean
  backupFirst?: boolean
}
```

---

## Confidence Score Justification: 9/10

**Why 9/10?**

**Strengths (+)**:
- ✅ Comprehensive codebase research with exact file paths and line numbers
- ✅ All patterns exist in codebase (storage operations, background jobs, Sheet component, tabs)
- ✅ User requirements fully clarified (incremental saves, conflict resolution, Smart Mode)
- ✅ Clear implementation plan with validation gates at each phase
- ✅ Detailed JSON schemas with TypeScript types
- ✅ Risk mitigation strategies for all identified risks
- ✅ Phased approach allows incremental delivery and validation

**Uncertainties (-1)**:
- Orchestrator enhancement for "Add New" mode needs validation (targetDocumentIds parameter doesn't exist yet)
- Large-scale testing (1,000+ documents) not yet performed
- User acceptance of UI design not validated with mockups

**Missing from 10/10**:
- User testing of Admin Panel UI (mockups need validation)
- Performance benchmarks for scanner with 1,000+ documents
- Migration path for existing processed documents (need to backfill Storage)

**Overall Assessment**: High confidence in one-pass implementation success. All technical patterns are proven in codebase, requirements are clear, and implementation plan is detailed with validation gates. The -1 point accounts for unknowns in user experience and large-scale performance.

---

## Task Breakdown Reference

**See**: `docs/tasks/storage-first-portability.md`

Detailed task breakdown with acceptance criteria, dependencies, and estimates generated by team-lead-task-breakdown agent.

---

**END OF PRP**
