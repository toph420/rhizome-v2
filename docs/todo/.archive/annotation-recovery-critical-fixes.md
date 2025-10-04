# Annotation Recovery System - Critical Implementation Fixes

**Status**: Required corrections before implementation
**Priority**: Must address before starting Phase 1
**Impact**: Prevents data loss, ensures system actually works

---

## Critical Issue #1: Server-Side Context Capture

### Problem
The plan assumes the client provides `textContext`, but the client doesn't have access to full markdown. Annotations are created with only `startOffset`, `endOffset`, `originalText`.

### Solution

**File**: `src/app/actions/annotations.ts` (MODIFY - Server Action)

```typescript
'use server'

import { getSupabaseClient } from '@/lib/supabase/server';
import { ECS } from '@/lib/ecs/ecs';
import { AnnotationOperations } from '@/lib/ecs/annotations';

export async function createAnnotation(input: {
  documentId: string
  startOffset: number
  endOffset: number
  originalText: string
  chunkId: string
  type: 'highlight' | 'underline' | 'margin-note' | 'comment'
  color?: string
  note?: string
}) {
  const supabase = getSupabaseClient();

  // 1. Fetch markdown from storage (server-side only)
  const { data: document } = await supabase
    .from('documents')
    .select('markdown_path')
    .eq('id', input.documentId)
    .single();

  const { data: blob, error: downloadError } = await supabase.storage
    .from('documents')
    .download(document.markdown_path);

  if (downloadError || !blob) {
    throw new Error(`Failed to fetch markdown: ${downloadError?.message}`);
  }

  const markdown = await blob.text();

  // 2. Capture context server-side (±100 chars)
  const textContext = {
    before: markdown.slice(
      Math.max(0, input.startOffset - 100),
      input.startOffset
    ),
    after: markdown.slice(
      input.endOffset,
      Math.min(markdown.length, input.endOffset + 100)
    )
  };

  // 3. Find chunk index server-side
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id, chunk_index, start_offset, end_offset')
    .eq('document_id', input.documentId)
    .order('chunk_index');

  const chunkIndex = chunks?.findIndex(
    c => c.start_offset <= input.startOffset && c.end_offset >= input.endOffset
  ) ?? -1;

  // 4. Find overlapping chunks (for multi-chunk annotations)
  const overlappingChunks = chunks?.filter(
    c => c.end_offset > input.startOffset && c.start_offset < input.endOffset
  ) || [];

  // 5. Create annotation with captured context
  const user = await getCurrentUser();
  const ecs = new ECS(supabase);
  const ops = new AnnotationOperations(ecs, user.id);

  const entityId = await ops.create({
    documentId: input.documentId,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    originalText: input.originalText,
    chunkId: input.chunkId,
    chunkPosition: 0, // Will be calculated properly
    type: input.type,
    color: input.color,
    note: input.note,

    // NEW: Server-captured context
    textContext,
    chunkIndex
  });

  // 6. Update with chunk_ids array (for connection graph)
  await supabase
    .from('components')
    .update({
      chunk_ids: overlappingChunks.map(c => c.id)
    })
    .eq('entity_id', entityId)
    .eq('component_type', 'ChunkRef');

  return entityId;
}
```

**Key Points**:
- Server action fetches markdown from storage
- Context captured server-side, not client-side
- Chunk index calculated from database chunks
- Multi-chunk support via `chunk_ids` array

---

## Critical Issue #2: Multi-Chunk Connection Lookup

### Problem
No method exists to query which chunks an annotation overlaps—critical for displaying connections in the reader sidebar.

### Solution

**File**: `src/lib/ecs/annotations.ts` (ADD METHOD)

```typescript
export class AnnotationOperations {
  // ... existing methods ...

  /**
   * Get chunk IDs for a specific annotation.
   * Used by connection sidebar to find relevant connections.
   */
  async getChunksForAnnotation(annotationId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('components')
      .select('chunk_ids')
      .eq('entity_id', annotationId)
      .eq('component_type', 'ChunkRef')
      .single();

    if (error || !data) return [];

    return data.chunk_ids || [];
  }

  /**
   * Get all connections for annotation's chunks.
   * Queries the 3-engine connection system.
   */
  async getConnectionsForAnnotation(annotationId: string): Promise<any[]> {
    const chunkIds = await this.getChunksForAnnotation(annotationId);

    if (chunkIds.length === 0) return [];

    const { data } = await this.supabase
      .from('chunk_connections')
      .select(`
        *,
        target_chunk:chunks!target_chunk_id(id, content, summary)
      `)
      .in('source_chunk_id', chunkIds)
      .order('strength', { ascending: false });

    return data || [];
  }
}
```

