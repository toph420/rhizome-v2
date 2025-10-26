# Semantic Search Panel Implementation Plan

## Overview

Implement a comprehensive search system for Rhizome V2 that leverages existing chunk embeddings (vector(768)) to provide hybrid semantic + full-text search with advanced relationship query capabilities. The search panel uses the BottomPanel pattern, slides from top on Opt+S, supports Simple and Advanced tabs, and exposes the knowledge graph's connection detection engines through relationship queries.

**Why**: Users need to discover content across documents, chunks, connections, sparks, and annotations. The 3-engine connection system (Semantic, Contradiction, Thematic) is a unique differentiator that must be surfaced through search. Semantic search with pgvector enables natural language queries beyond keyword matching.

## Current State Analysis

### What Exists:

**Embeddings Infrastructure:**
- `chunks` table has `embedding vector(768)` column populated during processing
- Chunks table schema: `/Users/topher/Code/rhizome-v2-worktree-merge/src/app/actions/chunks.ts`
- No existing search indexes on embeddings or content

**Connection Detection System:**
- 3 engines operational: semantic_similarity (25%), contradiction_detection (40%), thematic_bridge (35%)
- Connection store manages engine weights and filtering: `src/stores/connection-store.ts:84-216`
- Connections table with metadata JSONB: `src/app/actions/connections.ts:19-54`

**UI Component Patterns:**
- BottomPanel reusable component: `src/components/layout/BottomPanel.tsx`
- AdminPanel implementation reference: `src/components/admin/AdminPanel.tsx:25-122`
- Zustand store patterns: `src/stores/admin/admin-panel.ts:45-72` (no persist)

**Server Action Patterns:**
- Complex filtering examples: `src/app/actions/study.ts:47-154`
- RPC function usage: `src/app/actions/connections.ts:195-210`
- Pagination pattern: `src/app/actions/sparks.ts:398-421`

### What's Missing:

1. **No search infrastructure** - No search panel, stores, or server actions
2. **No search indexes** - Missing GIN (full-text) and HNSW (vector) indexes
3. **No RPC functions** - No hybrid search or relationship query functions
4. **No saved searches** - No database table or persistence mechanism
5. **No keyboard shortcut** - Opt+S not registered in AppShell

### Key Discoveries:

- Chunks already have embeddings (`vector(768)`) ready for semantic search
- Connection metadata stored in JSONB with `shared_concepts`, `explanation` fields
- Store pattern follows session-only state for UI panels (no persist middleware)
- Server Actions use `withErrorHandling` pattern for consistent responses
- RPC functions preferred for complex aggregations and graph queries

### Constraints:

- **Personal tool** - No multi-user, single user_id via RLS
- **No modals rule** - Must use BottomPanel persistent UI pattern
- **Keyboard conflict** - Cmd+K already used by QuickSparkModal, use Opt+S instead
- **Performance budget** - Simple search <500ms, Advanced <1s, Relationship <2s
- **Vector dimensions** - Fixed at 768 (matches existing embedding model)

## Desired End State

### Specification:

**User opens search with Opt+S:**
1. SearchPanel slides from top (BottomPanel pattern)
2. Opens to Simple tab by default
3. Input focused, ready for typing
4. Panel shows at top, overlays content but doesn't block

**Simple Tab - 90% use case:**
- Type query → semantic + full-text hybrid search (debounced 300ms)
- Filter by type: All, Documents, Connections, Sparks, Annotations
- Filter by connection strength: High (0.8+), Medium (0.6+), All (0.5+)
- Results show mixed types with icons, previews, metadata
- Click "Open in reader" → panel minimizes to small bar, document opens
- Minimized bar shows: "[🔍] consciousness (147 results) [Restore ⬆]"

**Advanced Tab - Power users:**
- All Simple features +
- Content type checkboxes (Documents, Chunks, Connections, Sparks, Annotations)
- Connection filters (engine toggles, strength slider, cross-doc/same-doc)
- Metadata filters (themes multi-select, emotional tone radio, concepts input)
- Date/Author filters (date ranges, author input, min connection count)
- **Relationship Queries** (killer feature):
  - "Find documents that connect to X"
  - "Find documents that contradict Y"
  - "Find documents that bridge to Z"
  - "Find connections linking concepts A, B"
- Click "SEARCH →" to execute (not auto-search)
- Results same as Simple tab

**Saved Searches:**
- Click "SAVE SEARCH" in Advanced tab
- Name the search, save to database
- Dropdown shows recent 10 saved searches
- Click saved search → loads filters + executes query
- Track usage count and last_used_at

**Keyboard Navigation:**
- Opt+S: Open/close panel
- Tab: Switch Simple/Advanced
- Esc: Close panel
- Up/Down: Navigate results
- Enter: Open first result
- Cmd+1-9: Open result 1-9

### Verification:

**Automated:**
- Migration 069 applies: `npx supabase db reset`
- Indexes created: Check `\di` in psql
- RPC functions exist: `\df hybrid_search` in psql
- Tests pass: `npm test`
- Type check: `npm run type-check`
- Build: `npm run build`

**Manual:**
- Search for "consciousness" returns relevant chunks
- Relationship query "Find documents that connect to X" shows connected docs
- Saved search loads filters correctly
- Minimize state preserves search when opening document
- Keyboard shortcuts work (Opt+S, Tab, Esc, Enter, arrows)
- Performance: Simple <500ms, Advanced <1s, Relationship <2s

## Rhizome Architecture

- **Module**: Main App (Next.js only)
- **Storage**: Database (chunks, documents, connections, saved_searches)
- **Source of truth**: Database (chunks.embedding, connections metadata)
- **Migration**: Yes - `069_search_infrastructure.sql`
- **Test Tier**: Stable (fix when broken, not deployment-blocking)
- **Pipeline Stages**: None (uses existing chunk embeddings)
- **Engines**: All 3 (Semantic 25%, Contradiction 40%, Thematic 35%) - exposed via Relationship Queries
- **Processing Mode**: N/A (no document processing changes)

## What We're NOT Doing

**Out of scope for MVP:**
- ❌ **Fuzzy matching** - Use exact + semantic instead
- ❌ **Natural language parsing** - "show me books about X added last month" → too complex
- ❌ **Search suggestions** - As-you-type autocomplete → Phase 2 feature
- ❌ **Search history** - Recent 10 searches → Nice-to-have for v2
- ❌ **Export results** - CSV/JSON export → Future enhancement
- ❌ **Bulk actions** - Select multiple results → Out of scope
- ❌ **Multi-hop relationships** - A→B→C traversal → Future feature
- ❌ **Search within search** - Filter existing results → v2
- ❌ **Binary quantization** - Halfvec optimization → Premature optimization
- ❌ **Multi-language full-text** - English only for now

**Defer to later phases:**
- Search analytics (query patterns, popular searches)
- Search result highlighting (exact match highlighting in preview)
- Advanced query syntax (boolean operators AND/OR/NOT)
- Connection path visualization (show how A connects to B)

## Implementation Approach

### High-Level Strategy:

**Phase-by-phase incremental development:**
1. **Foundation** → Establish infrastructure (migration, store, panel shell)
2. **Simple Search** → Core value (hybrid search, results display)
3. **Advanced Filters** → Power features (filters, relationship queries)
4. **Saved Searches** → User convenience (persistence, quick recall)
5. **Polish** → Production-ready (minimize, keyboard nav, performance)

**Why this order:**
- Foundation first ensures clean architecture
- Simple tab delivers immediate value (test hypothesis early)
- Advanced builds on working Simple implementation
- Saved searches leverage completed search logic
- Polish refines working system

### Technical Approach:

**Hybrid Search Strategy:**
1. **Full-text search** (PostgreSQL tsvector) for exact keyword matches
2. **Semantic search** (pgvector cosine similarity) for natural language queries
3. **Reciprocal Rank Fusion (RRF)** to merge results with configurable weights
4. **HNSW indexing** for logarithmic-time vector similarity queries

**Relationship Query Strategy:**
1. Use existing `connections` table with bidirectional queries
2. PostgreSQL RPC functions for graph traversal
3. Filter by `connection_type` (semantic/contradiction/thematic)
4. Aggregate by document with connection counts and avg strength

