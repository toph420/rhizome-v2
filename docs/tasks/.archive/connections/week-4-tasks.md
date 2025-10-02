# Week 4: Parallel Execution Pipeline Tasks

**Feature**: Connection Synthesis System - Pipeline Integration  
**Source PRP**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md)  
**Duration**: 5 days  
**Objective**: Orchestrate 7 engines with parallel execution and connection storage  

---

## Task T-009: Create Background Job Handler

### Task Identification
**Task ID**: T-009  
**Task Name**: Create Background Job Handler for Connection Detection  
**Priority**: Critical  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 1094-1394

#### Feature Overview
The background job handler orchestrates all 7 detection engines in parallel, manages connection storage with limits, and provides progress updates for the UI.

#### Task Purpose
**As a** background worker system  
**I need** a job handler for connection detection  
**So that** all 7 engines run efficiently in parallel with proper error handling

#### Dependencies
- **Prerequisite Tasks**: T-001 to T-008 (All engines must be implemented)
- **Parallel Tasks**: None (blocking task for pipeline)
- **Integration Points**: Background jobs table, all 7 engines, ProcessingDock
- **Blocked By**: Week 3 engine completion

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When detect_connections job is picked up, the system shall query all chunks for the document
- **REQ-2**: The system shall run all 7 engines in parallel using Promise.all()
- **REQ-3**: The system shall handle individual engine failures without stopping the pipeline
- **REQ-4**: The system shall update job progress at regular intervals
- **REQ-5**: The system shall respect user synthesis configuration (weights, limits)

#### Non-Functional Requirements
- **Performance**: Total detection time <5s for 50 chunks
- **Reliability**: Individual engine failures don't crash pipeline
- **Progress**: Update every 10 chunks for UI feedback
- **Scalability**: Handle documents with 200+ chunks

#### Technical Constraints
- **Technology Stack**: Node.js worker, TypeScript
- **Pattern**: Follow existing process-document.ts handler pattern
- **Database**: Use background_jobs table for status tracking
- **Error Handling**: Catch per-engine errors, continue processing

### Implementation Details

#### Files to Modify/Create
```
worker/handlers/
└── detect-connections.ts - [CREATE: Main job handler]
worker/index.ts - [MODIFY: Register new job type]
```

#### Key Implementation Steps
1. **Step 1**: Create detect-connections.ts handler → Export detectConnectionsHandler function
2. **Step 2**: Query chunks for document → Order by chunk_index
3. **Step 3**: Get user synthesis config → Default weights if not exists
4. **Step 4**: Implement parallel engine execution → Promise.all() with error catching
5. **Step 5**: Add progress updates → Every 10 chunks processed
6. **Step 6**: Register handler in worker index → Add to job type switch

#### Code Patterns to Follow
- **Job Handler Pattern**: [worker/handlers/process-document.ts:41-695] - Background job structure
- **Progress Updates**: [worker/handlers/process-document.ts:updateProgress()] - Progress tracking
- **Error Handling**: Individual try-catch per engine in Promise.all()

