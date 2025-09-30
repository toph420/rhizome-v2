# Week 1: Foundation Setup - Database & First Engine

**Timeline**: Week 1 (4 hours total)  
**Tasks**: T-001 to T-002  
**Focus**: Database migrations and semantic similarity engine implementation

## Summary

This week establishes the foundation for the connection synthesis system by creating the necessary database schema and implementing the first detection engine. We start with 5 critical database migrations that enable user configuration, feedback tracking, and performance optimization. Then we implement the semantic similarity engine using pgvector, which forms the baseline for all connection detection.

## Tasks

---

#### Task T-001: Create Database Migrations 016-020

**Priority**: Critical  
**Dependencies**: None (blocking task)  
**Estimated Time**: 2 hours

##### Context & Purpose
**As a** developer  
**I need** 5 new database migrations for synthesis configuration and learning  
**So that** user weights, feedback, contexts, and models have persistent storage

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When migrations run, they shall create 5 new tables without errors
- REQ-2: When user_synthesis_config is created, it shall have default weight values
- REQ-3: When foreign keys are added, they shall reference auth.users correctly
- REQ-4: When indexes are created, they shall improve query performance

**Schema Requirements**:
- user_synthesis_config: User weight preferences (weights JSONB, engine_order TEXT[])
- connection_feedback: Validation tracking (action, context JSONB, note TEXT)
- weight_contexts: Context-specific multipliers (context, engine, weight_multiplier FLOAT)
- user_models: Personal model storage (model_type, model_data JSONB, accuracy FLOAT)
- Enhanced connections table: Add performance indexes

##### Implementation Details

**Files to Create**:
```
supabase/migrations/
├── 016_user_synthesis_config.sql     # CREATE
├── 017_connection_feedback.sql       # CREATE
├── 018_weight_contexts.sql          # CREATE
├── 019_user_models.sql              # CREATE
└── 020_connections_indexes.sql      # CREATE
```

**Code Pattern Reference**:
- **Migration Structure**: Follow `supabase/migrations/001_initial_schema.sql`
- **JSONB Defaults**: Use `DEFAULT '{...}'::jsonb` syntax

**Migration 016: user_synthesis_config**:
```sql
-- User synthesis configuration
CREATE TABLE user_synthesis_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  
  -- Engine weights (0.0-1.0)
  weights JSONB NOT NULL DEFAULT '{
    "semantic": 0.3,
    "thematic": 0.9,
    "structural": 0.7,
    "contradiction": 1.0,
    "emotional": 0.4,
    "methodological": 0.8,
    "temporal": 0.2
  }'::jsonb,
  
  -- Engine order for priority (when ties)
  engine_order TEXT[] DEFAULT ARRAY[
    'contradiction', 'thematic', 'methodological', 
    'structural', 'semantic', 'emotional', 'temporal'
  ],
  
  -- Storage limits
  max_connections_per_chunk INTEGER DEFAULT 50,
  max_connections_per_engine INTEGER DEFAULT 10,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_synthesis_config_user ON user_synthesis_config(user_id);

-- Insert default config for dev user
INSERT INTO user_synthesis_config (user_id)
VALUES ('dev-user-123')
ON CONFLICT (user_id) DO NOTHING;
```

**Migration 017: connection_feedback**:
```sql
-- Connection feedback tracking
CREATE TABLE connection_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  connection_id UUID REFERENCES connections NOT NULL,
  
  action TEXT NOT NULL CHECK (action IN ('validated', 'rejected', 'starred', 'clicked', 'ignored')),
  
  -- Rich context
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  note TEXT, -- Optional user note
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_connection_feedback_user ON connection_feedback(user_id);
CREATE INDEX idx_connection_feedback_connection ON connection_feedback(connection_id);
CREATE INDEX idx_connection_feedback_action ON connection_feedback(action);
CREATE INDEX idx_connection_feedback_created ON connection_feedback(created_at DESC);
```

**Migration 018: weight_contexts**:
```sql
-- Context-specific weight multipliers
CREATE TABLE weight_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  context TEXT NOT NULL, -- 'morning', 'evening', 'writing_criticism', 'starred_boost'
  engine TEXT NOT NULL,  -- 'semantic', 'thematic', etc.
  weight_multiplier FLOAT NOT NULL DEFAULT 1.0 CHECK (weight_multiplier >= 0.5 AND weight_multiplier <= 2.0),
  
  expires_at TIMESTAMPTZ, -- For temporary boosts (starred connections)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, context, engine)
);

CREATE INDEX idx_weight_contexts_user ON weight_contexts(user_id);
CREATE INDEX idx_weight_contexts_expires ON weight_contexts(expires_at) WHERE expires_at IS NOT NULL;
```

**Migration 019: user_models**:
```sql
-- Personal model storage
CREATE TABLE user_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  
  model_type TEXT NOT NULL, -- 'logistic_regression', 'decision_tree'
  model_data JSONB NOT NULL, -- Serialized model
  
  accuracy FLOAT CHECK (accuracy >= 0 AND accuracy <= 1),
  trained_on INTEGER NOT NULL, -- Number of samples used
  last_trained_at TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_models_user ON user_models(user_id);
```

