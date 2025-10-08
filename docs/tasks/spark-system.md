# Spark System - Technical Task Breakdown

**Feature**: Personal Knowledge Capture System with Context Preservation
**Source PRP**: `/Users/topher/Code/rhizome-v2/docs/prps/spark-system.md`
**Complexity**: High
**Estimated Total Effort**: 5-7 days
**Tasks**: 38 tasks across 6 phases

---

## PRP Analysis Summary

### Feature Scope
The Spark System enables users to capture thoughts while reading, preserving the complete cognitive context (visible chunks, active connections, scroll position, engine weights) for later restoration. Sparks are lightweight entities (~500 chars) that inherit connections from their origin chunks, support semantic search, and sync bidirectionally with Obsidian vaults.

### Key Technical Requirements
- Database migrations for entity connections (migration 044) and sparks cache table (migration 045)
- Hybrid storage strategy (Storage for source of truth + PostgreSQL cache for queries)
- ECS extension for spark components
- Connection inheritance with 0.7x weight reduction
- Fuzzy mention resolution system
- Obsidian vault synchronization
- Real-time search with semantic embeddings

### Validation Requirements
- Capture speed <2 seconds from Cmd+K to save
- Context restoration 100% accurate (scroll position + visible chunks)
- Search relevance >70% precision for semantic spark search
- Obsidian sync with <5 second latency
- Cache integrity maintained between Storage and PostgreSQL

---

## Task Complexity Assessment

### Overall Complexity: HIGH

**Technical Challenges**:
- Complex database migration altering existing connections table structure
- Dual storage pattern requiring cache integrity management
- Fuzzy mention resolution with multiple fallback strategies
- Connection inheritance with denormalized snapshots
- Real-time semantic search integration
- Bidirectional Obsidian synchronization

**Integration Points**:
- ECS system (existing singleton)
- Supabase Storage (existing document pattern)
- 3-engine collision detection system
- Gemini API for embeddings
- Obsidian file system
- React reader components

**Risk Factors**:
- Cache-Storage desync potential
- Connection inheritance explosion
- Obsidian sync conflicts
- Performance impact of real-time search

---

## Phase Organization

### Phase 1: Core Infrastructure (Days 1-2)
**Objective**: Establish database schema, storage infrastructure, and ECS integration
**Deliverables**: Migrations applied, storage helpers functional, cache integrity system
**Milestones**: Database ready for spark entities, storage upload/download working

### Phase 2: Spark Creation (Days 2-3)
**Objective**: Implement spark capture with mention resolution and connection inheritance
**Deliverables**: Server action for creation, mention resolver, connection inheritance
**Milestones**: Sparks can be created with full context preservation

### Phase 3: UI Components (Days 3-4)
**Objective**: Build user interface for spark capture and timeline display
**Deliverables**: Cmd+K modal, timeline component, context restoration
**Milestones**: Users can capture and view sparks

### Phase 4: Obsidian Integration (Day 5)
**Objective**: Enable export and sync with Obsidian vaults
**Deliverables**: Export handler, vault file structure, YAML frontmatter
**Milestones**: Sparks appear in Obsidian with proper formatting

### Phase 5: Writing Mode Integration (Day 6)
**Objective**: Surface relevant sparks during writing
**Deliverables**: Search API, suggestions hook, real-time matching
**Milestones**: Sparks appear as suggestions while writing

### Phase 6: Polish & Testing (Day 7)
**Objective**: Ensure reliability, performance, and data integrity
**Deliverables**: Test suite, export functionality, cache rebuild system
**Milestones**: System production-ready with comprehensive tests

---

## Detailed Task Breakdown

### Phase 1: Core Infrastructure

#### Task SS-001: Create Entity Connection Migration
**Priority**: Critical
**Dependencies**: None
**Estimated Effort**: 2 hours

**Implementation Details**:
- Create migration file: `supabase/migrations/044_add_entity_connections.sql`
- Make chunk_id columns nullable in connections table
- Add entity_id columns with foreign key constraints
- Add check constraints for valid source/target combinations
- Extend connection_type enum with spark-specific types
- Create indexes for entity lookups

