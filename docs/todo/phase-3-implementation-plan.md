# Phase 3 Implementation Plan: Connection Surfacing with 3-Engine System

**Status**: In Progress
**Started**: 2025-10-02
**Estimated Time**: 6-8 hours total

## Overview

Migrate from 7-engine mock system to 3-engine real data system with debounced fetching for optimal performance.

## Critical Issues Identified

### 1. Performance: Missing Debouncing (CRITICAL)
**Problem**: Without debouncing, `visibleChunkIds` changes 60 times/second during scrolling, causing 60 database queries/second.

**Impact**: Database overload, poor performance, potential crashes

**Solution**: Custom `useDebounce` hook with 300ms delay

### 2. Type Safety: 7-Engine → 3-Engine Migration
**Problem**: Frontend types define 7 engines, worker produces 3 engines, causing type mismatch.

**Current State**:
- Frontend: `'semantic' | 'thematic' | 'structural' | 'contradiction' | 'emotional' | 'methodological' | 'temporal'`
- Worker: `'semantic_similarity' | 'thematic_bridge' | 'contradiction_detection'`

**Solution**: Update all frontend types to match worker output

### 3. Data Completeness: Missing Metadata
**Problem**: Worker doesn't populate `target_document_title` or `target_snippet` in connection metadata.

**Impact**: ConnectionCard displays "Unknown Document" and "No preview available" for all connections

**Solution**: Enhance worker metadata population in all 3 engines

## Implementation Sessions

### Session 1: Type System & Debouncing (2-3 hours)

#### Task 1.1: Update Type Definitions
**File**: `src/types/annotations.ts`

**Changes**:
```typescript
// OLD (lines 99-108):
export type SynthesisEngine =
  | 'semantic'
  | 'thematic'
  | 'structural'
  | 'contradiction'
  | 'emotional'
  | 'methodological'
  | 'temporal'

// NEW (matching worker output):
export type SynthesisEngine =
  | 'semantic_similarity'      // Embedding-based (25% weight)
  | 'thematic_bridge'          // AI cross-domain (35% weight)
  | 'contradiction_detection'  // Metadata tensions (40% weight)

// Update EngineWeights interface:
export interface EngineWeights {
  semantic_similarity: number
  thematic_bridge: number
  contradiction_detection: number
}

// Update WeightPreset type (remove 'chaos', add 'semantic-only'):
export type WeightPreset = 'max-friction' | 'thematic-focus' | 'balanced' | 'semantic-only'
```

**Validation**: TypeScript compilation should pass

---

#### Task 1.2: Update Store Presets
**File**: `src/stores/annotation-store.ts`

**Changes**:
```typescript
// Update WEIGHT_PRESETS (lines 13-50):
const WEIGHT_PRESETS: Record<WeightPreset, EngineWeights> = {
  'max-friction': {
    semantic_similarity: 0.25,
    thematic_bridge: 0.35,
    contradiction_detection: 0.40,  // Highest - prioritizes tensions
  },
  'thematic-focus': {
    semantic_similarity: 0.20,
    thematic_bridge: 0.60,          // Highest - cross-domain insights
    contradiction_detection: 0.20,
  },
  'balanced': {
    semantic_similarity: 0.33,
    thematic_bridge: 0.34,
    contradiction_detection: 0.33,
  },
  'semantic-only': {  // Renamed from 'chaos'
    semantic_similarity: 0.70,
    thematic_bridge: 0.20,
    contradiction_detection: 0.10,
  },
}

// Update initial enabled engines (line 162-170):
enabledEngines: new Set(['semantic_similarity', 'thematic_bridge', 'contradiction_detection'])
```

**Validation**: Store should export correctly, no TS errors

---

#### Task 1.3: Create Debounce Hook
**File**: `src/hooks/useDebounce.ts` (NEW)

**Full Implementation**:
```typescript
import { useState, useEffect } from 'react'

/**
 * Debounces a value update to reduce rapid state changes.
 * Useful for scroll-based queries that would otherwise fire 60 times/second.
 *
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns Debounced value
 *
 * @example
 * ```tsx
 * const debouncedChunkIds = useDebounce(visibleChunkIds, 300)
 * useEffect(() => {
 *   fetchConnections(debouncedChunkIds)
 * }, [debouncedChunkIds])
 * ```
 */
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

**Validation**: Hook should export correctly

---

#### Task 1.4: Update ConnectionsList with Debounced Fetching
**File**: `src/components/sidebar/ConnectionsList.tsx`

**Major Changes**:
1. Replace MOCK_CONNECTIONS with real database fetching
2. Add `visibleChunkIds` prop
3. Implement debounced fetching
4. Add runtime type validation
5. Update engine labels and colors

**Key Code Sections**:

```typescript
// NEW: Real connection interface
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
    [key: string]: unknown
  }
}

interface ConnectionsListProps {
  documentId: string
  visibleChunkIds: string[]  // NEW
}

