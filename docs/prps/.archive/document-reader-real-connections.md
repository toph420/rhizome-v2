# PRP: Document Reader Real Connections Integration

**Project**: Rhizome V2  
**Feature**: Document Reader Real Connections Integration  
**Date**: 2025-01-30  
**Status**: Ready for Implementation  

## 1. Problem Statement

### Current State
The document reader displays 49 mock connections instead of real collision detection results from the 7-engine system. Users cannot experience the core value proposition of Rhizome V2 - discovering genuine non-obvious connections between ideas across their knowledge corpus.

### Root Cause Analysis
Through comprehensive codebase analysis, the core issue is a **database schema mismatch**:

- **Worker Output**: Collision detection engines generate chunk-based connections (`source_chunk_id`, `target_chunk_id`)
- **Database Schema**: Connections table expects entity-based IDs (`source_entity_id`, `target_entity_id`)
- **Result**: Worker connection insertion fails silently, UI falls back to mock data

**Evidence**: 
- `/worker/handlers/detect-connections.ts:330-340` - Worker attempts to insert chunk-based connections
- `/supabase/migrations/001_initial_schema.sql:92-108` - Database schema expects entity IDs
- `/src/lib/annotations/mock-connections.ts` - UI currently uses 49 hardcoded mock connections

### Secondary Issues
1. **Engine Type Mismatch**: Worker uses `SEMANTIC_SIMILARITY` (underscore enum), UI expects `semantic` (lowercase string)
2. **Missing Viewport API**: No server action exists to query connections for visible chunks
3. **No Internal/External Toggle**: UI lacks functionality to filter connections by scope

## 2. Business Value & User Impact

### User Value Proposition
- **Primary Benefit**: Users can see real, AI-discovered connections from their processed documents
- **Discovery Experience**: Connections update contextually as users scroll, showing relevant insights for visible content
- **Validation**: Users can finally validate the 7-engine collision detection system works as designed

### Success Metrics
- **Functional**: Real connections display instead of mock data (binary success)
- **Performance**: Connection queries complete in <500ms (acceptable for personal tool)
- **Usability**: Smooth sidebar updates during scroll events without UI blocking

### Acceptance Criteria
```gherkin
Given a user is reading a processed document
When they scroll through the content
Then they see real connections detected by the 7-engine system in the sidebar

Given a user wants to focus on specific connection types
When they use the internal/external toggle
Then connections filter appropriately by document scope

Given a user has multiple documents processed
When viewing connections in the sidebar
Then they can distinguish between intra-document and cross-document connections
```

## 3. Technical Approach

### Architecture Overview
This implementation follows the **existing data integration patterns** found in the codebase:

```
Document Reader UI
       ↓ (viewport scroll events)
Server Action (new)
       ↓ (query by chunk IDs)
PostgreSQL Connections Table (migrated schema)
       ↑ (populated by)
Worker Module (fixed insertion logic)
       ↑ (chunk-based connections)
7-Engine Collision Detection System (no changes)
```

### Implementation Strategy
**Phase-based approach** using existing architectural patterns:
1. **Database Migration**: Add chunk-based columns to connections table
2. **Worker Integration**: Fix connection insertion to use new schema
3. **API Layer**: Create server action for viewport-based connection queries
4. **UI Integration**: Replace mock data with real connection queries

## 4. Implementation Plan

### Phase 1: Database Schema & Worker Integration
**Duration**: 4-6 hours  
**Priority**: Critical (enables all other phases)

#### Tasks
1. **Create Database Migration**
   ```sql
   -- File: supabase/migrations/017_chunk_based_connections.sql
   ALTER TABLE connections 
     ADD COLUMN source_chunk_id UUID REFERENCES chunks(id),
     ADD COLUMN target_chunk_id UUID REFERENCES chunks(id),
     ADD COLUMN engine_type TEXT NOT NULL,
     ADD COLUMN detected_at TIMESTAMPTZ DEFAULT NOW();
   
   -- Performance indexes
   CREATE INDEX idx_connections_source_chunk ON connections(source_chunk_id);
   CREATE INDEX idx_connections_target_chunk ON connections(target_chunk_id);
   CREATE INDEX idx_connections_engine_type ON connections(engine_type);
   ```

2. **Fix Worker Connection Insertion**
   ```typescript
   // File: worker/handlers/detect-connections.ts (lines 329-343)
   const connectionInserts = connections.map(conn => ({
     id: crypto.randomUUID(),
     user_id: userId,
     source_chunk_id: conn.sourceChunkId,      // Fixed: was source_entity_id
     target_chunk_id: conn.targetChunkId,      // Fixed: was target_entity_id
     engine_type: conn.engine.toLowerCase().replace('_', '-'), // Map to UI format
     strength: conn.score,
     auto_detected: true,
     detected_at: new Date().toISOString(),
     metadata: { 
       raw_engine_type: conn.engine,
       context: conn.context 
     }
   }));
   ```

