# Task Breakdown: Document Reader Real Connections Integration

> **Generated From**: docs/prps/document-reader-real-connections.md  
> **Feature**: Real-time collision detection display in document reader  
> **Total Estimated Effort**: 13-18 hours  
> **Priority**: Critical - Core user value proposition  

## Executive Summary

This task breakdown implements the fix for displaying real collision detection results instead of mock data in the document reader. The primary issue is a database schema mismatch where the worker outputs chunk-based connections but the database expects entity-based IDs. This is a well-scoped technical fix using existing architectural patterns.

## Phase Organization

### Phase 1: Database Schema & Worker Integration
**Objective**: Fix the root cause schema mismatch  
**Duration**: 4-6 hours  
**Deliverables**:
- Database migration with chunk-based columns
- Worker connection insertion fix
- Engine type mapping utility

**Milestones**:
- Migration applies cleanly
- Worker successfully inserts connections
- Engine types map correctly between systems

### Phase 2: Connection Query API  
**Objective**: Create server-side query infrastructure  
**Duration**: 3-4 hours  
**Deliverables**:
- Server action for connection queries
- Filtering support (internal/external/engines)
- User feedback actions

**Milestones**:
- API returns real connections from database
- Filters work correctly
- Feedback persists to database

### Phase 3: UI Integration & Real Data Display
**Objective**: Replace mock data with real connections  
**Duration**: 4-5 hours  
**Deliverables**:
- React Query hook for connections
- Updated ConnectionsList component
- Internal/external toggle UI

**Milestones**:
- UI displays real connections
- Toggle filters connections properly
- Loading states handle gracefully

### Phase 4: Viewport-Aware Loading
**Objective**: Optimize for contextual connection display  
**Duration**: 2-3 hours  
**Deliverables**:
- Viewport chunk detection
- Debounced scroll handling
- Dynamic connection updates

**Milestones**:
- Connections update as user scrolls
- No UI blocking during updates
- Performance within acceptable thresholds

---

## Detailed Task Breakdown

### Task T-001: Create Database Migration for Chunk-Based Connections

**Priority**: Critical  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: None (can start immediately)  

#### Context & Background
The connections table currently expects entity-based IDs but the worker generates chunk-based connections. This migration adds the necessary columns without breaking existing data.

#### Technical Requirements
- Add chunk ID columns to connections table
- Create performance indexes for query optimization
- Maintain backward compatibility with existing columns

#### Implementation Details

**Files to Modify/Create**:
```
└── supabase/migrations/017_chunk_based_connections.sql [NEW] - Migration to add chunk columns
```

**Migration SQL**:
```sql
-- Add chunk-based columns
ALTER TABLE connections 
  ADD COLUMN source_chunk_id UUID REFERENCES chunks(id),
  ADD COLUMN target_chunk_id UUID REFERENCES chunks(id),
  ADD COLUMN engine_type TEXT,
  ADD COLUMN detected_at TIMESTAMPTZ DEFAULT NOW();

-- Performance indexes for query optimization
CREATE INDEX idx_connections_source_chunk ON connections(source_chunk_id);
CREATE INDEX idx_connections_target_chunk ON connections(target_chunk_id);
CREATE INDEX idx_connections_engine_type ON connections(engine_type);
CREATE INDEX idx_connections_detected_at ON connections(detected_at DESC);

-- Composite index for common query pattern
CREATE INDEX idx_connections_chunk_lookup 
  ON connections(source_chunk_id, engine_type, strength DESC);
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given the existing connections table structure
When the migration is applied
Then new chunk-based columns exist
And existing data remains intact
And indexes are created for performance
```

**Checklist**:
- [ ] Migration applies without errors
- [ ] Indexes created successfully
- [ ] Foreign key constraints established
- [ ] Rollback script works if needed