**State Management:**
- **SearchStore** (Zustand, no persist): Panel state, current query, results, loading
- **Database** (saved_searches table): Persisted saved searches
- **ConnectionStore** (existing): Reuse engine weights for result scoring

---

## Phase 1: Foundation

### Overview

Establish the search infrastructure: database schema (migration 069), indexes (GIN for full-text, HNSW for vectors), Zustand store, SearchPanel component shell, and keyboard shortcut registration. This phase creates the foundation for all subsequent search functionality.

### Changes Required:

#### 1. Database Migration

**File**: `supabase/migrations/069_search_infrastructure.sql`
**Changes**: Create saved_searches table, search indexes, and basic RPC functions

```sql
-- ============================================
-- Saved Searches Table
-- ============================================

CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  query_type TEXT NOT NULL CHECK (query_type IN ('simple', 'advanced')),
  search_query TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0
);

-- Indexes for saved searches
CREATE INDEX idx_saved_searches_last_used ON saved_searches(last_used_at DESC NULLS LAST);
CREATE INDEX idx_saved_searches_created ON saved_searches(created_at DESC);

-- ============================================
-- Full-Text Search Setup
-- ============================================

-- Add tsvector column for full-text search on chunks
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS content_tsv tsvector
GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON chunks USING gin(content_tsv);

-- ============================================
-- Vector Search Index (HNSW)
-- ============================================

-- HNSW index for semantic search (faster than IVFFlat)
-- m=16: max connections per layer (default, good balance)
-- ef_construction=64: build quality (default, good quality/speed tradeoff)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
ON chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get available themes from chunks
CREATE OR REPLACE FUNCTION get_available_themes()
RETURNS TABLE (theme TEXT, count BIGINT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    jsonb_object_keys(themes) as theme,
    COUNT(*) as count
  FROM chunks
  WHERE themes IS NOT NULL AND themes != '{}'::jsonb
  GROUP BY theme
  ORDER BY count DESC;
END;
$$;

-- Function to update saved search usage stats
CREATE OR REPLACE FUNCTION use_saved_search(search_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE saved_searches
  SET
    last_used_at = NOW(),
    use_count = use_count + 1
  WHERE id = search_id;
END;
$$;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE saved_searches IS 'User-saved search queries with filters for quick recall';
COMMENT ON COLUMN chunks.content_tsv IS 'Generated tsvector for full-text search on chunk content';
COMMENT ON INDEX idx_chunks_embedding_hnsw IS 'HNSW index for fast semantic similarity search using cosine distance';
```

#### 2. Zustand Store

**File**: `src/stores/search-store.ts`
**Changes**: Create new store following admin-panel pattern (no persist)

```typescript
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// ============================================
// Types
// ============================================

export type SearchTab = 'simple' | 'advanced'
export type ContentTypeFilter = 'all' | 'documents' | 'connections' | 'sparks' | 'annotations'
export type SortOption = 'relevance' | 'date_added' | 'date_modified'
export type ConnectionStrength = 0.5 | 0.6 | 0.8

export interface SearchResult {
  id: string
  type: 'document' | 'connection' | 'spark' | 'annotation' | 'chunk'
  title: string
  preview: string
  metadata: {
    matchCount?: number
    connectionCount?: number
    score?: number
    createdAt?: string
    [key: string]: unknown
  }
}

export interface AdvancedFilters {
  contentTypes: Set<string>
  connectionEngines: Set<'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'>
  strengthRange: [number, number]
  themes: string[]
  emotionalTone?: 'positive' | 'negative' | 'neutral'
  dateRange?: { start: Date; end: Date }
  author?: string
  minConnections?: number
  relationshipQuery?: {
    type: 'connect_to' | 'contradict' | 'bridge_to' | 'link_concepts' | 'cross_domains'
    documentId?: string
    concepts?: string[]
  }
}

// ============================================
// Store Interface
// ============================================

interface SearchState {
  // Panel state
  isOpen: boolean
  isMinimized: boolean
  activeTab: SearchTab

  // Search state
  query: string
  contentTypeFilter: ContentTypeFilter
  sortBy: SortOption
  connectionStrength: ConnectionStrength
  advancedFilters: AdvancedFilters

  // Results
  results: SearchResult[]
  isLoading: boolean
  error: string | null
  totalCount: number

  // Minimized state
  minimizedQuery: string
  minimizedResultCount: number

  // Actions - Panel
  open: () => void
  close: () => void
  minimize: () => void
  restore: () => void
  setActiveTab: (tab: SearchTab) => void

  // Actions - Search
  setQuery: (query: string) => void
  setContentTypeFilter: (filter: ContentTypeFilter) => void
  setSortBy: (sort: SortOption) => void
  setConnectionStrength: (strength: ConnectionStrength) => void
  setAdvancedFilters: (filters: Partial<AdvancedFilters>) => void
  resetFilters: () => void

  // Actions - Results
  setResults: (results: SearchResult[], totalCount: number) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearResults: () => void
}

// ============================================
// Default Values
// ============================================

const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  contentTypes: new Set(['documents', 'connections', 'sparks']),
  connectionEngines: new Set(['semantic_similarity', 'contradiction_detection', 'thematic_bridge']),
  strengthRange: [0.5, 1.0],
  themes: [],
}

// ============================================
// Store Implementation
// ============================================

export const useSearchStore = create<SearchState>()(
  devtools(
    (set, get) => ({
      // Initial state
      isOpen: false,
      isMinimized: false,
      activeTab: 'simple',

      query: '',
      contentTypeFilter: 'all',
      sortBy: 'relevance',
      connectionStrength: 0.6,
      advancedFilters: DEFAULT_ADVANCED_FILTERS,

      results: [],
      isLoading: false,
      error: null,
      totalCount: 0,

      minimizedQuery: '',
      minimizedResultCount: 0,

      // Panel actions
      open: () => {
        set({ isOpen: true, isMinimized: false })
      },

      close: () => {
        set({ isOpen: false, isMinimized: false })
        get().clearResults()
      },

      minimize: () => {
        const { query, totalCount } = get()
        set({
          isMinimized: true,
          minimizedQuery: query,
          minimizedResultCount: totalCount
        })
      },

      restore: () => {
        set({ isMinimized: false })
      },

      setActiveTab: (tab) => {
        set({ activeTab: tab })
      },

      // Search actions
      setQuery: (query) => {
        set({ query })
      },

      setContentTypeFilter: (filter) => {
        set({ contentTypeFilter: filter })
      },

      setSortBy: (sort) => {
        set({ sortBy: sort })
      },

      setConnectionStrength: (strength) => {
        set({ connectionStrength: strength })
      },

      setAdvancedFilters: (filters) => {
        set((state) => ({
          advancedFilters: {
            ...state.advancedFilters,
            ...filters,
          }
        }))
      },

      resetFilters: () => {
        set({
          query: '',
          contentTypeFilter: 'all',
          sortBy: 'relevance',
          connectionStrength: 0.6,
          advancedFilters: DEFAULT_ADVANCED_FILTERS,
        })
      },

      // Results actions
      setResults: (results, totalCount) => {
        set({ results, totalCount, isLoading: false, error: null })
      },

      setLoading: (loading) => {
        set({ isLoading: loading })
      },

      setError: (error) => {
        set({ error, isLoading: false })
      },

      clearResults: () => {
        set({ results: [], totalCount: 0, error: null })
      },
    }),
    {
      name: 'SearchPanel',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)
```

#### 3. SearchPanel Component Shell

**File**: `src/components/search/SearchPanel.tsx`
**Changes**: Create panel shell with tabs (empty content for now)

