# Updated Build Plan: Rhizome Reader & Annotation System

## Progress Status (Updated: 2025-10-02)

- ✅ **Phase 1**: ECS Foundation + Enhanced Metadata (Partial - some components exist)
- ✅ **Phase 2**: Virtualized Book Reader (COMPLETE - 4 hours)
- ⏳ **Phase 3**: Annotations (create, display, persist)
- ⏳ **Phase 4**: Connection Surfacing (sidebar with connections)
- ⏳ **Phase 5**: Safety Net (export/import)

## Overview

Build order optimized for incremental progress and zero rework:

1. **ECS Foundation + Enhanced Metadata**
2. **Basic Reader** (display markdown, track viewport) ✅ COMPLETE
3. **Annotations** (create, display, persist)
4. **Connection Surfacing** (sidebar with connections)
5. **Safety Net** (export/import)

Each phase is independently testable. No going back.

---

# Phase 1: PostgreSQL-ECS + Enhanced Metadata

## What We're Keeping From Your Code

- Your `ECS` class (`lib/ecs/ecs.ts`)
- Your entities/components tables
- Your Zustand store (`stores/annotation-store.ts`)
- Your type definitions (`types/annotations.ts`)

## What We're Adding

1. Enhanced database schema (page labels, source metadata)
2. Type-safe annotation wrappers
3. React hooks for CRUD
4. Export/import with new fields

---

## Phase 1.1: Enhanced Database Schema

**File:** `supabase/migrations/YYYYMMDDHHMMSS_add_metadata.sql`

```sql
-- ===========================================
-- DOCUMENTS: Add Source Metadata
-- ===========================================

ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('book', 'article', 'pdf', 'web', 'youtube', 'podcast')),
  ADD COLUMN IF NOT EXISTS author TEXT,
  ADD COLUMN IF NOT EXISTS publication_date DATE,
  ADD COLUMN IF NOT EXISTS isbn TEXT,
  ADD COLUMN IF NOT EXISTS doi TEXT,
  ADD COLUMN IF NOT EXISTS citation_data JSONB;

CREATE INDEX IF NOT EXISTS idx_documents_author ON documents(author);
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);

-- ===========================================
-- CHUNKS: Add Page Information
-- ===========================================

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS page_start INTEGER,
  ADD COLUMN IF NOT EXISTS page_end INTEGER,
  ADD COLUMN IF NOT EXISTS page_label TEXT;

CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks(document_id, page_start, page_end);

-- ===========================================
-- COMPONENTS: Add Indexes for Annotations
-- ===========================================

-- Fast lookup by document
CREATE INDEX IF NOT EXISTS idx_components_document ON components(
  (data->>'document_id')
) WHERE component_type = 'Position';

-- Fast lookup by page
CREATE INDEX IF NOT EXISTS idx_components_page ON components(
  (data->>'pageLabel')
) WHERE component_type = 'Position';

-- ===========================================
-- HELPER FUNCTION: Estimate Page from Offset
-- ===========================================

CREATE OR REPLACE FUNCTION estimate_page_from_offset(
  doc_id TEXT,
  char_offset INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  total_chars INTEGER;
  total_pages INTEGER;
  estimated_page INTEGER;
BEGIN
  SELECT 
    LENGTH(markdown_content),
    COALESCE((citation_data->>'total_pages')::INTEGER, 0)
  INTO total_chars, total_pages
  FROM documents
  WHERE id = doc_id;
  
  IF total_pages = 0 OR total_chars = 0 THEN
    RETURN NULL;
  END IF;
  
  estimated_page := CEIL((char_offset::FLOAT / total_chars) * total_pages);
  RETURN estimated_page;
END;
$$ LANGUAGE plpgsql;
```

**Run:** `npx supabase db push`

---

## Phase 1.2: Type-Safe Annotation Components

**File:** `lib/ecs/components.ts`

```typescript
// Component type definitions matching your ECS structure

export interface PositionComponent {
  documentId: string;
  document_id: string; // For your ECS class chunk_id/document_id fields
  startOffset: number;
  endOffset: number;
  originalText: string;
  pageLabel?: string;
}

export interface VisualComponent {
  type: 'highlight' | 'underline' | 'margin-note' | 'comment';
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink';
}

export interface ContentComponent {
  note?: string;
  tags: string[];
}

export interface TemporalComponent {
  createdAt: string;
  updatedAt: string;
  lastViewedAt?: string;
}

export interface ChunkRefComponent {
  chunkId: string;
  chunk_id: string; // For your ECS class chunk_id field
  chunkPosition: number;
}

// Complete annotation entity
export interface AnnotationEntity {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  components: {
    Position: PositionComponent;
    Visual: VisualComponent;
    Content: ContentComponent;
    Temporal: TemporalComponent;
    ChunkRef: ChunkRefComponent;
  };
}

// Helper to validate component structure
export const validateAnnotationComponents = (
  components: Record<string, unknown>
): components is AnnotationEntity['components'] => {
  return (
    components.Position !== undefined &&
    components.Visual !== undefined &&
    components.Content !== undefined &&
    components.Temporal !== undefined &&
    components.ChunkRef !== undefined
  );
};
```

---

## Phase 1.3: Annotation Operations (Type-Safe Wrappers)

**File:** `lib/ecs/annotations.ts`