#### Manual Testing Steps
```bash
# 1. Reset database with migration
npx supabase db reset

# 2. Verify schema
psql -h localhost -p 54322 -d postgres -c "\d connections"

# 3. Test insert with new columns
psql -h localhost -p 54322 -d postgres -c "
  INSERT INTO connections (
    id, user_id, source_chunk_id, target_chunk_id, 
    engine_type, strength, auto_detected
  ) VALUES (
    gen_random_uuid(), '<test-user-id>', '<chunk1>', '<chunk2>',
    'semantic', 0.85, true
  );"
```

---

### Task T-002: Fix Worker Connection Insertion Logic

**Priority**: Critical  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: T-001 (migration must be applied first)  

#### Context & Background
The worker currently tries to insert connections with entity IDs that don't exist, causing silent failures. This task fixes the insertion to use chunk IDs.

#### Technical Requirements
- Map worker connection data to new database schema
- Fix engine type format mismatch
- Add proper error handling for failed insertions

#### Implementation Details

**Files to Modify**:
```
├── worker/handlers/detect-connections.ts [MODIFY] - Fix insertion logic (lines 329-343)
└── worker/lib/monitoring.ts [MODIFY] - Add connection insertion metrics
```

**Code Changes**:
```typescript
// worker/handlers/detect-connections.ts (lines 329-343)
const connectionInserts = connections.map(conn => ({
  id: crypto.randomUUID(),
  user_id: userId,
  source_chunk_id: conn.sourceChunkId,      // Changed from source_entity_id
  target_chunk_id: conn.targetChunkId,      // Changed from target_entity_id
  engine_type: conn.engine.toLowerCase().replace(/_/g, '-'), // Map to UI format
  strength: conn.score,
  auto_detected: true,
  detected_at: new Date().toISOString(),
  metadata: { 
    raw_engine_type: conn.engine,           // Keep original for debugging
    context: conn.context,
    explanation: conn.explanation
  }
}));

// Add error handling
const { data, error } = await supabase
  .from('connections')
  .insert(connectionInserts)
  .select();

if (error) {
  monitoring.recordError('connection_insertion_failed', error);
  throw new Error(`Failed to insert connections: ${error.message}`);
}

monitoring.recordMetric('connections_inserted', connectionInserts.length);
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given the worker processes a document with chunks
When collision detection finds connections
Then connections are inserted with chunk IDs
And engine types are properly formatted
And insertion errors are logged
```

**Checklist**:
- [ ] Connections insert successfully
- [ ] No silent failures
- [ ] Engine types match UI format
- [ ] Monitoring tracks insertions

#### Manual Testing Steps
```bash
# 1. Process a test document
cd worker && npm run dev

# 2. Monitor logs for insertion
tail -f worker.log | grep "connections_inserted"

# 3. Verify database records
psql -h localhost -p 54322 -d postgres -c "
  SELECT COUNT(*) FROM connections WHERE source_chunk_id IS NOT NULL;"
```

---

### Task T-003: Create Engine Type Mapping Utility

**Priority**: High  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: None (can work in parallel with T-001)  

#### Context & Background
The worker uses SCREAMING_SNAKE_CASE engine types while the UI expects lowercase-hyphenated format. This utility ensures consistent mapping.

#### Technical Requirements
- Bidirectional mapping between formats
- Type-safe implementation
- Shared between worker and UI

#### Implementation Details

**Files to Create**:
```
├── worker/lib/engine-type-mapper.ts [NEW] - Mapping utility
└── worker/lib/__tests__/engine-type-mapper.test.ts [NEW] - Unit tests
```