#### Implementation Structure
```typescript
export async function detectConnectionsHandler(
  supabase: SupabaseClient,
  job: BackgroundJob
) {
  const { document_id } = job.input_data
  
  try {
    // 1. Update progress: Starting
    await updateProgress(supabase, job.id, 10, 'detection', 'starting')
    
    // 2. Query chunks
    const chunks = await queryChunks(supabase, document_id)
    
    // 3. Get user config
    const config = await getUserConfig(supabase, job.user_id)
    
    // 4. Process chunks with all engines
    const allConnections = []
    for (let i = 0; i < chunks.length; i++) {
      const connections = await processChunkWithEngines(chunk, config)
      allConnections.push(...connections)
      
      // Update progress every 10 chunks
      if (i % 10 === 0) {
        await updateProgress(...)
      }
    }
    
    // 5. Apply limits and store
    await storeConnections(allConnections, config)
    
    // 6. Mark complete
    await markJobComplete(supabase, job.id)
    
  } catch (error) {
    await markJobFailed(supabase, job.id, error)
  }
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Successful parallel execution
  Given document with 50 chunks
  When detect_connections job runs
  Then all 7 engines execute in parallel
  And total time is <5s
  And connections are stored with limits applied

Scenario 2: Single engine failure handled
  Given semantic engine throws error
  When detect_connections job runs
  Then other 6 engines continue processing
  And job completes successfully
  And error is logged but not thrown

Scenario 3: Progress updates work
  Given document with 100 chunks
  When detect_connections job runs
  Then progress updates every 10 chunks
  And ProcessingDock shows real-time progress

Scenario 4: User config respected
  Given user has custom weights and limits
  When detect_connections job runs
  Then weights applied to connection scoring
  And limits enforced (50/chunk, 10/engine)
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: All 7 engines called for each chunk
- [ ] **Performance**: Total execution <5s for 50 chunks
- [ ] **Reliability**: Individual engine failures handled
- [ ] **Progress**: Updates sent every 10 chunks
- [ ] **Configuration**: User weights and limits applied
- [ ] **Integration**: Job status updated in background_jobs table

### Manual Testing Steps
1. **Setup**: Create document with 50 chunks
2. **Test Parallel Execution**:
   ```typescript
   // In detect-connections.ts
   console.time('All engines')
   const results = await Promise.all([...engineCalls])
   console.timeEnd('All engines') // Should be ~1s, not 7s
   ```
3. **Test Error Handling**:
   - Make semantic engine throw error
   - Verify job still completes
   - Check other engines processed
4. **Test Progress Updates**:
   - Monitor background_jobs.progress column
   - Verify updates every 10 chunks

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
npm run build

# Test handler integration
npm test detect-connections.test.ts

# Performance benchmark
node benchmark-detection.js
```

#### Definition of Done
- [ ] Handler processes all chunks with 7 engines
- [ ] Parallel execution verified (not sequential)
- [ ] Progress updates working
- [ ] Error handling tested
- [ ] <5s performance target met
- [ ] Job status tracking complete

### Resources & References

#### Code References
- **Job Handler Pattern**: [worker/handlers/process-document.ts:41-695]
- **Progress Function**: [worker/handlers/process-document.ts:updateProgress]
- **Worker Registration**: [worker/index.ts] - Job type switch

### Notes & Comments

#### Implementation Notes
- Use Promise.all() with individual try-catch blocks
- Don't use Promise.allSettled() - we want to handle errors explicitly
- Progress calculation: (chunksProcessed / totalChunks * 60) + 20
- Reserve 20% for initial setup, 60% for processing, 20% for storage

#### Risk Factors
- **Medium Risk**: Memory usage with many connections
- **Mitigation**: Process in batches if needed
- **High Risk**: Timeout with large documents
- **Mitigation**: Increase job timeout to 30s if needed

#### Estimated Time
**4 hours** (complex orchestration and error handling)

---

## Task T-010: Implement Parallel Execution with Promise.all

### Task Identification
**Task ID**: T-010  
**Task Name**: Implement Parallel Engine Execution  
**Priority**: Critical  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 1154-1228

#### Feature Overview
Optimize the connection detection pipeline by running all 7 engines in parallel for each chunk, dramatically reducing total processing time.

#### Task Purpose
**As a** performance optimization  
**I need** parallel execution of all detection engines  
**So that** connection detection completes in <5s instead of 35s (7 engines × 5s sequential)

#### Dependencies
- **Prerequisite Tasks**: T-009 (job handler structure)
- **Parallel Tasks**: T-011 (can work on scoring simultaneously)
- **Integration Points**: All 7 engine functions
- **Blocked By**: None if T-009 complete

### Technical Requirements

#### Functional Requirements
- **REQ-1**: The system shall execute all 7 engines simultaneously using Promise.all()
- **REQ-2**: Each engine shall have individual error handling that doesn't affect others
- **REQ-3**: The system shall collect results from all successful engines
- **REQ-4**: Failed engines shall return empty arrays (graceful degradation)

#### Non-Functional Requirements
- **Performance**: Parallel execution time = max(individual engine times), not sum
- **Reliability**: One engine failure doesn't stop others
- **Monitoring**: Log individual engine execution times

### Implementation Details

#### Files to Modify/Create
```
worker/handlers/
└── detect-connections.ts - [MODIFY: Add parallel execution]
```