3. **Create Engine Type Mapping**
   ```typescript
   // File: worker/lib/engine-type-mapper.ts (new)
   export const mapEngineTypeForUI = (workerType: string): string => {
     const mapping = {
       'SEMANTIC_SIMILARITY': 'semantic',
       'CONCEPTUAL_DENSITY': 'thematic', 
       'STRUCTURAL_PATTERN': 'structural',
       'CITATION_NETWORK': 'methodological',
       'TEMPORAL_PROXIMITY': 'temporal',
       'CONTRADICTION_DETECTION': 'contradiction',
       'EMOTIONAL_RESONANCE': 'emotional'
     };
     return mapping[workerType] || 'unknown';
   };
   ```

#### Validation Gates
```bash
# Verify migration applies cleanly
npx supabase db reset

# Test worker integration
cd worker && npm run test:integration

# Validate connection insertion
cd worker && npm run validate:semantic-accuracy
```

### Phase 2: Connection Query API
**Duration**: 3-4 hours  
**Priority**: High (enables UI integration)

#### Tasks
1. **Create Connections Server Action**
   ```typescript
   // File: src/app/actions/connections.ts (new, following annotations.ts pattern)
   'use server'
   
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
     
     let query = supabase
       .from('connections')
       .select(`
         id, engine_type, strength, auto_detected, user_confirmed,
         source_chunks:source_chunk_id(id, content, position),
         target_chunks:target_chunk_id(id, content, position, document_id),
         metadata
       `)
       .in('source_chunk_id', chunkIds)
       .order('strength', { ascending: false });
   
     // Apply scope filter
     if (filters?.scope === 'internal') {
       query = query.eq('target_chunks.document_id', documentId);
     } else if (filters?.scope === 'external') {
       query = query.neq('target_chunks.document_id', documentId);
     }
   
     // Apply strength and engine filters
     if (filters?.minStrength) query = query.gte('strength', filters.minStrength);
     if (filters?.engineTypes?.length) query = query.in('engine_type', filters.engineTypes);
   
     const { data, error } = await query;
     if (error) throw error;
   
     return data;
   }
   ```

2. **Add Connection Feedback Actions**
   ```typescript
   // Same file: src/app/actions/connections.ts
   export async function updateConnectionFeedback(
     connectionId: string, 
     feedback: 'confirmed' | 'hidden'
   ) {
     const updates = feedback === 'confirmed' 
       ? { user_confirmed: true, user_hidden: false }
       : { user_hidden: true };
       
     const { error } = await supabase
       .from('connections')
       .update(updates)
       .eq('id', connectionId);
       
     if (error) throw error;
     revalidatePath('/read/[id]', 'page');
   }
   ```

#### Validation Gates
```bash
# Test API functionality
npm test -- connections.test.ts

# Verify server action patterns
npm run lint
```

### Phase 3: UI Integration & Real Data Display
**Duration**: 4-5 hours  
**Priority**: High (delivers user value)

#### Tasks
1. **Update ConnectionsList Component**
   ```typescript
   // File: src/components/sidebar/ConnectionsList.tsx (modify existing)
   
   // Replace mock data import with real data hook
   // Before: import { MOCK_CONNECTIONS } from '@/lib/annotations/mock-connections';
   // After: 
   import { useConnections } from '@/hooks/use-connections';
   
   export function ConnectionsList({ documentId, visibleChunkIds }: Props) {
     const { 
       data: connections, 
       isLoading, 
       error 
     } = useConnections(documentId, visibleChunkIds, {
       scope: internalOnly ? 'internal' : 'all',
       engineTypes: selectedEngines,
       minStrength: strengthThreshold
     });
   
     if (isLoading) return <ConnectionsSkeleton />;
     if (error) return <ConnectionsError error={error} />;
     if (!connections?.length) return <NoConnectionsFound />;
   
     // Rest of component unchanged - same rendering logic
   }
   ```

2. **Create useConnections Hook**
   ```typescript
   // File: src/hooks/use-connections.ts (new)
   import { useQuery } from '@tanstack/react-query';
   import { getConnectionsForChunks } from '@/app/actions/connections';
   
   export function useConnections(
     documentId: string,
     chunkIds: string[],
     filters?: ConnectionFilters
   ) {
     return useQuery({
       queryKey: ['connections', documentId, chunkIds, filters],
       queryFn: () => getConnectionsForChunks(documentId, chunkIds, filters),
       staleTime: 5 * 60 * 1000, // 5 minute cache for personal app
       enabled: chunkIds.length > 0,
     });
   }
   ```