**Implementation**:
```typescript
// worker/lib/engine-type-mapper.ts
export const ENGINE_TYPE_MAP = {
  'SEMANTIC_SIMILARITY': 'semantic',
  'CONCEPTUAL_DENSITY': 'thematic', 
  'STRUCTURAL_PATTERN': 'structural',
  'CITATION_NETWORK': 'methodological',
  'TEMPORAL_PROXIMITY': 'temporal',
  'CONTRADICTION_DETECTION': 'contradiction',
  'EMOTIONAL_RESONANCE': 'emotional'
} as const;

export type WorkerEngineType = keyof typeof ENGINE_TYPE_MAP;
export type UIEngineType = typeof ENGINE_TYPE_MAP[WorkerEngineType];

export function mapEngineTypeForUI(workerType: string): string {
  return ENGINE_TYPE_MAP[workerType as WorkerEngineType] || 'unknown';
}

export function mapEngineTypeFromUI(uiType: string): string {
  const entry = Object.entries(ENGINE_TYPE_MAP)
    .find(([_, ui]) => ui === uiType);
  return entry?.[0] || 'UNKNOWN';
}
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given an engine type from the worker
When mapped to UI format
Then the correct lowercase-hyphenated string is returned

Given an engine type from the UI
When mapped to worker format
Then the correct SCREAMING_SNAKE_CASE string is returned
```

**Checklist**:
- [ ] All 7 engine types mapped correctly
- [ ] Bidirectional mapping works
- [ ] Unknown types handled gracefully
- [ ] TypeScript types enforced

---

### Task T-004: Create Connections Server Action

**Priority**: High  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: T-001, T-002 (database and insertion must work)  

#### Context & Background
Following the existing pattern from annotations.ts, create a server action to query connections for specific chunks with filtering support.

#### Technical Requirements
- Query connections by chunk IDs
- Support filtering by scope and engine type
- Include related chunk data in response
- Follow existing server action patterns

#### Implementation Details

**Files to Create**:
```
└── src/app/actions/connections.ts [NEW] - Server actions for connections
```

**Implementation**:
```typescript
// src/app/actions/connections.ts
'use server'

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getConnectionsForChunks(
  documentId: string,
  chunkIds: string[],
  filters?: {
    engineTypes?: string[];
    minStrength?: number;
    scope?: 'internal' | 'external' | 'all';
  }
) {
  const supabase = createServerClient();
  
  // Base query with joins
  let query = supabase
    .from('connections')
    .select(`
      id,
      engine_type,
      strength,
      auto_detected,
      user_confirmed,
      user_hidden,
      detected_at,
      source_chunk:source_chunk_id (
        id,
        content,
        position,
        document_id
      ),
      target_chunk:target_chunk_id (
        id,
        content,
        position,
        document_id,
        document:documents (
          id,
          title
        )
      ),
      metadata
    `)
    .in('source_chunk_id', chunkIds)
    .eq('user_hidden', false) // Don't show hidden connections
    .order('strength', { ascending: false })
    .limit(50); // Limit for performance

  // Apply scope filter
  if (filters?.scope === 'internal') {
    query = query.eq('target_chunk.document_id', documentId);
  } else if (filters?.scope === 'external') {
    query = query.neq('target_chunk.document_id', documentId);
  }

  // Apply other filters
  if (filters?.minStrength) {
    query = query.gte('strength', filters.minStrength);
  }
  if (filters?.engineTypes?.length) {
    query = query.in('engine_type', filters.engineTypes);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Connection query failed:', error);
    throw new Error(`Failed to fetch connections: ${error.message}`);
  }

  return data || [];
}

export async function updateConnectionFeedback(
  connectionId: string,
  feedback: 'confirmed' | 'hidden'
) {
  const supabase = createServerClient();
  
  const updates = feedback === 'confirmed' 
    ? { user_confirmed: true, user_hidden: false }
    : { user_hidden: true, user_confirmed: false };
    
  const { error } = await supabase
    .from('connections')
    .update(updates)
    .eq('id', connectionId);
    
  if (error) {
    console.error('Connection update failed:', error);
    throw new Error(`Failed to update connection: ${error.message}`);
  }
  
  revalidatePath('/read/[id]', 'page');
}
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given visible chunks in the document reader
When requesting connections for those chunks
Then real connections are returned from the database
And filters are applied correctly
And related chunk data is included
```