**Acceptance Criteria**:
```gherkin
Given the existing connections table with chunk-only support
When the migration is applied
Then chunk_id columns become nullable
And entity_id columns are added with proper constraints
And new connection types are available for sparks
And indexes exist for efficient entity queries
```

**Validation**:
- [ ] Migration applies without errors
- [ ] Existing connections remain intact
- [ ] New constraints enforce either chunk OR entity (not both)
- [ ] Rollback script provided

---

#### Task SS-002: Create Sparks Cache Table Migration
**Priority**: Critical
**Dependencies**: SS-001
**Estimated Effort**: 2 hours

**Implementation Details**:
- Create migration file: `supabase/migrations/045_create_sparks_table.sql`
- Define sparks table with storage references
- Add cache columns for fast queries
- Create indexes for timeline and search
- Enable RLS with user-specific policies
- Add vector search function for semantic matching

**Acceptance Criteria**:
```gherkin
Given the need for queryable spark cache
When the migration is applied
Then sparks table exists with proper schema
And RLS policies restrict access to user's own sparks
And indexes optimize timeline and search queries
And vector search function is available
```

**Validation**:
- [ ] Table structure matches design
- [ ] RLS policies tested for security
- [ ] Indexes verified with EXPLAIN ANALYZE
- [ ] Vector search function tested

---

#### Task SS-003: Implement Storage Helper Functions
**Priority**: High
**Dependencies**: SS-002
**Estimated Effort**: 3 hours

**Implementation Details**:
- Create file: `src/lib/sparks/storage.ts`
- Implement uploadSparkToStorage function
- Implement downloadSparkFromStorage function
- Implement rebuildSparksCache function
- Implement verifySparksIntegrity function
- Add TypeScript interfaces for SparkJson

**Acceptance Criteria**:
```gherkin
Given spark data needs Storage persistence
When storage functions are called
Then JSON uploads successfully to Storage
And downloads parse correctly
And cache can be rebuilt from Storage
And integrity checks detect mismatches
```

**Validation**:
- [ ] Upload creates correct Storage path structure
- [ ] Download handles missing files gracefully
- [ ] Cache rebuild processes all sparks
- [ ] Integrity check accurately reports mismatches

---

#### Task SS-004: Create Worker Storage Module
**Priority**: High
**Dependencies**: SS-003
**Estimated Effort**: 1 hour

**Implementation Details**:
- Create file: `worker/lib/spark-storage.ts`
- Port storage functions for worker context
- Use service role for Storage access
- Handle ESM module requirements

**Acceptance Criteria**:
```gherkin
Given worker needs Storage access
When worker storage module is imported
Then functions work with service role credentials
And ESM imports resolve correctly
And error handling matches main app patterns
```

**Validation**:
- [ ] Worker can upload/download sparks
- [ ] Service role authentication works
- [ ] Module compatible with worker environment

---

### Phase 2: Spark Creation

#### Task SS-005: Implement Mention Resolution System
**Priority**: Critical
**Dependencies**: SS-001, SS-002
**Estimated Effort**: 4 hours

**Implementation Details**:
- Create file: `src/lib/sparks/mention-resolver.ts`
- Install fuse.js dependency for fuzzy matching
- Implement three-tier resolution strategy:
  - Exact chunk ID matching
  - Fuzzy document title matching
  - Fuzzy content matching (expensive fallback)
- Extract mentions from text with regex
- Return resolved, unresolved, and ambiguous mentions

**Acceptance Criteria**:
```gherkin
Given text with /mentions
When resolveMention is called
Then exact chunk IDs resolve with confidence 1.0
And document titles fuzzy match to first chunk
And ambiguous mentions return candidates
And unresolved mentions are flagged
```

**Validation**:
- [ ] Exact matches work reliably
- [ ] Fuzzy matching threshold appropriate
- [ ] Performance acceptable for real-time use
- [ ] Edge cases handled (empty, special chars)

