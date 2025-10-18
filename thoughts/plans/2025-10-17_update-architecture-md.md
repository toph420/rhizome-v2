# Update ARCHITECTURE.md Implementation Plan

## Overview
Update ARCHITECTURE.md to accurately reflect the current implementation state of Rhizome V2, incorporating all features built since the original documentation was written.

## Current State Analysis
After thorough analysis of the codebase, the following discrepancies were found between ARCHITECTURE.md and the actual implementation:

### Key Discoveries:
- **10-Stage Unified Pipeline**: Fully implemented with checkpoint-based pause/resume (worker/handlers/process-document.ts:97-765)
- **Chonkie Integration**: All 9 strategies operational with dynamic timeouts (worker/lib/chonkie/chonkie-chunker.ts:1-355)
- **3-Engine System**: Orchestrator coordinates all engines sequentially (worker/engines/orchestrator.ts:1-152)
- **Storage-First Portability**: Admin Panel with 6 tabs fully functional (src/components/admin/AdminPanel.tsx:1-135)
- **Job System v2.0**: Enhanced with pause/resume, checkpoints, retry logic (migration 052)
- **Cached Chunks**: Zero-cost reprocessing implemented (migration 046)
- **Document Reader**: 90% complete, missing connection visualization
- **RightPanel**: 7 tabs (was 6), with 5 fully functional, 2 placeholders
- **ECS System**: Fully operational singleton pattern (src/lib/ecs/ecs.ts:1-333)

## Desired End State
ARCHITECTURE.md should accurately document:
- The actual 10-stage unified processing pipeline with stage percentages
- Complete 3-engine implementation details with LOCAL/CLOUD modes
- Storage-First Portability system with Admin Panel architecture
- Enhanced Job System v2.0 with checkpoint-based pause/resume
- Cached chunks system for zero-cost reprocessing
- Current state of Document Reader (90% complete)
- Updated database schema (migrations 046-052)
- Accurate implementation status

## Rhizome Architecture
- **Module**: Main App (documentation update)
- **Storage**: N/A (documentation only)
- **Migration**: No
- **Test Tier**: N/A (documentation)
- **Pipeline Stages**: N/A (documentation)
- **Engines**: N/A (documentation)

## What We're NOT Doing
- Not changing any code, only updating documentation
- Not documenting planned features that aren't built
- Not removing the philosophical sections or vision statements
- Not changing the markdown structure significantly

## Implementation Approach
Update each section of ARCHITECTURE.md to reflect the actual implementation, preserving the document's tone and philosophy while ensuring technical accuracy.

## Phase 1: Update Processing Pipeline Section

### Overview
Replace the current processing pipeline documentation with the actual 10-stage unified pipeline implementation.

### Changes Required:

#### 1. Processing Pipeline Section
**File**: `docs/ARCHITECTURE.md`
**Changes**: Update lines 178-312 with actual implementation

```markdown
## Document Processing Pipeline [✅ IMPLEMENTED]

**Architecture:** Node.js worker handles all AI processing independently with checkpoint-based pause/resume.

### 10-Stage Unified Pipeline

```
Upload → Download → Extract → Cleanup → Match → Review → Chunk → Transfer → Enrich → Save → Connect
(0-10%) → (10-20%) → (20-30%) → (30-40%) → (40-50%) → (50-60%) → (60-70%) → (70-80%) → (80-90%) → (90-95%) → (95-100%)
```

#### Stage Details:

**Stage 1: Download (0-10%)**
- Fetch document metadata from database
- Validate document exists and is pending
- Initialize processing state

**Stage 2: Docling Extraction (10-20%)**
- Route to appropriate processor by source_type
- PDF/EPUB: Docling with HybridChunker (768 tokens)
- Cache original chunks in `cached_chunks` table
- Extract structural metadata (headings, pages)

**Stage 3: Cleanup (20-30%)**
- Local: Ollama Qwen 32B for markdown cleanup
- Cloud: Gemini 2.0 Flash for extraction
- Preserve formatting and structure

**Stage 4: Bulletproof Match (30-40%)**
- 5-layer matching strategy for metadata preservation
- Character offset validation
- 70-90% overlap coverage expected (and excellent)

**Stage 5: Review Checkpoint (40-50%)**
- Optional manual review point
- Export to Obsidian for editing
- Pause/resume capability

**Stage 6: Chonkie Chunk (50-60%)**
- 9 strategies available (default: recursive)
- Dynamic timeout based on strategy and document size
- Python subprocess with JSON IPC

**Stage 7: Metadata Transfer (60-70%)**
- Transfer Docling metadata to Chonkie chunks
- Preserve heading_path, heading_level, section_marker
- Validate character offsets

**Stage 8: Enrich (70-80%)**
- Generate embeddings (768d vectors)
- Local: Transformers.js
- Cloud: Gemini embedding model
- Metadata-enhanced embeddings

**Stage 9: Save (80-90%)**
- Insert chunks with embeddings to database
- Update document processing status
- Store processing statistics

**Stage 10: Connection Detection (90-100%)**
- Queue connection detection job
- Run 3-engine collision detection
- Complete processing

### Checkpoint & Resume System

```typescript
// Checkpoint creation with SHA-256 validation
const checkpoint = {
  stage: currentStage,
  path: `checkpoints/${documentId}/${stage}.json`,
  hash: sha256(JSON.stringify(stageData)),
  timestamp: new Date()
}