**Checklist**:
- [ ] Queries return real data
- [ ] Scope filtering works
- [ ] Engine type filtering works
- [ ] Feedback updates persist
- [ ] Errors handled gracefully

---

### Task T-005: Create useConnections React Query Hook

**Priority**: High  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: T-004 (server action must exist)  

#### Context & Background
Create a React Query hook to manage connection fetching with caching and invalidation support.

#### Technical Requirements
- Integrate with server action
- Provide caching with 5-minute stale time
- Support filter changes
- Handle loading and error states

#### Implementation Details

**Files to Create**:
```
└── src/hooks/use-connections.ts [NEW] - React Query hook for connections
```

**Implementation**:
```typescript
// src/hooks/use-connections.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getConnectionsForChunks, 
  updateConnectionFeedback 
} from '@/app/actions/connections';

export interface ConnectionFilters {
  engineTypes?: string[];
  minStrength?: number;
  scope?: 'internal' | 'external' | 'all';
}

export function useConnections(
  documentId: string,
  chunkIds: string[],
  filters?: ConnectionFilters
) {
  return useQuery({
    queryKey: ['connections', documentId, chunkIds, filters],
    queryFn: () => getConnectionsForChunks(documentId, chunkIds, filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    enabled: chunkIds.length > 0,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export function useConnectionFeedback() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      connectionId, 
      feedback 
    }: { 
      connectionId: string; 
      feedback: 'confirmed' | 'hidden' 
    }) => updateConnectionFeedback(connectionId, feedback),
    
    onSuccess: () => {
      // Invalidate all connection queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
    
    onError: (error) => {
      console.error('Failed to update connection feedback:', error);
    }
  });
}
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given the hook is used in a component
When chunk IDs change
Then new connections are fetched
And previous results are cached
And loading states are provided
```

**Checklist**:
- [ ] Hook fetches real data
- [ ] Caching works as expected
- [ ] Filter changes trigger refetch
- [ ] Error states handled
- [ ] Mutation updates UI

---

### Task T-006: Update ConnectionsList Component

**Priority**: Critical  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: T-005 (hook must be available)  

#### Context & Background
Replace the mock data import with the real connections hook while maintaining existing UI behavior.

#### Technical Requirements
- Remove mock data dependency
- Integrate useConnections hook
- Add loading and error states
- Maintain existing rendering logic

#### Implementation Details

**Files to Modify**:
```
└── src/components/sidebar/ConnectionsList.tsx [MODIFY] - Replace mock data with real
```

**Code Changes**:
```typescript
// src/components/sidebar/ConnectionsList.tsx

// Remove mock import
// DELETE: import { MOCK_CONNECTIONS } from '@/lib/annotations/mock-connections';

// Add real data hook
import { useConnections } from '@/hooks/use-connections';
import { ConnectionsSkeleton } from './ConnectionsSkeleton';
import { ConnectionsError } from './ConnectionsError';

interface ConnectionsListProps {
  documentId: string;
  visibleChunkIds: string[];
  filters?: {
    internalOnly?: boolean;
    selectedEngines?: string[];
    strengthThreshold?: number;
  };
}

export function ConnectionsList({ 
  documentId, 
  visibleChunkIds,
  filters 
}: ConnectionsListProps) {
  const { 
    data: connections, 
    isLoading, 
    error 
  } = useConnections(documentId, visibleChunkIds, {
    scope: filters?.internalOnly ? 'internal' : 'all',
    engineTypes: filters?.selectedEngines,
    minStrength: filters?.strengthThreshold
  });

  if (isLoading) {
    return <ConnectionsSkeleton />;
  }

  if (error) {
    return <ConnectionsError error={error} onRetry={() => {}} />;
  }

  if (!connections?.length) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No connections found for the current view
      </div>
    );
  }

  // Existing rendering logic remains the same
  return (
    <div className="space-y-2">
      {connections.map((connection) => (
        <ConnectionCard 
          key={connection.id} 
          connection={connection}
          onFeedback={(feedback) => {
            // Handle feedback
          }}
        />
      ))}
    </div>
  );
}
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given the component is rendered with chunk IDs
When connections are loading
Then a loading skeleton is shown

Given connections have loaded
When data is available
Then real connections are displayed

Given an error occurs
When the query fails
Then an error state is shown
```