#### Key Implementation Steps
1. **Step 1**: Import all 7 engine functions → Named imports from engine files
2. **Step 2**: Create engineCalls array → Each wrapped in try-catch
3. **Step 3**: Execute with Promise.all() → Await all results
4. **Step 4**: Flatten results array → Combine all connections
5. **Step 5**: Add timing logs → Measure parallel vs sequential improvement

#### Code Patterns to Follow
```typescript
async function processChunkWithEngines(
  chunk: Chunk,
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  const engineCalls = [
    // Engine 1: Semantic
    findSemanticMatches(
      chunk.id,
      chunk.embedding,
      documentId,
      supabase
    ).catch(err => {
      console.error('Engine 1 failed:', err)
      return []
    }),
    
    // Engine 2: Thematic
    findThematicBridges(
      chunk.id,
      chunk.themes || [],
      chunk.metadata?.structural_patterns || [],
      documentId,
      supabase
    ).catch(err => {
      console.error('Engine 2 failed:', err)
      return []
    }),
    
    // ... Engines 3-7 similar pattern
  ]
  
  // Execute all engines in parallel
  console.time(`Chunk ${chunk.id} engines`)
  const engineResults = await Promise.all(engineCalls)
  console.timeEnd(`Chunk ${chunk.id} engines`)
  
  // Flatten results
  return engineResults.flat()
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Parallel execution verified
  Given 7 engines each taking ~500ms
  When Promise.all() executes
  Then total time is ~500ms (not 3500ms)
  And all engines run simultaneously

Scenario 2: Engine failure isolation
  Given engine 3 throws error
  When Promise.all() executes
  Then engines 1,2,4,5,6,7 complete successfully
  And engine 3 returns empty array
  And no uncaught exceptions

Scenario 3: Results properly combined
  Given each engine returns 5 connections
  When Promise.all() completes
  Then flattened array has 35 connections (7 × 5)
  And all connection objects valid
```

#### Rule-Based Criteria (Checklist)
- [ ] **Performance**: Parallel time = max(engine times), not sum
- [ ] **Error Isolation**: Each engine wrapped in .catch()
- [ ] **Result Collection**: All successful results combined
- [ ] **Logging**: Individual engine times logged
- [ ] **Type Safety**: TypeScript types preserved

### Manual Testing Steps
1. **Test Parallel Timing**:
   ```typescript
   console.time('Sequential')
   for (const engine of engines) {
     await engine()
   }
   console.timeEnd('Sequential') // ~7s
   
   console.time('Parallel')
   await Promise.all(engines)
   console.timeEnd('Parallel') // ~1s
   ```
2. **Test Error Isolation**:
   - Add throw new Error() to one engine
   - Verify other engines complete
3. **Test Result Combination**:
   - Log engineResults.length before flatten
   - Log connections.length after flatten

### Resources & References

#### Documentation Links
- **Promise.all() MDN**: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
- **Error Handling**: Individual .catch() per promise

### Notes & Comments

#### Implementation Notes
- Do NOT use Promise.allSettled() - we handle errors explicitly
- Each engine already returns [] on error (defensive)
- Log timing per chunk for performance profiling

#### Estimated Time
**2 hours** (refactoring existing sequential code)

---

## Task T-011: Implement Weighted Scoring and Connection Limits

### Task Identification
**Task ID**: T-011  
**Task Name**: Apply Weighted Scoring and Connection Limits  
**Priority**: High  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 1233-1245, 1333-1361

#### Feature Overview
Apply user-configured weights to connection scores and enforce storage limits to prevent database bloat while preserving the most valuable connections.

#### Task Purpose
**As a** connection quality control system  
**I need** weighted scoring and storage limits  
**So that** only the most relevant connections are stored based on user preferences

#### Dependencies
- **Prerequisite Tasks**: T-010 (connections collected)
- **Parallel Tasks**: T-012 (batch insertion)
- **Integration Points**: user_synthesis_config table
- **Blocked By**: None if T-010 complete

### Technical Requirements

