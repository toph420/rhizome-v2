# Spark Portability & Global Architecture - Implementation Plan

**Created**: 2025-01-21
**Status**: Ready for implementation
**Priority**: High (enables true Storage-First portability for sparks)

---

## Overview

Refactor sparks from document-scoped to user-scoped global entities with proper Storage mirroring, title-based naming, and orphan survival. Sparks should be accessible anywhere in the app (reader, library, study mode) and survive document deletion.

**Core Philosophy**: Sparks are USER-LEVEL entities (like tweets/notes), not DOCUMENT-LEVEL entities (like annotations). They can reference documents/chunks but aren't owned by them.

---

## Current State Analysis

### What Works

**4-Component ECS Pattern** (`src/lib/ecs/sparks.ts`):
- ✅ Spark component (selections, connections, recovery)
- ✅ Content component (note, tags)
- ✅ Temporal component (timestamps)
- ✅ ChunkRef component (chunk references)

**Storage-First Architecture** (`src/app/actions/sparks.ts:91-97`):
- ✅ Uploads to Storage at `{userId}/sparks/{sparkId}/content.json`
- ✅ Cache rebuild from Storage (`worker/lib/sparks/rebuild-cache.ts`)

**UI Integration**:
- ✅ Quick capture (Cmd+K) via `QuickSparkCapture.tsx`
- ✅ Sparks sidebar tab (`SparksTab.tsx`)
- ✅ Reader integration

### What's Broken

**1. Document-Scoped Thinking** (Architecture Mismatch):
```
Current vault export:
Documents/{title}/.rhizome/sparks.json  ❌ Wrong! Implies sparks belong to document

Should be:
Rhizome/Sparks/{date}-spark-{title}.json  ✅ Global user-level
```

**2. Cascade Deletion** (`supabase/migrations/054_create_sparks_cache.sql:25-26`):
```sql
-- Current: Sparks cascade when document deleted
document_id UUID REFERENCES documents(id) ON DELETE CASCADE  ❌

-- Should: Sparks survive with SET NULL
document_id UUID REFERENCES documents(id) ON DELETE SET NULL  ✅
```

**3. Storage Naming** (`src/app/actions/sparks.ts:113`):
```typescript
// Current: UUID-based, not human-readable
{userId}/sparks/{sparkId}/content.json  ❌

// Should: Date + title based
{userId}/sparks/{date}-spark-{title}.json  ✅
```

**4. Missing Title Field**:
- Sparks have no title, only content
- Can't create meaningful filenames for vault/Storage
- Need AI-generated title if user doesn't provide

**5. Required ChunkRef** (`src/lib/ecs/components.ts:71-92`):
- ChunkRef requires `documentId`, `chunkId`
- But sparks can be created globally (no document context)
- Should be optional

### Key Discoveries

**Storage CASCADE Issue** (`src/app/actions/delete-document.ts:113-143`):
- Document deletion manually deletes entities by querying JSONB field
- Cache automatically cascades via FK constraint
- **BUT** Storage files are orphaned (not cleaned up)

**Vault Export Mismatch** (`worker/handlers/obsidian-sync.ts:243-256`):
- Current: Exports to `Documents/{title}/.rhizome/sparks.json`
- Should: Export to global `Rhizome/Sparks/` folder
- Pattern exists in Phase 2 plan but not implemented

**ZIP Export Gap** (`worker/handlers/export-document.ts:77-107`):
- Only exports documents, not sparks
- Should export full backup (all docs + all sparks)

---

## Desired End State

### Storage Structure
```
{userId}/
├── {documentId}/              # Documents stay flat (no change)
│   ├── chunks.json
│   ├── metadata.json
│   └── source.pdf
└── sparks/                    # Sparks use date-title naming
    ├── 2025-01-20-spark-privacy-concerns.json
    ├── 2025-01-20-spark-architecture-insight.json
    └── 2025-01-19-spark-deleuze-connection.json
```

### Vault Structure
```
Rhizome/
├── Documents/{title}/
│   ├── {title}.md
│   ├── {title} - Highlights.md
│   └── .rhizome/
│       ├── chunks.json
│       └── metadata.json
└── Sparks/                    # ✨ Global sparks folder
    ├── 2025-01-20-spark-privacy-concerns.md    # Readable
    ├── 2025-01-20-spark-privacy-concerns.json  # Portable
    ├── 2025-01-20-spark-architecture-insight.md
    └── 2025-01-20-spark-architecture-insight.json
```

### ZIP Export Structure
```
export-2025-01-21.zip/
├── documents/
│   ├── {documentId}/
│   │   ├── chunks.json
│   │   └── metadata.json
│   └── {documentId}/
│       └── ...
├── sparks/
│   ├── 2025-01-20-spark-privacy-concerns.json
│   └── 2025-01-20-spark-architecture-insight.json
└── manifest.json
```

### Orphaned Spark UI
```tsx
{spark.documentId === null && spark.documentTitle && (
  <Alert variant="warning">
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>
      Original document "{spark.documentTitle}" was deleted.
      <Button onClick={() => relinkSpark(spark.id)}>
        Re-link to a document
      </Button>
    </AlertDescription>
  </Alert>
)}
```

---

## Rhizome Architecture

**Module**: Both
- Main App: UI components, Server Actions, title generation
- Worker: Vault export/import, ZIP export, cache rebuild

**Storage**: Both
- Database: ECS entities (source for queries)
- Storage: JSON files (source of truth for portability)
- **NEW**: Storage paths match vault naming for consistency

**Migration**: Yes - `062_spark_portability_orphan_survival.sql`
- Fix CASCADE to SET NULL for document_id and chunk_id
- Add denormalized documentTitle to components for orphan detection

**Test Tier**: Stable (fix when broken)
- Manual testing: Create spark, delete document, verify survival
- Manual testing: Vault round-trip, ZIP export/import

**Pipeline Impact**: None (data portability only)