**Checklist**:
- [ ] Mock data removed completely
- [ ] Real connections display
- [ ] Loading state works
- [ ] Error state works
- [ ] Empty state handled

---

### Task T-007: Add Internal/External Toggle UI

**Priority**: Medium  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: T-006 (ConnectionsList updated)  

#### Context & Background
Add UI controls to filter connections by scope (internal to document vs external).

#### Technical Requirements
- Add toggle buttons to filter component
- Update filter state management
- Pass scope to ConnectionsList

#### Implementation Details

**Files to Modify**:
```
└── src/components/sidebar/ConnectionFilters.tsx [MODIFY] - Add scope toggle
```

**Code Changes**:
```typescript
// src/components/sidebar/ConnectionFilters.tsx
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function ConnectionFilters({ 
  onFiltersChange 
}: { 
  onFiltersChange: (filters: any) => void 
}) {
  const [scope, setScope] = useState<'all' | 'internal' | 'external'>('all');
  const [selectedEngines, setSelectedEngines] = useState<string[]>([]);
  
  const handleScopeChange = (newScope: typeof scope) => {
    setScope(newScope);
    onFiltersChange({ 
      scope: newScope, 
      engineTypes: selectedEngines 
    });
  };

  return (
    <div className="space-y-4 p-4 border-b">
      {/* Scope Toggle */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Connection Scope</label>
        <div className="flex gap-2">
          <Button
            variant={scope === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleScopeChange('all')}
          >
            All
          </Button>
          <Button
            variant={scope === 'internal' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleScopeChange('internal')}
          >
            This Document
          </Button>
          <Button
            variant={scope === 'external' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleScopeChange('external')}
          >
            Other Documents
          </Button>
        </div>
      </div>

      {/* Engine Type Filters */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Connection Types</label>
        {/* Existing engine checkboxes */}
      </div>
    </div>
  );
}
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given the filter component is displayed
When a user clicks "This Document"
Then only internal connections are shown

Given internal filter is active
When a user clicks "Other Documents"
Then only external connections are shown
```

**Checklist**:
- [ ] Toggle buttons render correctly
- [ ] Scope changes trigger refetch
- [ ] Visual feedback for active state
- [ ] Filters persist during session

---

### Task T-008: Implement Viewport Chunk Detection

**Priority**: Medium  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: T-006 (ConnectionsList accepts chunk IDs)  

#### Context & Background
Detect which chunks are visible in the viewport to load relevant connections dynamically.

#### Technical Requirements
- Use Intersection Observer API
- Debounce scroll events (200ms)
- Track visible chunk IDs
- Pass to ConnectionsList

#### Implementation Details

**Files to Modify**:
```
└── src/components/reader/DocumentViewer.tsx [MODIFY] - Add viewport detection
```

