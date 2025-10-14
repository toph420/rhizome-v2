# PRP: Chunk Validation and Correction System

**Status**: Draft
**Priority**: P1 (Critical Quality System)
**Estimated Effort**: 4-6 hours
**Confidence Score**: 9/10 (One-pass implementation highly likely)

---

## Executive Summary

### Problem Statement

The bulletproof matching system generates validation warnings during document processing (overlap corrections, synthetic chunk interpolations), but these warnings are stored in ephemeral job metadata and lost after processing completes. The ChunkQualityPanel UI queries the chunks table but has no access to these warnings, creating a **data persistence gap** that prevents users from validating and correcting problematic chunks.

**Current Behavior**:
- Log shows "Synthetic: 0/9" (Layer 4 interpolated chunks only)
- Log also shows "7 synthetic chunks require validation" (all warnings)
- ChunkQualityPanel query: `.eq('position_confidence', 'synthetic')` returns 0 chunks
- **Result**: 7 overlap-corrected chunks needing validation are invisible to UI

**Root Cause**:
```typescript
// bulletproof-matcher.ts:line 320 (pdf-processor.ts)
this.job.metadata.matchingWarnings = warnings  // ❌ Ephemeral memory
```

### Solution Overview

Persist validation warnings to the chunks table during processing, enabling:
1. **Validation Workflow**: User marks chunks as correct without changes
2. **Correction Workflow**: User selects correct text span to adjust chunk boundaries
3. **Review Workflow**: Flag chunks for expert attention (future)

**Implementation Strategy**:
- Database: Add validation metadata columns (migration 047)
- Matcher: Attach warnings to MatchResult objects
- Processor: Save warnings to database during chunk insertion
- Hooks: Query all unvalidated chunks (not just synthetic)
- UI: Display warnings by type with validation/correction actions
- Server Actions: Validate positions and update offsets with overlap detection

---

## Business Context

### User Story

**As a user processing documents in LOCAL mode,**
**I want to review and validate chunks with questionable positions,**
**So that I can ensure annotation accuracy and correct any positioning errors.**

### Current User Pain Points

1. **Invisible Problems**: Overlap-corrected chunks don't appear in quality panel
2. **No Correction Path**: Can validate synthetic chunks but can't fix incorrect boundaries
3. **Confusing Logs**: "Synthetic: 0/9" vs "7 chunks need validation" creates confusion
4. **Lost Context**: Warning details (original offsets, adjustment reasons) aren't persisted
5. **Manual Workflow**: No UI for text selection → boundary correction

### Success Criteria

**Must Have**:
- ✅ All chunks needing validation are surfaced in ChunkQualityPanel
- ✅ User can mark chunks as validated (position correct)
- ✅ User can correct chunk boundaries via text selection
- ✅ Overlap detection prevents invalid corrections
- ✅ Logging clearly distinguishes synthetic vs overlap-corrected chunks

**Should Have**:
- ✅ Correction history tracked with timestamps and reasons
- ✅ UI shows warning details (original vs adjusted offsets)
- ✅ Toast notifications for success/error states

**Nice to Have**:
- ⚠️ Flag for expert review (future: separate review queue)
- ⚠️ Batch validation operations
- ⚠️ Correction suggestions based on content analysis

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Processing Pipeline (worker/processors/pdf-processor.ts)    │
├─────────────────────────────────────────────────────────────┤
│ 1. Bulletproof Matcher generates MatchResult[]              │
│    - MatchResult.validation_warning (NEW)                   │
│    - MatchResult.validation_details (NEW)                   │
│    - MatchResult.overlap_corrected (NEW)                    │
│                                                              │
│ 2. pdf-processor.ts saves chunks with warning metadata      │
│    - chunks.validation_warning                              │
│    - chunks.validation_details                              │
│    - chunks.overlap_corrected                               │
│    - chunks.position_validated = false                      │
└─────────────────────────────────────────────────────────────┘
                         ↓ Persisted to database
┌─────────────────────────────────────────────────────────────┐
│ Database (chunks table)                                      │
├─────────────────────────────────────────────────────────────┤
│ New Columns (Migration 047):                                │
│ - validation_warning TEXT                                   │
│ - validation_details JSONB                                  │
│ - overlap_corrected BOOLEAN                                 │
│ - position_corrected BOOLEAN                                │
│ - correction_history JSONB                                  │
└─────────────────────────────────────────────────────────────┘
                         ↓ Queried by hooks
┌─────────────────────────────────────────────────────────────┐
│ Frontend (src/components/sidebar/ChunkQualityPanel.tsx)    │
├─────────────────────────────────────────────────────────────┤
│ useUnvalidatedChunks(documentId)                            │
│ → Query: position_validated = false                         │
│ → Returns: {synthetic, overlapCorrected, all}               │
│                                                              │
│ User Actions:                                                │
│ 1. ✅ Validate → validateChunkPosition()                    │
│ 2. 🔧 Fix → Enter correction mode → updateChunkOffsets()    │
│ 3. 📍 View → Navigate to chunk in document reader           │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema Changes

**Migration 047**: Add validation and correction tracking columns