**File**: `src/components/reader/ConnectionSidebar.tsx` (NEW - Usage)

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AnnotationOperations } from '@/lib/ecs/annotations';

export function ConnectionSidebar({ annotationId }: { annotationId: string }) {
  const [connections, setConnections] = useState([]);

  useEffect(() => {
    async function loadConnections() {
      const ops = new AnnotationOperations(ecs, userId);
      const data = await ops.getConnectionsForAnnotation(annotationId);
      setConnections(data);
    }

    loadConnections();
  }, [annotationId]);

  return (
    <div className="space-y-2">
      {connections.map(conn => (
        <ConnectionCard key={conn.id} connection={conn} />
      ))}
    </div>
  );
}
```

---

## Critical Issue #3: Performance Claims Are Overstated

### Problem
Claim: "60x smaller search space = 150x performance improvement"

Reality:
- 5 chunks / 382 total = **1.3% of space** (75x smaller, not 60x)
- Levenshtein is O(m×n) complexity
- 75x smaller haystack = **50-75x faster**, not 150x

### Correction

**File**: `worker/lib/fuzzy-match.ts` (ADD COMMENT)

```typescript
/**
 * Strategy 3: Chunk-bounded search (performance-optimized)
 *
 * PERFORMANCE ANALYSIS:
 * - Full document: ~750,000 chars
 * - 5-chunk window: ~12,500 chars (±2 chunks from original position)
 * - Search space reduction: 75x smaller (1.3% of original)
 * - Levenshtein O(m×n): 75x smaller haystack = 50-75x faster in practice
 * - Typical recovery time: 1-2 seconds for 20 annotations
 *
 * This is still excellent performance, just not 150x as originally claimed.
 */