**Implementation**:
```typescript
// src/components/reader/DocumentViewer.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';

export function DocumentViewer({ document, chunks }) {
  const [visibleChunkIds, setVisibleChunkIds] = useState<string[]>([]);
  
  // Debounced handler for performance
  const handleIntersection = useMemo(() => 
    debounce((entries: IntersectionObserverEntry[]) => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .map(entry => entry.target.getAttribute('data-chunk-id'))
        .filter(Boolean) as string[];
      
      setVisibleChunkIds(prev => {
        // Only update if actually changed
        if (JSON.stringify(prev) !== JSON.stringify(visible)) {
          return visible;
        }
        return prev;
      });
    }, 200),
    []
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersection, {
      root: null, // viewport
      rootMargin: '100px', // Preload nearby chunks
      threshold: 0.3 // 30% visible to count
    });

    // Observe all chunk elements
    const chunkElements = document.querySelectorAll('[data-chunk-id]');
    chunkElements.forEach(el => observer.observe(el));

    // Initial check
    handleIntersection(
      Array.from(chunkElements).map(el => ({
        isIntersecting: el.getBoundingClientRect().top < window.innerHeight,
        target: el
      })) as IntersectionObserverEntry[]
    );

    return () => {
      observer.disconnect();
      handleIntersection.cancel();
    };
  }, [chunks, handleIntersection]);

  return (
    <div className="prose max-w-none">
      {chunks.map((chunk) => (
        <div
          key={chunk.id}
          data-chunk-id={chunk.id}
          className="chunk-content"
        >
          {chunk.content}
        </div>
      ))}
    </div>
  );
}
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given a document with multiple chunks
When the user scrolls
Then visible chunk IDs are detected
And updates are debounced for performance
```

**Checklist**:
- [ ] Viewport detection works
- [ ] Debouncing prevents excessive updates
- [ ] Initial chunks detected on load
- [ ] Memory cleanup on unmount

---

### Task T-009: Pass Viewport Data to Sidebar

**Priority**: Medium  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: T-008 (viewport detection implemented)  

#### Context & Background
Connect the viewport detection to the sidebar ConnectionsList component.

#### Technical Requirements
- Pass visibleChunkIds prop
- Maintain prop drilling pattern
- Update component interfaces

#### Implementation Details

**Files to Modify**:
```
├── src/app/read/[id]/page.tsx [MODIFY] - Top-level state management
└── src/components/layout/RightPanel.tsx [MODIFY] - Pass props to ConnectionsList
```

**Code Changes**:
```typescript
// src/app/read/[id]/page.tsx
'use client';

import { useState } from 'react';
import { DocumentViewer } from '@/components/reader/DocumentViewer';
import { RightPanel } from '@/components/layout/RightPanel';

export default function ReadPage({ params, document, chunks }) {
  const [visibleChunkIds, setVisibleChunkIds] = useState<string[]>([]);
  
  return (
    <div className="flex">
      <div className="flex-1">
        <DocumentViewer 
          document={document}
          chunks={chunks}
          onVisibleChunksChange={setVisibleChunkIds}
        />
      </div>
      <RightPanel 
        documentId={params.id}
        visibleChunkIds={visibleChunkIds}
      />
    </div>
  );
}

// src/components/layout/RightPanel.tsx
export function RightPanel({ 
  documentId, 
  visibleChunkIds 
}: { 
  documentId: string;
  visibleChunkIds: string[];
}) {
  return (
    <div className="w-96 border-l">
      <ConnectionsList 
        documentId={documentId}
        visibleChunkIds={visibleChunkIds}
      />
    </div>
  );
}
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given the viewport detection is working
When visible chunks change
Then the ConnectionsList receives updated IDs
And connections refresh automatically
```

**Checklist**:
- [ ] Props passed correctly
- [ ] State updates propagate
- [ ] No prop drilling issues
- [ ] TypeScript types correct

---

### Task T-010: Add Connection Feedback UI

**Priority**: Low  
**Source PRP Document**: docs/prps/document-reader-real-connections.md  
**Dependencies**: T-006 (ConnectionsList working)  

#### Context & Background
Allow users to confirm or hide connections to improve future recommendations.

#### Technical Requirements
- Add feedback buttons to connection cards
- Integrate with feedback mutation
- Show visual feedback on action

#### Implementation Details

**Files to Modify**:
```
└── src/components/sidebar/ConnectionCard.tsx [MODIFY] - Add feedback buttons
```