**Connection Engines**: None (data structure changes only)

---

## What We're NOT Doing

**Out of Scope** (to prevent scope creep):

1. ❌ **Restructure Document Storage** - Documents stay at `{userId}/{documentId}/`
   - Only sparks get new structure
   - Avoids massive migration

2. ❌ **Migrate Existing Sparks** - Start fresh after refactor
   - User confirmed: "We don't need migration, we'll start fresh"
   - Clean slate for testing

3. ❌ **Auto-sync Vault** - Manual export/import only
   - File watchers, polling = complexity
   - Keep it simple

4. ❌ **Spark Embeddings** - Defer to later
   - Cache has `embedding` field (nullable)
   - Can generate in background job later

5. ❌ **Daily Notes Format** - User has own daily notes
   - Can't use `YYYY-MM-DD.md` (naming conflict)
   - Use `{date}-spark-{title}.md` instead

---

## Implementation Approach

### High-Level Strategy

**Incremental, testable phases**:
1. Fix database cascade (sparks survive deletion)
2. Add title generation (AI-powered with fallback)
3. Make ChunkRef optional (sparks from anywhere)
4. Restructure Storage paths (date-title naming)
5. Update vault export (global Sparks/ folder)
6. Update ZIP export (full backup)
7. Update vault import (global location)

**Backward Compatibility**:
- No migration of existing sparks
- New sparks use new structure
- Old sparks can be cleaned up manually

---

## Phase 1: Database Schema - Orphan Survival

### Overview
Fix CASCADE deletion so sparks survive when documents/chunks are deleted. Add denormalized documentTitle for orphan detection UI.

### Changes Required

#### 1. Migration 062: Spark Portability

**File**: `supabase/migrations/062_spark_portability_orphan_survival.sql` (NEW)
**Changes**: Fix FK constraints, add denormalized field

```sql
-- Migration 062: Spark portability and orphan survival
-- Sparks should survive document/chunk deletion with SET NULL

-- Fix cascade deletion for components.document_id
ALTER TABLE components
DROP CONSTRAINT IF EXISTS components_document_id_fkey;

ALTER TABLE components
ADD CONSTRAINT components_document_id_fkey
FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT components_document_id_fkey ON components IS
  'SET NULL allows sparks to survive document deletion (orphaned state).
   Spark entities remain queryable with document_id=NULL for re-linking.';

-- Fix cascade deletion for components.chunk_id
ALTER TABLE components
DROP CONSTRAINT IF EXISTS components_chunk_id_fkey;

ALTER TABLE components
ADD CONSTRAINT components_chunk_id_fkey
FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT components_chunk_id_fkey ON components IS
  'SET NULL preserves sparks when chunks are reprocessed.
   Spark content and selections survive chunk regeneration.';

-- Note: sparks_cache already has SET NULL (migrations 054, lines 25-26)
-- No changes needed for cache table
```

**Implementation Note**: Components use JSONB `data` field, so we can add `documentTitle` to ChunkRef component data without schema change.

### Success Criteria

#### Automated Verification:
- [x] Migration applies: `npx supabase db reset`
- [x] Type check: `npm run build` (no new errors)
- [x] Constraints exist: Query `pg_constraint` for `ON DELETE SET NULL`

#### Manual Verification:
- [ ] Create spark referencing document
- [ ] Delete document
- [ ] Verify spark entity still exists with `document_id=NULL`
- [ ] Verify cache row updated with `document_id=NULL`

**Implementation Note**: Pause after automated verification. Test delete-document flow before proceeding.

### Service Restarts:
- [ ] Supabase: `npx supabase db reset` (schema changes)
- [ ] Worker: No restart needed (no code changes yet)
- [ ] Next.js: No restart needed (no code changes yet)

---

## Phase 2: Component Schema - Optional ChunkRef & Document Title

### Overview
Make ChunkRef component optional (sparks can be created without document context). Add denormalized `documentTitle` to ChunkRef for orphan detection.

### Changes Required

#### 1. Update ChunkRefComponent Type

**File**: `src/lib/ecs/components.ts`
**Changes**: Make all fields optional, add `documentTitle`

```typescript
// Update existing interface (around line 71-92)
export interface ChunkRefComponent {
  // ALL FIELDS NOW OPTIONAL (sparks can be created without context)
  documentId?: string | null,        // Optional document reference
  document_id?: string | null,       // Optional for ECS filtering
  documentTitle?: string | null,     // ✨ NEW: Denormalized for orphan detection
  chunkId?: string | null,          // Optional chunk reference
  chunk_id?: string | null,         // Optional for ECS filtering
  chunkIds?: string[],              // Optional array
  chunkPosition?: number,           // Optional position
  hasSelections?: boolean,          // Optional flag
}
```

#### 2. Update SparkOperations.create

**File**: `src/lib/ecs/sparks.ts`
**Changes**: Make ChunkRef optional in create method

```typescript
// Update create method (around line 92-129)
async create(input: CreateSparkInput): Promise<string> {
  const now = new Date().toISOString();
  const selections = input.selections || [];
  const hasSelections = selections.length > 0;

  const chunkHash = input.originChunkContent
    ? createHash('sha256').update(input.originChunkContent).digest('hex')
    : undefined;

  // Build components object
  const components: Record<string, any> = {
    Spark: {
      title: input.title || 'Untitled',  // ✨ NEW: Title field
      selections,
      connections: input.connections,
      originalChunkContent: input.originChunkContent?.slice(0, 500),
      originalChunkHash: chunkHash,
    },
    Content: {
      note: input.content,
      tags: input.tags || [],
    },
    Temporal: {
      createdAt: now,
      updatedAt: now,
    },
  };

  // ✨ NEW: Only add ChunkRef if context provided
  if (input.documentId || input.chunkId) {
    components.ChunkRef = {
      documentId: input.documentId || null,
      document_id: input.documentId || null,
      documentTitle: input.documentTitle || null,  // ✨ NEW: Denormalized
      chunkId: input.chunkId || null,
      chunk_id: input.chunkId || null,
      chunkIds: input.chunkIds || (input.chunkId ? [input.chunkId] : []),
      chunkPosition: hasSelections ? selections[0].startOffset : 0,
      hasSelections,
    };
  }

  const entityId = await this.ecs.createEntity(this.userId, components);
  return entityId;
}
```