**Migration 020: connections_indexes**:
```sql
-- Enhanced connections table indexes for performance
CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_source ON connections(source_chunk_id);
CREATE INDEX IF NOT EXISTS idx_connections_target ON connections(target_chunk_id);
CREATE INDEX IF NOT EXISTS idx_connections_strength ON connections(strength DESC);
CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(connection_type);
CREATE INDEX IF NOT EXISTS idx_connections_metadata ON connections USING gin(metadata);
```

##### Acceptance Criteria

**Scenario 1: All migrations run successfully**
```gherkin
Given fresh database with migrations 001-015 applied
When I run `npx supabase db reset`
Then migrations 016-020 execute without errors
And all 5 tables are created
And default weights are set for dev user
```

**Scenario 2: JSONB defaults work correctly**
```gherkin
Given user_synthesis_config table created
When I query default weights
Then weights JSONB contains all 7 engines
And contradiction weight equals 1.0
And temporal weight equals 0.2
```

**Scenario 3: Indexes improve query performance**
```gherkin
Given connections table has 10,000 rows
When I query by user_id
Then query uses idx_connections_user
And query completes in <50ms
```

**Scenario 4: Foreign key constraints work**
```gherkin
Given invalid user_id reference
When I attempt to insert into connection_feedback
Then PostgreSQL raises foreign key violation
And no row is inserted
```

**Checklist**:
- [ ] All 5 migrations created with correct SQL
- [ ] Default weights JSONB valid
- [ ] Foreign key constraints reference auth.users
- [ ] Indexes created on high-traffic columns
- [ ] CHECK constraints validate data ranges
- [ ] Dev user config inserted
- [ ] `npx supabase db reset` passes

##### Manual Testing Steps
1. Run `npx supabase db reset` to apply all migrations
2. Check for errors in output
3. Verify all 5 tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('user_synthesis_config', 'connection_feedback', 'weight_contexts', 'user_models');
   ```
4. Verify dev user config created:
   ```sql
   SELECT * FROM user_synthesis_config WHERE user_id = 'dev-user-123';
   ```
5. Verify indexes created:
   ```sql
   SELECT indexname FROM pg_indexes WHERE tablename = 'connections';
   ```

---

#### Task T-002: Implement Engine 1 - Semantic Similarity

**Priority**: Critical  
**Dependencies**: T-001  
**Estimated Time**: 1.5 hours

##### Context & Purpose
**As a** connection detection system  
**I need** semantic similarity engine using pgvector  
**So that** semantically related chunks are discovered across documents

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When chunk embedding provided, engine shall query pgvector with match_chunks RPC
- REQ-2: When threshold is 0.3, engine shall return weak connections for user filtering
- REQ-3: When same document chunks returned, engine shall exclude them
- REQ-4: When no matches found, engine shall return empty array without errors
- REQ-5: Detection time shall be <1s for typical chunk

**Performance Requirements**:
- Query time: <1s (target from PRP)
- Match count: Top 20 results
- Threshold: 0.3 minimum (store weak connections)

##### Implementation Details

**Files to Create**:
```
worker/lib/engines/
└── semantic.ts    # CREATE - pgvector similarity engine
```

**Code Pattern Reference**:
- **pgvector RPC**: `supabase/migrations/001_initial_schema.sql` lines 272-301
- **Error Handling**: Try-catch with console.error (no throw)
- **Type Safety**: Import SupabaseClient and Connection types

**Implementation**:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Represents a connection between two chunks.
 */
interface Connection {
  source_chunk_id: string
  target_chunk_id: string
  connection_type: string
  strength: number
  auto_detected: boolean
  metadata: Record<string, any>
}

/**
 * Detects semantic similarity connections using pgvector.
 * 
 * @param chunkId - Source chunk ID
 * @param chunkEmbedding - 768d embedding vector
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections (empty on error)
 * 
 * @example
 * const connections = await findSemanticMatches(
 *   'chunk-123',
 *   embedding,
 *   'doc-456',
 *   supabase
 * )
 */
export async function findSemanticMatches(
  chunkId: string,
  chunkEmbedding: number[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  try {
    // Validate embedding dimensions
    if (chunkEmbedding.length !== 768) {
      console.error(`Invalid embedding dimension: ${chunkEmbedding.length} (expected 768)`)
      return []
    }
    
    // Use existing match_chunks RPC function
    const { data: matches, error } = await supabase.rpc('match_chunks', {
      query_embedding: chunkEmbedding,
      match_threshold: 0.3, // Store weak connections too (filter later)
      match_count: 20,      // Top 20 matches
      exclude_document_id: documentId
    })
    
    if (error) {
      console.error('Semantic engine failed:', error)
      return []
    }
    
    if (!matches || matches.length === 0) {
      return []
    }
    
    // Map to Connection format
    return matches.map((match: any) => ({
      source_chunk_id: chunkId,
      target_chunk_id: match.id,
      connection_type: 'semantic_similarity',
      strength: match.similarity, // Already 0-1 from RPC
      auto_detected: true,
      metadata: {
        engine: 'semantic',
        similarity_score: match.similarity,
        target_summary: match.summary || null,
        target_themes: match.themes || []
      }
    }))
  } catch (error) {
    console.error('Semantic engine exception:', error)
    return []
  }
}
```