export function findNearChunk(
  markdown: string,
  needle: string,
  chunks: Chunk[],
  originalChunkIndex: number
): FuzzyMatchResult | null {
  // ... implementation
}
```

**Update documentation**: Replace "150x faster" with "50-75x faster" in all docs.

---

## Critical Issue #4: Obsidian URI Navigation Bug

### Problem
```typescript
window.location.href = uri  // Navigates away from app!
```

This leaves the app and breaks the user experience.

### Solution

**File**: `src/components/reader/DocumentHeader.tsx` (FIX)

```tsx
const handleEditInObsidian = async () => {
  try {
    // Export to vault first
    const response = await fetch('/api/obsidian/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId })
    });

    const { uri } = await response.json();

    // CORRECT: Use invisible iframe for protocol handling
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = uri;
    document.body.appendChild(iframe);

    // Clean up after protocol handler triggers
    setTimeout(() => iframe.remove(), 1000);

    toast({
      title: 'Opening in Obsidian',
      description: 'Document exported to vault'
    });
  } catch (error) {
    toast({
      title: 'Export failed',
      description: error.message,
      variant: 'destructive'
    });
  }
};
```

**Alternative approach** (if iframe doesn't work):
```typescript
// Use window.open with immediate close
const popup = window.open(uri, '_blank');
setTimeout(() => popup?.close(), 100);
```

---

## Critical Issue #5: Missing Batch Operations

### Problem
50 annotations needing review = 50 separate API calls if user clicks "Accept" individually.

### Solution

**File**: `src/app/api/annotations/batch-accept/route.ts` (CREATE)

```typescript
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { matches } = await request.json();
  // matches: Array<{ componentId, startOffset, endOffset }>

  const supabase = getSupabaseClient();

  // Build batch updates
  const updates = matches.map((m: any) => ({
    id: m.componentId,
    data: supabase.raw(`
      jsonb_set(
        jsonb_set(data, '{startOffset}', '${m.startOffset}'),
        '{endOffset}', '${m.endOffset}'
      )
    `),
    needs_review: false,
    recovery_confidence: m.confidence,
    recovery_method: m.method
  }));

  // Execute batch update
  for (const update of updates) {
    await supabase
      .from('components')
      .update(update)
      .eq('id', update.id);
  }

  return Response.json({
    success: true,
    updated: updates.length
  });
}
```

**File**: `src/app/api/annotations/batch-discard/route.ts` (CREATE)

```typescript
export async function POST(request: NextRequest) {
  const { componentIds } = await request.json();

  const supabase = getSupabaseClient();

  // Batch delete
  await supabase
    .from('components')
    .delete()
    .in('id', componentIds);

  return Response.json({
    success: true,
    deleted: componentIds.length
  });
}
```

**File**: `src/components/review/AnnotationReviewModal.tsx` (ADD BATCH BUTTONS)

```tsx
export function AnnotationReviewModal({ results, ... }: ReviewModalProps) {
  // ... existing state ...

  const acceptAll = async () => {
    const matches = pending.map(item => ({
      componentId: item.annotation.id,
      startOffset: item.suggestedMatch.startOffset,
      endOffset: item.suggestedMatch.endOffset,
      confidence: item.suggestedMatch.confidence,
      method: item.suggestedMatch.method
    }));

    await fetch('/api/annotations/batch-accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matches })
    });

    setPending([]);
    toast({ title: `Accepted ${matches.length} annotations` });
  };

  const discardAll = async () => {
    const componentIds = pending.map(item => item.annotation.id);

    await fetch('/api/annotations/batch-discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentIds })
    });

    setPending([]);
    toast({ title: `Discarded ${componentIds.length} annotations` });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* ... existing content ... */}

      {pending.length > 0 && (
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={acceptAll} className="flex-1">
            Accept All ({pending.length})
          </Button>
          <Button
            onClick={discardAll}
            variant="destructive"
            className="flex-1"
          >
            Discard All ({pending.length})
          </Button>
        </div>
      )}
    </Dialog>
  );
}
```

---

## Critical Issue #6: Cross-Document Connection Remapping

### Problem
If a connection's target chunk is in a different (unedited) document, `findBestMatch` fails because `newChunks` only contains chunks from the edited document.

### Solution

**File**: `worker/handlers/remap-connections.ts` (FIX)

```typescript
export async function remapConnections(
  verifiedConnections: Connection[],
  newChunks: Chunk[],
  documentId: string  // NEW: ID of document being edited
) {
  const results = {
    success: [] as Connection[],
    needsReview: [] as any[],
    lost: [] as Connection[]
  };

  for (const conn of verifiedConnections) {
    if (!conn.source_chunk?.embedding || !conn.target_chunk?.embedding) {
      results.lost.push(conn);
      continue;
    }

    // Check which side was edited
    const sourceIsEdited = conn.source_chunk.document_id === documentId;
    const targetIsEdited = conn.target_chunk.document_id === documentId;

    // Only remap chunks from the edited document
    const sourceMatch = sourceIsEdited
      ? await findBestMatch(conn.source_chunk.embedding, newChunks)
      : { chunk: conn.source_chunk, similarity: 1.0 };  // Preserve unchanged

    const targetMatch = targetIsEdited
      ? await findBestMatch(conn.target_chunk.embedding, newChunks)
      : { chunk: conn.target_chunk, similarity: 1.0 };  // Preserve unchanged

    if (sourceMatch.similarity > 0.95 && targetMatch.similarity > 0.95) {
      // High confidence - auto-remap
      await supabase.from('chunk_connections').insert({
        source_chunk_id: sourceMatch.chunk.id,
        target_chunk_id: targetMatch.chunk.id,
        engine_type: conn.engine_type,
        strength: conn.strength,
        user_validated: true,
        auto_detected: false,
        metadata: {
          ...conn.metadata,
          remapped: true,
          original_source: conn.source_chunk_id,
          original_target: conn.target_chunk_id,
          remap_confidence: {
            source: sourceMatch.similarity,
            target: targetMatch.similarity
          }
        }
      });
      results.success.push(conn);
    } else if (sourceMatch.similarity > 0.85 && targetMatch.similarity > 0.85) {
      results.needsReview.push({
        connection: conn,
        sourceMatch,
        targetMatch
      });
    } else {
      results.lost.push(conn);
    }
  }

  return results;
}
```

**Key change**: Cross-document connections preserve the unchanged side (similarity = 1.0) while only remapping the edited side.

---

## Critical Issue #7: Error Handling Missing Everywhere

### Problem
No try/catch blocks, no null checks, no error propagation.

### Solution Template

**File**: `worker/handlers/reprocess-document.ts` (ADD ERROR HANDLING)

```typescript
export async function reprocessDocument(
  documentId: string
): Promise<ReprocessResults> {
  try {
    console.log(`🔄 Reprocessing document ${documentId}`);

    // Set status to processing
    await supabase.from('documents').update({
      processing_status: 'reprocessing',
      processing_error: null
    }).eq('id', documentId);

    // 1. Get markdown with error handling
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('markdown_path')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.markdown_path);

    if (downloadError || !blob) {
      throw new Error(`Failed to download markdown: ${downloadError?.message}`);
    }

    const editedMarkdown = await blob.text();

    // 2. Snapshot with error handling
    const { data: verifiedConnections, error: connError } = await supabase
      .from('chunk_connections')
      .select(`...`)
      .eq('user_validated', true);

    if (connError) {
      console.warn(`Failed to fetch connections: ${connError.message}`);
    }

    // 3. Delete old chunks (with error check)
    const { error: deleteError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) {
      throw new Error(`Failed to delete old chunks: ${deleteError.message}`);
    }

    // ... rest of processing with error checks ...

    // Success
    await supabase.from('documents').update({
      processing_status: 'completed',
      processed_at: new Date().toISOString()
    }).eq('id', documentId);

    console.log(`✅ Reprocessing complete`);
    return results;

  } catch (error) {
    console.error(`❌ Reprocessing failed for ${documentId}:`, error);

    // Save failure state
    await supabase.from('documents').update({
      processing_status: 'failed',
      processing_error: error instanceof Error ? error.message : String(error)
    }).eq('id', documentId);

    throw error;  // Re-throw for caller
  }
}
```

**Apply this pattern to ALL handlers**:
- `recover-annotations.ts`
- `remap-connections.ts`
- `obsidian-sync.ts`
- `readwise-import.ts`

**Apply to ALL API routes**:
- `accept-match/route.ts`
- `discard/route.ts`
- `batch-accept/route.ts`
- `batch-discard/route.ts`

---

## Critical Issue #8: Type Safety Violations

### Problem
Uses `any[]` everywhere instead of proper types.

### Solution

**File**: `worker/types/recovery.ts` (CREATE)

```typescript
export interface Annotation {
  id: string
  text: string
  startOffset: number
  endOffset: number
  textContext?: {
    before: string
    after: string
  }
  originalChunkIndex?: number
}