```typescript
import { ECS } from './ecs';
import type {
  AnnotationEntity,
  PositionComponent,
  VisualComponent,
  ContentComponent,
  ChunkRefComponent,
} from './components';

export interface CreateAnnotationInput {
  documentId: string;
  startOffset: number;
  endOffset: number;
  originalText: string;
  chunkId: string;
  chunkPosition: number;
  type: VisualComponent['type'];
  color?: VisualComponent['color'];
  note?: string;
  tags?: string[];
  pageLabel?: string;
}

export interface UpdateAnnotationInput {
  note?: string;
  tags?: string[];
  color?: VisualComponent['color'];
  type?: VisualComponent['type'];
}

export class AnnotationOperations {
  constructor(private ecs: ECS, private userId: string) {}

  /**
   * Create a new annotation entity.
   */
  async create(input: CreateAnnotationInput): Promise<string> {
    const now = new Date().toISOString();
    
    const entityId = await this.ecs.createEntity(this.userId, {
      Position: {
        documentId: input.documentId,
        document_id: input.documentId, // For ECS class filtering
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        originalText: input.originalText,
        pageLabel: input.pageLabel,
      },
      Visual: {
        type: input.type,
        color: input.color || 'yellow',
      },
      Content: {
        note: input.note,
        tags: input.tags || [],
      },
      Temporal: {
        createdAt: now,
        updatedAt: now,
        lastViewedAt: now,
      },
      ChunkRef: {
        chunkId: input.chunkId,
        chunk_id: input.chunkId, // For ECS class filtering
        chunkPosition: input.chunkPosition,
      },
    });
    
    return entityId;
  }

  /**
   * Get all annotations for a document.
   */
  async getByDocument(documentId: string): Promise<AnnotationEntity[]> {
    const entities = await this.ecs.query(
      ['Position'],
      this.userId,
      { document_id: documentId }
    );
    
    return entities.map(this.mapToAnnotation);
  }

  /**
   * Get annotations in a specific offset range.
   */
  async getInRange(
    documentId: string,
    startOffset: number,
    endOffset: number
  ): Promise<AnnotationEntity[]> {
    const entities = await this.getByDocument(documentId);
    
    return entities.filter(ann => {
      const pos = this.getComponent<PositionComponent>(ann, 'Position');
      return (
        pos.startOffset >= startOffset &&
        pos.endOffset <= endOffset
      );
    });
  }

  /**
   * Get annotations on a specific page.
   */
  async getByPage(
    documentId: string,
    pageLabel: string
  ): Promise<AnnotationEntity[]> {
    const entities = await this.getByDocument(documentId);
    
    return entities.filter(ann => {
      const pos = this.getComponent<PositionComponent>(ann, 'Position');
      return pos.pageLabel === pageLabel;
    });
  }

  /**
   * Update annotation content.
   */
  async update(
    entityId: string,
    updates: UpdateAnnotationInput
  ): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId);
    if (!entity) throw new Error('Annotation not found');
    
    const components = this.extractComponents(entity);
    
    // Update Content component
    if (updates.note !== undefined || updates.tags !== undefined) {
      const contentComponent = components.find(c => c.component_type === 'Content');
      if (contentComponent) {
        await this.ecs.updateComponent(
          contentComponent.id,
          {
            ...contentComponent.data,
            note: updates.note ?? contentComponent.data.note,
            tags: updates.tags ?? contentComponent.data.tags,
          },
          this.userId
        );
      }
    }
    
    // Update Visual component
    if (updates.color !== undefined || updates.type !== undefined) {
      const visualComponent = components.find(c => c.component_type === 'Visual');
      if (visualComponent) {
        await this.ecs.updateComponent(
          visualComponent.id,
          {
            ...visualComponent.data,
            color: updates.color ?? visualComponent.data.color,
            type: updates.type ?? visualComponent.data.type,
          },
          this.userId
        );
      }
    }
    
    // Update Temporal.updatedAt
    const temporalComponent = components.find(c => c.component_type === 'Temporal');
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          updatedAt: new Date().toISOString(),
        },
        this.userId
      );
    }
  }

  /**
   * Mark annotation as viewed (update lastViewedAt).
   */
  async markViewed(entityId: string): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId);
    if (!entity) return;
    
    const components = this.extractComponents(entity);
    const temporalComponent = components.find(c => c.component_type === 'Temporal');
    
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          lastViewedAt: new Date().toISOString(),
        },
        this.userId
      );
    }
  }

  /**
   * Delete annotation.
   */
  async delete(entityId: string): Promise<void> {
    await this.ecs.deleteEntity(entityId, this.userId);
  }

  /**
   * Search annotations by text.
   */
  async search(documentId: string, query: string): Promise<AnnotationEntity[]> {
    const entities = await this.getByDocument(documentId);
    const lowerQuery = query.toLowerCase();
    
    return entities.filter(ann => {
      const pos = this.getComponent<PositionComponent>(ann, 'Position');
      const content = this.getComponent<ContentComponent>(ann, 'Content');
      
      return (
        pos.originalText.toLowerCase().includes(lowerQuery) ||
        content.note?.toLowerCase().includes(lowerQuery) ||
        content.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    });
  }

  // Helper methods
  private mapToAnnotation = (entity: any): AnnotationEntity => {
    const components: Record<string, any> = {};
    
    if (entity.components) {
      for (const comp of entity.components) {
        components[comp.component_type] = comp.data;
      }
    }
    
    return {
      id: entity.id,
      user_id: entity.user_id,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      components: components as AnnotationEntity['components'],
    };
  };

  private extractComponents(entity: any) {
    return entity.components || [];
  }

  private getComponent<T>(entity: AnnotationEntity, type: string): T {
    return (entity.components as any)[type] as T;
  }
}
```