```sql
-- File: supabase/migrations/047_chunk_validation_corrections.sql

-- Add validation metadata columns
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS validation_warning TEXT,
  ADD COLUMN IF NOT EXISTS validation_details JSONB,
  ADD COLUMN IF NOT EXISTS overlap_corrected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS position_corrected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS correction_history JSONB DEFAULT '[]'::jsonb;

-- Add index for querying unvalidated chunks
CREATE INDEX IF NOT EXISTS idx_chunks_needs_validation
  ON chunks(document_id, position_validated)
  WHERE position_validated = FALSE;

-- Add index for overlap-corrected chunks
CREATE INDEX IF NOT EXISTS idx_chunks_overlap_corrected
  ON chunks(document_id, overlap_corrected)
  WHERE overlap_corrected = TRUE;

-- Column comments
COMMENT ON COLUMN chunks.validation_warning IS 'Human-readable warning message (e.g., "Position overlap corrected")';
COMMENT ON COLUMN chunks.validation_details IS 'Machine-readable warning details: {type, original_offsets, adjusted_offsets, reason}';
COMMENT ON COLUMN chunks.overlap_corrected IS 'TRUE if chunk offsets were adjusted due to overlap during matching';
COMMENT ON COLUMN chunks.position_corrected IS 'TRUE if user manually corrected chunk boundaries';
COMMENT ON COLUMN chunks.correction_history IS 'Array of correction records: [{timestamp, old_offsets, new_offsets, reason}]';
```

**validation_details JSONB Structure**:
```typescript
{
  type: 'overlap_corrected' | 'synthetic' | 'low_similarity',
  original_offsets?: { start: number; end: number },
  adjusted_offsets?: { start: number; end: number },
  reason?: string,
  confidence_downgrade?: string  // e.g., "exact → high"
}
```

**correction_history JSONB Structure**:
```typescript
[
  {
    timestamp: "2025-01-15T10:30:00Z",
    old_offsets: { start: 1200, end: 1540 },
    new_offsets: { start: 1205, end: 1535 },
    reason: "manual_correction" | "annotation_recovery",
    corrected_by?: "user_id"  // Optional for future multi-user
  }
]
```

### Data Flow

**1. During Processing (Bulletproof Matcher)**

```typescript
// worker/lib/local/bulletproof-matcher.ts

export interface MatchResult {
  chunk: DoclingChunk
  start_offset: number
  end_offset: number
  confidence: MatchConfidence
  method: MatchMethod
  similarity?: number
  // NEW: Validation metadata
  validation_warning?: string
  validation_details?: {
    type: 'synthetic' | 'overlap_corrected' | 'low_similarity'
    original_offsets?: { start: number; end: number }
    adjusted_offsets?: { start: number; end: number }
    reason?: string
    confidence_downgrade?: string
  }
  overlap_corrected?: boolean
}

// In finalizeBulletproofMatch() - Overlap correction logic
if (curr.start_offset < prev.end_offset) {
  // Store original offsets before adjustment
  const originalStart = curr.start_offset
  const originalEnd = curr.end_offset

  // Enforce sequential ordering
  curr.start_offset = prev.end_offset
  curr.end_offset = Math.max(
    curr.start_offset + curr.chunk.content.length,
    prev.end_offset + 1
  )

  // Downgrade confidence
  if (curr.confidence === 'exact') {
    curr.confidence = 'high'
    curr.method = 'normalized_match'
  } else if (curr.confidence === 'high') {
    curr.confidence = 'medium'
  }

  // NEW: Attach validation metadata
  curr.validation_warning = `Position overlap corrected. Original: [${originalStart}-${originalEnd}], Adjusted: [${curr.start_offset}-${curr.end_offset}]. Validation recommended.`
  curr.validation_details = {
    type: 'overlap_corrected',
    original_offsets: { start: originalStart, end: originalEnd },
    adjusted_offsets: { start: curr.start_offset, end: curr.end_offset },
    reason: `Overlapped with chunk ${prev.chunk.index}`,
    confidence_downgrade: 'exact → high'
  }
  curr.overlap_corrected = true

  warnings.push(curr.validation_warning)
}

// For Layer 4 synthetic chunks
const synthetic = layer4_interpolation(cleanedMarkdown, remaining, allMatched)
for (const result of synthetic) {
  result.validation_warning = `Chunk ${result.chunk.index} (page ${result.chunk.meta.page_start || 'unknown'}): Position approximate, metadata preserved. Validation recommended.`
  result.validation_details = {
    type: 'synthetic',
    reason: 'Layer 4 interpolation (no exact match found)'
  }
  warnings.push(result.validation_warning)
}
```

**2. During Chunk Insertion (PDF Processor)**

```typescript
// worker/processors/pdf-processor.ts

// Convert MatchResult to ProcessedChunk format
finalChunks = rematchedChunks.map((result: MatchResult, idx: number) => {
  const wordCount = result.chunk.content.split(/\s+/).filter((w: string) => w.length > 0).length

  return {
    document_id: this.job.document_id,
    content: result.chunk.content,
    chunk_index: idx,
    start_offset: result.start_offset,
    end_offset: result.end_offset,
    word_count: wordCount,

    // Docling metadata
    page_start: result.chunk.meta.page_start || null,
    page_end: result.chunk.meta.page_end || null,
    heading_level: result.chunk.meta.heading_level || null,
    section_marker: result.chunk.meta.section_marker || null,
    bboxes: result.chunk.meta.bboxes || null,

    // Confidence tracking
    position_confidence: result.confidence,
    position_method: result.method,
    position_validated: false,

    // NEW: Validation metadata
    validation_warning: result.validation_warning || null,
    validation_details: result.validation_details || null,
    overlap_corrected: result.overlap_corrected || false,
    position_corrected: false,
    correction_history: [],

    // Metadata (extracted in next stage)
    themes: [],
    importance_score: 0.5,
    summary: null,
    emotional_metadata: {
      polarity: 0,
      primaryEmotion: 'neutral',
      intensity: 0
    },
    conceptual_metadata: {
      concepts: []
    },
    domain_metadata: null,
    metadata_extracted_at: null
  }
})
```