export interface ReviewItem {
  annotation: Annotation
  suggestedMatch: FuzzyMatchResult
}

export interface RecoveryResults {
  success: Annotation[]
  needsReview: ReviewItem[]
  lost: Annotation[]
}

export interface ConnectionRecoveryResults {
  success: Connection[]
  needsReview: ConnectionReviewItem[]
  lost: Connection[]
}

export interface ConnectionReviewItem {
  connection: Connection
  sourceMatch: { chunk: Chunk; similarity: number }
  targetMatch: { chunk: Chunk; similarity: number }
}

export interface FuzzyMatchResult {
  text: string
  startOffset: number
  endOffset: number
  confidence: number
  method: 'exact' | 'context' | 'chunk_bounded'
}

export interface Chunk {
  id: string
  document_id: string
  chunk_index: number
  start_offset: number
  end_offset: number
  content: string
  embedding?: number[]
}

export interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  engine_type: 'semantic_similarity' | 'thematic_bridge' | 'contradiction_detection'
  strength: number
  user_validated: boolean
  metadata?: any
  source_chunk?: { id: string; document_id: string; embedding: number[] }
  target_chunk?: { id: string; document_id: string; embedding: number[] }
}
```

**Use these types everywhere**:
```typescript
// BEFORE
const results = {
  success: [] as any[],
  needsReview: [] as any[],
  lost: [] as any[]
}

// AFTER
import type { RecoveryResults, Annotation, ReviewItem } from '../types/recovery';

const results: RecoveryResults = {
  success: [],
  needsReview: [],
  lost: []
}
```

---

## Missing Implementations

### 1. Periodic Annotation Export Cron

**File**: `worker/jobs/export-annotations.ts` (CREATE)

```typescript
import cron from 'node-cron';
import { getSupabaseClient } from '../lib/supabase';