#### Functional Requirements
- **REQ-1**: The system shall apply user weights (0.0-1.0) to each engine's connections
- **REQ-2**: The system shall enforce max 50 connections per chunk
- **REQ-3**: The system shall enforce max 10 connections per engine per chunk
- **REQ-4**: The system shall sort by weighted score before applying limits

#### Non-Functional Requirements
- **Performance**: Scoring and limiting <100ms per chunk
- **Accuracy**: Preserve highest-scored connections
- **Flexibility**: Support user weight adjustments

### Implementation Details

#### Files to Modify/Create
```
worker/handlers/
└── detect-connections.ts - [MODIFY: Add applyConnectionLimits function]
```

#### Key Implementation Steps
1. **Step 1**: Apply weights to raw strength → weighted_score = strength * weight[engine]
2. **Step 2**: Group connections by engine → Prevent single engine domination
3. **Step 3**: Take top 10 per engine → First limit applied
4. **Step 4**: Sort all by weighted score → Combine limited results
5. **Step 5**: Take top 50 overall → Final limit per chunk

#### Code Implementation
```typescript
function applyConnectionLimits(
  connections: Connection[],
  weights: Record<string, number>,
  maxPerChunk: number = 50,
  maxPerEngine: number = 10
): Connection[] {
  // Apply weights
  const weighted = connections.map(conn => ({
    ...conn,
    weighted_score: conn.strength * weights[conn.metadata.engine]
  }))
  
  // Group by engine
  const byEngine: Record<string, Connection[]> = {}
  for (const conn of weighted) {
    const engine = conn.metadata.engine
    if (!byEngine[engine]) {
      byEngine[engine] = []
    }
    byEngine[engine].push(conn)
  }
  
  // Apply per-engine limit
  const limited: Connection[] = []
  for (const engine in byEngine) {
    const engineConns = byEngine[engine]
      .sort((a, b) => b.weighted_score - a.weighted_score)
      .slice(0, maxPerEngine)
    limited.push(...engineConns)
  }
  
  // Apply overall limit
  return limited
    .sort((a, b) => b.weighted_score - a.weighted_score)
    .slice(0, maxPerChunk)
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Weights applied correctly
  Given semantic weight = 0.5 and connection strength = 0.8
  When applyConnectionLimits() is called
  Then weighted_score = 0.4 (0.8 * 0.5)

Scenario 2: Per-engine limit enforced
  Given 20 semantic connections for one chunk
  When limits applied with maxPerEngine = 10
  Then only top 10 semantic connections kept
  And other engines not affected

Scenario 3: Overall limit enforced
  Given 100 total connections after engine limits
  When limits applied with maxPerChunk = 50
  Then only top 50 connections kept
  And sorted by weighted_score descending

Scenario 4: No single engine dominates
  Given semantic engine produces 50 high-score connections
  When limits applied
  Then maximum 10 semantic connections in final result
  And room for other engines' connections
```

#### Rule-Based Criteria (Checklist)
- [ ] **Weighting**: Each connection's weighted_score calculated
- [ ] **Engine Limit**: Max 10 per engine enforced
- [ ] **Chunk Limit**: Max 50 per chunk enforced
- [ ] **Sorting**: Higher scores preserved
- [ ] **Distribution**: Multiple engines represented

### Manual Testing Steps
1. **Test Weight Application**:
   ```typescript
   const weights = { semantic: 0.3, thematic: 0.9 }
   const weighted = applyWeights(connections, weights)
   console.log('Weighted scores:', weighted.map(c => c.weighted_score))
   ```
2. **Test Limit Enforcement**:
   - Create 100 connections
   - Apply limits
   - Verify exactly 50 returned
   - Verify max 10 per engine

### Resources & References

#### Code References
- **Default Weights**: Lines 1385-1393 in PRP
- **Limit Algorithm**: Lines 1333-1361 in PRP

### Notes & Comments

#### Implementation Notes
- Apply engine limit first, then overall limit
- This prevents one dominant engine from using all 50 slots
- weighted_score is temporary, not stored in database

#### Estimated Time
**2 hours** (algorithm implementation and testing)

---

## Task T-012: Implement Batch Insertion and Progress Updates

### Task Identification
**Task ID**: T-012  
**Task Name**: Implement Batch Database Insertion with Progress Tracking  
**Priority**: High  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 1264-1299