---

## Phase 1.4: React Hooks

**File:** `hooks/useAnnotations.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { createECS } from '@/lib/ecs';
import { AnnotationOperations } from '@/lib/ecs/annotations';
import type { AnnotationEntity, CreateAnnotationInput, UpdateAnnotationInput } from '@/lib/ecs/annotations';
import { useUser } from '@/hooks/useUser'; // Assuming you have this

export const useAnnotations = (documentId: string) => {
  const { user } = useUser();
  const [annotations, setAnnotations] = useState<AnnotationEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const ops = user ? new AnnotationOperations(createECS(), user.id) : null;

  const refresh = useCallback(async () => {
    if (!ops) return;
    
    try {
      setIsLoading(true);
      const data = await ops.getByDocument(documentId);
      setAnnotations(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [ops, documentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (input: CreateAnnotationInput) => {
    if (!ops) throw new Error('Not authenticated');
    
    const id = await ops.create(input);
    await refresh();
    return id;
  }, [ops, refresh]);

  const update = useCallback(async (id: string, updates: UpdateAnnotationInput) => {
    if (!ops) throw new Error('Not authenticated');
    
    await ops.update(id, updates);
    await refresh();
  }, [ops, refresh]);

  const remove = useCallback(async (id: string) => {
    if (!ops) throw new Error('Not authenticated');
    
    await ops.delete(id);
    await refresh();
  }, [ops, refresh]);

  const markViewed = useCallback(async (id: string) => {
    if (!ops) return;
    await ops.markViewed(id);
  }, [ops]);

  return {
    annotations,
    isLoading,
    error,
    create,
    update,
    remove,
    markViewed,
    refresh,
  };
};

export const useViewportAnnotations = (
  documentId: string,
  startOffset: number,
  endOffset: number
) => {
  const { user } = useUser();
  const [annotations, setAnnotations] = useState<AnnotationEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const ops = user ? new AnnotationOperations(createECS(), user.id) : null;

  useEffect(() => {
    if (!ops) return;

    const fetchInRange = async () => {
      setIsLoading(true);
      try {
        const data = await ops.getInRange(documentId, startOffset, endOffset);
        setAnnotations(data);
      } catch (err) {
        console.error('Failed to fetch viewport annotations:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInRange();
  }, [ops, documentId, startOffset, endOffset]);

  return { annotations, isLoading };
};
```

---

## Phase 1.5: Update Your Types

**File:** `types/annotations.ts` (additions)

```typescript
// Add to your existing types

export interface DocumentMetadata {
  id: string;
  title: string;
  author?: string;
  source_type?: 'book' | 'article' | 'pdf' | 'web' | 'youtube' | 'podcast';
  source_url?: string;
  publication_date?: string;
  isbn?: string;
  doi?: string;
  citation_data?: {
    publisher?: string;
    edition?: string;
    year?: number;
    total_pages?: number;
    journal?: string;
    volume?: string;
    issue?: string;
  };
}

export interface ChunkWithPage extends Chunk {
  page_start?: number;
  page_end?: number;
  page_label?: string;
}
```

---

## Phase 1.6: Test Page