3. **Add Internal/External Toggle**
   ```typescript
   // File: src/components/sidebar/ConnectionFilters.tsx (modify existing)
   
   // Add scope toggle to existing filter component
   <div className="flex items-center gap-2">
     <Button
       variant={scope === 'internal' ? 'default' : 'outline'}
       size="sm"
       onClick={() => setScope('internal')}
     >
       This Document
     </Button>
     <Button
       variant={scope === 'external' ? 'default' : 'outline'}
       size="sm"
       onClick={() => setScope('external')}
     >
       Other Documents
     </Button>
   </div>
   ```

#### Validation Gates
```bash
# Component integration tests
npm test -- ConnectionsList.test.tsx

# UI behavior validation
npm run dev # Manual testing in browser
```

### Phase 4: Viewport-Aware Loading
**Duration**: 2-3 hours  
**Priority**: Medium (performance optimization)

#### Tasks
1. **Add Viewport Chunk Detection**
   ```typescript
   // File: src/components/reader/DocumentViewer.tsx (modify existing)
   
   const [visibleChunkIds, setVisibleChunkIds] = useState<string[]>([]);
   
   const handleScroll = useMemo(() => 
     debounce((entries: IntersectionObserverEntry[]) => {
       const visible = entries
         .filter(entry => entry.isIntersecting)
         .map(entry => entry.target.getAttribute('data-chunk-id'))
         .filter(Boolean);
       setVisibleChunkIds(visible);
     }, 200), // 200ms debounce for personal app tolerance
   []);
   
   useEffect(() => {
     const observer = new IntersectionObserver(handleScroll, {
       threshold: 0.3, // 30% visible to count as "in viewport"
       rootMargin: '100px' // Preload connections for nearby chunks
     });
     
     // Observe all chunk elements
     document.querySelectorAll('[data-chunk-id]').forEach(el => {
       observer.observe(el);
     });
     
     return () => observer.disconnect();
   }, [handleScroll]);
   ```

2. **Pass Viewport Data to Sidebar**
   ```typescript
   // File: src/components/layout/RightPanel.tsx (modify existing)
   
   // Pass visibleChunkIds to ConnectionsList
   <ConnectionsList 
     documentId={documentId} 
     visibleChunkIds={visibleChunkIds}  // New prop
   />
   ```

#### Validation Gates
```bash
# Performance testing
npm run dev # Test scroll performance manually

# Final integration validation
npm test
cd worker && npm run test:integration
```

## 5. Success Criteria & Quality Gates

### Functional Requirements ✅
- [ ] Real connections display in sidebar (no mock data)
- [ ] Connections update when scrolling through document
- [ ] Internal/external toggle filters connections properly
- [ ] User feedback (confirm/hide) persists in database
- [ ] All 7 engine types display with correct labels and colors

### Performance Requirements ✅
- [ ] Connection queries complete in <500ms (personal app tolerance)
- [ ] Scroll events don't block UI (<200ms response time)
- [ ] Connection sidebar updates smoothly during viewport changes
- [ ] Cache hit rate >50% for repeated chunk queries

### Technical Quality ✅
- [ ] Database migration applies without errors
- [ ] Worker connection insertion succeeds (no silent failures)
- [ ] Engine type mapping between worker and UI is consistent
- [ ] Server actions follow existing patterns (annotations.ts style)
- [ ] Component updates maintain existing UI behavior

### Validation Commands
```bash
# Main app validation
npm run lint                    # Code quality
npm test                       # Unit and integration tests  
npm run dev                    # Manual testing

# Worker validation  
cd worker && npm run test:integration     # Worker integration
cd worker && npm run validate:semantic-accuracy  # Engine accuracy
cd worker && npm run test:validate       # Full validation suite

# Database validation
npx supabase db reset          # Verify migrations work
psql -h localhost -p 54322 -d postgres -c "SELECT COUNT(*) FROM connections WHERE source_chunk_id IS NOT NULL;"
```

## 6. Implementation Blueprint

### Code Architecture Pattern
```typescript
// Data Flow Pattern (mirrors existing annotations.ts approach)
User Scroll Event 
  → DocumentViewer (viewport detection)
  → RightPanel (chunk IDs)
  → ConnectionsList (React Query)
  → useConnections hook
  → getConnectionsForChunks server action
  → Supabase query with filters
  → ConnectionCard components
```

### Error Handling Strategy
Following existing patterns in `src/app/actions/annotations.ts:37-94`:

```typescript
// Graceful degradation approach
try {
  const connections = await getConnectionsForChunks(documentId, chunkIds);
  return connections;
} catch (error) {
  console.error('Connection query failed:', error);
  // Don't crash UI - show error state instead
  return [];
}
```