#### Feature Overview
Efficiently insert thousands of connections into the database using batching, while providing real-time progress updates to the UI.

#### Task Purpose
**As a** database optimization  
**I need** batch insertion of connections  
**So that** large volumes of connections are stored efficiently without overwhelming the database

#### Dependencies
- **Prerequisite Tasks**: T-011 (connections ready for storage)
- **Parallel Tasks**: T-013 (performance optimization)
- **Integration Points**: connections table, ProcessingDock UI
- **Blocked By**: None if T-011 complete

### Technical Requirements

#### Functional Requirements
- **REQ-1**: The system shall insert connections in batches of 1000 rows
- **REQ-2**: The system shall update progress after each batch
- **REQ-3**: The system shall handle partial batch failures gracefully
- **REQ-4**: The system shall avoid duplicate connections in database

#### Non-Functional Requirements
- **Performance**: Batch insertion 10x faster than individual inserts
- **Reliability**: Partial failures logged but don't stop process
- **Progress**: Real-time updates for ProcessingDock

### Implementation Details

#### Files to Modify/Create
```
worker/handlers/
└── detect-connections.ts - [MODIFY: Add batch insertion logic]
```

#### Key Implementation Steps
1. **Step 1**: Collect all connections → After limits applied
2. **Step 2**: Prepare for insertion → Add user_id to each connection
3. **Step 3**: Split into batches → 1000 connections per batch
4. **Step 4**: Insert each batch → Handle errors per batch
5. **Step 5**: Update progress → After each batch completes

#### Code Implementation
```typescript
async function storeConnections(
  connections: Connection[],
  userId: string,
  jobId: string,
  supabase: SupabaseClient
): Promise<void> {
  const BATCH_SIZE = 1000
  
  // Prepare connections for insertion
  const toInsert = connections.map(conn => ({
    user_id: userId,
    source_chunk_id: conn.source_chunk_id,
    target_chunk_id: conn.target_chunk_id,
    connection_type: conn.connection_type,
    strength: conn.strength,
    auto_detected: conn.auto_detected,
    metadata: conn.metadata,
    created_at: new Date().toISOString()
  }))
  
  // Insert in batches
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)
    
    try {
      const { error } = await supabase
        .from('connections')
        .insert(batch)
      
      if (error) {
        console.error(`Batch ${i} failed:`, error)
        // Continue with next batch
      } else {
        inserted += batch.length
      }
    } catch (err) {
      console.error(`Batch ${i} exception:`, err)
    }
    
    // Update progress
    const progress = 85 + Math.floor((inserted / toInsert.length) * 10)
    await updateProgress(
      supabase,
      jobId,
      progress,
      'detection',
      'storing',
      `${inserted}/${toInsert.length} connections saved`
    )
  }
  
  console.log(`Stored ${inserted}/${toInsert.length} connections`)
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Large batch insertion
  Given 5000 connections to insert
  When storeConnections() is called
  Then 5 batches of 1000 are created
  And each batch inserts successfully
  And progress updates 5 times

Scenario 2: Partial batch failure
  Given batch 3 of 5 fails
  When storeConnections() continues
  Then batches 1,2,4,5 insert successfully
  And error is logged for batch 3
  And process doesn't stop

Scenario 3: Progress tracking
  Given 2000 connections inserting
  When first batch completes
  Then progress shows "1000/2000 connections saved"
  And progress percentage increases

Scenario 4: Small batch handling
  Given only 500 connections
  When storeConnections() is called
  Then single batch inserts all 500
  And no unnecessary splitting
```

#### Rule-Based Criteria (Checklist)
- [ ] **Batching**: 1000 rows per batch maximum
- [ ] **Error Handling**: Batch failures don't stop process
- [ ] **Progress**: Updates after each batch
- [ ] **Performance**: Faster than individual inserts
- [ ] **Completeness**: All valid connections stored

### Manual Testing Steps
1. **Test Batch Splitting**:
   ```typescript
   const connections = Array(2500).fill(testConnection)
   await storeConnections(connections, userId, jobId, supabase)
   // Should see 3 batches in logs
   ```
2. **Test Progress Updates**:
   - Monitor background_jobs.progress
   - Verify incremental updates