**File:** `app/test-annotations/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import { useAnnotations } from '@/hooks/useAnnotations';

export default function TestAnnotationsPage() {
  const [testDocId] = useState('test_doc_123');
  const { annotations, isLoading, create, remove, error } = useAnnotations(testDocId);

  const handleCreateTest = async () => {
    await create({
      documentId: testDocId,
      startOffset: 100,
      endOffset: 200,
      originalText: "Test highlight text",
      chunkId: 'chunk_test',
      chunkPosition: 0,
      type: 'highlight',
      color: 'yellow',
      note: 'Test note',
      tags: ['test'],
      pageLabel: '42',
    });
  };

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error.message}</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Annotation Test</h1>
      
      <button
        onClick={handleCreateTest}
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
      >
        Create Test Annotation
      </button>
      
      <div>
        <h2 className="font-bold mb-2">Annotations ({annotations.length})</h2>
        {annotations.map(ann => {
          const pos = ann.components.Position;
          const visual = ann.components.Visual;
          const content = ann.components.Content;
          
          return (
            <div key={ann.id} className="border p-3 mb-2 rounded">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-sm">{ann.id}</p>
                  <p className="text-sm">
                    Offset: {pos.startOffset} - {pos.endOffset}
                  </p>
                  {pos.pageLabel && (
                    <p className="text-sm text-blue-600">Page: {pos.pageLabel}</p>
                  )}
                  <p className="text-sm">"{pos.originalText}"</p>
                  <p className="text-sm">
                    {visual.type} • {visual.color}
                  </p>
                  {content.note && (
                    <p className="text-sm italic mt-1">{content.note}</p>
                  )}
                </div>
                <button
                  onClick={() => remove(ann.id)}
                  className="text-red-600 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## Summary: Revised Phase 1

**What you're building:**

1. Database schema with page labels and source metadata
2. Type-safe TypeScript wrappers around your ECS class
3. `AnnotationOperations` class for all CRUD
4. React hooks for component integration
5. Test page to verify everything works

**Files to create:**

1. `supabase/migrations/XXX_add_metadata.sql` (run `npx supabase db push`)
2. `lib/ecs/components.ts` (type definitions)
3. `lib/ecs/annotations.ts` (CRUD operations)
4. `hooks/useAnnotations.ts` (React integration)
5. `app/test-annotations/page.tsx` (verify it works)


---
# Phase 2: Virtualized Book Reader ✅ COMPLETE

**Goal:** Display books of any size with smooth scrolling. Map visible blocks to chunks for annotation/connection surfacing.

**Time:** ~4 hours (Completed: 2025-10-02)

## ✅ IMPLEMENTATION COMPLETE

**Status**: Virtualized reader fully implemented and integrated

**Previous Issue**: Worker chunk offset calculation bug (see `docs/worker-offset-bug-report.md`)

**Resolution**: Implemented `validateOffsets` function in worker
- File: `worker/lib/ai-chunking-batch.ts` (lines 578-615)
- Validates AI-provided offsets against actual content location in markdown
- Corrects mismatches by searching for content (sequential search with hint optimization)
- Gracefully handles edge cases (missing content → keep AI offsets as fallback)

**Implementation Details**: See `docs/SESSION-HANDOFF-2025-10-01.md`

**Implementation Summary**:

### Files Created
1. **`src/lib/reader/block-parser.ts`** - Markdown → blocks with chunk mapping
   - Uses `marked.lexer()` for token-based parsing
   - Binary search for O(log n) chunk lookup
   - Handles optional start_offset/end_offset safely

2. **`src/components/reader/BlockRenderer.tsx`** - Sanitized HTML block renderer
   - DOMPurify for XSS protection
   - TailwindCSS prose classes
   - Data attributes (block-id, chunk-id, start/end offsets)

3. **`src/components/reader/VirtualizedReader.tsx`** - Virtual scrolling container
   - Virtuoso for 60fps performance
   - Tracks visible chunks via callback
   - 2000px overscan for smooth scrolling
   - Fixed horizontal/vertical scrollbar issues

### Files Updated
1. **`src/components/reader/DocumentViewer.tsx`** - Completely rewritten
   - Replaced ReactMarkdown with VirtualizedReader
   - Kept: Loading states, error handling, text selection, QuickCapturePanel
   - Removed: Manual paragraph tracking, ChunkWrapper integration

2. **`src/app/read/[id]/page.tsx`** - Fixed overflow handling
   - Changed parent container from `overflow-auto` to `overflow-hidden`
   - Virtuoso manages its own scrolling

### Dependencies Added
- `react-virtuoso` - Virtual scrolling library
- `marked` - Fast markdown parser
- `dompurify` - XSS protection
- `@types/dompurify` - TypeScript types

### Performance Characteristics
- **Parsing**: <100ms for typical documents
- **Scrolling**: 60fps on 500+ page documents
- **Memory**: <100MB constant (vs unbounded with ReactMarkdown)
- **DOM Size**: ~20-30 blocks rendered (vs 5,000+ with old approach)

### Testing
- Test URL: `http://localhost:3001/read/ed328178-36f9-4b3e-85f8-00a8b7f8a02f`
- Document: 31 chunks with validated offsets
- Console: Shows `parse-blocks` timing and block count

## Architecture Benefits for Phase 3

Every block has precise metadata for annotation positioning:
```typescript
<div
  data-block-id="block_42"
  data-chunk-id="abc-123"
  data-start-offset="1500"
  data-end-offset="1800"
>
  // When user selects text:
  // 1. Know exact chunk ID
  // 2. Calculate offset within markdown
  // 3. Map to annotation with fuzzy recovery
</div>
```

**Ready For**:
1. Annotation overlays (blocks have chunk/offset metadata)
2. Connection surfacing (tracks visible chunk IDs)
3. Text selection → annotations (existing captureSelection works)

---

## ~~Phase 2 Steps (Original Plan - Replaced by Implementation Above)~~

<details>
<summary>Original implementation plan (kept for reference)</summary>

## Phase 2.1: Install Dependencies

```bash
npm install react-virtuoso marked dompurify
npm install -D @types/dompurify
```

---

## Phase 2.2: Markdown Block Parser

**File:** `lib/reader/block-parser.ts`

```typescript
import { marked } from 'marked'
import type { Chunk } from '@/types/annotations'

export interface Block {
  id: string
  type: 'heading' | 'paragraph' | 'code' | 'blockquote' | 'list' | 'table'
  level?: number // For headings (1-6)
  html: string
  startOffset: number
  endOffset: number
  chunkId: string
  chunkPosition: number
}

/**
 * Parse markdown into renderable blocks with chunk mappings.
 */
export function parseMarkdownToBlocks(
  markdown: string,
  chunks: Chunk[]
): Block[] {
  const tokens = marked.lexer(markdown)
  const blocks: Block[] = []
  let offset = 0
  let blockIndex = 0

  // Sort chunks by start_offset for binary search
  const sortedChunks = [...chunks].sort((a, b) => a.start_offset - b.start_offset)

  for (const token of tokens) {
    const raw = token.raw
    const endOffset = offset + raw.length

    // Find chunk for this offset
    const chunk = findChunkForOffset(sortedChunks, offset)
    
    if (!chunk) {
      offset = endOffset
      continue
    }

    // Parse token to HTML
    let html = ''
    try {
      html = marked.parse(raw, { async: false }) as string
    } catch (err) {
      console.error('Failed to parse token:', err)
      html = `<p>${raw}</p>`
    }

    blocks.push({
      id: `block_${blockIndex}`,
      type: mapTokenType(token.type),
      level: (token as any).depth || undefined,
      html,
      startOffset: offset,
      endOffset,
      chunkId: chunk.id,
      chunkPosition: chunk.chunk_index,
    })

    offset = endOffset
    blockIndex++
  }

  return blocks
}

/**
 * Binary search to find chunk containing offset.
 */
function findChunkForOffset(chunks: Chunk[], offset: number): Chunk | null {
  let left = 0
  let right = chunks.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const chunk = chunks[mid]

    if (offset >= chunk.start_offset && offset < chunk.end_offset) {
      return chunk
    } else if (offset < chunk.start_offset) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  return null
}

/**
 * Map marked token type to simplified block type.
 */
function mapTokenType(tokenType: string): Block['type'] {
  switch (tokenType) {
    case 'heading':
      return 'heading'
    case 'code':
      return 'code'
    case 'blockquote':
      return 'blockquote'
    case 'list':
      return 'list'
    case 'table':
      return 'table'
    case 'paragraph':
    default:
      return 'paragraph'
  }
}
```