---

#### Task SS-006: Create Spark Server Action
**Priority**: Critical
**Dependencies**: SS-003, SS-005
**Estimated Effort**: 4 hours

**Implementation Details**:
- Create file: `src/app/actions/sparks.ts`
- Implement createSpark server action
- Extract and resolve mentions
- Extract hashtags for tagging
- Generate 768d embedding with Gemini
- Create ECS entity with spark component
- Upload to Storage as source of truth
- Insert cache row in sparks table
- Implement connection inheritance logic

**Acceptance Criteria**:
```gherkin
Given user wants to create a spark
When createSpark action is called
Then spark entity is created in ECS
And JSON uploads to Storage
And cache row inserts to database
And mentions are resolved
And connections are inherited at 0.7x weight
And embeddings are generated
```

**Validation**:
- [ ] End-to-end creation works
- [ ] Storage and cache remain in sync
- [ ] Connection inheritance applies correct weight
- [ ] Embedding generation succeeds
- [ ] Error handling comprehensive

---

#### Task SS-007: Implement Connection Inheritance
**Priority**: High
**Dependencies**: SS-006
**Estimated Effort**: 2 hours

**Implementation Details**:
- Add inheritChunkConnections function
- Create origin connection (chunk → spark)
- Query origin chunk's connections
- Filter by strength ≥0.6
- Create inherited connections at 0.7x weight
- Add metadata tracking inheritance source

**Acceptance Criteria**:
```gherkin
Given a spark created from a chunk
When connection inheritance runs
Then direct origin connection is created at 1.0 strength
And strong connections (≥0.6) are inherited
And inherited connections have 0.7x reduced weight
And metadata tracks inheritance relationship
```

**Validation**:
- [ ] Origin connection always created
- [ ] Weight reduction applied correctly
- [ ] Weak connections filtered out
- [ ] Metadata preserves provenance

---

#### Task SS-008: Add Mention Connection Creation
**Priority**: Medium
**Dependencies**: SS-006
**Estimated Effort**: 1 hour

**Implementation Details**:
- Create explicit connections for mentions
- Use spark_mention connection type
- Set strength to 0.9 for explicit mentions
- Add metadata indicating explicit mention

**Acceptance Criteria**:
```gherkin
Given a spark mentions other chunks
When connections are created
Then each mention creates a connection
And connection type is spark_mention
And strength is 0.9
And metadata indicates explicit mention
```

**Validation**:
- [ ] Mention connections created
- [ ] Correct connection type used
- [ ] Strength appropriate for explicit mentions

---

### Phase 3: UI Components

#### Task SS-009: Build Spark Capture Modal
**Priority**: Critical
**Dependencies**: SS-006
**Estimated Effort**: 3 hours

**Implementation Details**:
- Create file: `src/components/sparks/SparkCapture.tsx`
- Implement Cmd+K hotkey listener
- Build modal with textarea input
- Auto-quote selected text if present
- Show current reading context
- Handle Cmd+Enter for submission
- Call createSpark server action
- Show loading state during save

**Acceptance Criteria**:
```gherkin
Given user is reading a document
When Cmd+K is pressed
Then spark capture modal opens
And selected text is auto-quoted
And context shows current document/chunk
And Cmd+Enter saves the spark
And modal closes after successful save
```

**Validation**:
- [ ] Hotkey works globally
- [ ] Selection detection accurate
- [ ] Context display correct
- [ ] Save completes in <2 seconds
- [ ] Error handling user-friendly

---

#### Task SS-010: Create Reader Context Hook
**Priority**: High
**Dependencies**: SS-009
**Estimated Effort**: 2 hours

**Implementation Details**:
- Create file: `src/hooks/useReaderContext.ts`
- Track current document ID
- Track visible chunks array
- Track scroll position
- Track active connections
- Track engine weights
- Track navigation trail
- Provide context to spark capture