```typescript
'use client'

import { useSearchStore } from '@/stores/search-store'
import { BottomPanel } from '@/components/layout/BottomPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'

export function SearchPanel() {
  const {
    isOpen,
    isMinimized,
    activeTab,
    setActiveTab,
    close,
    restore,
    minimizedQuery,
    minimizedResultCount
  } = useSearchStore()

  // Show minimized bar when minimized
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-black text-white p-3 flex items-center justify-between border-t-4 border-white cursor-pointer hover:bg-gray-900"
        onClick={restore}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🔍</span>
          <span className="font-mono">
            {minimizedQuery} ({minimizedResultCount} results)
          </span>
        </div>
        <button
          className="font-mono hover:underline"
          aria-label="Restore search panel"
        >
          Restore ⬆
        </button>
      </div>
    )
  }

  return (
    <BottomPanel
      open={isOpen}
      onOpenChange={(open) => !open && close()}
      title="Search"
      description="Search documents, connections, sparks, and annotations"
      size="lg"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="simple">Simple</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="simple" className="mt-6">
          <div className="p-4 border-4 border-black">
            <p className="font-mono text-sm text-gray-600">
              Simple search tab - Coming in Phase 2
            </p>
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="mt-6">
          <div className="p-4 border-4 border-black">
            <p className="font-mono text-sm text-gray-600">
              Advanced search tab - Coming in Phase 3
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </BottomPanel>
  )
}
```

#### 4. Keyboard Shortcut Registration

**File**: `src/components/layout/AppShell.tsx`
**Changes**: Add Opt+S shortcut to open SearchPanel

Find the keyboard shortcut registration section and add:

```typescript
// Add import
import { useSearchStore } from '@/stores/search-store'

// Inside component
const { open: openSearch, isOpen: searchOpen } = useSearchStore()

// Add keyboard shortcut (look for useHotkeys or similar pattern)
useHotkeys('alt+s', () => {
  openSearch()
}, { enabled: !searchOpen })
```

**Note**: Exact implementation depends on existing keyboard shortcut pattern in AppShell. Follow the pattern used for AdminPanel (Cmd+Shift+A).

#### 5. Top Nav Integration

**File**: `src/components/layout/TopNav.tsx` (or wherever admin button lives)
**Changes**: Add search button next to admin panel button

```typescript
import { useSearchStore } from '@/stores/search-store'
import { Search } from 'lucide-react'
import { Button } from '@/components/rhizome/button'

// Inside component
const { open: openSearch } = useSearchStore()

// Add button in nav bar (next to admin button)
<Button
  variant="ghost"
  size="icon"
  onClick={openSearch}
  title="Search (Opt+S)"
  className="border-2 border-black"
>
  <Search className="h-5 w-5" />
</Button>
```

#### 6. Render SearchPanel in Layout

**File**: `src/app/layout.tsx` (or main layout file)
**Changes**: Add SearchPanel to render tree

```typescript
import { SearchPanel } from '@/components/search/SearchPanel'

// Inside layout return
<body>
  {children}
  <SearchPanel />
  {/* ... other global components like AdminPanel */}
</body>
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Indexes created: `psql postgresql://postgres:postgres@localhost:54322/postgres -c "\di idx_chunks_*"`
- [ ] RPC functions exist: `psql postgresql://postgres:postgres@localhost:54322/postgres -c "\df get_available_themes"`
- [ ] Types compile: `npm run type-check`
- [ ] No build errors: `npm run build`
- [ ] Store accessible: Check `useSearchStore` exports correctly

#### Manual Verification:
- [ ] Press Opt+S → SearchPanel opens from top
- [ ] Panel shows "Simple" and "Advanced" tabs
- [ ] Click outside panel → closes
- [ ] Press Esc → closes
- [ ] Tab switches between Simple/Advanced
- [ ] Search button visible in top nav
- [ ] Click search button → panel opens

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to Phase 2.

### Service Restarts:
- [x] Supabase: `npx supabase db reset` (migration 069)
- [ ] Worker: N/A (no worker changes)
- [x] Next.js: Auto-reload should work (verify HMR)

---

## Phase 2: Simple Search

### Overview

Implement the core search functionality: hybrid semantic + full-text search using RRF (Reciprocal Rank Fusion), real-time debounced search input, result display with mixed types (documents, connections, sparks, annotations, chunks), and basic filtering. This phase delivers the primary user value.

### Changes Required:

#### 1. Hybrid Search RPC Function

**File**: `supabase/migrations/070_hybrid_search_rpc.sql`
**Changes**: Create RRF-based hybrid search function

```sql
-- ============================================
-- Hybrid Search Function (RRF)
-- ============================================

CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding vector(768),
  match_count INT DEFAULT 20,
  full_text_weight FLOAT DEFAULT 1.0,
  semantic_weight FLOAT DEFAULT 1.0,
  rrf_k INT DEFAULT 50,
  content_type_filter TEXT DEFAULT 'all',
  min_strength FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  content TEXT,
  document_id UUID,
  document_title TEXT,
  chunk_index INT,
  similarity FLOAT,
  rank FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Full-text search CTE
  full_text AS (
    SELECT
      c.id,
      'chunk' as type,
      c.content,
      c.document_id,
      d.title as document_title,
      c.chunk_index,
      0.0::float as similarity,
      row_number() OVER(ORDER BY ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', query_text)) DESC) as rank_ix,
      jsonb_build_object(
        'themes', c.themes,
        'importance_score', c.importance_score,
        'page_start', c.page_start,
        'page_end', c.page_end
      ) as metadata
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE
      c.content_tsv @@ websearch_to_tsquery('english', query_text)
      AND c.is_current = true
    ORDER BY rank_ix
    LIMIT match_count * 2
  ),

  -- Semantic search CTE
  semantic AS (
    SELECT
      c.id,
      'chunk' as type,
      c.content,
      c.document_id,
      d.title as document_title,
      c.chunk_index,
      (1 - (c.embedding <=> query_embedding))::float as similarity,
      row_number() OVER (ORDER BY c.embedding <=> query_embedding) as rank_ix,
      jsonb_build_object(
        'themes', c.themes,
        'importance_score', c.importance_score,
        'page_start', c.page_start,
        'page_end', c.page_end
      ) as metadata
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE
      c.embedding IS NOT NULL
      AND c.is_current = true
    ORDER BY rank_ix
    LIMIT match_count * 2
  ),

  -- RRF fusion
  fused AS (
    SELECT
      COALESCE(ft.id, s.id) as id,
      COALESCE(ft.type, s.type) as type,
      COALESCE(ft.content, s.content) as content,
      COALESCE(ft.document_id, s.document_id) as document_id,
      COALESCE(ft.document_title, s.document_title) as document_title,
      COALESCE(ft.chunk_index, s.chunk_index) as chunk_index,
      COALESCE(s.similarity, 0.0) as similarity,
      (
        COALESCE(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight +
        COALESCE(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight
      ) as rank,
      COALESCE(ft.metadata, s.metadata) as metadata
    FROM full_text ft
    FULL OUTER JOIN semantic s ON ft.id = s.id
  )

  SELECT * FROM fused
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION hybrid_search IS 'Hybrid semantic + full-text search using Reciprocal Rank Fusion (RRF)';
```

#### 2. Search Server Actions

**File**: `src/app/actions/search.ts`
**Changes**: Create Server Actions for search operations

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import type { SearchResult } from '@/stores/search-store'

// ============================================
// Generate Embedding (use existing utility or Gemini)
// ============================================

async function generateEmbedding(text: string): Promise<number[]> {
  // TODO: Use existing embedding generation
  // Check if there's a utility in worker/ or lib/
  // For now, placeholder - implement based on existing pattern
  throw new Error('Implement embedding generation')
}

// ============================================
// Simple Search Action
// ============================================