#### 3. Update CreateSparkInput

**File**: `src/lib/ecs/sparks.ts`
**Changes**: Add title field, make context optional

```typescript
// Update interface (around line 26-47)
export interface CreateSparkInput {
  /** Spark title (auto-generated if not provided) */
  title?: string;

  /** User's spark thought/note */
  content: string;

  /** Text selections (can be empty array for thought-only sparks) */
  selections?: SparkSelection[];

  /** Tags extracted from content */
  tags?: string[];

  /** Chunk connections */
  connections: SparkConnection[];

  // ✨ ALL CONTEXT FIELDS NOW OPTIONAL
  /** Primary/origin chunk ID */
  chunkId?: string | null;

  /** All visible chunk IDs */
  chunkIds?: string[];

  /** Document ID */
  documentId?: string | null;

  /** Document title (denormalized for orphan detection) */
  documentTitle?: string | null;

  /** First 500 chars of origin chunk content (for recovery) */
  originChunkContent?: string;
}
```

#### 4. Update SparkComponent

**File**: `src/lib/ecs/components.ts`
**Changes**: Add title field

```typescript
// Update interface (around line 142-167)
export interface SparkComponent {
  title?: string;  // ✨ NEW: Human-readable title

  selections: SparkSelection[];
  connections: SparkConnection[];
  annotationRefs?: string[];
  orphaned?: boolean;
  recoveryConfidence?: number;
  recoveryMethod?: 'selections' | 'semantic' | 'context' | 'orphaned';
  needsReview?: boolean;
  originalChunkContent?: string;
  originalChunkHash?: string;
}
```

### Success Criteria

#### Automated Verification:
- [x] Type check: `npx tsc --noEmit src/lib/ecs/components.ts src/lib/ecs/sparks.ts` ✅
- [ ] Unit tests pass: `npm test src/lib/ecs/__tests__/sparks.test.ts`

#### Manual Verification:
- [ ] Create spark WITH document context (reader)
- [ ] Create spark WITHOUT document context (global capture)
- [ ] Both save successfully to database
- [ ] ChunkRef component present/absent as expected

**Implementation Note**: Test both code paths (with/without context) before proceeding.

### Service Restarts:
- [ ] Next.js: Verify auto-reload (type changes)

---

## Phase 3: AI Title Generation

### Overview
Add AI-powered title generation using Gemini 2.0 Flash via Vercel AI SDK. Fallback to first 3 words if AI fails.

### Changes Required

#### 1. Title Generator Utility

**File**: `src/lib/sparks/title-generator.ts` (NEW)
**Changes**: AI-powered title with fallback

```typescript
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

export async function generateSparkTitle(content: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: google('gemini-2.0-flash-exp'),
      prompt: `Generate a concise 3-5 word title for this thought (lowercase, no punctuation):

"${content.slice(0, 200)}"

Return ONLY the title, nothing else.`,
      maxTokens: 20,
    })

    return slugify(text.trim().toLowerCase())
  } catch (error) {
    console.warn('[Sparks] AI title generation failed, using fallback:', error)
    // Fallback: first 3 words
    const words = content.trim().split(/\s+/).slice(0, 3)
    return slugify(words.join(' '))
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)  // Max 50 chars
}

export function generateSparkFilename(title: string): string {
  const date = new Date().toISOString().split('T')[0]  // YYYY-MM-DD
  return `${date}-spark-${slugify(title)}.json`
}
```

#### 2. Update createSpark Action

**File**: `src/app/actions/sparks.ts`
**Changes**: Generate title if not provided, use in Storage path

```typescript
import { generateSparkTitle, generateSparkFilename } from '@/lib/sparks/title-generator'

export async function createSpark(input: CreateSparkInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()

  // 1. Generate title if not provided
  const title = input.title || await generateSparkTitle(input.content)

  // 2. Get document title if documentId provided (for denormalization)
  let documentTitle: string | undefined
  if (input.context?.documentId) {
    const { data: doc } = await supabase
      .from('documents')
      .select('title')
      .eq('id', input.context.documentId)
      .single()
    documentTitle = doc?.title
  }

  // 3. Create ECS entity with OPTIONAL ChunkRef
  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  const sparkId = await ops.create({
    title,
    content: input.content,
    selections: input.selections || [],
    tags: extractTags(input.content),
    connections: input.context?.originChunkId
      ? await buildSparkConnections(input.content, input.context.originChunkId, user.id)
      : [],
    // Optional fields (only if context provided)
    chunkId: input.context?.originChunkId,
    chunkIds: input.context?.visibleChunks,
    documentId: input.context?.documentId,
    documentTitle,  // Denormalized for orphan detection
    originChunkContent: input.context?.originChunkId
      ? await getChunkContent(input.context.originChunkId)
      : undefined,
  })

  // 4. Generate filename with title
  const filename = generateSparkFilename(title)

  // 5. Build Storage JSON (same as before)
  const sparkData = {
    entity_id: sparkId,
    user_id: user.id,
    component_type: 'spark',
    title,  // Include title
    data: {
      content: input.content,
      createdAt: new Date().toISOString(),
      tags: extractTags(input.content),
      connections: [],
      selections: input.selections || [],
    },
    context: input.context || null,
    source: input.context ? {
      chunk_id: input.context.originChunkId,
      document_id: input.context.documentId,
    } : null,
  }

  // 6. Upload to Storage with NEW naming convention
  try {
    await supabase.storage
      .from('documents')
      .upload(`${user.id}/sparks/${filename}`, JSON.stringify(sparkData, null, 2), {
        contentType: 'application/json',
      })
  } catch (error) {
    console.error('[Sparks] Storage upload failed:', error)
  }

  // 7. Update cache (include new path)
  try {
    await supabase.from('sparks_cache').insert({
      entity_id: sparkId,
      user_id: user.id,
      content: input.content,
      created_at: new Date().toISOString(),
      origin_chunk_id: input.context?.originChunkId || null,
      document_id: input.context?.documentId || null,
      tags: extractTags(input.content),
      storage_path: `${user.id}/sparks/${filename}`,  // NEW path
      cached_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Sparks] Cache update failed:', error)
  }

  revalidatePath('/sparks')
  if (input.context?.documentId) {
    revalidatePath(`/read/${input.context.documentId}`)
  }

  return { success: true, sparkId, title }
}
```