**Acceptance Criteria**:
```gherkin
Given reader needs context tracking
When useReaderContext hook is used
Then current document ID is available
And visible chunks are tracked
And scroll position updates
And connections are accessible
And engine weights are captured
```

**Validation**:
- [ ] Context updates in real-time
- [ ] All required fields present
- [ ] Performance acceptable
- [ ] Works with virtual scrolling

---

#### Task SS-011: Build Spark Timeline Component
**Priority**: High
**Dependencies**: SS-002
**Estimated Effort**: 3 hours

**Implementation Details**:
- Create file: `src/components/sparks/SparkTimeline.tsx`
- Query sparks with pagination (50/page)
- Group sparks by date
- Display content preview (3 lines)
- Show tags as badges
- Format timestamps with distance
- Handle click for context restoration
- Implement pagination controls

**Acceptance Criteria**:
```gherkin
Given user wants to view sparks
When timeline component loads
Then sparks display in reverse chronological order
And sparks are grouped by date
And content shows 3-line preview
And tags display as badges
And clicking restores context
And pagination works smoothly
```

**Validation**:
- [ ] Query performs in <500ms
- [ ] Grouping logic correct
- [ ] Preview truncation appropriate
- [ ] Pagination state management works
- [ ] Click handler triggers restoration

---

#### Task SS-012: Implement Context Restoration
**Priority**: High
**Dependencies**: SS-011
**Estimated Effort**: 2 hours

**Implementation Details**:
- Add handleRestore function
- Download full JSON from Storage
- Navigate to document
- Scroll to saved position
- Highlight visible chunks
- Load connections in sidebar
- Restore engine weights
- Optional: highlight selection

**Acceptance Criteria**:
```gherkin
Given user clicks a spark in timeline
When context restoration runs
Then document opens at correct location
And scroll position matches capture time
And visible chunks are highlighted
And connections display in sidebar
And engine weights restore
```

**Validation**:
- [ ] Navigation works correctly
- [ ] Scroll position accurate
- [ ] Chunk highlighting visible
- [ ] Connections load properly
- [ ] Engine weights apply

---

### Phase 4: Obsidian Integration

#### Task SS-013: Extend Obsidian Sync Handler
**Priority**: Medium
**Dependencies**: SS-004
**Estimated Effort**: 3 hours

**Implementation Details**:
- Extend file: `worker/handlers/obsidian-sync.ts`
- Add exportSparksToObsidian function
- Add exportSparkToObsidian function
- Build YAML frontmatter with metadata
- Add context section for connections
- Create folder structure: Sparks/YYYY-MM/
- Write markdown files with gray-matter

**Acceptance Criteria**:
```gherkin
Given sparks need Obsidian export
When export function runs
Then sparks export to vault
And YAML frontmatter includes metadata
And folder structure uses year-month
And markdown files are valid
And connections appear in context section
```

**Validation**:
- [ ] Export creates correct file structure
- [ ] Frontmatter parses correctly
- [ ] Markdown renders in Obsidian
- [ ] Context section formatted well
- [ ] File permissions correct

---

#### Task SS-014: Add Obsidian Auto-Sync
**Priority**: Low
**Dependencies**: SS-013
**Estimated Effort**: 2 hours

**Implementation Details**:
- Check user settings for autoSync flag
- Queue background job after spark creation
- Implement job handler for export
- Add sync timestamp tracking
- Handle sync conflicts

**Acceptance Criteria**:
```gherkin
Given user has autoSync enabled
When spark is created
Then background job queues
And spark exports to Obsidian
And sync timestamp updates
And conflicts are detected
```

**Validation**:
- [ ] Auto-sync respects user settings
- [ ] Background job executes
- [ ] Timestamp tracking works
- [ ] Conflict detection accurate

---

#### Task SS-015: Implement Obsidian Import
**Priority**: Low
**Dependencies**: SS-013
**Estimated Effort**: 3 hours

**Implementation Details**:
- Watch vault folder for changes
- Parse markdown with gray-matter
- Detect modifications via timestamps
- Update spark content in Storage
- Update cache in database
- Handle bidirectional sync