**3. Querying Unvalidated Chunks (Hook)**

```typescript
// src/hooks/use-unvalidated-chunks.ts (NEW, replaces useSyntheticChunks)

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface UnvalidatedChunk {
  id: string
  chunk_index: number
  content: string
  position_confidence: 'exact' | 'high' | 'medium' | 'synthetic'
  position_method: string | null
  validation_warning: string | null
  validation_details: {
    type: 'overlap_corrected' | 'synthetic' | 'low_similarity'
    original_offsets?: { start: number; end: number }
    adjusted_offsets?: { start: number; end: number }
    reason?: string
    confidence_downgrade?: string
  } | null
  overlap_corrected: boolean
  page_start: number | null
  page_end: number | null
  section_marker: string | null
  position_validated: boolean
}

export function useUnvalidatedChunks(documentId: string) {
  const [data, setData] = useState<UnvalidatedChunk[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchUnvalidatedChunks() {
      try {
        setIsLoading(true)
        const supabase = createClient()

        // Query ALL chunks where position_validated = false
        const { data: chunks, error } = await supabase
          .from('chunks')
          .select(`
            id,
            chunk_index,
            content,
            position_confidence,
            position_method,
            validation_warning,
            validation_details,
            overlap_corrected,
            page_start,
            page_end,
            section_marker,
            position_validated
          `)
          .eq('document_id', documentId)
          .eq('position_validated', false)
          .order('chunk_index', { ascending: true })

        if (error) throw error

        setData(chunks as UnvalidatedChunk[])
      } catch (err) {
        console.error('[useUnvalidatedChunks] Error fetching chunks:', err)
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUnvalidatedChunks()
  }, [documentId])

  // Categorize by warning type for UI filtering
  const categorized = data ? {
    synthetic: data.filter(c => c.position_confidence === 'synthetic'),
    overlapCorrected: data.filter(c => c.overlap_corrected),
    lowSimilarity: data.filter(c => c.position_confidence === 'medium'),
    all: data
  } : null

  return { data: categorized, isLoading, error }
}
```

**4. Validation & Correction (Server Actions)**