### Success Criteria

#### Automated Verification:
- [x] Type check: `npm run build` ✅
- [x] No TypeScript errors ✅

#### Manual Verification:
- [ ] Create spark without title
- [ ] Verify AI-generated title in response
- [ ] Check Storage file named correctly
- [ ] Create spark with very long content
- [ ] Verify title is ≤50 chars

**Implementation Note**: Test AI generation with various content lengths. Verify fallback works when Gemini fails.

### Service Restarts:
- [ ] Next.js: Verify auto-reload

---

## Phase 4: Vault Export - Global Sparks Folder

### Overview
Export all user sparks to global `Rhizome/Sparks/` folder with both Markdown (readable) and JSON (portable) formats.

### Changes Required

#### 1. Update Vault Export for Sparks

**File**: `worker/lib/vault-export-sparks.ts`
**Changes**: Export to global location with dual format

```typescript
import { promises as fs } from 'fs'
import * as path from 'path'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Export ALL user sparks to global Rhizome/Sparks/ folder
 * Creates both .md (readable) and .json (portable) files
 */
export async function exportSparksToVault(
  userId: string,
  vaultPath: string,
  supabase: SupabaseClient
): Promise<{ exported: number }> {
  const sparksDir = path.join(vaultPath, 'Rhizome/Sparks')
  await fs.mkdir(sparksDir, { recursive: true })

  // List all spark files in Storage
  const { data: sparkFiles } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks/`)

  if (!sparkFiles || sparkFiles.length === 0) {
    console.log('[ExportSparks] No sparks to export')
    return { exported: 0 }
  }

  let exported = 0

  for (const file of sparkFiles) {
    if (!file.name.endsWith('.json')) continue

    try {
      // Download JSON from Storage
      const { data: blob } = await supabase.storage
        .from('documents')
        .download(`${userId}/sparks/${file.name}`)

      const sparkData = JSON.parse(await blob.text())

      // Write JSON to vault (portable format)
      await fs.writeFile(
        path.join(sparksDir, file.name),
        JSON.stringify(sparkData, null, 2)
      )

      // Generate and write Markdown (readable format)
      const markdown = generateSparkMarkdown(sparkData)
      const mdFilename = file.name.replace('.json', '.md')
      await fs.writeFile(
        path.join(sparksDir, mdFilename),
        markdown
      )

      exported++
    } catch (error) {
      console.error(`[ExportSparks] Failed to export ${file.name}:`, error)
    }
  }

  console.log(`[ExportSparks] ✓ Exported ${exported} sparks`)
  return { exported }
}

function generateSparkMarkdown(sparkData: any): string {
  const components = sparkData.components || {}
  const spark = components.Spark?.data || {}
  const content = components.Content?.data || {}
  const temporal = components.Temporal?.data || {}
  const chunkRef = components.ChunkRef?.data || {}

  let md = `# ${spark.title || 'Untitled Spark'}\n\n`
  md += `**Created**: ${new Date(temporal.createdAt).toLocaleDateString()}\n`

  if (content.tags && content.tags.length > 0) {
    md += `**Tags**: ${content.tags.map(t => `#${t}`).join(' ')}\n`
  }

  if (chunkRef.documentTitle) {
    md += `**From**: [[${chunkRef.documentTitle}]]\n`
  }

  md += `\n---\n\n`
  md += `${content.note}\n\n`

  if (spark.selections && spark.selections.length > 0) {
    md += `## Selections\n\n`
    spark.selections.forEach((sel: any) => {
      md += `> "${sel.text}"\n\n`
      if (chunkRef.documentTitle) {
        md += `*From [[${chunkRef.documentTitle}]]*\n\n`
      }
    })
  }

  return md
}
```

#### 2. Remove Per-Document Spark Export

**File**: `worker/handlers/obsidian-sync.ts`
**Changes**: Remove sparks.json from document folders

```typescript
// Delete these lines (around 243-256):
// if (exportSparksJson) {
//   const sparksJsonPath = path.join(docFolderPath, '.rhizome', 'sparks.json')
//   await fs.writeFile(sparksJsonPath, sparksJson, 'utf-8')
// }

// Sparks are now exported globally, not per-document
```

#### 3. Add Job Handler for Global Spark Export

**File**: `worker/index.ts`
**Changes**: Register new job handler for exporting all sparks

```typescript
// Add to JOB_HANDLERS map (around line 62+)
'export_vault_sparks': async (supabase: any, job: any) => {
  const { userId, vaultPath } = job.input_data

  // Import the function
  const { exportSparksToVault } = await import('./lib/vault-export-sparks.js')

  const result = await exportSparksToVault(userId, vaultPath, supabase)

  await supabase
    .from('background_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      output_data: {
        success: true,
        sparksExported: result.exported,
        location: 'Rhizome/Sparks/'
      }
    })
    .eq('id', job.id)
},
```

**Usage**: Trigger from Admin Panel or when doing full vault export:

```typescript
// In Admin Panel IntegrationsTab or similar
await supabase.from('background_jobs').insert({
  job_type: 'export_vault_sparks',
  user_id: userId,
  input_data: {
    userId: userId,
    vaultPath: settings.vaultPath
  },
  status: 'pending'
})
```

### Success Criteria

#### Automated Verification:
- [x] Type check: `npm run type-check` (worker) ✅
- [x] Build succeeds: `cd worker && npm run build` ✅

#### Manual Verification:
- [ ] Export to vault
- [ ] Verify `Rhizome/Sparks/` folder exists
- [ ] Verify both `.md` and `.json` files for each spark
- [ ] Open `.md` in Obsidian (readable)
- [ ] Verify wikilinks work: `[[Document Title]]`
- [ ] Check `.json` has complete ECS data

**Implementation Note**: Test with 3-5 sparks. Verify Markdown format renders nicely in Obsidian.

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`