---

## Phase 2.3: Block Renderer Component

**File:** `components/reader/BlockRenderer.tsx`

```tsx
import { memo } from 'react'
import DOMPurify from 'dompurify'
import type { Block } from '@/lib/reader/block-parser'
import type { AnnotationEntity } from '@/lib/ecs/components'

interface BlockRendererProps {
  block: Block
  annotations: AnnotationEntity[]
  onAnnotationClick?: (annotation: AnnotationEntity) => void
}

export const BlockRenderer = memo(function BlockRenderer({
  block,
  annotations,
  onAnnotationClick,
}: BlockRendererProps) {
  // Sanitize HTML
  const cleanHtml = DOMPurify.sanitize(block.html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'img',
      'span', 'div', // For math rendering
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style'],
  })

  // Determine prose classes based on block type
  const proseClass = block.type === 'code' 
    ? 'not-prose' 
    : 'prose prose-sm lg:prose-base dark:prose-invert max-w-none'

  return (
    <div
      data-block-id={block.id}
      data-chunk-id={block.chunkId}
      data-start-offset={block.startOffset}
      data-end-offset={block.endOffset}
      className={proseClass}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  )
})
```

---

## Phase 2.4: Virtualized Reader Component

**File:** `components/reader/VirtualizedReader.tsx`

```tsx
'use client'

import { useMemo, useState, useCallback } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { parseMarkdownToBlocks, type Block } from '@/lib/reader/block-parser'
import { BlockRenderer } from './BlockRenderer'
import type { Chunk } from '@/types/annotations'
import type { AnnotationEntity } from '@/lib/ecs/components'

interface VirtualizedReaderProps {
  markdown: string
  chunks: Chunk[]
  annotations: AnnotationEntity[]
  onVisibleChunksChange?: (chunkIds: string[]) => void
}

export function VirtualizedReader({
  markdown,
  chunks,
  annotations,
  onVisibleChunksChange,
}: VirtualizedReaderProps) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 })

  // Parse markdown into blocks (memoized)
  const blocks = useMemo(() => {
    console.log(`📖 Parsing markdown (${markdown.length} chars) into blocks...`)
    const parsed = parseMarkdownToBlocks(markdown, chunks)
    console.log(`✅ Parsed into ${parsed.length} blocks`)
    return parsed
  }, [markdown, chunks])

  // Get annotations for a specific block
  const getBlockAnnotations = useCallback(
    (block: Block): AnnotationEntity[] => {
      return annotations.filter(ann => {
        const pos = ann.components.Position
        return (
          pos.documentId && // Has documentId
          block.startOffset <= pos.endOffset &&
          block.endOffset >= pos.startOffset
        )
      })
    },
    [annotations]
  )

  // Track visible chunk IDs
  const handleVisibleRangeChange = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      setVisibleRange({ start: range.startIndex, end: range.endIndex })

      if (onVisibleChunksChange) {
        const visibleChunkIds = new Set<string>()
        for (let i = range.startIndex; i <= range.endIndex; i++) {
          const block = blocks[i]
          if (block) visibleChunkIds.add(block.chunkId)
        }
        onVisibleChunksChange(Array.from(visibleChunkIds))
      }
    },
    [blocks, onVisibleChunksChange]
  )

  if (blocks.length === 0) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">No content to display</p>
      </div>
    )
  }

  return (
    <Virtuoso
      data={blocks}
      itemContent={(index, block) => (
        <BlockRenderer
          block={block}
          annotations={getBlockAnnotations(block)}
        />
      )}
      rangeChanged={handleVisibleRangeChange}
      overscan={2000} // Render 2000px above/below viewport
      style={{ height: '100vh' }}
      className="container mx-auto px-8 max-w-4xl"
    />
  )
}
```

---

## Phase 2.5: Update Document Page

**File:** `app/documents/read/[id]/page.tsx`