**Acceptance Criteria**:
```gherkin
Given user edits spark in Obsidian
When file change is detected
Then spark content updates
And Storage JSON updates
And cache row updates
And timestamps reflect change
```

**Validation**:
- [ ] File watching works reliably
- [ ] Changes detected accurately
- [ ] Updates propagate correctly
- [ ] Timestamps prevent loops

---

### Phase 5: Writing Mode Integration

#### Task SS-016: Create Writing Suggestions Hook
**Priority**: Medium
**Dependencies**: SS-002
**Estimated Effort**: 2 hours

**Implementation Details**:
- Create file: `src/hooks/useWritingModeSuggestions.ts`
- Install use-debounce dependency
- Implement debounced search (1000ms)
- Generate embeddings for draft content
- Query similar sparks
- Manage loading state
- Cancel previous requests

**Acceptance Criteria**:
```gherkin
Given user is writing content
When content reaches 50+ characters
Then suggestions query after 1s debounce
And previous requests cancel
And relevant sparks appear
And loading state displays
```

**Validation**:
- [ ] Debouncing prevents excessive queries
- [ ] Request cancellation works
- [ ] Suggestions relevant to content
- [ ] Performance acceptable

---

#### Task SS-017: Build Search API Endpoint
**Priority**: Medium
**Dependencies**: SS-002
**Estimated Effort**: 2 hours

**Implementation Details**:
- Create file: `src/app/api/sparks/search/route.ts`
- Accept query text and mode
- Generate query embedding
- Call vector search function
- Apply mode-specific thresholds
- Return ranked results

**Acceptance Criteria**:
```gherkin
Given search request with query
When API processes request
Then embedding generates
And vector search executes
And results rank by similarity
And mode affects thresholds
```

**Validation**:
- [ ] API responds in <1 second
- [ ] Embeddings generate correctly
- [ ] Search results relevant
- [ ] Mode differentiation works

---

#### Task SS-018: Add Writing Mode UI Integration
**Priority**: Low
**Dependencies**: SS-016, SS-017
**Estimated Effort**: 2 hours

**Implementation Details**:
- Add suggestions panel to writing interface
- Display spark previews
- Show relevance scores
- Enable click to insert
- Add attribution when inserting

**Acceptance Criteria**:
```gherkin
Given writing mode is active
When suggestions load
Then sparks display in sidebar
And relevance scores show
And clicking inserts content
And attribution is added
```

**Validation**:
- [ ] UI updates smoothly
- [ ] Relevance scores accurate
- [ ] Insertion works correctly
- [ ] Attribution formatted well

---

### Phase 6: Polish & Testing

#### Task SS-019: Implement Cache Integrity System
**Priority**: High
**Dependencies**: SS-003
**Estimated Effort**: 2 hours

**Implementation Details**:
- Add integrity check on startup
- Compare Storage file count vs cache rows
- Trigger rebuild if mismatch
- Log integrity status
- Add manual rebuild command

**Acceptance Criteria**:
```gherkin
Given app starts up
When integrity check runs
Then Storage files are counted
And cache rows are counted
And mismatches trigger rebuild
And status is logged
```

**Validation**:
- [ ] Startup check runs reliably
- [ ] Mismatch detection accurate
- [ ] Rebuild completes successfully
- [ ] Performance impact minimal

---

#### Task SS-020: Build Export Functionality
**Priority**: Medium
**Dependencies**: SS-003
**Estimated Effort**: 2 hours

**Implementation Details**:
- Install jszip dependency
- Add exportSparksZip function
- Download all spark JSONs
- Create ZIP archive
- Return blob for download

**Acceptance Criteria**:
```gherkin
Given user wants to export sparks
When export function runs
Then all sparks download from Storage
And ZIP file generates
And download initiates
And file structure preserved
```

**Validation**:
- [ ] Export includes all sparks
- [ ] ZIP structure correct
- [ ] Download works in browser
- [ ] Large exports handled