3. **Test Error Recovery**:
   - Cause one batch to fail (bad data)
   - Verify other batches succeed

### Resources & References

#### Code References
- **Batch Pattern**: PostgreSQL supports up to 65535 parameters
- **Progress Updates**: [worker/handlers/process-document.ts:updateProgress]

### Notes & Comments

#### Implementation Notes
- PostgreSQL limit: 65535 parameters total
- With ~10 fields per connection, safe limit is 1000 rows
- Consider using COPY command for even faster insertion (future optimization)

#### Estimated Time
**2 hours** (batch logic and error handling)

---

## Task T-013: Performance Optimization

### Task Identification
**Task ID**: T-013  
**Task Name**: Optimize Pipeline for <5s Total Detection Time  
**Priority**: Critical  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Performance targets section

#### Feature Overview
Fine-tune the entire detection pipeline to meet the <5s performance target for typical documents (50 chunks).

#### Task Purpose
**As a** performance requirement  
**I need** pipeline optimization  
**So that** users experience fast connection detection without blocking the UI

#### Dependencies
- **Prerequisite Tasks**: T-009 to T-012 (complete pipeline)
- **Parallel Tasks**: None (final optimization)
- **Integration Points**: All engines and pipeline components
- **Blocked By**: Pipeline must be working first

### Technical Requirements

#### Functional Requirements
- **REQ-1**: The system shall complete detection in <5s for 50 chunks
- **REQ-2**: The system shall identify and optimize bottlenecks
- **REQ-3**: The system shall maintain result quality while optimizing
- **REQ-4**: The system shall provide detailed timing metrics

#### Non-Functional Requirements
- **Performance**: <5s for typical document (50 chunks)
- **Scalability**: Linear scaling with chunk count
- **Monitoring**: Detailed timing logs for profiling

### Implementation Details

#### Files to Modify/Create
```
worker/handlers/
└── detect-connections.ts - [MODIFY: Add optimizations]
worker/lib/engines/
└── *.ts - [MODIFY: Optimize slow engines]
```

#### Key Implementation Steps
1. **Step 1**: Add detailed timing logs → Identify slowest components
2. **Step 2**: Profile each engine → Find bottlenecks
3. **Step 3**: Optimize database queries → Add indexes if needed
4. **Step 4**: Implement caching → For repeated calculations
5. **Step 5**: Consider chunking strategies → Process multiple chunks per engine call

#### Optimization Strategies
```typescript
// 1. Batch chunk processing
async function processChunksInBatches(
  chunks: Chunk[],
  batchSize: number = 10
): Promise<Connection[]> {
  const results = []
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    
    // Process batch of chunks together
    const batchResults = await Promise.all(
      batch.map(chunk => processChunkWithEngines(chunk))
    )
    
    results.push(...batchResults.flat())
  }
  
  return results
}

// 2. Engine-specific optimizations
async function optimizeSemanticEngine() {
  // Reduce match_count if needed
  // Increase threshold to reduce candidates
  // Cache embedding comparisons
}

// 3. Database optimizations
-- Add indexes if not exists
CREATE INDEX IF NOT EXISTS idx_chunks_themes ON chunks USING gin(themes);
CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON chunks USING gin(metadata);

// 4. Memory optimization
function* connectionGenerator(chunks) {
  for (const chunk of chunks) {
    yield processChunk(chunk)
  }
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Performance target met
  Given document with 50 chunks
  When connection detection runs
  Then total time is <5s
  And all connections detected
  And quality not compromised

Scenario 2: Scaling verified
  Given document with 100 chunks
  When connection detection runs
  Then time is <10s (linear scaling)
  And no memory issues

Scenario 3: Bottlenecks identified
  Given timing logs enabled
  When pipeline runs
  Then slowest engine identified
  And optimization opportunities clear

Scenario 4: Optimization impact measured
  Given baseline timing recorded
  When optimizations applied
  Then performance improvement quantified
  And <5s target achieved
```

#### Rule-Based Criteria (Checklist)
- [ ] **Performance**: <5s for 50 chunks achieved
- [ ] **Profiling**: Timing logs for each component
- [ ] **Quality**: No reduction in connection quality
- [ ] **Scalability**: Linear scaling verified
- [ ] **Documentation**: Optimizations documented