---

## Phase 5: Vault Import - Global Sparks Location

### Overview
Import sparks from global `Rhizome/Sparks/` folder, upload to Storage with date-title naming, populate cache.

### Changes Required

#### 1. Update Vault Import for Sparks

**File**: `worker/lib/vault-import-sparks.ts`
**Changes**: Import from global location, convert to Storage format

```typescript
import { promises as fs } from 'fs'
import * as path from 'path'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Import sparks from global Rhizome/Sparks/ location
 * Uploads to Storage with date-title naming, populates cache
 */
export async function importSparksFromVault(
  vaultPath: string,
  userId: string,
  supabase: SupabaseClient
): Promise<{ imported: number; errors: string[] }> {
  const sparksDir = path.join(vaultPath, 'Rhizome/Sparks')

  // Check if directory exists
  try {
    await fs.access(sparksDir)
  } catch {
    console.log('[ImportSparks] No sparks directory in vault')
    return { imported: 0, errors: [] }
  }

  const files = await fs.readdir(sparksDir)
  const jsonFiles = files.filter(f => f.endsWith('.json'))

  let imported = 0
  const errors: string[] = []

  for (const file of jsonFiles) {
    try {
      const sparkData = JSON.parse(
        await fs.readFile(path.join(sparksDir, file), 'utf-8')
      )

      // Create ECS components
      const { error: entityError } = await supabase
        .from('entities')
        .insert({
          id: sparkData.entity_id,
          user_id: userId,
          entity_type: 'spark'
        })

      if (entityError) {
        errors.push(`Failed to create entity ${sparkData.entity_id}: ${entityError.message}`)
        continue
      }

      // Insert components (Spark, Content, Temporal, ChunkRef if present)
      const components = sparkData.components || {}

      if (components.Spark) {
        await supabase.from('components').insert({
          entity_id: sparkData.entity_id,
          component_type: 'Spark',
          data: components.Spark.data
        })
      }

      if (components.Content) {
        await supabase.from('components').insert({
          entity_id: sparkData.entity_id,
          component_type: 'Content',
          data: components.Content.data
        })
      }

      if (components.Temporal) {
        await supabase.from('components').insert({
          entity_id: sparkData.entity_id,
          component_type: 'Temporal',
          data: components.Temporal.data
        })
      }

      if (components.ChunkRef) {
        await supabase.from('components').insert({
          entity_id: sparkData.entity_id,
          component_type: 'ChunkRef',
          document_id: components.ChunkRef.data.documentId || null,
          chunk_id: components.ChunkRef.data.chunkId || null,
          data: components.ChunkRef.data
        })
      }

      // Upload to Storage (use original filename from vault)
      await supabase.storage
        .from('documents')
        .upload(`${userId}/sparks/${file}`, JSON.stringify(sparkData, null, 2), {
          contentType: 'application/json',
          upsert: true
        })

      // Update cache
      await supabase.from('sparks_cache').insert({
        entity_id: sparkData.entity_id,
        user_id: userId,
        content: components.Content?.data.note || '',
        created_at: components.Temporal?.data.createdAt,
        updated_at: components.Temporal?.data.updatedAt,
        origin_chunk_id: components.ChunkRef?.data.chunkId || null,
        document_id: components.ChunkRef?.data.documentId || null,
        tags: components.Content?.data.tags || [],
        storage_path: `${userId}/sparks/${file}`,
        cached_at: new Date().toISOString()
      })

      imported++
    } catch (error) {
      errors.push(`Failed to import ${file}: ${error}`)
    }
  }

  console.log(`[ImportSparks] ✓ Imported ${imported} sparks, ${errors.length} errors`)
  return { imported, errors }
}
```

#### 2. Update Import-from-Vault Handler

**File**: `worker/handlers/import-from-vault.ts`
**Changes**: Remove per-document spark import

```typescript
// Remove per-document spark import (around lines 341-344)
// COMPLETED: Removed in implementation

// NOTE: Sparks are now imported globally from Rhizome/Sparks/, not per-document
// Per-document spark import removed - sparks are user-level entities
// See: worker/lib/vault-import-sparks.ts for global import
let sparksResult = { imported: 0, recovered: 0 }
```

#### 3. Add Job Handler for Global Spark Import

**File**: `worker/index.ts`
**Changes**: Register new job handler for importing all sparks

```typescript
// Add to JOB_HANDLERS map (around line 62+)
'import_vault_sparks': async (supabase: any, job: any) => {
  const { userId, vaultPath } = job.input_data

  // Import the function
  const { importSparksFromVault } = await import('./lib/vault-import-sparks.js')

  const result = await importSparksFromVault(vaultPath, userId, supabase)

  await supabase
    .from('background_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      output_data: {
        success: true,
        sparksImported: result.imported,
        errors: result.errors,
        location: 'Rhizome/Sparks/'
      }
    })
    .eq('id', job.id)
},
```

**Usage**: Trigger from Admin Panel or when doing full vault import:

```typescript
// In Admin Panel IntegrationsTab or similar
await supabase.from('background_jobs').insert({
  job_type: 'import_vault_sparks',
  user_id: userId,
  input_data: {
    userId: userId,
    vaultPath: settings.vaultPath
  },
  status: 'pending'
})
```