// Resume validation
if (checkpoint.hash !== calculateHash(loadedData)) {
  console.warn('Checkpoint hash mismatch, starting fresh')
  return startFromBeginning()
}
```

### Cost Breakdown (500-page book):
- Extraction: $0.12 (Docling or Gemini)
- Cleanup: $0.00 (Local) or $0.10 (Cloud)
- Embeddings: $0.02
- Connection detection: $0.20 (filtered AI calls)
- **Total: ~$0.34 (Local) or ~$0.44 (Cloud)**
```

### Success Criteria:

#### Automated Verification:
- [ ] Verify updated sections are accurate
- [ ] Check file references are correct
- [ ] Ensure cost calculations match current implementation

#### Manual Verification:
- [ ] Review reads naturally
- [ ] Technical details are accurate
- [ ] Philosophy preserved

---

## Phase 2: Update 3-Engine Connection Detection

### Overview
Document the actual implementation of the 3-engine system with orchestrator details.

### Changes Required:

#### 1. Connection Detection Section
**File**: `docs/ARCHITECTURE.md`
**Changes**: Update lines 313-494

```markdown
## 3-Engine Collision Detection System [✅ IMPLEMENTED]

**The Core Innovation:** 3 distinct engines find different connection types. Sequential execution with configurable weights.

### Orchestrator Architecture

```typescript
// worker/engines/orchestrator.ts
const orchestrator = new CollisionOrchestrator({
  engines: {
    semantic: new SemanticSimilarityEngine(),      // 25% weight
    contradiction: new ContradictionDetectionEngine(), // 40% weight
    thematic: process.env.PROCESSING_MODE === 'local'
      ? new ThematicBridgeQwenEngine()  // Local: Qwen
      : new ThematicBridgeEngine()      // Cloud: Gemini
  },
  weights: {
    semantic: 0.25,
    contradiction: 0.40,
    thematic: 0.35
  }
})
```

### Engine Implementations

#### 1. Semantic Similarity (25% weight)
- **Method**: pgvector cosine similarity
- **Threshold**: 0.7 (configurable)
- **Cost**: $0 (vector math only)
- **Finds**: "These say the same thing"

#### 2. Contradiction Detection (40% weight)
- **Method**: Metadata-based concept + polarity analysis
- **No AI calls**: Uses pre-extracted metadata
- **Strategies**: Shared concepts with opposite polarity
- **Finds**: "These disagree about the same thing"

#### 3. Thematic Bridge (35% weight)
- **Method**: AI-powered cross-domain matching
- **Filtering**: Importance >0.6, top 15 candidates per chunk
- **Local Mode**: Qwen 32B via Ollama
- **Cloud Mode**: Gemini 2.0 Flash
- **Cost**: ~$0.20 per document (after filtering)
- **Finds**: "These connect different domains"

### Connection Storage

All engines write to single `connections` table with:
- `type`: Engine identifier
- `strength`: 0-1 score
- `metadata`: Engine-specific data
- `auto_detected`: true (until user validates)
- `user_validated`: Preserved during reprocessing
```

---

## Phase 3: Add Storage-First Portability Section

### Overview
Document the complete Storage-First Portability system with Admin Panel.

### Changes Required:

#### 1. New Section After Connection Detection
**File**: `docs/ARCHITECTURE.md`
**Location**: After line 494