```typescript
// src/app/actions/chunks.ts (NEW)

'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================================
// Validation Action (Simple)
// ============================================================================

export async function validateChunkPosition(
  chunkId: string,
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('chunks')
      .update({ position_validated: true })
      .eq('id', chunkId)

    if (error) throw error

    revalidatePath(`/read/${documentId}`)
    return { success: true }
  } catch (error) {
    console.error('[validateChunkPosition] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================================================
// Correction Action (Complex with Overlap Detection)
// ============================================================================

const UpdateChunkOffsetsSchema = z.object({
  chunkId: z.string().uuid(),
  newStartOffset: z.number().int().min(0),
  newEndOffset: z.number().int().min(0),
  documentId: z.string().uuid(),
  reason: z.string().optional()
})

export async function updateChunkOffsets(
  input: z.infer<typeof UpdateChunkOffsetsSchema>
): Promise<{ success: boolean; error?: string; adjacentChunks?: any[] }> {
  try {
    const validated = UpdateChunkOffsetsSchema.parse(input)
    const supabase = await createClient()

    // Step 1: Get current chunk
    const { data: chunk, error: fetchError } = await supabase
      .from('chunks')
      .select('*')
      .eq('id', validated.chunkId)
      .single()

    if (fetchError) throw fetchError
    if (!chunk) {
      return { success: false, error: 'Chunk not found' }
    }

    // Step 2: Validate new offsets don't overlap with adjacent chunks
    const { data: adjacentChunks, error: adjacentError } = await supabase
      .from('chunks')
      .select('id, chunk_index, start_offset, end_offset')
      .eq('document_id', validated.documentId)
      .or(`chunk_index.eq.${chunk.chunk_index - 1},chunk_index.eq.${chunk.chunk_index + 1}`)

    if (adjacentError) throw adjacentError

    // Check for overlaps
    const hasOverlap = adjacentChunks?.some(adjacent => {
      return (
        // New start falls within adjacent range
        (validated.newStartOffset >= adjacent.start_offset &&
         validated.newStartOffset < adjacent.end_offset) ||
        // New end falls within adjacent range
        (validated.newEndOffset > adjacent.start_offset &&
         validated.newEndOffset <= adjacent.end_offset) ||
        // New range completely contains adjacent
        (validated.newStartOffset <= adjacent.start_offset &&
         validated.newEndOffset >= adjacent.end_offset)
      )
    })

    if (hasOverlap) {
      return {
        success: false,
        error: 'New offsets overlap with adjacent chunks. Adjust boundaries to avoid overlap.',
        adjacentChunks
      }
    }

    // Step 3: Build correction history entry
    const historyEntry = {
      timestamp: new Date().toISOString(),
      old_offsets: { start: chunk.start_offset, end: chunk.end_offset },
      new_offsets: { start: validated.newStartOffset, end: validated.newEndOffset },
      reason: validated.reason || 'manual_correction'
    }

    // Step 4: Update chunk with new offsets and history
    const { error: updateError } = await supabase
      .from('chunks')
      .update({
        start_offset: validated.newStartOffset,
        end_offset: validated.newEndOffset,
        position_validated: true,
        position_corrected: true,
        correction_history: [...(chunk.correction_history || []), historyEntry],
        updated_at: new Date().toISOString()
      })
      .eq('id', validated.chunkId)

    if (updateError) throw updateError

    revalidatePath(`/read/${validated.documentId}`)
    return { success: true }
  } catch (error) {
    console.error('[updateChunkOffsets] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

---

## Implementation Blueprint

### Phase 1: Database Layer (30 min)

**Task 1.1**: Create Migration 047
- File: `supabase/migrations/047_chunk_validation_corrections.sql`
- Add columns: `validation_warning`, `validation_details`, `overlap_corrected`, `position_corrected`, `correction_history`
- Add indexes for query optimization
- Test: Run migration locally, verify columns exist

**Task 1.2**: Update TypeScript Types
- File: `worker/types/processor.ts`
- Update `ProcessedChunk` interface with new fields
- Ensure null safety for optional fields

### Phase 2: Bulletproof Matcher Updates (45 min)

**Task 2.1**: Update MatchResult Interface
- File: `worker/lib/local/bulletproof-matcher.ts` (lines 48-66)
- Add `validation_warning?`, `validation_details?`, `overlap_corrected?` to interface

**Task 2.2**: Attach Warnings During Overlap Correction
- File: `worker/lib/local/bulletproof-matcher.ts` (lines 833-868)
- Store original offsets before adjustment
- Build `validation_warning` message
- Build `validation_details` object
- Set `overlap_corrected = true`

**Task 2.3**: Attach Warnings for Synthetic Chunks
- File: `worker/lib/local/bulletproof-matcher.ts` (lines 793-810)
- Build `validation_warning` for Layer 4 results
- Set `validation_details.type = 'synthetic'`

**Task 2.4**: Update Stats Tracking
- File: `worker/lib/local/bulletproof-matcher.ts` (lines 871-886)
- Add `overlapCorrected: number` to MatchStats
- Track overlap corrections separately from synthetic
- Update logging to show both metrics

### Phase 3: PDF Processor Integration (30 min)

**Task 3.1**: Save Validation Metadata
- File: `worker/processors/pdf-processor.ts` (lines 327-363)
- Map `MatchResult` fields to `ProcessedChunk` fields
- Set `validation_warning`, `validation_details`, `overlap_corrected`
- Initialize `correction_history` as empty array

**Task 3.2**: Update Logging
- File: `worker/processors/pdf-processor.ts` (lines 313-323)
- Change "Synthetic: X/Y" to "Layer 4 (Synthetic): X/Y"
- Add "Overlap corrections: X/Y"
- Update "warnings.length" message to "Total needing validation: X chunks"

### Phase 4: Server Actions (60 min)

**Task 4.1**: Create chunks.ts Actions File
- File: `src/app/actions/chunks.ts` (NEW)
- Implement `validateChunkPosition()` - simple update
- Implement `updateChunkOffsets()` - with overlap detection
- Use Zod for input validation
- Follow error handling pattern from annotations.ts

**Task 4.2**: Add Overlap Detection Logic
- Query adjacent chunks (chunk_index ± 1)
- Check if new offsets overlap with adjacent ranges
- Return detailed error with adjacent chunk info if overlap detected

**Task 4.3**: Add Correction History Tracking
- Build history entry with timestamp, old/new offsets, reason
- Append to existing `correction_history` array
- Set `position_corrected = true`

### Phase 5: Hook Refactoring (30 min)

**Task 5.1**: Create useUnvalidatedChunks Hook
- File: `src/hooks/use-unvalidated-chunks.ts` (NEW, replaces useSyntheticChunks)
- Query: `.eq('position_validated', false)`
- Select all validation-related columns
- Return categorized results: `{synthetic, overlapCorrected, lowSimilarity, all}`

**Task 5.2**: Update ChunkStats Hook
- File: `src/hooks/use-chunk-stats.ts`
- Add `overlapCorrected` count to stats
- Aggregate from `overlap_corrected` column

### Phase 6: UI Updates (90 min)

**Task 6.1**: Update ChunkQualityPanel
- File: `src/components/sidebar/ChunkQualityPanel.tsx`
- Import `useUnvalidatedChunks` (replace `useSyntheticChunks`)
- Display chunks grouped by warning type (Accordion sections)
- Add three action buttons per chunk:
  - "✅ Position OK" → calls `validateChunkPosition()`
  - "🔧 Fix Position" → enters correction mode
  - "📍 View in Document" → navigates to chunk

**Task 6.2**: Add Warning Details Display
- Show `validation_warning` text
- Display `validation_details` (original vs adjusted offsets)
- Use color-coded badges: Orange for overlap, Yellow for synthetic

**Task 6.3**: Implement Correction Mode UI
- Add state: `correctionMode: { chunkId, originalOffsets } | null`
- On "Fix" click: set correction mode, navigate to chunk
- Show floating instruction panel: "Select correct text span"
- On text selection: calculate offsets using existing `offset-calculator.ts`
- Show confirmation dialog with before/after preview
- Call `updateChunkOffsets()` on confirm

**Task 6.4**: Add Toast Notifications
- Success: "Chunk position validated"
- Error: Show detailed error (e.g., "Overlaps with adjacent chunks")
- Info: "Navigation not available"

### Phase 7: Document Reader Integration (60 min)

**Task 7.1**: Add Correction Mode to Reader
- File: `src/app/read/[id]/page.tsx` or reader component
- Accept `correctionMode` prop from navigation
- Show floating banner when in correction mode
- Enable text selection handler

**Task 7.2**: Text Selection → Offset Calculation
- Use existing `offset-calculator.ts` module
- On selection end: calculate markdown-absolute offsets
- Store in state for confirmation dialog

**Task 7.3**: Confirmation Dialog
- Show selected text preview
- Display before/after offsets
- Buttons: "Apply Correction" | "Cancel"
- On apply: call `updateChunkOffsets()`, exit correction mode

### Phase 8: Testing (45 min)

**Task 8.1**: Unit Tests
- Test `updateChunkOffsets` overlap detection logic
- Test `useUnvalidatedChunks` categorization
- Mock Supabase client responses

**Task 8.2**: Integration Tests
- Test bulletproof matcher attaches warnings
- Test pdf-processor saves warnings to database
- Use fixtures from real Docling extractions

**Task 8.3**: Manual Testing Checklist
- [ ] Process document with overlaps, verify warnings persist
- [ ] Open ChunkQualityPanel, see all unvalidated chunks
- [ ] Click "Position OK", verify chunk marked validated
- [ ] Click "Fix Position", enter correction mode
- [ ] Select text, verify offset calculation
- [ ] Submit correction, verify overlap detection
- [ ] Check correction_history in database

---

## Code Examples

### Example 1: Bulletproof Matcher with Validation Metadata

```typescript
// worker/lib/local/bulletproof-matcher.ts