### Success Criteria

#### Automated Verification:
- [x] Type check: Removed per-document imports ✅
- [x] Build succeeds: Code updated without errors ✅

#### Manual Verification:
- [ ] Export sparks to vault
- [ ] Delete sparks from database (keep vault files)
- [ ] Import from vault (via global mechanism)
- [ ] Verify sparks in database with correct entity_type
- [ ] Verify Storage files at `{userId}/sparks/{date}-spark-{title}.json`
- [ ] Verify cache populated

**Implementation Note**: Test round-trip (export → delete → import). Verify all data preserved.

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`

---

## Phase 6: ZIP Export - Full Backup

### Overview
Update ZIP export to include all documents AND all sparks (full user backup).

### Changes Required

#### 1. Add Sparks to ZIP Export

**File**: `worker/handlers/export-document.ts`
**Changes**: Add sparks folder to ZIP

```typescript
/**
 * Export all user documents + sparks to ZIP (full backup)
 */
export async function exportUserToZip(
  userId: string,
  supabase: SupabaseClient
): Promise<{ zipBlob: Blob; filename: string }> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // 1. Export all documents (existing code)
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, storage_path')
    .eq('user_id', userId)

  const docsFolder = zip.folder('documents')

  for (const doc of docs || []) {
    const docFolder = docsFolder!.folder(doc.id)

    // Download all files for this document
    const files = ['chunks.json', 'metadata.json', 'manifest.json', 'content.md']

    for (const file of files) {
      try {
        const { data } = await supabase.storage
          .from('documents')
          .download(`${doc.storage_path}/${file}`)

        docFolder!.file(file, await data.text())
      } catch (error) {
        console.warn(`[Export] Missing ${file} for ${doc.id}`)
      }
    }
  }

  // 2. Export all sparks (NEW)
  const sparksFolder = zip.folder('sparks')

  const { data: sparkFiles } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks/`)

  for (const file of sparkFiles || []) {
    if (!file.name.endsWith('.json')) continue

    try {
      const { data } = await supabase.storage
        .from('documents')
        .download(`${userId}/sparks/${file.name}`)

      sparksFolder!.file(file.name, await data.text())
    } catch (error) {
      console.warn(`[Export] Failed to export spark ${file.name}`)
    }
  }

  // 3. Add manifest
  const manifest = {
    export_date: new Date().toISOString(),
    document_count: docs?.length || 0,
    spark_count: sparkFiles?.length || 0,
    version: '2.0',
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  // 4. Generate ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `rhizome-backup-${timestamp}.zip`

  return { zipBlob, filename }
}
```

#### 2. Update Export Handler Registration

**File**: `worker/index.ts`
**Changes**: Register full backup handler

```typescript
// Add to JOB_HANDLERS map
'export_user_backup': exportUserToZip,
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check` (worker)
- [ ] Build succeeds: `cd worker && npm run build`

#### Manual Verification:
- [ ] Trigger full export
- [ ] Download ZIP
- [ ] Extract and verify structure:
  ```
  rhizome-backup-2025-01-21.zip/
  ├── documents/
  │   └── {docId}/
  ├── sparks/
  │   ├── 2025-01-20-spark-title.json
  │   └── 2025-01-21-spark-title.json
  └── manifest.json
  ```
- [ ] Verify manifest.json has `spark_count`

**Implementation Note**: Test with 2-3 documents and 2-3 sparks. Verify complete backup.

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`

---

## Job Handler Integration & Usage ✅

This section shows how to integrate and use the spark import/export job handlers in practice.

### Adding Job Handlers to Worker ✅

**File**: `worker/index.ts`

Add both job handlers to the `JOB_HANDLERS` map:

```typescript
const JOB_HANDLERS: Record<string, JobHandler> = {
  // ... existing handlers

  // Spark vault export (Phase 4)
  'export_vault_sparks': async (supabase: any, job: any) => {
    const { userId, vaultPath } = job.input_data

    const { exportSparksToVault } = await import('./lib/vault-export-sparks.js')
    const result = await exportSparksToVault(userId, vaultPath, supabase)

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: {
          success: true,
          sparksExported: result.exported,
          location: 'Rhizome/Sparks/'
        }
      })
      .eq('id', job.id)
  },

  // Spark vault import (Phase 5)
  'import_vault_sparks': async (supabase: any, job: any) => {
    const { userId, vaultPath } = job.input_data

    const { importSparksFromVault } = await import('./lib/vault-import-sparks.js')
    const result = await importSparksFromVault(vaultPath, userId, supabase)

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: {
          success: true,
          sparksImported: result.imported,
          errors: result.errors,
          location: 'Rhizome/Sparks/'
        }
      })
      .eq('id', job.id)
  },
}
```

### UI Integration in Admin Panel ✅

**File**: `src/components/admin/tabs/IntegrationsTab.tsx`

Add buttons to trigger spark import/export:

```typescript
// Export sparks to vault
async function handleExportSparks() {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('obsidian_vault_path')
    .single()

  if (!settings?.obsidian_vault_path) {
    toast.error('Obsidian vault path not configured')
    return
  }

  const { error } = await supabase.from('background_jobs').insert({
    job_type: 'export_vault_sparks',
    user_id: user.id,
    input_data: {
      userId: user.id,
      vaultPath: settings.obsidian_vault_path
    },
    status: 'pending'
  })

  if (error) {
    toast.error(`Failed to start export: ${error.message}`)
  } else {
    toast.success('Spark export started - check Jobs tab')
  }
}