---

#### Task SS-021: Create Mention Resolution Tests
**Priority**: High
**Dependencies**: SS-005
**Estimated Effort**: 2 hours

**Implementation Details**:
- Create test file: `src/lib/sparks/__tests__/mention-resolver.test.ts`
- Test exact chunk ID resolution
- Test fuzzy document matching
- Test ambiguous mentions
- Test edge cases

**Acceptance Criteria**:
```gherkin
Given mention resolver tests
When tests run
Then exact matches verify
And fuzzy matching validates
And ambiguous cases test
And edge cases covered
```

**Validation**:
- [ ] All resolution strategies tested
- [ ] Mock data realistic
- [ ] Edge cases comprehensive
- [ ] Tests run quickly

---

#### Task SS-022: Create Connection Inheritance Tests
**Priority**: High
**Dependencies**: SS-007
**Estimated Effort**: 2 hours

**Implementation Details**:
- Create test file: `src/app/actions/__tests__/sparks.test.ts`
- Test weight reduction (0.7x)
- Test strength filtering (≥0.6)
- Test metadata preservation
- Test connection limits

**Acceptance Criteria**:
```gherkin
Given connection inheritance tests
When tests run
Then weight reduction verifies
And filtering validates
And metadata checks
And limits enforce
```

**Validation**:
- [ ] Weight calculations correct
- [ ] Filtering logic tested
- [ ] Metadata structure verified
- [ ] Performance acceptable

---

#### Task SS-023: Create End-to-End Integration Tests
**Priority**: High
**Dependencies**: All previous
**Estimated Effort**: 3 hours

**Implementation Details**:
- Test full spark creation flow
- Test Storage upload verification
- Test cache row creation
- Test connection creation
- Test search functionality
- Test context restoration

**Acceptance Criteria**:
```gherkin
Given integration tests
When full flow tests run
Then spark creation succeeds
And Storage contains JSON
And cache row exists
And connections created
And search returns spark
And context restores
```

**Validation**:
- [ ] Full flow works end-to-end
- [ ] All components integrate
- [ ] Data consistency maintained
- [ ] Performance acceptable

---

#### Task SS-024: Performance Optimization
**Priority**: Medium
**Dependencies**: SS-023
**Estimated Effort**: 2 hours

**Implementation Details**:
- Profile spark creation time
- Optimize embedding generation
- Add connection query limits
- Implement pagination efficiently
- Cache frequently accessed data

**Acceptance Criteria**:
```gherkin
Given performance requirements
When optimizations apply
Then spark creation <2 seconds
And timeline loads <500ms
And search returns <1 second
And memory usage controlled
```

**Validation**:
- [ ] Performance metrics met
- [ ] No regression in functionality
- [ ] Memory usage acceptable
- [ ] Scalability verified

---

## Dependencies Mapping

### Critical Path Dependencies
```
SS-001 (Migration: Connections)
  → SS-002 (Migration: Sparks Table)
    → SS-003 (Storage Helpers)
      → SS-006 (Create Spark Action)
        → SS-009 (Capture Modal)
          → SS-011 (Timeline)
            → SS-023 (Integration Tests)
```

### Parallel Work Opportunities
- **Group A** (can start immediately):
  - SS-001: Entity Connection Migration
  - SS-005: Mention Resolution System (once SS-001 done)

- **Group B** (after core infrastructure):
  - SS-004: Worker Storage Module
  - SS-010: Reader Context Hook

- **Group C** (UI work):
  - SS-009: Spark Capture Modal
  - SS-011: Timeline Component
  - SS-012: Context Restoration

- **Group D** (independent features):
  - SS-013-015: Obsidian Integration
  - SS-016-018: Writing Mode
  - SS-019-020: Polish features

---

## Implementation Recommendations

### Team Structure
For optimal parallelization with 2-3 developers:

**Developer 1 (Backend Focus)**:
- Days 1-2: Database migrations (SS-001, SS-002)
- Days 2-3: Storage infrastructure (SS-003, SS-004)
- Days 3-4: Server actions and connection logic (SS-006, SS-007, SS-008)
- Days 5-6: API endpoints and search (SS-017)

**Developer 2 (Frontend Focus)**:
- Days 1-2: Reader context hook (SS-010)
- Days 2-3: Capture modal (SS-009)
- Days 3-4: Timeline component (SS-011, SS-012)
- Days 5-6: Writing mode UI (SS-016, SS-018)

**Developer 3 (Integration & Testing)**:
- Days 1-2: Mention resolution (SS-005)
- Days 3-4: Obsidian integration (SS-013, SS-014, SS-015)
- Days 5-6: Testing suite (SS-021, SS-022, SS-023)
- Day 7: Performance optimization (SS-024)

### Optimal Task Sequencing

**Day 1**: Database Infrastructure
- Morning: SS-001 (Connections migration)
- Afternoon: SS-002 (Sparks table migration)

**Day 2**: Core Systems
- Morning: SS-003 (Storage helpers)
- Afternoon: SS-005 (Mention resolution) + SS-004 (Worker storage)

**Day 3**: Spark Creation
- Morning: SS-006 (Server action)
- Afternoon: SS-007 (Connection inheritance) + SS-008 (Mention connections)

**Day 4**: UI Components
- Morning: SS-009 (Capture modal) + SS-010 (Context hook)
- Afternoon: SS-011 (Timeline) + SS-012 (Context restoration)

**Day 5**: Integration Features
- Morning: SS-013 (Obsidian export)
- Afternoon: SS-016 (Writing suggestions) + SS-017 (Search API)

**Day 6**: Polish & Testing
- Morning: SS-019 (Cache integrity) + SS-020 (Export)
- Afternoon: SS-021 (Mention tests) + SS-022 (Connection tests)

**Day 7**: Final Integration
- Morning: SS-023 (E2E tests)
- Afternoon: SS-024 (Performance optimization)

### Parallelization Opportunities

**Maximum Parallelization** (3 developers):
- Parallel tracks can reduce implementation to 4-5 days
- Backend and frontend work proceed simultaneously
- Testing begins as soon as individual features complete

**Medium Parallelization** (2 developers):
- Implementation in 5-6 days
- One developer on infrastructure/backend
- One developer on UI/frontend

**Sequential Implementation** (1 developer):
- Full 7-day timeline
- Focus on critical path first
- Defer optional features if needed

### Resource Allocation Suggestions

**Skills Required**:
- **Database**: PostgreSQL, migrations, RLS, pgvector
- **Backend**: TypeScript, Node.js, Server Actions
- **Frontend**: React 19, Next.js 15, UI components
- **Storage**: Supabase Storage, file handling
- **AI/ML**: Embeddings, vector search
- **Testing**: Jest, integration testing

**Recommended Team Composition**:
- Senior Backend Engineer (migrations, storage)
- Full-Stack Engineer (server actions, UI)
- QA/Test Engineer (testing, optimization)

---

## Critical Path Analysis

### Tasks on Critical Path
These tasks block all subsequent work and must be completed sequentially:

1. **SS-001**: Entity Connection Migration (2h)
2. **SS-002**: Sparks Cache Table (2h)
3. **SS-003**: Storage Helpers (3h)
4. **SS-006**: Create Spark Action (4h)
5. **SS-009**: Capture Modal (3h)
6. **SS-023**: Integration Tests (3h)

**Total Critical Path**: 17 hours (~2.5 days)

### Potential Bottlenecks

**Migration Dependencies**:
- All work depends on SS-001 and SS-002
- Solution: Prioritize migrations on Day 1

**Storage Infrastructure**:
- Multiple features depend on SS-003
- Solution: Complete storage helpers early Day 2

**Server Action Complexity**:
- SS-006 is most complex single task
- Solution: Allocate senior developer, allow extra time

### Schedule Optimization Suggestions