export function startAnnotationExportCron() {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('📝 Starting hourly annotation export');

    try {
      const supabase = getSupabaseClient();

      const { data: documents } = await supabase
        .from('documents')
        .select('id, markdown_path')
        .not('markdown_path', 'is', null);

      if (!documents) return;

      let exported = 0;

      for (const doc of documents) {
        // Get all Position components (annotations)
        const { data: annotations } = await supabase
          .from('components')
          .select('*')
          .eq('document_id', doc.id)
          .eq('component_type', 'Position');

        if (!annotations || annotations.length === 0) continue;

        const path = doc.markdown_path.replace('.md', '.annotations.json');

        const { error } = await supabase.storage
          .from('documents')
          .upload(path, JSON.stringify(annotations, null, 2), {
            contentType: 'application/json',
            upsert: true
          });

        if (!error) exported++;
      }

      console.log(`✅ Exported annotations for ${exported} documents`);
    } catch (error) {
      console.error('❌ Annotation export cron failed:', error);
    }
  });
}
```

**File**: `worker/index.ts` (MODIFY - Start cron)

```typescript
import { startAnnotationExportCron } from './jobs/export-annotations';

// ... existing worker setup ...

// Start cron jobs
startAnnotationExportCron();
console.log('✅ Annotation export cron started (runs hourly)');
```

**Install dependency**:
```bash
cd worker && npm install node-cron @types/node-cron
```

---

### 2. Review Queue Query Action

**File**: `src/app/actions/annotations.ts` (ADD)

```typescript
export async function getAnnotationsNeedingReview(documentId: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('components')
    .select('*')
    .eq('document_id', documentId)
    .eq('component_type', 'Position')
    .eq('needs_review', true)
    .order('recovery_confidence', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch review queue: ${error.message}`);
  }

  return data || [];
}
```

---

## Realistic Timeline

**Original estimate: 28 hours (3.5 days)**

**Adding critical fixes**:
- Server-side context capture: +2 hours
- Multi-chunk connection lookup: +1 hour
- Error handling (all handlers + routes): +4 hours
- Batch operations (endpoints + UI): +2 hours
- Cross-document connection fix: +1 hour
- Type safety cleanup: +2 hours
- Periodic export cron: +1 hour
- Review queue implementation: +1 hour
- Integration testing with fixes: +4 hours
- Debugging and polish: +4 hours

**Realistic total: 50 hours (6.5 days)**

---

## Pre-Implementation Checklist

Before starting Phase 1, verify:

- [ ] Context capture happens **server-side** in annotation creation action
- [ ] Multi-chunk lookup methods added to `AnnotationOperations`
- [ ] Error handling template applied to **all** handlers and routes
- [ ] Batch accept/discard endpoints created
- [ ] Cross-document connection logic handles unchanged side
- [ ] Obsidian URI uses iframe (not navigation)
- [ ] All `any[]` replaced with proper types from `worker/types/recovery.ts`
- [ ] Periodic export cron implemented and tested
- [ ] Review queue query action created
- [ ] Performance claims corrected to "50-75x faster" (not 150x)

---

## Testing Requirements

**Must pass before declaring success**:

1. **Context Capture**
   - Create annotation → `textContext` populated server-side
   - Verify ±100 chars captured correctly

2. **Recovery Performance**
   - Edit document with 20 annotations → recovery completes in <2 seconds
   - Recovery rate >90% (success + needsReview combined)

3. **Multi-Chunk Support**
   - Annotation spanning 3 chunks → `chunk_ids` array has 3 entries
   - Connection sidebar shows connections for all 3 chunks

4. **Cross-Document Connections**
   - Edit document A → connection to unchanged document B preserved
   - Both sides of connection have correct chunk IDs

5. **Batch Operations**
   - 50 annotations needing review → "Accept All" executes in <2 seconds
   - Single API call (not 50 separate calls)

6. **Obsidian Sync**
   - Export → edit in Obsidian → sync back → annotations recovered
   - No data loss on round-trip

7. **Error Handling**
   - Missing file → graceful error message
   - Network failure → retry logic works
   - All errors logged with context

8. **Type Safety**
   - No `any` types in production code
   - TypeScript strict mode passes

---

## Summary

The original plan has **excellent architecture** but **critical implementation gaps** that will cause data loss and system failures. These fixes are **mandatory**:

1. ✅ Context capture must be server-side
2. ✅ Add multi-chunk connection lookups
3. ✅ Fix Obsidian URI handling (iframe)
4. ✅ Add batch operations (accept/discard all)
5. ✅ Handle cross-document connections
6. ✅ Add comprehensive error handling
7. ✅ Replace all `any` with proper types
8. ✅ Implement periodic export cron
9. ✅ Correct performance claims (50-75x, not 150x)

**Budget 6.5 days, not 3.5 days.** Ship with proper error handling and type safety, not optimistic assumptions.