```markdown
## Storage-First Portability System [✅ IMPLEMENTED]

**Philosophy:** Storage is source of truth, Database is queryable cache.

### Admin Panel Architecture (Cmd+Shift+A)

```typescript
// 6 Operational Tabs
interface AdminPanel {
  scanner: CompareStorageVsDatabase,      // Find discrepancies
  import: RestoreFromStorage,             // 3 conflict strategies
  export: GenerateZipBundles,            // Complete portability
  connections: ReprocessConnections,       // Smart mode preserves validated
  integrations: ObsidianReadwise,         // External tool sync
  jobs: BackgroundJobHistory              // Complete job management
}
```

### Storage Structure

```
SUPABASE STORAGE
└── userId/documentId/
    ├── source.pdf              # Original upload
    ├── content.md              # Processed markdown
    ├── chunks.json             # Complete chunk data
    ├── metadata.json           # Document metadata
    ├── manifest.json           # Export manifest
    └── annotations.json        # Annotation backup

Benefits:
- Zero-cost restore ($0 vs $0.20-0.60 reprocessing)
- 6 minute restore vs 25 minute reprocessing
- Complete portability via ZIP export
- Disaster recovery capability
```

### Conflict Resolution Strategies

```typescript
enum ConflictStrategy {
  SKIP = 'skip',           // Keep existing
  REPLACE = 'replace',     // Overwrite with imported
  MERGE_SMART = 'merge'    // Intelligent merge by timestamp
}
```

### Export System

1. **Automatic**: After every processing completion
2. **Manual**: Via Admin Panel Export tab
3. **Format**: ZIP bundle with signed URLs (24hr expiry)
4. **Contents**: All documents or selected subset
```

---

## Phase 4: Update Background Job System

### Overview
Document the enhanced v2.0 job system with pause/resume.

### Changes Required:

#### 1. New Section for Job System
**File**: `docs/ARCHITECTURE.md`
**Location**: After Storage-First section

```markdown
## Background Job System v2.0 [✅ IMPLEMENTED]

**Enhancement:** Checkpoint-based pause/resume with SHA-256 validation.

### Job Architecture

```sql
-- Migration 052: Pause/Resume Support
ALTER TABLE background_jobs ADD COLUMN
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  pause_reason TEXT,
  resume_count INTEGER DEFAULT 0,
  last_checkpoint_path TEXT,
  last_checkpoint_stage TEXT,
  checkpoint_hash TEXT;
```

### Features

#### Pause & Resume
- **Checkpoint Creation**: At safe stages (review, post-chunk)
- **SHA-256 Validation**: Prevents corrupted resume
- **Graceful Fallback**: Start fresh if checkpoint invalid
- **UI Controls**: Pause/Resume buttons with validation

#### Retry System
- **Error Classification**: transient, permanent, paywall, invalid
- **Exponential Backoff**: 1min → 2min → 4min → 8min → 16min → 30min
- **Max Attempts**: 5 (configurable)
- **Auto-retry Loop**: 30-second polling

#### Progress Tracking
- **Real-time Updates**: Every 5-10 seconds
- **Detailed Status**: "Processing chunk 234 of 500"
- **Heartbeat**: Visual pulse indicator
- **Stage Progress**: 10 stages with percentages

### ProcessingDock

```typescript
// Bottom-right floating dock
interface ProcessingDock {
  visibility: 'auto-hide when admin open',
  display: 'active jobs only',
  collapse: 'mini badge mode',
  store: 'shared with admin panel'
}
```
```

---

## Phase 5: Add Cached Chunks System

### Overview
Document the cached chunks system for zero-cost reprocessing.

### Changes Required:

#### 1. New Section
**File**: `docs/ARCHITECTURE.md`
**Location**: After Job System section

```markdown
## Cached Chunks System [✅ IMPLEMENTED]

**Purpose:** Zero-cost document reprocessing by caching Docling extraction.

### Architecture

```sql
-- Migration 046: Cached Chunks Table
CREATE TABLE cached_chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents,
  extraction_mode TEXT, -- 'pdf' or 'epub'
  markdown_hash TEXT,   -- Invalidation detection
  chunks JSONB,         -- Full DoclingChunk array
  structure_metadata JSONB,
  created_at TIMESTAMPTZ
);
```

### Benefits

| Operation | With Cache | Without Cache |
|-----------|------------|---------------|
| Reprocess | 6 minutes | 25 minutes |
| Cost | $0.00 | $0.20-0.60 |
| API Calls | 0 | 50-200 |

### Usage

```typescript
// During initial processing (Stage 2)
await saveCachedChunks(documentId, doclingChunks)

// During reprocessing
const cached = await getCachedChunks(documentId)
if (cached && cached.markdown_hash === currentHash) {
  return cached.chunks // Skip extraction!
}
```
```

---

## Phase 6: Update Document Reader Architecture

### Overview
Document the current reader implementation with what's built vs planned.