export function ConnectionsList({ documentId, visibleChunkIds }: ConnectionsListProps) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(false)

  // Debounce visible chunk IDs (prevents 60 queries/second)
  const debouncedChunkIds = useDebounce(visibleChunkIds, 300)

  // Fetch connections for visible chunks (debounced)
  useEffect(() => {
    async function fetchConnections() {
      if (debouncedChunkIds.length === 0) {
        setConnections([])
        return
      }

      setLoading(true)
      const supabase = createClient()

      const { data, error } = await supabase
        .from('chunk_connections')
        .select('*')
        .in('source_chunk_id', debouncedChunkIds)
        .order('strength', { ascending: false })
        .limit(100)

      if (error) {
        console.error('[ConnectionsList] Failed to fetch:', error)
        setConnections([])
      } else {
        setConnections(data || [])
      }

      setLoading(false)
    }

    fetchConnections()
  }, [debouncedChunkIds])

  // Runtime type validation + filtering
  const filteredConnections = useMemo(() => {
    const validEngines = new Set(['semantic_similarity', 'thematic_bridge', 'contradiction_detection'])

    return connections
      .filter(c => validEngines.has(c.type))  // Runtime validation
      .filter(c => enabledEngines.has(c.type))
      .filter(c => c.strength >= strengthThreshold)
      .map(c => ({
        ...c,
        weightedStrength: c.strength * (weights[c.type] || 0)
      }))
      .sort((a, b) => b.weightedStrength - a.weightedStrength)
  }, [connections, weights, enabledEngines, strengthThreshold])

  // Update engine labels:
  const engineLabels: Record<SynthesisEngine, string> = {
    semantic_similarity: 'Semantic Similarity',
    thematic_bridge: 'Thematic Bridges',
    contradiction_detection: 'Contradictions',
  }

  // Update engine colors:
  const engineColors: Record<SynthesisEngine, string> = {
    semantic_similarity: 'blue-500',
    thematic_bridge: 'purple-500',
    contradiction_detection: 'red-500',
  }
}
```

**Validation**:
- Component renders without errors
- Console should show debounced queries (not 60/second)

---

### Session 2: Worker Metadata & UI Updates (2-3 hours)

#### Task 2.1: Enhance Semantic Similarity Metadata
**File**: `worker/engines/semantic-similarity.ts`

**Changes** (around line 120-140 where connections are created):
```typescript
const connections: ChunkConnection[] = matches.map(match => ({
  source_chunk_id: chunk.id,
  target_chunk_id: match.id,
  connection_type: 'semantic_similarity',
  strength: match.similarity,
  auto_detected: true,
  discovered_at: new Date().toISOString(),
  metadata: {
    // Existing:
    raw_similarity: match.similarity,
    importance_score: match.importance_score,
    threshold_used: threshold,
    engine_version: 'v2',

    // NEW - Required for UI:
    target_document_title: match.document_title || 'Unknown Document',
    target_snippet: match.content?.slice(0, 200) || match.summary?.slice(0, 200) || 'No preview available',
    explanation: `Semantic similarity: ${(match.similarity * 100).toFixed(1)}%`,
  }
}))
```

**Note**: You'll need to fetch document title in the query. Update the SELECT clause:
```typescript
const { data: matches } = await supabase
  .from('chunks')
  .select(`
    id,
    content,
    summary,
    importance_score,
    documents!inner(title)
  `)
  // ... rest of query
```

Then access: `match.documents.title`

---

#### Task 2.2: Enhance Contradiction Detection Metadata
**File**: `worker/engines/contradiction-detection.ts`

**Similar pattern** - add document title join and populate metadata:
```typescript
metadata: {
  // Existing contradiction-specific data
  shared_concepts: sharedConcepts,
  polarity_difference: polarityDiff,

  // NEW - Required for UI:
  target_document_title: targetChunk.documents.title || 'Unknown Document',
  target_snippet: targetChunk.content?.slice(0, 200) || 'No preview available',
  explanation: `Discussing ${sharedConcepts.join(', ')} with opposing stances`,
}
```

---

#### Task 2.3: Enhance Thematic Bridge Metadata
**File**: `worker/engines/thematic-bridge.ts`

**Similar pattern** - add document title join and populate metadata:
```typescript
metadata: {
  // Existing thematic-specific data
  bridge_type: analysis.bridgeType,
  shared_concept: analysis.sharedConcept,
  source_domain: sourceDomain,
  target_domain: targetDomain,

  // NEW - Required for UI:
  target_document_title: candidate.documents.title || 'Unknown Document',
  target_snippet: candidate.content?.slice(0, 200) || candidate.summary?.slice(0, 200) || 'No preview available',
  explanation: analysis.reasoning || `${analysis.bridgeType} bridge detected`,
}
```

---

#### Task 2.4: Update ConnectionCard with Fallbacks
**File**: `src/components/sidebar/ConnectionCard.tsx`

**Add defensive fallbacks**:
```typescript
export function ConnectionCard({ connection, documentId, isActive, onClick }: ConnectionCardProps) {
  // Defensive metadata access with fallbacks
  const targetTitle = connection.metadata?.target_document_title || 'Unknown Document'
  const targetSnippet = connection.metadata?.target_snippet || 'No preview available'
  const explanation = connection.metadata?.explanation || 'Connection detected'

  // ... rest of component
}
```

---

#### Task 2.5: Update WeightTuning Component
**File**: `src/components/sidebar/WeightTuning.tsx`

**Update ENGINE_LABELS** (probably around line 20-30):
```typescript
const ENGINE_LABELS: Record<keyof EngineWeights, string> = {
  semantic_similarity: 'Semantic Similarity',
  thematic_bridge: 'Thematic Bridges',
  contradiction_detection: 'Contradictions',
}