### Manual Testing Steps
1. **Baseline Performance**:
   ```typescript
   console.time('Full pipeline - 50 chunks')
   await detectConnectionsHandler(supabase, job)
   console.timeEnd('Full pipeline - 50 chunks')
   ```
2. **Profile Engines**:
   ```typescript
   for (const engine of engines) {
     console.time(`Engine: ${engine.name}`)
     await engine()
     console.timeEnd(`Engine: ${engine.name}`)
   }
   ```
3. **Test Optimizations**:
   - Apply one optimization at a time
   - Measure improvement
   - Document what worked

### Validation & Quality Gates

#### Performance Benchmarks
```bash
# Create benchmark script
cat > benchmark-detection.js << 'EOF'
const { detectConnectionsHandler } = require('./worker/handlers/detect-connections')

async function benchmark() {
  const testSizes = [10, 25, 50, 100]
  
  for (const size of testSizes) {
    const start = Date.now()
    await runDetection(size)
    const duration = Date.now() - start
    
    console.log(`${size} chunks: ${duration}ms`)
    
    if (size === 50 && duration > 5000) {
      console.error('FAILED: 50 chunks took ${duration}ms (target: <5000ms)')
      process.exit(1)
    }
  }
}

benchmark()
EOF

npm run benchmark
```

#### Definition of Done
- [ ] 50 chunks process in <5s
- [ ] 100 chunks process in <10s
- [ ] All engines profiled and optimized
- [ ] No quality degradation
- [ ] Optimization documentation complete

### Resources & References

#### Documentation Links
- **Node.js Profiling**: https://nodejs.org/en/docs/guides/simple-profiling/
- **PostgreSQL Optimization**: https://www.postgresql.org/docs/current/performance-tips.html

### Notes & Comments

#### Implementation Notes
- Start with profiling before optimizing
- Focus on the slowest engine first (likely temporal with content analysis)
- Consider disabling temporal engine if it's too slow
- Database indexes can provide huge improvements

#### Risk Factors
- **High Risk**: May not achieve <5s without compromising quality
- **Mitigation**: 
  - Allow configuration of active engines
  - Increase target to <10s if necessary
  - Use caching aggressively

#### Estimated Time
**4 hours** (profiling, optimization, testing)

---

## Week 4 Summary

### Total Estimated Time
- T-009: 4 hours (Job handler)
- T-010: 2 hours (Parallel execution)
- T-011: 2 hours (Weighted scoring and limits)
- T-012: 2 hours (Batch insertion)
- T-013: 4 hours (Performance optimization)
- **Total**: 14 hours

### Critical Dependencies
- T-009 blocks everything (main handler)
- T-010-T-012 can partially overlap
- T-013 must be last (optimization of complete pipeline)

### Key Risks
1. **Performance Target**: <5s may be ambitious
   - Mitigation: Profile early, optimize aggressively
   - Fallback: Accept <10s as acceptable
2. **Memory Usage**: Many connections in memory
   - Mitigation: Process in batches, use generators
3. **Database Performance**: Batch insertion may still be slow
   - Mitigation: Use COPY command if needed

### Validation Gate (End of Week 4)
- [ ] All 7 engines execute in parallel
- [ ] Connection storage with limits working
- [ ] Progress updates displaying in UI
- [ ] Batch insertion operational
- [ ] <5s performance for 50 chunks achieved
- [ ] No memory leaks or crashes
- [ ] Ready for Week 5 integration

### Performance Metrics
| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| 50 chunks detection | <5s | TBD | Pending |
| Single engine time | <1s | TBD | Pending |
| Parallel overhead | <0.5s | TBD | Pending |
| Batch insertion (1000) | <1s | TBD | Pending |
| Memory usage | <500MB | TBD | Pending |

### Next Steps
After completing Week 4:
1. Begin Week 5 Task T-014 (Reader integration)
2. Replace mock connections with real data
3. Implement client-side re-ranking
4. Test with diverse documents
5. Validate cross-domain connections work

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-09-28  
**Week**: 4 of 6  
**Status**: Ready for Implementation