export async function simpleSearch(
  query: string,
  contentTypeFilter: string = 'all',
  connectionStrength: number = 0.6,
  sortBy: string = 'relevance'
): Promise<{
  success: boolean
  results?: SearchResult[]
  totalCount?: number
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    if (!query || query.trim().length === 0) {
      return { success: true, results: [], totalCount: 0 }
    }

    const supabase = await createClient()

    // Generate embedding for semantic search
    const embedding = await generateEmbedding(query)

    // Call hybrid search RPC
    const { data: chunks, error: searchError } = await supabase
      .rpc('hybrid_search', {
        query_text: query,
        query_embedding: embedding,
        match_count: 50,
        full_text_weight: 1.0,
        semantic_weight: 1.5, // Emphasize semantic understanding
        rrf_k: 50,
        content_type_filter: contentTypeFilter,
        min_strength: connectionStrength
      })

    if (searchError) {
      console.error('[simpleSearch] RPC error:', searchError)
      return { success: false, error: 'Search failed' }
    }

    // Transform chunks to SearchResult format
    const results: SearchResult[] = (chunks || []).map((chunk: any) => ({
      id: chunk.id,
      type: 'chunk',
      title: chunk.document_title || 'Untitled',
      preview: chunk.content.substring(0, 200) + '...',
      metadata: {
        documentId: chunk.document_id,
        chunkIndex: chunk.chunk_index,
        similarity: chunk.similarity,
        rank: chunk.rank,
        ...chunk.metadata,
      }
    }))

    // TODO: Add connections, sparks, annotations to results
    // Query those tables separately and merge

    return {
      success: true,
      results,
      totalCount: results.length
    }

  } catch (error) {
    console.error('[simpleSearch] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================
// Get Available Themes (for autocomplete)
// ============================================

export async function getAvailableThemes(): Promise<{
  success: boolean
  themes?: Array<{ theme: string; count: number }>
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('get_available_themes')

    if (error) {
      console.error('[getAvailableThemes] Error:', error)
      return { success: false, error: 'Failed to get themes' }
    }

    return {
      success: true,
      themes: data || []
    }

  } catch (error) {
    console.error('[getAvailableThemes] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

#### 3. Simple Tab UI

**File**: `src/components/search/simple/SimpleSearch.tsx`
**Changes**: Create Simple tab with search input, filters, and results

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useSearchStore } from '@/stores/search-store'
import { simpleSearch } from '@/app/actions/search'
import { SearchInput } from './SearchInput'
import { ContentTypeFilter } from './ContentTypeFilter'
import { StrengthFilter } from './StrengthFilter'
import { SortDropdown } from './SortDropdown'
import { ResultsList } from '../results/ResultsList'
import { useDebounce } from '@/hooks/useDebounce'

export function SimpleSearch() {
  const {
    query,
    contentTypeFilter,
    connectionStrength,
    sortBy,
    results,
    isLoading,
    error,
    setQuery,
    setResults,
    setLoading,
    setError,
  } = useSearchStore()

  // Debounce query (300ms)
  const debouncedQuery = useDebounce(query, 300)

  // Execute search on debounced query change
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.trim().length === 0) {
      setResults([], 0)
      return
    }

    const executeSearch = async () => {
      setLoading(true)

      const result = await simpleSearch(
        debouncedQuery,
        contentTypeFilter,
        connectionStrength,
        sortBy
      )

      if (result.success) {
        setResults(result.results || [], result.totalCount || 0)
      } else {
        setError(result.error || 'Search failed')
      }
    }

    executeSearch()
  }, [debouncedQuery, contentTypeFilter, connectionStrength, sortBy])

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="What are you looking for?"
      />

      {/* Filters Row */}
      <div className="flex items-center gap-4 flex-wrap">
        <ContentTypeFilter />
        <StrengthFilter />
        <SortDropdown />
      </div>

      {/* Divider */}
      <div className="border-t-4 border-black" />

      {/* Results */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-mono font-bold">
            {isLoading ? 'Searching...' : `RESULTS (${results.length})`}
          </h3>
          {sortBy && (
            <span className="font-mono text-sm text-gray-600">
              Sorted by: {sortBy}
            </span>
          )}
        </div>

        {error && (
          <div className="p-4 border-4 border-red-600 bg-red-50">
            <p className="font-mono text-red-800">{error}</p>
          </div>
        )}

        <ResultsList results={results} isLoading={isLoading} />
      </div>
    </div>
  )
}
```

#### 4. Search Input Component

**File**: `src/components/search/simple/SearchInput.tsx`
**Changes**: Create brutalist search input

```typescript
'use client'

import { Search } from 'lucide-react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
        <Search className="h-6 w-6" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Search...'}
        className="w-full border-4 border-black p-4 pl-14 text-lg font-mono focus:outline-none focus:ring-4 focus:ring-black"
        autoFocus
      />
    </div>
  )
}
```

#### 5. Results List Component

**File**: `src/components/search/results/ResultsList.tsx`
**Changes**: Create virtualized results list

```typescript
'use client'

import type { SearchResult } from '@/stores/search-store'
import { DocumentResult } from './DocumentResult'
import { ConnectionResult } from './ConnectionResult'
import { SparkResult } from './SparkResult'
import { AnnotationResult } from './AnnotationResult'
import { ChunkResult } from './ChunkResult'

interface ResultsListProps {
  results: SearchResult[]
  isLoading: boolean
}