**Code Changes**:
```typescript
// src/components/sidebar/ConnectionCard.tsx
import { useConnectionFeedback } from '@/hooks/use-connections';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConnectionCard({ connection }) {
  const { mutate: updateFeedback, isPending } = useConnectionFeedback();
  
  const handleFeedback = (feedback: 'confirmed' | 'hidden') => {
    updateFeedback({ 
      connectionId: connection.id, 
      feedback 
    });
  };

  return (
    <div className="p-3 border rounded-lg">
      {/* Existing connection display */}
      
      <div className="flex gap-2 mt-2">
        <Button
          size="sm"
          variant={connection.user_confirmed ? 'default' : 'outline'}
          onClick={() => handleFeedback('confirmed')}
          disabled={isPending}
        >
          <Check className="h-3 w-3 mr-1" />
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleFeedback('hidden')}
          disabled={isPending}
        >
          <X className="h-3 w-3 mr-1" />
          Hide
        </Button>
      </div>
    </div>
  );
}
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given a connection is displayed
When the user clicks "Confirm"
Then the connection is marked as confirmed
And the UI updates to reflect this

Given a connection is displayed
When the user clicks "Hide"
Then the connection is hidden from view
And doesn't appear in future queries
```

**Checklist**:
- [ ] Feedback buttons render
- [ ] Actions persist to database
- [ ] UI provides feedback
- [ ] Disabled state during mutation

---

## Implementation Recommendations

### Suggested Team Structure
For solo development:
1. Start with Phase 1 (database/worker) - Critical foundation
2. Complete Phase 2 (API) to enable testing
3. Implement Phase 3 (UI) for immediate value
4. Add Phase 4 (viewport) as enhancement

### Optimal Task Sequencing
**Critical Path**: T-001 → T-002 → T-004 → T-005 → T-006
**Parallel Work**: T-003 can be done anytime
**Enhancements**: T-007, T-008, T-009, T-010 after critical path

### Parallelization Opportunities
- T-001 and T-003 can be done simultaneously
- T-007 through T-010 can be split if multiple developers
- Testing can happen in parallel with next phase

### Resource Allocation
- Database/Backend: 40% effort (T-001, T-002, T-003, T-004)
- Frontend Integration: 40% effort (T-005, T-006, T-007)
- Performance/UX: 20% effort (T-008, T-009, T-010)

## Critical Path Analysis

### Tasks on Critical Path
1. **T-001**: Database Migration (blocks everything)
2. **T-002**: Worker Fix (blocks real data)
3. **T-004**: Server Action (blocks UI integration)
4. **T-005**: React Hook (blocks component update)
5. **T-006**: Component Update (delivers user value)

### Potential Bottlenecks
- Database migration testing (ensure thorough validation)
- Worker integration testing (verify no silent failures)
- Performance with real data (may need optimization)

### Schedule Optimization
- Frontload critical path tasks
- Test integration points early
- Keep viewport optimization for last (nice-to-have)

## Validation Commands

### Phase 1 Validation
```bash
# Database migration
npx supabase db reset
psql -h localhost -p 54322 -d postgres -c "\d connections"

# Worker integration
cd worker && npm run test:integration
cd worker && npm run validate:semantic-accuracy
```

### Phase 2 Validation
```bash
# API testing
npm test -- connections.test.ts
npm run lint
```

### Phase 3 Validation
```bash
# UI integration
npm test -- ConnectionsList.test.tsx
npm run dev # Manual testing
```

### Phase 4 Validation
```bash
# Performance testing
npm run dev # Test scroll performance
# Check Chrome DevTools Performance tab
```

### Full System Validation
```bash
# Complete integration test
npm test
cd worker && npm run test:full-validation
psql -h localhost -p 54322 -d postgres -c "SELECT COUNT(*) FROM connections WHERE source_chunk_id IS NOT NULL;"
```

---

**Document Generated**: 2025-01-30  
**Total Tasks**: 10  
**Critical Path Length**: 5 tasks  
**Estimated Total Effort**: 13-18 hours  
**Risk Level**: Low-Medium (well-scoped with existing patterns)