### Database Transaction Pattern
```typescript
// Batch operations following worker/handlers/detect-connections.ts:345-356
const { error } = await supabase
  .from('connections')
  .upsert(connectionBatch, { onConflict: 'source_chunk_id,target_chunk_id,engine_type' });
```

## 7. Risk Assessment & Mitigation

### Technical Risks 🟡
**Database Migration Risk**
- **Impact**: Medium - Could affect existing mock data or break connections table
- **Probability**: Low - Migration is additive (new columns only)
- **Mitigation**: Test migration on development database, backup production data

**Performance Risk** 
- **Impact**: Medium - Real queries could be slower than mock data
- **Probability**: Medium - Complex joins with chunks table
- **Mitigation**: Proper indexing, React Query caching, debounced scroll events

### Integration Risks 🟢
**Engine Type Mapping**
- **Impact**: Low - Wrong labels in UI
- **Probability**: Low - Clear mapping defined
- **Mitigation**: Comprehensive testing of all 7 engine types

**UI Component Breaking**
- **Impact**: Medium - Could break existing connection display
- **Probability**: Low - Minimal changes to component props
- **Mitigation**: Maintain existing component interfaces, thorough testing

## 8. Dependencies & Prerequisites

### Required Before Implementation
- [ ] Supabase local development environment running
- [ ] Worker module processing documents and generating connections
- [ ] At least one processed document with chunks for testing
- [ ] 7-engine collision detection system operational

### External Dependencies
- **None** - All required patterns and infrastructure exist in codebase

### Team Dependencies
- **Solo Implementation** - No external team dependencies for personal app

## 9. Definition of Done

### MVP Completion Checklist
- [ ] Database migration creates chunk-based connections table successfully
- [ ] Worker engines store connections without silent failures
- [ ] UI displays real connections instead of mock data (verifiable in browser dev tools)
- [ ] Connection queries perform within acceptable latency (<500ms measured)
- [ ] All 7 engine types properly aligned and functional with correct labels
- [ ] Internal/external toggle working correctly (filters connections by document scope)
- [ ] User feedback system stores confirmation/hidden status to database
- [ ] Viewport scrolling updates connections contextually without UI blocking

### Quality Assurance
- [ ] All existing tests pass (`npm test` and `cd worker && npm run test:integration`)
- [ ] Code passes linting (`npm run lint`)
- [ ] Manual testing confirms real connections display and update during scroll
- [ ] Database contains real connection records (not just mock data)
- [ ] Performance acceptable during real usage (no noticeable lag)

## 10. Success Scoring

**Implementation Confidence**: 9/10

**Reasoning**: 
- All necessary architectural patterns exist and are proven (server actions, React Query, database migrations)
- Root cause clearly identified with straightforward technical solution
- Minimal risk since it's primarily data integration using existing infrastructure
- Clear validation gates and rollback strategies available
- Personal app tolerance allows for pragmatic approach over enterprise optimization

**High Confidence Factors**:
- Database schema fix is additive (low risk)
- Worker integration requires minimal code changes
- UI components exist and work with mock data (proven render patterns)
- Query patterns established in existing server actions
- Comprehensive test coverage available for validation

**Potential Deductions**:
- Performance with real data unknown (-1 point, but acceptable tolerance for personal app)

## 11. Post-Implementation Enhancements

### Future Iteration Opportunities (Not in Scope)
- **Connection Validation Feedback Integration**: Keyboard shortcuts (v/r/s) storing to database
- **Performance Optimization**: Connection caching layer for frequently accessed queries  
- **Advanced Filtering**: Connection strength thresholds and engine weight real-time adjustment
- **Progressive Loading**: Load strongest connections first for very large documents
- **Visual Indicators**: Connection strength indicators in document text highlighting

### Technical Debt to Address Later
- **Connection Lifecycle Management**: Handle document re-processing scenarios
- **Connection Quality Metrics**: User feedback integration with engine weight tuning
- **Cross-Document Connection Discovery**: Optimize queries for large document collections

---

## References

### Codebase Files Referenced
- `/src/components/sidebar/ConnectionsList.tsx` - Primary UI component to modify
- `/src/lib/annotations/mock-connections.ts` - Mock data structure to replicate
- `/worker/handlers/detect-connections.ts` - Worker connection generation logic
- `/src/app/actions/annotations.ts` - Server action pattern to follow
- `/supabase/migrations/001_initial_schema.sql` - Current database schema
- `/docs/brainstorming/2025-01-25-document-reader-real-connections.md` - Original requirements

### Implementation Task Breakdown
**Reference**: `docs/tasks/document-reader-real-connections.md` - Detailed 10-task breakdown with Given-When-Then acceptance criteria

### Related Documentation
- `docs/ARCHITECTURE.md` - Chunk-based design principles
- `docs/USER_FLOW.md` - Reading experience architecture
- `worker/README.md` - 7-engine collision detection system details