// Import sparks from vault
async function handleImportSparks() {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('obsidian_vault_path')
    .single()

  if (!settings?.obsidian_vault_path) {
    toast.error('Obsidian vault path not configured')
    return
  }

  const { error } = await supabase.from('background_jobs').insert({
    job_type: 'import_vault_sparks',
    user_id: user.id,
    input_data: {
      userId: user.id,
      vaultPath: settings.obsidian_vault_path
    },
    status: 'pending'
  })

  if (error) {
    toast.error(`Failed to start import: ${error.message}`)
  } else {
    toast.success('Spark import started - check Jobs tab')
  }
}
```

### Workflow Examples

**Full Vault Sync Workflow**:
```typescript
// 1. Export all documents to vault (existing)
await triggerObsidianExport()

// 2. Export all sparks to vault (NEW)
await handleExportSparks()

// 3. User edits in Obsidian...

// 4. Import documents from vault (existing)
await triggerVaultImport()

// 5. Import sparks from vault (NEW)
await handleImportSparks()
```

**Backup & Restore Workflow**:
```typescript
// Backup
// 1. Export to vault (documents + sparks)
await handleExportSparks()

// 2. Create ZIP backup (includes sparks)
await handleZipExport()

// Restore
// 1. Extract ZIP
// 2. Import from vault (documents + sparks)
await handleImportSparks()
```

### Job Type Registry

Update your job type constants/types:

```typescript
// In types or constants file
export type JobType =
  | 'process_document'
  | 'detect_connections'
  | 'obsidian_export'
  | 'obsidian_sync'
  | 'export_vault_sparks'    // NEW
  | 'import_vault_sparks'    // NEW
  | 'readwise_import'
  // ... other job types
```

### Migration 063: Add Job Types (Optional)

If you have job type validation in the database:

```sql
-- Migration 063: Add spark vault job types
ALTER TABLE background_jobs
DROP CONSTRAINT IF EXISTS background_jobs_job_type_check;

ALTER TABLE background_jobs
ADD CONSTRAINT background_jobs_job_type_check
CHECK (job_type IN (
  'process_document',
  'detect_connections',
  'obsidian_export',
  'obsidian_sync',
  'export_vault_sparks',
  'import_vault_sparks',
  'readwise_import',
  -- ... other job types
));
```

---

## Testing Strategy

### Unit Tests

**Spark Title Generation** (`src/lib/sparks/__tests__/title-generator.test.ts`):
```typescript
describe('generateSparkTitle', () => {
  it('generates title via AI', async () => {
    const title = await generateSparkTitle('Privacy concerns in modern surveillance...')
    expect(title).toMatch(/^[a-z0-9-]+$/)
    expect(title.length).toBeLessThanOrEqual(50)
  })

  it('falls back to first 3 words on AI failure', async () => {
    // Mock AI failure
    const title = await generateSparkTitle('This is a test spark')
    expect(title).toBe('this-is-a')
  })
})
```

**Optional ChunkRef** (`src/lib/ecs/__tests__/sparks.test.ts`):
```typescript
describe('SparkOperations', () => {
  it('creates spark without context', async () => {
    const sparkId = await ops.create({
      title: 'Global Thought',
      content: 'Random idea...',
      selections: [],
      tags: [],
      connections: [],
      // No chunkId, documentId, etc.
    })

    const entity = await ecs.getEntity(sparkId, userId)
    const chunkRef = entity.components?.find(c => c.component_type === 'ChunkRef')
    expect(chunkRef).toBeUndefined()  // No ChunkRef component
  })
})
```

### Integration Tests

**Document Deletion Survival** (`worker/__tests__/spark-orphan-survival.test.ts`):
```typescript
describe('Spark Orphan Survival', () => {
  it('spark survives document deletion', async () => {
    // Create spark linked to document
    const sparkId = await createSpark({ documentId: 'doc-123', ... })

    // Delete document
    await supabase.from('documents').delete().eq('id', 'doc-123')

    // Verify spark still exists with document_id=NULL
    const { data: entity } = await supabase
      .from('entities')
      .select('*')
      .eq('id', sparkId)
      .single()

    expect(entity).toBeDefined()

    const { data: chunkRef } = await supabase
      .from('components')
      .select('data')
      .eq('entity_id', sparkId)
      .eq('component_type', 'ChunkRef')
      .single()

    expect(chunkRef.data.documentId).toBeNull()
    expect(chunkRef.data.documentTitle).toBe('Test Document')  // Preserved!
  })
})
```

### Manual Testing

**Complete Round-Trip**:
1. Create 3 sparks (1 global, 2 with document context)
2. Export to vault → Verify `Rhizome/Sparks/` has 3 files (.md + .json)
3. Export to ZIP → Verify `sparks/` folder has 3 .json files
4. Delete 1 spark from database
5. Import from vault → Verify spark restored
6. Delete document → Verify spark survives
7. Check UI → Verify orphan warning shows

**Storage Consistency**:
1. Create spark "My Great Idea"
2. Verify Storage file: `{userId}/sparks/2025-01-21-spark-my-great-idea.json`
3. Verify cache: `storage_path` matches
4. Verify vault: `Rhizome/Sparks/2025-01-21-spark-my-great-idea.{md,json}`

---

## Performance Considerations

**AI Title Generation**: ~100-200ms per spark
- Use Gemini 2.0 Flash (fast model)
- Fallback is instant (no API call)
- Non-blocking for user (happens server-side)

**Storage Path Changes**: No migration needed
- New sparks use new paths
- Old sparks stay at old paths (can coexist)
- Eventually clean up old sparks manually

**Vault Export**: Scales linearly with spark count
- Batch in groups of 10 (existing pattern)
- ~50ms per spark (file write)
- 100 sparks = ~5 seconds

---

## Migration Notes

### Data Migration Strategy

**NO automatic migration** (user confirmed):
- New sparks use new structure
- Old sparks can be manually deleted
- Fresh start for testing

**If migration needed later**:
```sql
-- Script to migrate old sparks to new Storage paths
-- Run in worker background job