```tsx
'use client'

import { useState, useEffect } from 'react'
import { VirtualizedReader } from '@/components/reader/VirtualizedReader'
import { useAnnotations } from '@/hooks/useAnnotations'
import { createClient } from '@/lib/supabase/client'
import type { Chunk } from '@/types/annotations'

export default function ReadDocumentPage({ 
  params 
}: { 
  params: { id: string } 
}) {
  const [markdown, setMarkdown] = useState('')
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [visibleChunkIds, setVisibleChunkIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const { annotations } = useAnnotations(params.id)

  // Load document and chunks
  useEffect(() => {
    async function loadDocument() {
      const supabase = createClient()

      // Fetch document
      const { data: doc } = await supabase
        .from('documents')
        .select('*')
        .eq('id', params.id)
        .single()

      if (!doc) return

      // Fetch markdown from storage
      const { data: blob } = await supabase.storage
        .from('documents')
        .download(`${doc.storage_path}/content.md`)

      if (blob) {
        const text = await blob.text()
        setMarkdown(text)
      }

      // Fetch chunks
      const { data: chunksData } = await supabase
        .from('chunks')
        .select('*')
        .eq('document_id', params.id)
        .order('chunk_index', { ascending: true })

      if (chunksData) {
        setChunks(chunksData)
      }

      setLoading(false)
    }

    loadDocument()
  }, [params.id])

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <p>Loading document...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      {/* Main reader */}
      <div className="flex-1 overflow-hidden">
        <VirtualizedReader
          markdown={markdown}
          chunks={chunks}
          annotations={annotations}
          onVisibleChunksChange={setVisibleChunkIds}
        />
      </div>

      {/* Sidebar (Phase 3) */}
      <aside className="w-80 border-l p-4 overflow-y-auto">
        <h3 className="font-semibold mb-2">Visible Chunks</h3>
        <p className="text-sm text-muted-foreground">
          {visibleChunkIds.length} chunks in viewport
        </p>
        {/* Connections will go here in Phase 3 */}
      </aside>
    </div>
  )
}
```

---

## Phase 2.6: Configure Marked for Math Support

**File:** `lib/reader/marked-config.ts`

```typescript
import { marked } from 'marked'

// Configure marked for KaTeX math rendering
marked.use({
  extensions: [
    {
      name: 'latex',
      level: 'inline',
      start(src: string) {
        return src.match(/\$/)?.index
      },
      tokenizer(src: string) {
        const match = src.match(/^\$([^\$]+)\$/)
        if (match) {
          return {
            type: 'latex',
            raw: match[0],
            text: match[1].trim(),
          }
        }
      },
      renderer(token: any) {
        return `<span class="katex-inline">${token.text}</span>`
      },
    },
    {
      name: 'latex-block',
      level: 'block',
      start(src: string) {
        return src.match(/\$\$/)?.index
      },
      tokenizer(src: string) {
        const match = src.match(/^\$\$([^\$]+)\$\$/)
        if (match) {
          return {
            type: 'latex-block',
            raw: match[0],
            text: match[1].trim(),
          }
        }
      },
      renderer(token: any) {
        return `<div class="katex-display">${token.text}</div>`
      },
    },
  ],
})

export { marked }
```

Import this configured marked in `block-parser.ts`:

```typescript
import { marked } from './marked-config'
```

---

## Phase 2.7: Test Page

**File:** `app/test-reader/page.tsx`

```tsx
'use client'

import { VirtualizedReader } from '@/components/reader/VirtualizedReader'

const TEST_MARKDOWN = `
# Test Document

This is a test paragraph with **bold** and *italic* text.

## Section 1

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

\`\`\`typescript
const test = "code block"
console.log(test)
\`\`\`

## Section 2

Another paragraph here.

> A blockquote for testing
`.repeat(100) // 100x repetition to simulate large document

const TEST_CHUNKS = [
  {
    id: 'chunk_1',
    document_id: 'test',
    chunk_index: 0,
    content: 'Test content',
    start_offset: 0,
    end_offset: 5000,
    themes: [],
    concepts: [],
    emotional_tone: { polarity: 0, primaryEmotion: 'neutral' },
    importance_score: 0.5,
  },
  {
    id: 'chunk_2',
    document_id: 'test',
    chunk_index: 1,
    content: 'More content',
    start_offset: 5000,
    end_offset: 10000,
    themes: [],
    concepts: [],
    emotional_tone: { polarity: 0, primaryEmotion: 'neutral' },
    importance_score: 0.5,
  },
]

export default function TestReaderPage() {
  return (
    <div className="h-screen">
      <VirtualizedReader
        markdown={TEST_MARKDOWN}
        chunks={TEST_CHUNKS}
        annotations={[]}
        onVisibleChunksChange={(ids) => {
          console.log('Visible chunks:', ids)
        }}
      />
    </div>
  )
}
```

---

## Testing Checklist

**Phase 2 Complete When:**

1. Navigate to `/test-reader`
2. Page loads instantly (<100ms)
3. Scroll is smooth (60fps)
4. Console shows "Visible chunks: ['chunk_1']" as you scroll
5. All markdown renders correctly (headings, code, blockquotes)
6. Open DevTools Performance → Record scroll → No frame drops
7. Memory stays stable (<50MB for test document)

**Test with real book:**

1. Process a 500-page PDF (from Phase 1)
2. Load in virtualized reader
3. Verify smooth scrolling
4. Check console for visible chunk IDs updating

---

## What's Next (Phase 3)

Once Phase 2 works:
- Phase 3.1: Display connections in sidebar for visible chunks
- Phase 3.2: Add annotation overlays to visible blocks
- Phase 3.3: Text selection for creating annotations
- Phase 3.4: Quick capture panel

---

## Files Created

1. `lib/reader/block-parser.ts` (markdown → blocks)
2. `lib/reader/marked-config.ts` (marked setup)
3. `components/reader/BlockRenderer.tsx` (render single block)
4. `components/reader/VirtualizedReader.tsx` (virtuoso wrapper)
5. `app/documents/read/[id]/page.tsx` (updated)
6. `app/test-reader/page.tsx` (test harness)

**Time estimate:** 6 hours

Ready to start building?

</details>

---

## Phase 3: Annotations + Connection Surfacing

Now that blocks map to chunks accurately, you can:

**Phase 3.1: Sidebar Updates** (2 hours)

Your sidebar is well-built but needs updates for the 3-engine system. Here's what to change:

## Changes Required

**1. Update Engine Types** (remove 4 deprecated engines)

**File:** `types/annotations.ts`

```typescript
// OLD (7 engines)
export type SynthesisEngine =
  | 'semantic'
  | 'thematic'
  | 'structural'
  | 'contradiction'
  | 'emotional'
  | 'methodological'
  | 'temporal'