const ENGINE_DESCRIPTIONS: Record<keyof EngineWeights, string> = {
  semantic_similarity: 'Embedding-based matching (fast, baseline)',
  thematic_bridge: 'AI-powered cross-domain connections',
  contradiction_detection: 'Opposing viewpoints and tensions',
}
```

**Update render** to only show 3 sliders:
```tsx
{Object.entries(ENGINE_LABELS).map(([engine, label]) => (
  <div key={engine}>
    <Label>{label}</Label>
    <p className="text-xs text-muted-foreground">{ENGINE_DESCRIPTIONS[engine]}</p>
    <Slider
      value={[weights[engine as keyof EngineWeights] * 100]}
      onValueChange={([value]) => setWeight(engine as keyof EngineWeights, value / 100)}
      max={100}
      step={1}
    />
  </div>
))}
```

---

#### Task 2.6: Update ConnectionFilters Component
**File**: `src/components/sidebar/ConnectionFilters.tsx`

**Similar updates** - 3 engines instead of 7:
```typescript
const ENGINE_OPTIONS = [
  { value: 'semantic_similarity', label: 'Semantic Similarity', color: 'blue' },
  { value: 'thematic_bridge', label: 'Thematic Bridges', color: 'purple' },
  { value: 'contradiction_detection', label: 'Contradictions', color: 'red' },
] as const
```

---

### Session 3: Integration & Testing (1 hour)

#### Task 3.1: Wire VirtualizedReader to ConnectionsList
**File**: `src/app/read/[id]/page.tsx`

**Update RightPanel integration**:
```tsx
<RightPanel
  documentId={params.id}
  visibleChunkIds={visibleChunkIds}  // Pass from VirtualizedReader
/>
```

Make sure `visibleChunkIds` state is being tracked by VirtualizedReader's `onVisibleChunksChange` callback.

---

#### Task 3.2: Testing Checklist

**Network Performance**:
- [ ] Open browser DevTools → Network tab
- [ ] Scroll through document rapidly
- [ ] Verify queries only fire when scrolling pauses (300ms debounce)
- [ ] Should see ~1 query per scroll pause, NOT 60/second

**Weight Tuning**:
- [ ] Adjust weight sliders
- [ ] Connections should re-rank instantly (no network request)
- [ ] Check console for performance warnings (should be <100ms)

**Engine Filtering**:
- [ ] Toggle engines on/off
- [ ] Connections should filter instantly (no network request)
- [ ] Grouped sections should show/hide appropriately

**Connection Display**:
- [ ] Verify target document titles display correctly
- [ ] Verify snippets show actual content (not "No preview available")
- [ ] Verify explanations are meaningful

**Edge Cases**:
- [ ] No visible chunks (sidebar should show empty state)
- [ ] No connections found (should show helpful message)
- [ ] Invalid engine types in database (should be filtered out)

---

## Success Criteria

✅ **Performance**: Debounced queries (1 per scroll pause, not 60/second)
✅ **Type Safety**: All 3 engines align between worker and frontend
✅ **Data Completeness**: Connections show real document titles and snippets
✅ **Real-time Filtering**: Weight/engine changes don't trigger refetch
✅ **User Experience**: Smooth scrolling with connections surfacing for visible chunks

---

## Files Modified (Total: 10)

### Frontend (6 files)
1. `src/types/annotations.ts` - Type definitions
2. `src/stores/annotation-store.ts` - Weight presets
3. `src/hooks/useDebounce.ts` - NEW debounce hook
4. `src/components/sidebar/ConnectionsList.tsx` - Real data + debouncing
5. `src/components/sidebar/ConnectionCard.tsx` - Metadata fallbacks
6. `src/components/sidebar/WeightTuning.tsx` - 3 sliders
7. `src/components/sidebar/ConnectionFilters.tsx` - 3 toggles

### Worker (3 files)
8. `worker/engines/semantic-similarity.ts` - Metadata enhancement
9. `worker/engines/contradiction-detection.ts` - Metadata enhancement
10. `worker/engines/thematic-bridge.ts` - Metadata enhancement

---

## Rollback Plan

If issues arise:
1. **Frontend**: Revert to MOCK_CONNECTIONS temporarily
2. **Worker**: Metadata is additive - won't break existing connections
3. **Types**: Git revert specific commits

---

## Next Steps After Phase 3

Once this is complete:
- **Phase 4**: Annotation creation and persistence
- **Phase 5**: Export/import safety net

---

**Last Updated**: 2025-10-02
**Status**: Ready to begin implementation