**Unit Test** (worker/__tests__/engines/semantic.test.ts):
```typescript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { createClient } from '@supabase/supabase-js'
import { findSemanticMatches } from '../../lib/engines/semantic'

describe('Semantic Engine', () => {
  let supabase: any
  let testChunkId: string
  let testEmbedding: number[]
  let testDocId: string
  
  beforeAll(async () => {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Create test chunk with embedding
    const { data } = await supabase
      .from('chunks')
      .insert({
        document_id: 'test-doc-1',
        content: 'Test content',
        chunk_index: 0,
        embedding: new Array(768).fill(0.1)
      })
      .select()
      .single()
    
    testChunkId = data.id
    testEmbedding = data.embedding
    testDocId = data.document_id
  })
  
  test('detects high similarity connections', async () => {
    const connections = await findSemanticMatches(
      testChunkId,
      testEmbedding,
      testDocId,
      supabase
    )
    
    expect(connections).toBeDefined()
    expect(Array.isArray(connections)).toBe(true)
    
    if (connections.length > 0) {
      expect(connections[0].strength).toBeGreaterThan(0.3)
      expect(connections[0].connection_type).toBe('semantic_similarity')
      expect(connections[0].metadata.engine).toBe('semantic')
    }
  })
  
  test('excludes same document', async () => {
    const connections = await findSemanticMatches(
      testChunkId,
      testEmbedding,
      testDocId,
      supabase
    )
    
    const sameDoc = connections.filter(c => c.target_chunk_id === testChunkId)
    expect(sameDoc.length).toBe(0)
  })
  
  test('handles empty results gracefully', async () => {
    const zeroEmbedding = new Array(768).fill(0)
    const connections = await findSemanticMatches(
      testChunkId,
      zeroEmbedding,
      testDocId,
      supabase
    )
    
    expect(connections).toEqual([])
  })
  
  test('handles invalid embedding dimensions', async () => {
    const invalidEmbedding = new Array(512).fill(0.1)
    const connections = await findSemanticMatches(
      testChunkId,
      invalidEmbedding,
      testDocId,
      supabase
    )
    
    expect(connections).toEqual([])
  })
  
  afterAll(async () => {
    // Cleanup test data
    await supabase.from('chunks').delete().eq('id', testChunkId)
  })
})
```

##### Acceptance Criteria

**Scenario 1: High similarity connections detected**
```gherkin
Given chunk with embedding [0.1, 0.2, ...] (768 dimensions)
And database has similar chunks with >0.7 similarity
When findSemanticMatches() is called
Then connections array contains matches
And all strengths are >0.7
And connection_type equals 'semantic_similarity'
```

**Scenario 2: Weak connections included**
```gherkin
Given chunk with embedding
And database has chunks with 0.3-0.5 similarity
When findSemanticMatches() is called
Then weak connections (0.3-0.5) are included
And user can filter with UI sliders later
```

**Scenario 3: Same document excluded**
```gherkin
Given source chunk in document A
And 10 similar chunks in document A
When findSemanticMatches() is called with exclude_document_id=A
Then no chunks from document A returned
And only cross-document connections included
```

**Scenario 4: Empty results handled**
```gherkin
Given chunk with zero embedding [0, 0, ...]
When findSemanticMatches() is called
Then empty array returned
And no errors thrown
And no console.error messages
```

**Scenario 5: Performance target met**
```gherkin
Given typical chunk with embedding
When findSemanticMatches() is called
Then query completes in <1s
And returns up to 20 matches
```

**Checklist**:
- [ ] Function returns Connection[] type
- [ ] pgvector match_chunks RPC called correctly
- [ ] Threshold 0.3 used
- [ ] Same document excluded
- [ ] Empty results return []
- [ ] JSDoc on exported function
- [ ] 5 unit tests passing (80% coverage)
- [ ] Detection time <1s validated

##### Manual Testing Steps
1. Create test document with 50 chunks
2. Process chunks to generate embeddings
3. Call findSemanticMatches() on one chunk
4. Verify connections returned:
   ```typescript
   const start = performance.now()
   const connections = await findSemanticMatches(chunkId, embedding, docId, supabase)
   const duration = performance.now() - start
   console.log(`Detection time: ${duration}ms (target: <1000ms)`)
   console.log(`Connections found: ${connections.length}`)
   ```
5. Verify no same-document connections
6. Verify strengths are >0.3
7. Run unit tests: `npm test semantic.test.ts`

---

## Progress Tracking

### Completed
- [ ] T-001: Database migrations 016-020
- [ ] T-002: Semantic similarity engine

### Upcoming (Week 2)
- T-003: Thematic bridge engine
- T-004: Structural isomorphism engine
- T-005: Contradiction detection engine

## Notes

- All database migrations must be run before implementing engines
- Each engine returns Connection[] for consistency
- Error handling uses console.error and returns empty array (never throws)
- Performance target is <1s per engine (enables <5s total pipeline)
- Test coverage target is 80% minimum per engine