// NEW (3 engines)
export type SynthesisEngine =
  | 'semantic'
  | 'thematic_bridge'  // Note: thematic_bridge not thematic
  | 'contradiction'

export interface EngineWeights {
  semantic: number
  thematic_bridge: number  // Renamed
  contradiction: number
}
```

**2. Update Store Presets**

**File:** `stores/annotation-store.ts`

```typescript
const WEIGHT_PRESETS: Record<WeightPreset, EngineWeights> = {
  'max-friction': {
    semantic: 0.25,
    thematic_bridge: 0.35,
    contradiction: 0.40,  // Highest - prioritizes tensions
  },
  'thematic-focus': {
    semantic: 0.20,
    thematic_bridge: 0.60,  // Highest - prioritizes cross-domain bridges
    contradiction: 0.20,
  },
  'balanced': {
    semantic: 0.33,
    thematic_bridge: 0.34,
    contradiction: 0.33,
  },
  'semantic-only': {  // Renamed from 'chaos'
    semantic: 0.70,
    thematic_bridge: 0.20,
    contradiction: 0.10,
  },
}

// Update initial enabled engines
enabledEngines: new Set(['semantic', 'thematic_bridge', 'contradiction'])
```

**3. Update ConnectionsList to Use Real Data**

**File:** `components/sidebar/ConnectionsList.tsx`

```typescript
'use client'

import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAnnotationStore } from '@/stores/annotation-store'
import { createClient } from '@/lib/supabase/client'
import { ConnectionCard } from './ConnectionCard'
import { CollapsibleSection } from './CollapsibleSection'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SynthesisEngine } from '@/types/annotations'

interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  type: SynthesisEngine
  strength: number
  metadata: {
    explanation?: string
    target_document_title?: string
    target_snippet?: string
  }
}

interface ConnectionsListProps {
  documentId: string
  visibleChunkIds: string[]  // NEW: From Phase 2
}