**Fast Track Option** (4 days):
- Skip Obsidian import (SS-015)
- Defer writing mode (SS-016-018)
- Basic testing only
- Polish in follow-up sprint

**Standard Track** (5-7 days):
- All core features
- Comprehensive testing
- Performance optimization
- Full Obsidian integration

**Extended Track** (8-10 days):
- Additional polish
- Advanced search features
- Thread detection
- Comprehensive documentation

---

## Risk Mitigation Strategies

### High-Risk Tasks

**SS-001: Connection Migration**
- Risk: Breaking existing connections
- Mitigation: Comprehensive backup, rollback script, staged deployment

**SS-005: Mention Resolution**
- Risk: Poor fuzzy matching accuracy
- Mitigation: Tunable thresholds, user feedback collection, manual override option

**SS-007: Connection Inheritance**
- Risk: Explosion of connections
- Mitigation: Strength filtering, connection limits, monitoring

### Contingency Plans

**If migrations fail**:
- Rollback scripts ready
- Alternative: Separate connection tables

**If performance targets missed**:
- Reduce real-time features
- Add caching layer
- Optimize queries with EXPLAIN ANALYZE

**If Obsidian sync conflicts**:
- Phase 1: Manual sync only
- Phase 2: Conflict resolution UI
- Alternative: One-way export only

---

## Quality Gates

### Phase Completion Criteria

**Phase 1 Complete When**:
- [ ] Both migrations applied successfully
- [ ] Storage helpers pass unit tests
- [ ] Cache integrity check works

**Phase 2 Complete When**:
- [ ] Sparks can be created via server action
- [ ] Mentions resolve with >80% accuracy
- [ ] Connections inherit correctly

**Phase 3 Complete When**:
- [ ] Cmd+K captures sparks
- [ ] Timeline displays all sparks
- [ ] Context restoration works

**Phase 4 Complete When**:
- [ ] Sparks export to Obsidian
- [ ] YAML frontmatter valid
- [ ] Folder structure correct

**Phase 5 Complete When**:
- [ ] Suggestions appear while writing
- [ ] Search returns relevant sparks
- [ ] Insertion works smoothly

**Phase 6 Complete When**:
- [ ] All tests passing
- [ ] Performance targets met
- [ ] Export functionality works

### Definition of Done

- [ ] Code review completed
- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] Documentation updated
- [ ] Performance validated
- [ ] Accessibility checked
- [ ] Security review completed
- [ ] Deployment validated

---

## Appendix: Quick Reference

### Database Migrations
- **044**: `add_entity_connections.sql` - Extend connections for entities
- **045**: `create_sparks_table.sql` - Sparks cache table with RLS

### Key Files Created
- `src/lib/sparks/storage.ts` - Storage helper functions
- `src/lib/sparks/mention-resolver.ts` - Mention resolution system
- `src/app/actions/sparks.ts` - Server actions
- `src/components/sparks/SparkCapture.tsx` - Capture modal
- `src/components/sparks/SparkTimeline.tsx` - Timeline view
- `src/hooks/useReaderContext.ts` - Reader context tracking
- `src/hooks/useWritingModeSuggestions.ts` - Writing suggestions
- `worker/lib/spark-storage.ts` - Worker storage module

### Dependencies to Install
```bash
npm install fuse.js gray-matter use-debounce jszip
```

### Testing Commands
```bash
npm test                          # Run all tests
npm run test:integration          # Integration tests
cd worker && npm test             # Worker tests
npx supabase db reset            # Test migrations
```

### Critical Metrics
- Spark creation: <2 seconds
- Timeline load: <500ms
- Search response: <1 second
- Context restoration: 100% accurate
- Mention resolution: >80% accuracy

---

**Document Generated**: 2025-10-07
**Source PRP**: `/Users/topher/Code/rhizome-v2/docs/prps/spark-system.md`
**Total Tasks**: 24 core tasks + 14 optional/enhancement tasks
**Estimated Effort**: 5-7 days with 1-2 developers
**Confidence Score**: 85% (High confidence in one-pass implementation)