WITH old_sparks AS (
  SELECT
    e.id as entity_id,
    c1.data->>'note' as content,
    c2.data->>'createdAt' as created_at,
    sc.storage_path as old_path
  FROM entities e
  JOIN components c1 ON c1.entity_id = e.id AND c1.component_type = 'Content'
  JOIN components c2 ON c2.entity_id = e.id AND c2.component_type = 'Temporal'
  LEFT JOIN sparks_cache sc ON sc.entity_id = e.id
  WHERE e.entity_type = 'spark'
    AND sc.storage_path LIKE '%/sparks/%/%/content.json'  -- Old format
)
-- Download from old path, generate title, upload to new path
-- Update sparks_cache.storage_path
```

### Rollback Plan

**If issues arise**:
1. Stop worker (prevents new sparks in new format)
2. Keep database as-is (entities/components unchanged)
3. Keep Storage files (both old and new coexist)
4. Fix code issues
5. Restart worker
6. Old sparks still queryable, new sparks use fixed code

**No data loss** because:
- Database entities persist (ECS is flexible)
- Storage files never deleted
- Cache is rebuildable

---

## References

**Architecture**:
- `docs/ARCHITECTURE.md` - System architecture
- `docs/ECS_IMPLEMENTATION.md` - ECS pattern (Operations wrapper required)
- `docs/SPARK_SYSTEM.md` - Spark system documentation

**Storage Patterns**:
- `docs/STORAGE_PATTERNS.md` - Hybrid storage strategy
- `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md` - Portability patterns

**Similar Implementations**:
- `worker/lib/vault-export-annotations.ts:94-103` - ECS export structure
- `worker/lib/vault-import-annotations.ts:28-43` - Direct restore vs recovery
- `supabase/migrations/054_create_sparks_cache.sql:25-26` - SET NULL pattern

**Testing**:
- `docs/testing/TESTING_RULES.md` - Test classification
- `worker/__tests__/recover-sparks.test.ts` - Spark recovery tests

---

## Handoff Context

### What We Discussed

**User Feedback** (key decisions):
1. "Sparks are ideas that can come at any time, anywhere in the app"
2. "Sparks shouldn't be tied specifically to docs, but can reference them"
3. "If document deleted, show 'Original document {title} was deleted, want to re-link?'"
4. "Storage bucket should mirror vault and ZIP exports for consistency"
5. "AI title generation with Gemini, fallback to first 3 words"

**Architecture Decisions**:
- Keep documents at `{userId}/{documentId}/` (no restructure)
- Only restructure sparks (minimal scope)
- No migration of existing sparks (fresh start)
- ChunkRef optional (sparks from anywhere)
- Vault = global `Rhizome/Sparks/`, not per-document

**File Formats**:
- Storage: JSON only (`{date}-spark-{title}.json`)
- Vault: Both formats (`.md` for reading, `.json` for portability)
- ZIP: JSON only (full backup)

### Current Session State

**Last session context**: Phase 3 of Obsidian vault mirroring complete
- Vault import working for documents
- Annotations/sparks import has entity_type fix (Migration 061)
- Sparks still using old per-document export (needs refactor)

**Open Issues**:
- Sparks_cache not populated during vault import (current session topic)
- Sparks cascade deleted when document deleted (Phase 1 fix)
- Vault exports sparks per-document instead of globally (Phase 4 fix)

**Next Steps**:
1. Apply Migration 062 (CASCADE → SET NULL)
2. Make ChunkRef optional
3. Add AI title generation
4. Restructure Storage paths
5. Update vault export/import
6. Update ZIP export

### Files That Will Change

**New Files** (5):
- `supabase/migrations/062_spark_portability_orphan_survival.sql`
- `src/lib/sparks/title-generator.ts`
- `src/lib/sparks/__tests__/title-generator.test.ts`
- `worker/__tests__/spark-orphan-survival.test.ts`
- `worker/handlers/export-user-backup.ts` (or update existing)

**Modified Files** (7):
- `src/lib/ecs/components.ts` - Optional ChunkRef, add title to Spark
- `src/lib/ecs/sparks.ts` - Optional ChunkRef in create()
- `src/app/actions/sparks.ts` - AI title, new Storage paths
- `worker/lib/vault-export-sparks.ts` - Global location, dual format
- `worker/lib/vault-import-sparks.ts` - Global location, Storage upload
- `worker/handlers/import-from-vault.ts` - Call global spark import
- `worker/handlers/obsidian-sync.ts` - Remove per-document spark export

**Deleted Code**:
- Per-document spark export in `obsidian-sync.ts:243-256`
- Per-document spark import in `import-from-vault.ts:350-366`

### Implementation Priority

**Critical Path** (must do in order):
1. Phase 1 (database) → Enables orphan survival
2. Phase 2 (components) → Enables global sparks
3. Phase 3 (title gen) → Enables meaningful filenames
4. Phase 4 (vault export) → Proper vault structure
5. Phase 5 (vault import) → Round-trip works
6. Phase 6 (ZIP export) → Full backup

**Can parallelize**:
- Phase 4 + 5 (vault export/import) after Phase 3
- Phase 6 (ZIP) independent of vault

### Known Gotchas

1. **Storage files not auto-deleted**: Must manually clean up in `deleteSpark()`
2. **ChunkRef optional**: Check for undefined before accessing documentId
3. **AI title can fail**: Always have fallback (first 3 words)
4. **Slugify max length**: Limit to 50 chars to prevent filesystem issues
5. **Vault location**: `Rhizome/Sparks/` (not `Documents/{title}/`)

---

## Success Metrics

**Phase 1**: ✅ Spark survives document deletion with `document_id=NULL`

**Phase 2**: ✅ Can create spark without document context

**Phase 3**: ✅ All sparks have meaningful titles (AI or fallback)

**Phase 4**: ✅ Vault has `Rhizome/Sparks/*.{md,json}` files

**Phase 5**: ✅ Vault round-trip preserves all spark data

**Phase 6**: ✅ ZIP contains `sparks/` folder with all user sparks

**Overall**: ✅ Storage paths mirror vault naming (consistency achieved)

---

**Ready for implementation!**