// Overlap correction with validation metadata
if (curr.start_offset < prev.end_offset) {
  const originalStart = curr.start_offset
  const originalEnd = curr.end_offset

  curr.start_offset = prev.end_offset
  curr.end_offset = Math.max(
    curr.start_offset + curr.chunk.content.length,
    prev.end_offset + 1
  )

  // Downgrade confidence
  if (curr.confidence === 'exact') {
    curr.confidence = 'high'
    curr.method = 'normalized_match'
  }

  // NEW: Attach validation metadata
  curr.validation_warning = `Position overlap corrected. Original: [${originalStart}-${originalEnd}], Adjusted: [${curr.start_offset}-${curr.end_offset}].`
  curr.validation_details = {
    type: 'overlap_corrected',
    original_offsets: { start: originalStart, end: originalEnd },
    adjusted_offsets: { start: curr.start_offset, end: curr.end_offset },
    reason: `Overlapped with chunk ${prev.chunk.index}`,
    confidence_downgrade: 'exact → high'
  }
  curr.overlap_corrected = true

  warnings.push(curr.validation_warning)
}
```

### Example 2: Updated ChunkQualityPanel

```typescript
// src/components/sidebar/ChunkQualityPanel.tsx

'use client'

import { useCallback, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useUnvalidatedChunks } from '@/hooks/use-unvalidated-chunks'
import { validateChunkPosition, updateChunkOffsets } from '@/app/actions/chunks'
import { toast } from 'sonner'
import { CheckCircle, AlertTriangle, FileText } from 'lucide-react'

interface ChunkQualityPanelProps {
  documentId: string
  onNavigateToChunk?: (chunkId: string, options?: { correctionMode?: boolean }) => void
}