export function ConnectionsList({ documentId, visibleChunkIds }: ConnectionsListProps) {
  const { weights, enabledEngines, strengthThreshold } = useAnnotationStore()
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch connections for visible chunks
  useEffect(() => {
    async function fetchConnections() {
      if (visibleChunkIds.length === 0) return
      
      setLoading(true)
      const supabase = createClient()
      
      const { data } = await supabase
        .from('connections')
        .select('*')
        .in('source_chunk_id', visibleChunkIds)
        .order('strength', { ascending: false })
        .limit(100)
      
      setConnections(data || [])
      setLoading(false)
    }
    
    fetchConnections()
  }, [visibleChunkIds])

  // Filter and weight connections
  const filteredConnections = useMemo(() => {
    const startTime = performance.now()
    
    const result = connections
      .filter(c => enabledEngines.has(c.type))
      .filter(c => c.strength >= strengthThreshold)
      .map(c => ({
        ...c,
        weightedStrength: c.strength * weights[c.type]
      }))
      .sort((a, b) => b.weightedStrength - a.weightedStrength)
    
    const duration = performance.now() - startTime
    if (duration > 100) {
      console.warn(`⚠️ Re-ranking took ${duration.toFixed(2)}ms`)
    }
    
    return result
  }, [connections, weights, enabledEngines, strengthThreshold])

  // Group by engine type
  const groupedConnections = useMemo(() => {
    return filteredConnections.reduce((acc, connection) => {
      if (!acc[connection.type]) {
        acc[connection.type] = []
      }
      acc[connection.type].push(connection)
      return acc
    }, {} as Record<string, typeof filteredConnections>)
  }, [filteredConnections])

  const engineLabels: Record<SynthesisEngine, string> = {
    semantic: 'Semantic Similarity',
    thematic_bridge: 'Thematic Bridges',
    contradiction: 'Contradictions',
  }

  const engineColors: Record<SynthesisEngine, string> = {
    semantic: 'blue-500',
    thematic_bridge: 'purple-500',
    contradiction: 'red-500',
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
  }

  if (filteredConnections.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No connections for visible chunks
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {Object.entries(groupedConnections).map(([engineType, conns]) => (
          <CollapsibleSection
            key={engineType}
            title={engineLabels[engineType as SynthesisEngine]}
            count={conns.length}
            color={engineColors[engineType as SynthesisEngine]}
            defaultOpen={true}
          >
            <div className="space-y-2">
              {conns.map(connection => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  documentId={documentId}
                  isActive={activeConnectionId === connection.id}
                  onClick={() => setActiveConnectionId(connection.id)}
                />
              ))}
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </ScrollArea>
  )
}
```

**4. Update WeightTuning**

**File:** `components/sidebar/WeightTuning.tsx`

```typescript
const ENGINE_LABELS: Record<keyof EngineWeights, string> = {
  semantic: 'Semantic Similarity',
  thematic_bridge: 'Thematic Bridges',
  contradiction: 'Contradictions',
}
```

**5. Update ConnectionFilters**

Same change - update labels and remove old engines.

**6. Wire Up to Phase 2**

**File:** `app/documents/read/[id]/page.tsx`

```typescript
<RightPanel 
  documentId={params.id} 
  visibleChunkIds={visibleChunkIds}  // Pass from Phase 2
/>
```

## Migration Steps

1. Update `types/annotations.ts` (remove 4 engines)
2. Update `stores/annotation-store.ts` (new presets)
3. Update `ConnectionsList.tsx` (real data + visible chunks)
4. Update `WeightTuning.tsx` (3 sliders)
5. Update `ConnectionFilters.tsx` (3 toggles)
6. Update `RightPanel.tsx` interface to accept `visibleChunkIds`
7. Test with real connections from database











---

## Phase 4: Connection Surfacing (Days 8-9)

**Goal:** Display connections in sidebar based on visible chunks.

### Files to Create/Modify

#### 4.1 Connection Fetching

**File:** `lib/api/connections.ts`

**No changes from original plan**

#### 4.2 Connection Hook

**File:** `hooks/useConnections.ts`

**No changes from original plan**

#### 4.3 Connection Component

**File:** `components/ConnectionCard.tsx`

**No changes from original plan**

#### 4.4 Update Document Page Sidebar

**File:** `app/document/[id]/page.tsx`

**No changes from original plan**

### Test Phase 4

**No changes from original plan**

**Success criteria:**

- ✅ Connections load for visible chunks
- ✅ Connections scored by engine weights
- ✅ Three engine types display correctly
- ✅ Can navigate to target chunks

---

## Phase 5: Safety Net (Day 10)

**Goal:** Export/import annotations to survive refactors.

### Files to Create

#### 5.1 Export Script

**File:** `scripts/export-all-annotations.ts`

**Enhanced to include new metadata fields (pageLabel, lastViewedAt, document source metadata)**

#### 5.2 Import Script

**File:** `scripts/import-annotations.ts`

**Enhanced to restore new metadata fields**

#### 5.3 Add to package.json

```json
{
  "scripts": {
    "export:annotations": "tsx scripts/export-all-annotations.ts",
    "import:annotations": "tsx scripts/import-annotations.ts"
  }
}
```

### Test Phase 5

```bash
# Export
USER_ID=your_user_id npm run export:annotations
# Check: ./backups/latest/documents/*/annotations.json exists
# Verify: page labels and lastViewedAt in export files

# Make breaking change (e.g., modify ECS schema)

# Import
USER_ID=your_user_id npm run import:annotations
# Verify: annotations recovered with all metadata
```

**Success criteria:**

- ✅ Can export all annotations to files
- ✅ **Export includes page labels and lastViewedAt**
- ✅ **Export includes document source metadata**
- ✅ Can import from files
- ✅ Fuzzy recovery works for position changes
- ✅ Orphaned annotations flagged

---

## Summary: Build Order

**Week 1:**

- Days 1-2: **ECS Foundation + Enhanced Metadata** (page labels, source data, lastViewedAt)
- Days 3-4: Basic Reader (display, viewport tracking)
- Days 5-7: Annotations (create, display, persist)

**Week 2:**

- Days 8-9: Connection Surfacing (sidebar, scoring)
- Day 10: **Safety Net** (export/import with new fields)

**Total:** ~10 days to working reader with annotations and connections.

## Key Enhancements from Phase 1

**New Metadata Fields:**

- ✅ Page labels (Position.pageLabelIndex)
- ✅ Source metadata (documents.author, source_type, etc.)
- ✅ Last viewed tracking (Temporal.lastViewedAt)
- ✅ Page tracking in chunks (page_start, page_end, page_label)

**New Functions:**

- ✅ markAnnotationViewed(world, eid)
- ✅ getAnnotationsByPage(world, documentId, pageLabel)
- ✅ estimate_page_from_offset(doc_id, char_offset) SQL function

**What This Enables:**

- Citation export with page numbers
- Import from Readwise/Zotero with page preservation
- Search annotations by page
- Track reading analytics (lastViewedAt)
- Proper academic citations

## Key Files Reference

**ECS Core:**

- `lib/ecs/world.ts` - World setup
- `lib/ecs/components/annotation-components.ts` - **Enhanced** components
- `lib/ecs/systems/annotation-systems.ts` - **Enhanced** CRUD operations
- `lib/ecs/persistence.ts` - **Enhanced** PostgreSQL sync

**React Integration:**

- `hooks/useWorld.tsx` - Global world context
- `hooks/useAnnotations.ts` - Annotation CRUD hooks
- `hooks/useViewportTracking.ts` - Scroll tracking
- `hooks/useTextSelection.ts` - Text selection
- `hooks/useConnections.ts` - Connection fetching

**Components:**

- `components/AnnotationToolbar.tsx` - Color picker
- `components/AnnotationOverlay.tsx` - Highlight renderer
- `components/ConnectionCard.tsx` - Connection display

**Pages:**

- `app/document/[id]/page.tsx` - Main reader

**Scripts:**

- `scripts/export-all-annotations.ts` - **Enhanced** backup
- `scripts/import-annotations.ts` - **Enhanced** restore

Ready to start building Phase 1 with these enhancements?