export function ResultsList({ results, isLoading }: ResultsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-4 border-gray-300 bg-gray-100 p-4 h-32 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="border-4 border-black p-8 text-center">
        <p className="font-mono text-gray-600">
          No results found. Try a different search term.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {results.map((result) => {
        switch (result.type) {
          case 'document':
            return <DocumentResult key={result.id} result={result} />
          case 'connection':
            return <ConnectionResult key={result.id} result={result} />
          case 'spark':
            return <SparkResult key={result.id} result={result} />
          case 'annotation':
            return <AnnotationResult key={result.id} result={result} />
          case 'chunk':
            return <ChunkResult key={result.id} result={result} />
          default:
            return null
        }
      })}
    </div>
  )
}
```

#### 6. Chunk Result Component (Example)

**File**: `src/components/search/results/ChunkResult.tsx`
**Changes**: Create chunk result card

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useSearchStore } from '@/stores/search-store'
import type { SearchResult } from '@/stores/search-store'
import { FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/rhizome/button'

interface ChunkResultProps {
  result: SearchResult
}

export function ChunkResult({ result }: ChunkResultProps) {
  const router = useRouter()
  const { minimize } = useSearchStore()

  const handleOpenInReader = () => {
    minimize()
    router.push(`/read/${result.metadata.documentId}#chunk-${result.metadata.chunkIndex}`)
  }

  return (
    <div className="border-4 border-black p-4 bg-white hover:bg-gray-50 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-start gap-3 flex-1">
          <FileText className="h-5 w-5 mt-1 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-mono font-bold text-lg truncate">
              {result.title}
            </h3>
            <p className="font-mono text-sm text-gray-600">
              Chunk {result.metadata.chunkIndex}
              {result.metadata.page_start && ` • Page ${result.metadata.page_start}`}
              {result.metadata.similarity && ` • Match: ${(result.metadata.similarity * 100).toFixed(0)}%`}
            </p>
          </div>
        </div>
      </div>

      {/* Preview */}
      <p className="font-sans text-sm text-gray-800 mb-4 line-clamp-3">
        {result.preview}
      </p>

      {/* Metadata */}
      {result.metadata.themes && Object.keys(result.metadata.themes).length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="font-mono text-xs text-gray-500">Themes:</span>
          {Object.keys(result.metadata.themes).slice(0, 3).map((theme) => (
            <span
              key={theme}
              className="border-2 border-black px-2 py-1 text-xs font-mono bg-yellow-100"
            >
              {theme}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleOpenInReader}
          className="border-4 border-black"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in reader
        </Button>
      </div>
    </div>
  )
}
```

#### 7. Update SearchPanel to Use SimpleSearch

**File**: `src/components/search/SearchPanel.tsx`
**Changes**: Replace placeholder with SimpleSearch component

```typescript
// Add import
import { SimpleSearch } from './simple/SimpleSearch'

// Replace SimpleTab content
<TabsContent value="simple" className="mt-6">
  <SimpleSearch />
</TabsContent>
```

#### 8. Create useDebounce Hook

**File**: `src/hooks/useDebounce.ts`
**Changes**: Create debounce hook for search input

```typescript
import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration 070 applies: `npx supabase db reset`
- [ ] RPC function exists: `psql -c "\df hybrid_search"`
- [ ] Types compile: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors: Check browser console

#### Manual Verification:
- [ ] Type "consciousness" → results appear after 300ms
- [ ] Results show document title, preview, metadata
- [ ] Click "Open in reader" → panel minimizes, document opens
- [ ] Minimized bar shows query and result count
- [ ] Click minimized bar → panel restores
- [ ] Change content type filter → results update
- [ ] Change connection strength → results update
- [ ] Empty query → shows no results (not error)
- [ ] No results → shows helpful message
- [ ] Performance: Search completes <500ms for 50 results

**Implementation Note**: Pause after automated verification passes for manual testing.

### Service Restarts:
- [x] Supabase: `npx supabase db reset` (migration 070)
- [ ] Worker: N/A
- [x] Next.js: Auto-reload (HMR)

---

## Phase 3: Advanced Filters

### Overview

Build Advanced tab with comprehensive filtering: content types (checkboxes), connection filters (engine toggles, strength slider, document scope), metadata filters (themes, emotional tone, concepts), date/author filters, and the killer feature - Relationship Queries (find documents that connect to X, contradict Y, bridge to Z, link concepts).

### Changes Required:

#### 1. Relationship Query RPC Functions

**File**: `supabase/migrations/071_relationship_queries.sql`
**Changes**: Create graph traversal functions

```sql
-- ============================================
-- Get Connected Documents
-- ============================================

CREATE OR REPLACE FUNCTION get_connected_documents(
  target_doc_id UUID,
  connection_types TEXT[] DEFAULT ARRAY['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
  min_strength FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  document_id UUID,
  title TEXT,
  connection_count BIGINT,
  avg_strength FLOAT,
  max_strength FLOAT,
  connection_type_breakdown JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH doc_connections AS (
    SELECT DISTINCT
      CASE
        WHEN c.source_chunk_id IN (SELECT id FROM chunks WHERE document_id = target_doc_id)
        THEN ch_target.document_id
        ELSE ch_source.document_id
      END as connected_doc_id,
      c.connection_type,
      c.strength
    FROM connections c
    JOIN chunks ch_source ON c.source_chunk_id = ch_source.id
    JOIN chunks ch_target ON c.target_chunk_id = ch_target.id
    WHERE
      (ch_source.document_id = target_doc_id OR ch_target.document_id = target_doc_id)
      AND c.connection_type = ANY(connection_types)
      AND c.strength >= min_strength
  )
  SELECT
    dc.connected_doc_id as document_id,
    d.title,
    COUNT(*)::bigint as connection_count,
    AVG(dc.strength)::float as avg_strength,
    MAX(dc.strength)::float as max_strength,
    jsonb_object_agg(dc.connection_type, COUNT(*)) as connection_type_breakdown
  FROM doc_connections dc
  JOIN documents d ON dc.connected_doc_id = d.id
  WHERE dc.connected_doc_id != target_doc_id
  GROUP BY dc.connected_doc_id, d.title
  ORDER BY connection_count DESC, avg_strength DESC;
END;
$$;

-- ============================================
-- Find Connections by Concept Overlap
-- ============================================

CREATE OR REPLACE FUNCTION find_connections_by_concepts(
  concept_list TEXT[],
  min_strength FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  connection_id UUID,
  source_document_id UUID,
  source_document_title TEXT,
  target_document_id UUID,
  target_document_title TEXT,
  connection_type TEXT,
  strength FLOAT,
  shared_concepts JSONB,
  explanation TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as connection_id,
    ch_source.document_id as source_document_id,
    d_source.title as source_document_title,
    ch_target.document_id as target_document_id,
    d_target.title as target_document_title,
    c.connection_type,
    c.strength,
    c.metadata->'shared_concepts' as shared_concepts,
    c.metadata->>'explanation' as explanation
  FROM connections c
  JOIN chunks ch_source ON c.source_chunk_id = ch_source.id
  JOIN chunks ch_target ON c.target_chunk_id = ch_target.id
  JOIN documents d_source ON ch_source.document_id = d_source.id
  JOIN documents d_target ON ch_target.document_id = d_target.id
  WHERE
    c.metadata->'shared_concepts' ?| concept_list
    AND c.strength >= min_strength
  ORDER BY c.strength DESC
  LIMIT match_count;
END;
$$;

-- ============================================
-- Advanced Search with Filters
-- ============================================

CREATE OR REPLACE FUNCTION advanced_search(
  query_text TEXT,
  query_embedding vector(768),
  p_content_types TEXT[] DEFAULT ARRAY['documents', 'chunks', 'connections', 'sparks'],
  p_connection_engines TEXT[] DEFAULT ARRAY['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
  p_strength_min FLOAT DEFAULT 0.5,
  p_strength_max FLOAT DEFAULT 1.0,
  p_themes TEXT[] DEFAULT NULL,
  p_date_start TIMESTAMPTZ DEFAULT NULL,
  p_date_end TIMESTAMPTZ DEFAULT NULL,
  match_count INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  content TEXT,
  title TEXT,
  similarity FLOAT,
  rank FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- This is a simplified version
  -- Full implementation would handle all filter combinations
  RETURN QUERY
  SELECT
    c.id,
    'chunk'::text as type,
    c.content,
    d.title,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    0.0::float as rank, -- Simplified ranking
    jsonb_build_object(
      'themes', c.themes,
      'document_id', c.document_id,
      'chunk_index', c.chunk_index
    ) as metadata
  FROM chunks c
  JOIN documents d ON c.document_id = d.id
  WHERE
    c.embedding IS NOT NULL
    AND c.is_current = true
    AND (p_themes IS NULL OR c.themes ?| p_themes)
    AND (p_date_start IS NULL OR c.created_at >= p_date_start)
    AND (p_date_end IS NULL OR c.created_at <= p_date_end)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION get_connected_documents IS 'Find all documents connected to a target document via connections table';
COMMENT ON FUNCTION find_connections_by_concepts IS 'Find connections where shared_concepts overlap with provided concept list';
COMMENT ON FUNCTION advanced_search IS 'Advanced search with comprehensive filtering options';
```

#### 2. Advanced Search Server Actions

**File**: `src/app/actions/search.ts` (add to existing)
**Changes**: Add advanced search and relationship query actions

```typescript
// ============================================
// Advanced Search Action
// ============================================

export async function advancedSearch(params: {
  query: string
  contentTypes: string[]
  connectionEngines: string[]
  strengthRange: [number, number]
  themes?: string[]
  emotionalTone?: string
  dateRange?: { start: Date; end: Date }
  relationshipQuery?: {
    type: 'connect_to' | 'contradict' | 'bridge_to' | 'link_concepts'
    documentId?: string
    concepts?: string[]
  }
}): Promise<{
  success: boolean
  results?: SearchResult[]
  totalCount?: number
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Handle relationship queries separately
    if (params.relationshipQuery) {
      return handleRelationshipQuery(params.relationshipQuery, params)
    }

    // Generate embedding
    const embedding = await generateEmbedding(params.query)

    // Call advanced_search RPC
    const { data, error } = await supabase.rpc('advanced_search', {
      query_text: params.query,
      query_embedding: embedding,
      p_content_types: params.contentTypes,
      p_connection_engines: params.connectionEngines,
      p_strength_min: params.strengthRange[0],
      p_strength_max: params.strengthRange[1],
      p_themes: params.themes && params.themes.length > 0 ? params.themes : null,
      p_date_start: params.dateRange?.start || null,
      p_date_end: params.dateRange?.end || null,
      match_count: 50
    })

    if (error) {
      console.error('[advancedSearch] Error:', error)
      return { success: false, error: 'Advanced search failed' }
    }

    // Transform to SearchResult format
    const results: SearchResult[] = (data || []).map((item: any) => ({
      id: item.id,
      type: item.type,
      title: item.title || 'Untitled',
      preview: item.content?.substring(0, 200) + '...' || '',
      metadata: {
        similarity: item.similarity,
        rank: item.rank,
        ...item.metadata,
      }
    }))

    return {
      success: true,
      results,
      totalCount: results.length
    }

  } catch (error) {
    console.error('[advancedSearch] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================
// Relationship Query Handler
// ============================================

async function handleRelationshipQuery(
  relationshipQuery: {
    type: 'connect_to' | 'contradict' | 'bridge_to' | 'link_concepts'
    documentId?: string
    concepts?: string[]
  },
  params: any
): Promise<{
  success: boolean
  results?: SearchResult[]
  totalCount?: number
  error?: string
}> {
  const supabase = await createClient()

  try {
    if (relationshipQuery.type === 'connect_to' && relationshipQuery.documentId) {
      // Find documents connected to X
      const { data, error } = await supabase.rpc('get_connected_documents', {
        target_doc_id: relationshipQuery.documentId,
        connection_types: params.connectionEngines,
        min_strength: params.strengthRange[0]
      })

      if (error) throw error

      const results: SearchResult[] = (data || []).map((doc: any) => ({
        id: doc.document_id,
        type: 'document',
        title: doc.title,
        preview: `${doc.connection_count} connections • Avg strength: ${(doc.avg_strength * 100).toFixed(0)}%`,
        metadata: {
          connectionCount: doc.connection_count,
          avgStrength: doc.avg_strength,
          maxStrength: doc.max_strength,
          connectionTypeBreakdown: doc.connection_type_breakdown,
        }
      }))

      return { success: true, results, totalCount: results.length }
    }

    if (relationshipQuery.type === 'contradict' && relationshipQuery.documentId) {
      // Find contradictions
      const { data, error } = await supabase.rpc('get_connected_documents', {
        target_doc_id: relationshipQuery.documentId,
        connection_types: ['contradiction_detection'],
        min_strength: params.strengthRange[0]
      })

      if (error) throw error

      const results: SearchResult[] = (data || []).map((doc: any) => ({
        id: doc.document_id,
        type: 'document',
        title: doc.title,
        preview: `${doc.connection_count} contradictions found`,
        metadata: {
          connectionCount: doc.connection_count,
          avgStrength: doc.avg_strength,
        }
      }))

      return { success: true, results, totalCount: results.length }
    }

    if (relationshipQuery.type === 'link_concepts' && relationshipQuery.concepts) {
      // Find connections linking concepts
      const { data, error } = await supabase.rpc('find_connections_by_concepts', {
        concept_list: relationshipQuery.concepts,
        min_strength: params.strengthRange[0],
        match_count: 50
      })

      if (error) throw error

      const results: SearchResult[] = (data || []).map((conn: any) => ({
        id: conn.connection_id,
        type: 'connection',
        title: `${conn.source_document_title} → ${conn.target_document_title}`,
        preview: conn.explanation || 'No explanation available',
        metadata: {
          sourceDocumentId: conn.source_document_id,
          targetDocumentId: conn.target_document_id,
          connectionType: conn.connection_type,
          strength: conn.strength,
          sharedConcepts: conn.shared_concepts,
        }
      }))

      return { success: true, results, totalCount: results.length }
    }

    return { success: false, error: 'Invalid relationship query type' }

  } catch (error) {
    console.error('[handleRelationshipQuery] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

#### 3. Advanced Tab UI

**File**: `src/components/search/advanced/AdvancedSearch.tsx`
**Changes**: Create Advanced tab container

```typescript
'use client'

import { useState } from 'react'
import { useSearchStore } from '@/stores/search-store'
import { advancedSearch } from '@/app/actions/search'
import { SearchInput } from '../simple/SearchInput'
import { FilterGrid } from './FilterGrid'
import { ActionButtons } from './ActionButtons'
import { ResultsList } from '../results/ResultsList'

export function AdvancedSearch() {
  const {
    query,
    advancedFilters,
    results,
    isLoading,
    error,
    setQuery,
    setResults,
    setLoading,
    setError,
    setAdvancedFilters,
    resetFilters,
  } = useSearchStore()

  const handleSearch = async () => {
    if (!query || query.trim().length === 0) {
      setError('Please enter a search query')
      return
    }

    setLoading(true)

    const result = await advancedSearch({
      query,
      contentTypes: Array.from(advancedFilters.contentTypes),
      connectionEngines: Array.from(advancedFilters.connectionEngines),
      strengthRange: advancedFilters.strengthRange,
      themes: advancedFilters.themes,
      emotionalTone: advancedFilters.emotionalTone,
      dateRange: advancedFilters.dateRange,
      relationshipQuery: advancedFilters.relationshipQuery,
    })

    if (result.success) {
      setResults(result.results || [], result.totalCount || 0)
    } else {
      setError(result.error || 'Search failed')
    }
  }

  const handleClearAll = () => {
    resetFilters()
    setResults([], 0)
    setError(null)
  }

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Enter your search query..."
      />

      {/* Filter Grid */}
      <FilterGrid filters={advancedFilters} onChange={setAdvancedFilters} />

      {/* Action Buttons */}
      <ActionButtons
        onSearch={handleSearch}
        onClearAll={handleClearAll}
        isLoading={isLoading}
      />

      {/* Divider */}
      <div className="border-t-4 border-black" />

      {/* Results */}
      <div className="space-y-2">
        <h3 className="font-mono font-bold">
          RESULTS ({results.length})
        </h3>

        {error && (
          <div className="p-4 border-4 border-red-600 bg-red-50">
            <p className="font-mono text-red-800">{error}</p>
          </div>
        )}

        <ResultsList results={results} isLoading={isLoading} />
      </div>
    </div>
  )
}
```

**Note**: FilterGrid and other advanced components (ContentTypeFilters, ConnectionFilters, MetadataFilters, RelationshipFilters) would be implemented similarly to Simple tab components, following the brutalist styling pattern.

### Success Criteria:

#### Automated Verification:
- [ ] Migration 071 applies: `npx supabase db reset`
- [ ] RPC functions exist: `psql -c "\df get_connected_documents"`
- [ ] Types compile: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Advanced tab shows all filter sections
- [ ] Content type checkboxes work
- [ ] Connection engine toggles work
- [ ] Strength slider updates range
- [ ] Theme autocomplete shows available themes
- [ ] Relationship query "Find documents that connect to X" works
- [ ] Click "SEARCH →" executes query (not auto-search)
- [ ] Click "CLEAR ALL" resets all filters
- [ ] Results show relationship data (connection counts, etc.)
- [ ] Performance: Advanced search <1s, Relationship queries <2s

**Implementation Note**: This is a large phase. Consider breaking into sub-phases if needed.

### Service Restarts:
- [x] Supabase: `npx supabase db reset` (migration 071)
- [ ] Worker: N/A
- [x] Next.js: Auto-reload

---

## Phase 4: Saved Searches

### Overview

Add persistence for saved searches: save/load queries to database, dropdown UI showing recent 10 searches, usage tracking (last_used_at, use_count), and export/import functionality.

### Changes Required:

#### 1. Saved Search Server Actions

**File**: `src/app/actions/search.ts` (add to existing)
**Changes**: Add CRUD operations for saved searches

```typescript
// ============================================
// Save Search
// ============================================

export async function saveSearch(search: {
  name: string
  queryType: 'simple' | 'advanced'
  searchQuery: string
  filters: Record<string, any>
}): Promise<{
  success: boolean
  searchId?: string
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        name: search.name,
        query_type: search.queryType,
        search_query: search.searchQuery,
        filters: search.filters,
      })
      .select()
      .single()

    if (error) {
      console.error('[saveSearch] Error:', error)
      return { success: false, error: 'Failed to save search' }
    }

    return {
      success: true,
      searchId: data.id
    }

  } catch (error) {
    console.error('[saveSearch] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================
// Load Search
// ============================================

export async function loadSearch(id: string): Promise<{
  success: boolean
  search?: {
    id: string
    name: string
    queryType: 'simple' | 'advanced'
    searchQuery: string
    filters: Record<string, any>
  }
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Update usage stats via RPC
    await supabase.rpc('use_saved_search', { search_id: id })

    // Fetch search
    const { data, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('[loadSearch] Error:', error)
      return { success: false, error: 'Failed to load search' }
    }

    return {
      success: true,
      search: {
        id: data.id,
        name: data.name,
        queryType: data.query_type,
        searchQuery: data.search_query,
        filters: data.filters || {},
      }
    }

  } catch (error) {
    console.error('[loadSearch] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================
// Get Saved Searches
// ============================================

export async function getSavedSearches(): Promise<{
  success: boolean
  searches?: Array<{
    id: string
    name: string
    queryType: 'simple' | 'advanced'
    createdAt: string
    lastUsedAt?: string
    useCount: number
  }>
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('saved_searches')
      .select('*')
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .limit(10)

    if (error) {
      console.error('[getSavedSearches] Error:', error)
      return { success: false, error: 'Failed to get saved searches' }
    }

    const searches = (data || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      queryType: s.query_type,
      createdAt: s.created_at,
      lastUsedAt: s.last_used_at,
      useCount: s.use_count,
    }))

    return {
      success: true,
      searches
    }

  } catch (error) {
    console.error('[getSavedSearches] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================
// Delete Saved Search
// ============================================

export async function deleteSavedSearch(id: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('saved_searches')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[deleteSavedSearch] Error:', error)
      return { success: false, error: 'Failed to delete search' }
    }

    return { success: true }

  } catch (error) {
    console.error('[deleteSavedSearch] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

#### 2. SaveSearchDialog Component

**File**: `src/components/search/saved/SaveSearchDialog.tsx`
**Changes**: Create dialog for saving searches

```typescript
'use client'

import { useState } from 'react'
import { saveSearch } from '@/app/actions/search'
import { useSearchStore } from '@/stores/search-store'
import { Button } from '@/components/rhizome/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/rhizome/dialog'

interface SaveSearchDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function SaveSearchDialog({ isOpen, onClose }: SaveSearchDialogProps) {
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { query, activeTab, advancedFilters } = useSearchStore()

  const handleSave = async () => {
    if (!name || name.trim().length === 0) {
      setError('Please enter a name for this search')
      return
    }

    setIsSaving(true)
    setError(null)

    const result = await saveSearch({
      name: name.trim(),
      queryType: activeTab,
      searchQuery: query,
      filters: advancedFilters,
    })

    setIsSaving(false)

    if (result.success) {
      onClose()
      setName('')
    } else {
      setError(result.error || 'Failed to save search')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-4 border-black">
        <DialogHeader>
          <DialogTitle className="font-mono">Save Search</DialogTitle>
          <DialogDescription className="font-mono text-sm">
            Give this search a name for quick recall later
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="font-mono text-sm font-bold block mb-2">
              Search Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Buddhism neuroscience bridges"
              className="w-full border-4 border-black p-3 font-mono"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 border-4 border-red-600 bg-red-50">
              <p className="font-mono text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isSaving}
              className="border-2 border-black"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="border-4 border-black bg-black text-white"
            >
              {isSaving ? 'Saving...' : 'Save Search'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

#### 3. SavedSearchesDropdown Component

**File**: `src/components/search/saved/SavedSearchesDropdown.tsx`
**Changes**: Create dropdown showing recent searches

```typescript
'use client'

import { useState, useEffect } from 'react'
import { getSavedSearches, loadSearch, deleteSavedSearch } from '@/app/actions/search'
import { useSearchStore } from '@/stores/search-store'
import { Button } from '@/components/rhizome/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/rhizome/dropdown-menu'
import { Bookmark, Trash2 } from 'lucide-react'

export function SavedSearchesDropdown() {
  const [searches, setSearches] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const { setQuery, setActiveTab, setAdvancedFilters } = useSearchStore()

  // Load saved searches on mount
  useEffect(() => {
    loadSavedSearches()
  }, [])

  const loadSavedSearches = async () => {
    setIsLoading(true)
    const result = await getSavedSearches()
    setIsLoading(false)

    if (result.success) {
      setSearches(result.searches || [])
    }
  }

  const handleLoadSearch = async (id: string) => {
    const result = await loadSearch(id)

    if (result.success && result.search) {
      const search = result.search

      // Load query and filters into store
      setQuery(search.searchQuery)
      setActiveTab(search.queryType)
      setAdvancedFilters(search.filters)

      // Reload list (updates lastUsedAt)
      loadSavedSearches()
    }
  }

  const handleDeleteSearch = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const result = await deleteSavedSearch(id)

    if (result.success) {
      loadSavedSearches()
    }
  }

  if (searches.length === 0) {
    return (
      <div className="p-4 border-4 border-black">
        <p className="font-mono text-sm text-gray-600">
          No saved searches yet
        </p>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="border-2 border-black">
          <Bookmark className="h-4 w-4 mr-2" />
          Saved Searches ({searches.length})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 border-4 border-black">
        {searches.map((search) => (
          <DropdownMenuItem
            key={search.id}
            onClick={() => handleLoadSearch(search.id)}
            className="font-mono p-3 cursor-pointer hover:bg-gray-100"
          >
            <div className="flex items-start justify-between gap-2 w-full">
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{search.name}</p>
                <p className="text-xs text-gray-600">
                  {search.queryType === 'simple' ? 'Simple' : 'Advanced'} •
                  Used {search.useCount} times
                </p>
              </div>
              <button
                onClick={(e) => handleDeleteSearch(search.id, e)}
                className="p-1 hover:bg-red-100 rounded"
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </button>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Types compile: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors

#### Manual Verification:
- [ ] Click "SAVE SEARCH" → dialog opens
- [ ] Enter name, click Save → search saved to database
- [ ] Saved searches dropdown shows recent 10
- [ ] Click saved search → loads query and filters
- [ ] Click delete icon → removes search
- [ ] Use count increments when loaded
- [ ] Last used date updates

### Service Restarts:
- [ ] Supabase: N/A (no new migration)
- [ ] Worker: N/A
- [x] Next.js: Auto-reload

---

## Phase 5: Polish

### Overview

Production-ready refinements: minimize behavior (panel shrinks to bar when opening document), keyboard navigation (Tab, Esc, arrows, Enter, Cmd+1-9), performance optimizations (caching, debouncing, virtual scroll), loading states, empty states, and error handling improvements.

### Changes Required:

#### 1. Keyboard Navigation Hook

**File**: `src/components/search/useSearchKeyboard.ts`
**Changes**: Create keyboard navigation hook

```typescript
import { useEffect } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useRouter } from 'next/navigation'
import { useSearchStore } from '@/stores/search-store'

export function useSearchKeyboard(results: any[], isOpen: boolean) {
  const router = useRouter()
  const { activeTab, setActiveTab, close, minimize } = useSearchStore()

  // Tab: Switch between Simple/Advanced
  useHotkeys('tab', (e) => {
    e.preventDefault()
    setActiveTab(activeTab === 'simple' ? 'advanced' : 'simple')
  }, { enabled: isOpen })

  // Esc: Close panel
  useHotkeys('esc', () => {
    close()
  }, { enabled: isOpen })

  // Arrow navigation (TODO: implement result focus)
  // useHotkeys('up', ..., { enabled: isOpen })
  // useHotkeys('down', ..., { enabled: isOpen })

  // Enter: Open first result
  useHotkeys('enter', () => {
    if (results.length > 0) {
      const first = results[0]
      if (first.type === 'chunk' && first.metadata.documentId) {
        minimize()
        router.push(`/read/${first.metadata.documentId}`)
      }
    }
  }, { enabled: isOpen && results.length > 0 })

  // Cmd+1-9: Open result by number
  for (let i = 1; i <= 9; i++) {
    useHotkeys(`cmd+${i}`, () => {
      if (results[i - 1]) {
        const result = results[i - 1]
        if (result.type === 'chunk' && result.metadata.documentId) {
          minimize()
          router.push(`/read/${result.metadata.documentId}`)
        }
      }
    }, { enabled: isOpen && results.length >= i })
  }
}
```

#### 2. Performance Optimizations

**File**: `src/components/search/simple/SimpleSearch.tsx`
**Changes**: Add result caching

```typescript
// Add at top of component
const [cachedResults, setCachedResults] = useState<Map<string, any>>(new Map())

// In search effect, check cache first
useEffect(() => {
  if (!debouncedQuery) {
    setResults([], 0)
    return
  }

  // Check cache
  const cacheKey = `${debouncedQuery}-${contentTypeFilter}-${connectionStrength}-${sortBy}`
  if (cachedResults.has(cacheKey)) {
    const cached = cachedResults.get(cacheKey)
    setResults(cached.results, cached.totalCount)
    return
  }

  // Execute search and cache
  const executeSearch = async () => {
    setLoading(true)

    const result = await simpleSearch(...)

    if (result.success) {
      setResults(result.results || [], result.totalCount || 0)

      // Cache for 5 minutes
      const newCache = new Map(cachedResults)
      newCache.set(cacheKey, {
        results: result.results,
        totalCount: result.totalCount,
        timestamp: Date.now()
      })
      setCachedResults(newCache)
    }
  }

  executeSearch()
}, [debouncedQuery, ...])

// Clear stale cache (older than 5 min)
useEffect(() => {
  const interval = setInterval(() => {
    const now = Date.now()
    const newCache = new Map(
      Array.from(cachedResults.entries())
        .filter(([_, value]) => now - value.timestamp < 5 * 60 * 1000)
    )
    setCachedResults(newCache)
  }, 60000) // Check every minute

  return () => clearInterval(interval)
}, [cachedResults])
```

#### 3. Empty States

**File**: `src/components/search/EmptyState.tsx`
**Changes**: Create helpful empty states

```typescript
interface EmptyStateProps {
  type: 'no_query' | 'no_results' | 'no_saved_searches'
}

export function EmptyState({ type }: EmptyStateProps) {
  const content = {
    no_query: {
      icon: '🔍',
      title: 'What are you looking for?',
      description: 'Enter a search query to find documents, connections, sparks, and annotations.',
    },
    no_results: {
      icon: '🤷',
      title: 'No results found',
      description: 'Try different keywords, broaden your filters, or check your spelling.',
    },
    no_saved_searches: {
      icon: '📌',
      title: 'No saved searches yet',
      description: 'Save your complex searches for quick recall later.',
    },
  }

  const state = content[type]

  return (
    <div className="border-4 border-black p-12 text-center">
      <div className="text-6xl mb-4">{state.icon}</div>
      <h3 className="font-mono font-bold text-xl mb-2">{state.title}</h3>
      <p className="font-mono text-sm text-gray-600">{state.description}</p>
    </div>
  )
}
```

#### 4. Loading Skeleton

**File**: `src/components/search/results/ResultsList.tsx`
**Changes**: Improve loading state

```typescript
// Enhanced loading skeleton
if (isLoading) {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="border-4 border-gray-300 p-4 space-y-3"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse" />
          </div>
          <div className="h-10 bg-gray-200 rounded w-1/3 animate-pulse" />
        </div>
      ))}
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Types compile: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors
- [ ] Lighthouse performance score >90

#### Manual Verification:
- [ ] Tab switches between Simple/Advanced tabs
- [ ] Esc closes panel
- [ ] Enter opens first result
- [ ] Cmd+1-9 opens results 1-9
- [ ] Minimize bar shows at bottom when document opens
- [ ] Click minimized bar restores panel
- [ ] Search results cached (instant load on repeat query)
- [ ] Empty states show helpful messages
- [ ] Loading skeleton animates smoothly
- [ ] Performance: Simple <500ms, Advanced <1s, Relationship <2s
- [ ] No memory leaks (test with multiple searches)

### Service Restarts:
- [ ] Supabase: N/A
- [ ] Worker: N/A
- [x] Next.js: Auto-reload

---

## Testing Strategy

### Unit Tests

**File**: `src/components/search/__tests__/search-store.test.ts`
**Test coverage:**
- Store initialization
- Panel open/close/minimize/restore
- Query updates trigger debounce
- Filters update correctly
- Results set/clear

**File**: `src/app/actions/__tests__/search.test.ts`
**Test coverage:**
- Simple search returns results
- Advanced search with filters
- Relationship queries work
- Saved search CRUD operations
- Error handling (no auth, invalid params)

### Integration Tests

**File**: `src/components/search/__tests__/SearchPanel.integration.test.ts`
**Test coverage:**
- Type query → results appear
- Change filter → results update
- Click result → navigates to document
- Save search → persists to database
- Load saved search → restores query/filters

### Manual Testing Checklist

#### Simple Tab:
- [ ] Type "consciousness" → results appear
- [ ] Results show document titles, previews, metadata
- [ ] Click "Open in reader" → document opens, panel minimizes
- [ ] Filter by type → results update
- [ ] Filter by strength → results update
- [ ] Sort by date → results reorder
- [ ] Empty query → no results (not error)
- [ ] No results → helpful message

#### Advanced Tab:
- [ ] All filters render correctly
- [ ] Select engines → updates filter
- [ ] Adjust strength slider → updates range
- [ ] Select themes → autocomplete works
- [ ] Relationship query "Connect to X" → shows connected docs
- [ ] Relationship query "Link concepts A, B" → shows connections
- [ ] Click "SEARCH →" → executes query
- [ ] Click "CLEAR ALL" → resets filters

#### Saved Searches:
- [ ] Save search → appears in dropdown
- [ ] Load search → restores query/filters
- [ ] Delete search → removes from list
- [ ] Use count increments
- [ ] Last used date updates

#### Keyboard Shortcuts:
- [ ] Opt+S opens panel
- [ ] Tab switches tabs
- [ ] Esc closes panel
- [ ] Enter opens first result
- [ ] Cmd+1-9 opens results

#### Performance:
- [ ] Simple search <500ms
- [ ] Advanced search <1s
- [ ] Relationship queries <2s
- [ ] Cached queries instant
- [ ] Smooth scrolling (50+ results)

---

## Performance Considerations

### Query Optimization

**HNSW Index Tuning:**
```sql
-- Current settings (from migration 069)
CREATE INDEX idx_chunks_embedding_hnsw
ON chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Runtime tuning (if needed)
SET hnsw.ef_search = 100; -- Default: 40, higher = better recall
```

**Performance targets:**
- HNSW provides logarithmic search time: O(log n)
- Expected QPS (queries per second): 40+ for 1M vectors
- Recall accuracy: >95% with default settings

### Caching Strategy

**Client-side cache:**
- Cache search results for 5 minutes
- Cache saved searches list for session
- Clear stale cache entries every 1 minute

**Server-side cache (future):**
- Consider Redis for frequently searched terms
- Cache RPC function results (5 min TTL)
- Invalidate on document updates

### Database Performance

**Index Maintenance:**
```sql
-- Run weekly
VACUUM ANALYZE chunks;
ANALYZE saved_searches;

-- Monitor index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename IN ('chunks', 'connections', 'saved_searches')
ORDER BY idx_scan DESC;
```

**Query Monitoring:**
```sql
-- Check slow queries (>500ms)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 500
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Frontend Performance

**Code splitting:**
- Lazy load Advanced tab components
- Lazy load result type components
- Use dynamic imports for heavy dependencies

**Virtual scrolling:**
- Implement for >50 results
- Use `react-virtuoso` or similar
- Render only visible results

**Debouncing:**
- Simple tab: 300ms debounce
- Advanced tab: No auto-search (manual trigger)
- Saved searches dropdown: No debounce needed

---

## Migration Notes

**Migration Timeline:**
- `069_search_infrastructure.sql` - Foundation (indexes, saved_searches table)
- `070_hybrid_search_rpc.sql` - Simple search RPC function
- `071_relationship_queries.sql` - Advanced search and graph queries

**No Data Migration Needed:**
- Uses existing `chunks.embedding` column
- Uses existing `connections` table
- Saved searches start empty (no migration)

**Rollback Strategy:**
```sql
-- To rollback all search migrations
DROP TABLE IF EXISTS saved_searches;
DROP INDEX IF EXISTS idx_chunks_content_fts;
DROP INDEX IF EXISTS idx_chunks_embedding_hnsw;
DROP FUNCTION IF EXISTS hybrid_search;
DROP FUNCTION IF EXISTS get_connected_documents;
DROP FUNCTION IF EXISTS find_connections_by_concepts;
DROP FUNCTION IF EXISTS advanced_search;
DROP FUNCTION IF EXISTS get_available_themes;
DROP FUNCTION IF EXISTS use_saved_search;
ALTER TABLE chunks DROP COLUMN IF EXISTS content_tsv;
```

---

## References

### Architecture:
- `docs/ARCHITECTURE.md` - Rhizome system architecture
- `docs/APP_VISION.md` - Product vision and philosophy
- `docs/UI_PATTERNS.md` - No modals rule, persistent UI patterns

### Implementation Patterns:
- `src/stores/admin/admin-panel.ts:45-72` - Zustand store pattern (no persist)
- `src/components/layout/BottomPanel.tsx` - Reusable panel component
- `src/app/actions/connections.ts:19-54` - RPC function pattern
- `src/app/actions/study.ts:47-154` - Complex filtering pattern

### External Documentation:
- [pgvector GitHub](https://github.com/pgvector/pgvector) - Vector extension documentation
- [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search) - RRF implementation
- [AWS pgvector Optimization](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/) - Performance benchmarks
- [Neon Halfvec Guide](https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost) - Storage optimization

### Similar Implementations:
- AdminPanel: `src/components/admin/AdminPanel.tsx:25-122`
- RightPanel: `src/components/sidebar/RightPanel.tsx`
- Connection filtering: `src/stores/connection-store.ts:84-216`