export function ChunkQualityPanel({ documentId, onNavigateToChunk }: ChunkQualityPanelProps) {
  const { data, isLoading } = useUnvalidatedChunks(documentId)
  const [correctionMode, setCorrectionMode] = useState<string | null>(null)

  const handleValidate = useCallback(async (chunkId: string) => {
    const result = await validateChunkPosition(chunkId, documentId)
    if (result.success) {
      toast.success('Chunk position validated')
    } else {
      toast.error('Failed to validate', { description: result.error })
    }
  }, [documentId])

  const handleFixPosition = useCallback((chunkId: string) => {
    setCorrectionMode(chunkId)
    onNavigateToChunk?.(chunkId, { correctionMode: true })
  }, [onNavigateToChunk])

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!data || data.all.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <p className="text-sm">All chunks validated</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Chunks Needing Validation</CardTitle>
          <CardDescription>
            {data.overlapCorrected.length} overlap-corrected, {data.synthetic.length} synthetic
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Overlap-corrected chunks */}
      {data.overlapCorrected.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Overlap-Corrected Chunks ({data.overlapCorrected.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {data.overlapCorrected.map(chunk => (
                <AccordionItem key={chunk.id} value={chunk.id}>
                  <AccordionTrigger>
                    <Badge variant="outline" className="bg-orange-500/10">
                      Chunk {chunk.chunk_index}
                    </Badge>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">{chunk.validation_warning}</p>

                      {chunk.validation_details && (
                        <div className="text-xs space-y-1 bg-muted p-2 rounded">
                          <p><strong>Original:</strong> [{chunk.validation_details.original_offsets?.start}-{chunk.validation_details.original_offsets?.end}]</p>
                          <p><strong>Adjusted:</strong> [{chunk.validation_details.adjusted_offsets?.start}-{chunk.validation_details.adjusted_offsets?.end}]</p>
                          <p><strong>Reason:</strong> {chunk.validation_details.reason}</p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleValidate(chunk.id)}>
                          ✅ Position OK
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleFixPosition(chunk.id)}>
                          🔧 Fix Position
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onNavigateToChunk?.(chunk.id)}>
                          📍 View
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Synthetic chunks */}
      {data.synthetic.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Synthetic Chunks ({data.synthetic.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {data.synthetic.map(chunk => (
                <AccordionItem key={chunk.id} value={chunk.id}>
                  <AccordionTrigger>
                    <Badge variant="outline" className="bg-yellow-500/10">
                      Chunk {chunk.chunk_index}
                    </Badge>
                  </AccordionTrigger>
                  <AccordionContent>
                    {/* Similar structure as overlap-corrected */}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

### Example 3: Server Action with Overlap Detection

```typescript
// src/app/actions/chunks.ts

export async function updateChunkOffsets(input: {
  chunkId: string
  newStartOffset: number
  newEndOffset: number
  documentId: string
  reason?: string
}) {
  const supabase = await createClient()

  // Get current chunk
  const { data: chunk } = await supabase
    .from('chunks')
    .select('*')
    .eq('id', input.chunkId)
    .single()

  if (!chunk) return { success: false, error: 'Chunk not found' }

  // Get adjacent chunks
  const { data: adjacent } = await supabase
    .from('chunks')
    .select('id, chunk_index, start_offset, end_offset')
    .eq('document_id', input.documentId)
    .or(`chunk_index.eq.${chunk.chunk_index - 1},chunk_index.eq.${chunk.chunk_index + 1}`)

  // Check for overlaps
  const hasOverlap = adjacent?.some(adj => {
    return (
      (input.newStartOffset >= adj.start_offset && input.newStartOffset < adj.end_offset) ||
      (input.newEndOffset > adj.start_offset && input.newEndOffset <= adj.end_offset)
    )
  })

  if (hasOverlap) {
    return { success: false, error: 'Overlaps with adjacent chunks', adjacentChunks: adjacent }
  }

  // Build correction history
  const history = [
    ...(chunk.correction_history || []),
    {
      timestamp: new Date().toISOString(),
      old_offsets: { start: chunk.start_offset, end: chunk.end_offset },
      new_offsets: { start: input.newStartOffset, end: input.newEndOffset },
      reason: input.reason || 'manual_correction'
    }
  ]

  // Update chunk
  await supabase
    .from('chunks')
    .update({
      start_offset: input.newStartOffset,
      end_offset: input.newEndOffset,
      position_validated: true,
      position_corrected: true,
      correction_history: history
    })
    .eq('id', input.chunkId)

  revalidatePath(`/read/${input.documentId}`)
  return { success: true }
}
```

---

## Testing Strategy

### Unit Tests

**Test 1: Bulletproof Matcher Attaches Warnings**
```typescript
// worker/lib/local/__tests__/bulletproof-matcher-warnings.test.ts

describe('Bulletproof Matcher Validation Warnings', () => {
  test('attaches overlap warning when chunks overlap', async () => {
    const markdown = 'Test content...'
    const chunks: DoclingChunk[] = [
      { index: 0, content: 'First chunk', meta: {}, /* ... */ },
      { index: 1, content: 'Second chunk', meta: {}, /* ... */ }
    ]

    // Simulate overlap scenario
    const { chunks: results } = await bulletproofMatch(markdown, chunks)

    const overlappedChunk = results.find(r => r.overlap_corrected)
    expect(overlappedChunk).toBeDefined()
    expect(overlappedChunk?.validation_warning).toContain('overlap corrected')
    expect(overlappedChunk?.validation_details?.type).toBe('overlap_corrected')
  })

  test('attaches synthetic warning for Layer 4 chunks', async () => {
    // Test synthetic chunk generation
  })
})
```

**Test 2: Server Action Overlap Detection**
```typescript
// src/app/actions/__tests__/chunks.test.ts

describe('updateChunkOffsets', () => {
  test('prevents overlaps with adjacent chunks', async () => {
    const result = await updateChunkOffsets({
      chunkId: 'chunk-2',
      newStartOffset: 500,  // Overlaps with chunk-1 (450-600)
      newEndOffset: 700,
      documentId: 'doc-1'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('overlap')
    expect(result.adjacentChunks).toBeDefined()
  })

  test('allows valid offset updates', async () => {
    const result = await updateChunkOffsets({
      chunkId: 'chunk-2',
      newStartOffset: 650,  // No overlap
      newEndOffset: 800,
      documentId: 'doc-1'
    })

    expect(result.success).toBe(true)
  })

  test('tracks correction history', async () => {
    await updateChunkOffsets({
      chunkId: 'chunk-2',
      newStartOffset: 650,
      newEndOffset: 800,
      documentId: 'doc-1',
      reason: 'test_correction'
    })

    const chunk = await getChunkById('chunk-2')
    expect(chunk.correction_history).toHaveLength(1)
    expect(chunk.correction_history[0].reason).toBe('test_correction')
  })
})
```

### Integration Tests

**Test 3: End-to-End Processing with Warnings**
```typescript
// worker/__tests__/integration/validation-warnings.test.ts

describe('Validation Warnings E2E', () => {
  test('processes document and persists warnings to database', async () => {
    // Use fixture with known overlaps
    const pdfBuffer = await loadFixture('overlap-test.pdf')

    // Process document
    await processDocument(pdfBuffer, { mode: 'local' })

    // Query chunks from database
    const chunks = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', testDocId)

    // Verify warnings persisted
    const withWarnings = chunks.filter(c => c.validation_warning !== null)
    expect(withWarnings.length).toBeGreaterThan(0)

    const overlapped = chunks.find(c => c.overlap_corrected)
    expect(overlapped?.validation_details?.type).toBe('overlap_corrected')
  })
})
```

### Manual Testing Checklist

- [ ] **Process Document**: Upload PDF in LOCAL mode, verify matching completes
- [ ] **Check Database**: Query chunks table, verify validation_warning populated
- [ ] **Open Quality Panel**: Navigate to document, verify panel shows unvalidated chunks
- [ ] **Validate Chunk**: Click "Position OK", verify chunk disappears from panel
- [ ] **Fix Chunk (Valid)**: Enter correction mode, select text, submit valid correction
- [ ] **Fix Chunk (Overlap)**: Try to submit overlapping offsets, verify error message
- [ ] **Check History**: Query correction_history in database, verify entries
- [ ] **Logging**: Check console logs, verify clear messaging (synthetic vs overlap)

---

## Validation Gates

### Pre-Implementation Checklist

- [x] Migration 047 reviewed by architect (backward compatible)
- [x] MatchResult interface change won't break existing code (additive only)
- [x] Server action security reviewed (auth not needed for personal tool)
- [x] UI mockup approved by user (validation/correction workflow)

### Implementation Validation

**After Phase 2 (Bulletproof Matcher)**:
```bash
cd worker
npm run test:unit -- bulletproof-matcher
# Verify: Tests pass, warnings attached to MatchResult
```

**After Phase 3 (PDF Processor)**:
```bash
cd worker
npm run test:integration
# Verify: Warnings saved to database during processing
```

**After Phase 4 (Server Actions)**:
```bash
npm test -- src/app/actions/chunks.test.ts
# Verify: Overlap detection works, correction history tracked
```

**After Phase 6 (UI)**:
```bash
npm run dev
# Manual test: Open ChunkQualityPanel, verify all unvalidated chunks shown
# Test validation button, test correction workflow
```

### Deployment Validation

**Before Merge**:
```bash
# Run full test suite
npm test
cd worker && npm run test:full-validation

# Check TypeScript
npm run type-check

# Verify migration
npx supabase db reset
# Check: Migration 047 applies cleanly, no errors
```

**After Deployment**:
- [ ] Process test document in LOCAL mode
- [ ] Verify ChunkQualityPanel shows warnings
- [ ] Test validation action
- [ ] Test correction action with overlap detection
- [ ] Check correction_history in production database

---

## Edge Cases & Error Handling

### Edge Case 1: No Adjacent Chunks

**Scenario**: First or last chunk in document
**Handling**: Overlap detection skips if no adjacent chunks found
**Code**: Check `adjacentChunks?.length` before overlap validation

### Edge Case 2: Correction Creates New Overlap

**Scenario**: User corrects chunk 5, but new offsets overlap with chunk 6
**Handling**: Server action returns error with adjacent chunk details
**UI**: Show toast with error message, keep correction dialog open

### Edge Case 3: Concurrent Corrections

**Scenario**: User opens multiple documents, corrects chunks simultaneously
**Handling**: Each correction is atomic (single UPDATE query)
**Risk**: Low (personal tool, single user)

### Edge Case 4: Very Large Documents

**Scenario**: Document with 1000+ chunks, many needing validation
**Handling**: Use virtual scrolling in accordion (react-virtuoso integration)
**Performance**: Index on `position_validated` ensures fast queries

### Edge Case 5: Correction History Overflow

**Scenario**: User corrects same chunk 100+ times
**Handling**: JSONB array can handle large arrays, but limit to last 50 entries
**Code**: Trim `correction_history` to last 50 entries before insert

### Error Handling Strategy

**Database Errors**:
- Catch and log at server action level
- Return `{ success: false, error: message }` to UI
- Show toast notification with retry option

**Validation Errors**:
- Use Zod for input validation
- Return descriptive error messages (e.g., "Offset must be positive")
- Prevent invalid data from reaching database

**UI Errors**:
- Loading states with Skeleton components
- Empty states when no chunks need validation
- Error boundaries for component crashes

---

## Dependencies & Prerequisites

### Database
- PostgreSQL with existing `chunks` table (migration 001, 045)
- Supabase client (service role access)

### Existing Code
- `worker/lib/local/bulletproof-matcher.ts` - Generates MatchResult objects
- `worker/processors/pdf-processor.ts` - Saves chunks to database
- `src/lib/reader/offset-calculator.ts` - Text selection → offset calculation
- `src/components/ui/*` - shadcn/ui components (Card, Badge, Button, Accordion)

### External Libraries
- None required (all features use existing dependencies)

---

## Performance Considerations

### Query Optimization

**Index on position_validated**:
```sql
CREATE INDEX idx_chunks_needs_validation
  ON chunks(document_id, position_validated)
  WHERE position_validated = FALSE;
```

**Impact**: O(log n) lookup for unvalidated chunks instead of O(n) table scan

### Correction History Size

**Strategy**: Limit correction_history to last 50 entries
```typescript
const trimmedHistory = [...(chunk.correction_history || []), newEntry].slice(-50)
```

**Impact**: Prevents JSONB column from growing unbounded

### UI Rendering

**Virtual Scrolling**: If >100 chunks need validation, integrate react-virtuoso:
```typescript
import { Virtuoso } from 'react-virtuoso'

<Virtuoso
  data={data.all}
  itemContent={(index, chunk) => <ChunkItem chunk={chunk} />}
/>
```

---

## Security Considerations

### Authentication
- Personal tool: No multi-user auth required
- Service role operations: Safe (RLS disabled by design)

### Input Validation
- Zod schemas for all server actions
- Positive integer checks for offsets
- UUID validation for IDs

### SQL Injection
- Using Supabase client (parameterized queries)
- No raw SQL in application code

### XSS Prevention
- All user input sanitized by React
- markdown content already sanitized during processing

---

## Rollback Plan

### If Issues Arise

**Phase 1: Database Issues**
- Rollback migration 047: `npx supabase db reset --db-url <previous_version>`
- No data loss (additive migration only)

**Phase 2: Matcher Issues**
- Revert bulletproof-matcher.ts changes
- System continues working (warnings optional)

**Phase 3: UI Issues**
- Revert ChunkQualityPanel to previous version
- Users can still use old synthetic-only validation

**Phase 4: Server Action Issues**
- Disable correction action
- Keep validation action working

### Rollback Commands

```bash
# Revert migration
git revert <migration_commit>
npx supabase db push

# Revert code changes
git revert <feature_branch_merge>
npm run dev

# Emergency: Disable feature with feature flag
# Add to .env.local
ENABLE_CHUNK_CORRECTION=false
```

---

## Success Metrics

### Quantitative Metrics

- **Warning Persistence**: 100% of warnings persisted to database
- **UI Accuracy**: All unvalidated chunks visible in ChunkQualityPanel
- **Correction Success Rate**: >95% of valid corrections succeed
- **Overlap Detection Accuracy**: 100% of overlaps caught
- **Performance**: Query unvalidated chunks in <100ms

### Qualitative Metrics

- **User Satisfaction**: Can validate/correct chunks without confusion
- **Logging Clarity**: No more "0 synthetic but 7 need validation" confusion
- **Error Messages**: Clear, actionable error messages for invalid corrections

### Validation Criteria

**Must Pass Before Merge**:
- [ ] All unit tests pass
- [ ] Integration tests pass with real fixtures
- [ ] Manual test checklist completed
- [ ] No TypeScript errors
- [ ] Migration applies cleanly on fresh database

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Batch Validation**: Select multiple chunks, validate all at once
2. **Correction Suggestions**: AI suggests correct boundaries based on content analysis
3. **Review Queue**: Flag chunks for expert review (separate `chunk_reviews` table)
4. **Annotation Recovery Integration**: Trigger annotation recovery after correction
5. **Audit Trail UI**: Show full correction history in panel
6. **Undo Corrections**: Revert to previous offsets from history

### Technical Debt

1. **Optimize Correction History**: Consider moving to separate table if >50 corrections common
2. **Real-time Updates**: Use Supabase realtime subscriptions for collaborative review (multi-user)
3. **Performance Monitoring**: Track query times, add telemetry for correction success rates

---

## Appendix

### Reference Files

**Key Implementation Files**:
- `worker/lib/local/bulletproof-matcher.ts:48-66` - MatchResult interface
- `worker/lib/local/bulletproof-matcher.ts:833-868` - Overlap correction logic
- `worker/processors/pdf-processor.ts:327-363` - Chunk insertion
- `src/lib/reader/offset-calculator.ts:186-242` - Text selection → offsets
- `src/app/actions/annotations.ts:273-466` - Server action pattern reference

**Documentation**:
- `CLAUDE.md` - Project overview and conventions
- `docs/testing/TESTING_RULES.md` - Testing strategy
- `docs/processing-pipeline/bulletproof-metadata-extraction.md` - Matching system details

### Glossary

- **Bulletproof Matching**: 5-layer chunk recovery system (Layer 1: fuzzy, Layer 2: embeddings, Layer 3: LLM, Layer 4: interpolation)
- **Overlap Correction**: Automatic adjustment when chunk offsets overlap (forces sequential ordering)
- **Synthetic Chunk**: Chunk positioned via Layer 4 interpolation (approximate position)
- **Validation**: User confirms chunk position is correct
- **Correction**: User adjusts chunk boundaries via text selection
- **ProcessedChunk**: Chunk object saved to database (includes metadata + offsets)
- **MatchResult**: Chunk matching result from bulletproof matcher (includes confidence + warnings)

---

## Task Breakdown Document

See: `docs/tasks/chunk-validation-correction-system.md` (generated by team-lead-task-breakdown agent)

---

**End of PRP Document**

---

## Confidence Assessment

**One-Pass Implementation Confidence: 9/10**

**High Confidence Factors**:
- ✅ All patterns exist in codebase (server actions, hooks, UI components)
- ✅ Clear implementation path (8 phases, logical dependencies)
- ✅ Comprehensive code examples from codebase analysis
- ✅ Edge cases identified with handling strategies
- ✅ Validation gates at each phase
- ✅ Rollback plan documented

**Risk Factors** (Low):**
- ⚠️ Correction workflow UI complexity (text selection + confirmation) - 10% risk
- ⚠️ Overlap detection edge cases (3+ adjacent chunks, non-sequential) - 5% risk

**Mitigation**:
- Detailed code examples provided for correction workflow
- Comprehensive overlap detection test suite specified
- Manual testing checklist ensures edge cases covered

**Expected Implementation Time**: 4-6 hours for experienced TypeScript/React developer

**Recommended Executor**: Primary developer (familiarity with codebase patterns reduces integration risk)