### Changes Required:

#### 1. Reader Section Update
**File**: `docs/ARCHITECTURE.md`
**Location**: Update lines 495-555

```markdown
## Document Reader Architecture [90% COMPLETE]

**Current Implementation:** Virtualized scrolling with annotation support.

### VirtualizedReader Component

```typescript
// react-virtuoso for performance
interface ReaderState {
  markdown: string,              // Full document
  chunks: Chunk[],               // For tracking
  visibleChunks: string[],       // Viewport detection
  annotations: Annotation[],      // Injected inline
  scrollToChunk?: string,        // Navigation trigger
  correctionMode: boolean        // Chunk fixing
}
```

### Features Implemented

✅ **Virtual Scrolling**: react-virtuoso for 1000+ page documents
✅ **Markdown Rendering**: react-markdown + remark + KaTeX
✅ **Annotation System**: Selection → ECS persistence → Display
✅ **Text Selection**: useTextSelection hook with snapshot
✅ **Viewport Tracking**: Visible chunk detection for connections
✅ **Programmatic Navigation**: Scroll to chunk from RightPanel
✅ **Correction Mode**: Fix chunk quality issues

### Features Planned

📋 **Connection Visualization**:
- Heatmap in left margin (density)
- Inline highlights for active connections
- Connection strength gradients

### RightPanel (7 Tabs)

```typescript
interface Tabs {
  connections: 'Active connections for visible chunks',    // ✅
  annotations: 'All document annotations',                 // ✅
  quality: 'Chunk confidence metrics',                     // ✅
  sparks: 'Quick captures (placeholder)',                  // ⚠️
  cards: 'Flashcards (placeholder)',                       // ⚠️
  review: 'Annotation recovery workflow',                  // ✅
  tune: 'Engine weight configuration'                      // ✅
}
```
```

---

## Phase 7: Update Database Schema

### Overview
Add recent migrations to the schema documentation.

### Changes Required:

#### 1. Database Schema Section
**File**: `docs/ARCHITECTURE.md`
**Location**: Update lines 91-176

Add to existing schema:

```sql
-- Extended chunk metadata (Migration 047)
ALTER TABLE chunks ADD COLUMN
  heading_path TEXT[],      -- Hierarchical headings
  heading_level INTEGER,    -- Depth in tree
  section_marker TEXT,      -- EPUB sections
  chunker_type TEXT,        -- Which Chonkie strategy
  confidence TEXT;          -- high/medium/low/interpolated

-- Cached chunks (Migration 046)
CREATE TABLE cached_chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents,
  extraction_mode TEXT,
  markdown_hash TEXT,
  chunks JSONB,
  structure_metadata JSONB
);

-- Enhanced jobs (Migration 052)
ALTER TABLE background_jobs ADD COLUMN
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  checkpoint_hash TEXT,
  last_checkpoint_path TEXT,
  last_checkpoint_stage TEXT;

-- Import pending for review workflow (Migration 040)
CREATE TABLE import_pending (
  id UUID PRIMARY KEY,
  user_id UUID,
  source_type TEXT,
  title TEXT,
  author TEXT,
  raw_highlights JSONB,
  processed_data JSONB,
  import_status TEXT
);
```

---

## Phase 8: Update Implementation Status

### Overview
Update the status section to reflect current reality.

### Changes Required:

#### 1. Implementation Status
**File**: `docs/ARCHITECTURE.md`
**Location**: Lines 7-12

```markdown
**Current Status:**
- ✅ **IMPLEMENTED**: 10-stage pipeline, 3-engine detection, Storage-First portability, Job v2.0, 7 processors
- 🚧 **90% COMPLETE**: Document reader (missing connection visualization)
- 🚧 **PARTIAL**: Sparks/Cards tabs (UI only, no backend)
- 📋 **PLANNED**: Study system (FSRS), Threads
```

---

## Testing Strategy

### Verification:
1. Compare updated sections with actual code
2. Verify all file paths are correct
3. Check migration numbers are accurate
4. Ensure cost calculations are current

### Manual Review:
1. Document flows naturally
2. Technical accuracy maintained
3. Philosophy preserved
4. No contradictions introduced

## Performance Considerations
None - documentation only change

## Migration Notes
N/A - documentation update

## References
- Current ARCHITECTURE.md: `docs/ARCHITECTURE.md`
- Implementation analysis: Complete codebase review
- Migration files: `supabase/migrations/046-052`
- Worker implementation: `worker/handlers/`, `worker/engines/`
- Frontend components: `src/components/`