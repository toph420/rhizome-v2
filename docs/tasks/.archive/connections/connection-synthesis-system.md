# Connection Synthesis System - Task Breakdown

**Feature Name**: 7-Engine Connection Synthesis with Learning & Obsidian Sync  
**Source PRP**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md)  
**Version**: 1.0.0  
**Status**: Ready for Implementation  
**Timeline**: 6 weeks (Weeks 3-8)  
**Confidence**: 8/10

---

## Executive Summary

### Feature Overview
Implement a 7-engine parallel connection detection system that discovers relationships between document chunks across multiple dimensions (semantic, thematic, structural, contradiction, emotional, methodological, temporal). The system includes user-configurable weights, validation learning with feedback capture, automatic weight tuning based on 30-day patterns, Obsidian bidirectional sync, and experimental personal model training.

### Business Value
- **Maximum Intelligence**: 7 engines running simultaneously catch every connection type
- **Personal Adaptation**: System learns from validation patterns and auto-tunes weights over 30 days
- **Serendipitous Discovery**: Cross-domain bridges and contradictions surface unexpected insights
- **Obsidian Integration**: Bidirectional sync enables graph visualization and external knowledge management
- **Testing Infrastructure**: Weight tuning interface validates synthesis effectiveness in production

### Technical Complexity Assessment
- **Overall Complexity**: High (8/10)
- **Infrastructure Status**: 80% exists (pgvector, ECS, background jobs, fuzzy matching)
- **Integration Risk**: Medium (7 engines running in parallel, timeout management)
- **Performance Risk**: High (5s detection target requires optimization)
- **Testing Confidence**: High (88.52% coverage on fuzzy matching, proven patterns)

---

## Phase Organization

### Phase 1: 7-Engine Implementation (Week 3)
**Duration**: 5 days  
**Objective**: Implement all 7 detection engines with unit tests

**Deliverables**:
- Engine 1: Semantic Similarity (pgvector, <1s detection)
- Engine 2: Thematic Bridges (Jaccard on themes, cross-domain filtering)
- Engine 3: Structural Isomorphisms (pattern matching)
- Engine 4: Contradiction Tensions (opposing tones + concept overlap)
- Engine 5: Emotional Resonance (tone matching)
- Engine 6: Methodological Echoes (method signatures)
- Engine 7: Temporal Rhythms (narrative pattern analysis)

**Milestones**:
- Day 1-2: Engines 1-3 with unit tests
- Day 3-4: Engines 4-6 with unit tests
- Day 5: Engine 7, integration validation

### Phase 2: Parallel Execution Pipeline (Week 4)
**Duration**: 5 days  
**Objective**: Orchestrate 7 engines with connection storage and limits

**Deliverables**:
- Background job handler (detect-connections.ts)
- Promise.all parallel execution (<5s total)
- Weighted scoring system
- Connection limits (50/chunk, 10/engine)
- Batch insertion (1000 rows at a time)
- Progress updates for ProcessingDock

**Milestones**:
- Day 1-2: Job handler with parallel engine calls
- Day 3-4: Storage limits and batch insertion
- Day 5: Performance optimization and validation

### Phase 3: Integration Testing & Mock Replacement (Week 5)
**Duration**: 5 days  
**Objective**: Replace mock data with real connections in reader UI

**Deliverables**:
- Modify reader page (query connections with weights)
- Enhance RightPanel (client-side re-ranking <100ms)
- Connection navigation and filtering
- 10 diverse document tests (cross-domain validation)
- No data loss on document re-processing

**Milestones**:
- Day 1-2: Reader page integration
- Day 3-4: RightPanel enhancement and testing
- Day 5: Comprehensive validation with diverse documents

### Phase 4: Validation Learning System (Week 6)
**Duration**: 5 days  
**Objective**: Capture user validation feedback with rich context

**Deliverables**:
- Server Action: validateConnection() with context capture
- Validation dashboard page (stats per engine)
- Starred connections boost (2x multiplier, 24h expiry)
- 50+ real validations captured (dogfooding)
- No blocking bugs

**Milestones**:
- Day 1-2: Server Action and context capture
- Day 3-4: Validation dashboard UI
- Day 5: Dogfooding and feedback capture validation

### Phase 5: Obsidian Bidirectional Sync (Week 7)
**Duration**: 5 days  
**Objective**: Sync connections to Obsidian vault with companion section

**Deliverables**:
- Sync function: syncToObsidian() (<2s per document)
- Companion section generator (wikilinks, metadata)
- Backup system (non-destructive)
- Conflict resolution (Rhizome source of truth)
- Obsidian graph integration verified

**Milestones**:
- Day 1-2: Sync function and companion section
- Day 3-4: Backup system and conflict handling
- Day 5: Obsidian integration testing

### Phase 6: Weight Auto-Tuning & Personal Model (Week 8)
**Duration**: 5 days  
**Objective**: Automatic weight adjustment and optional ML model

**Deliverables**:
- Nightly job: autoTuneWeights() (cron at 3am)
- 30-day feedback analysis with conservative ±10% adjustment
- (Optional) Personal model training (>70% accuracy, 100+ validations minimum)
- (Optional) Model blending (70% model, 30% weighted)
- Transparency logging for all weight changes

**Milestones**:
- Day 1-2: Auto-tuning job with 30-day analysis
- Day 3-4: (Optional) Personal model training
- Day 5: Final validation and Week 3-8 feature review

---

## Task Breakdown by Phase

### PHASE 1: 7-ENGINE IMPLEMENTATION

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

#### Task T-003: Implement Engine 2 - Thematic Bridges

**Priority**: High  
**Dependencies**: T-002  
**Estimated Time**: 2.5 hours

##### Context & Purpose
**As a** connection detection system  
**I need** thematic bridge engine using Jaccard similarity on themes  
**So that** cross-domain connections are discovered (e.g., philosophy ↔ biology)

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When themes provided, engine shall calculate Jaccard similarity with candidates
- REQ-2: When domain distance >0.6, engine shall prioritize cross-domain connections
- REQ-3: When theme overlap <0.5, connection shall be filtered out
- REQ-4: When structural patterns differ significantly, connection strength shall increase
- REQ-5: Detection time shall be <1s for typical chunk

**Algorithm**:
```
1. Query chunks with overlapping themes (JSONB contains operator)
2. Calculate Jaccard similarity for themes (intersection/union)
3. Calculate domain distance (1 - pattern_overlap)
4. Filter: theme_overlap ≥0.5 AND domain_distance ≥0.6
5. Weight strength: theme_overlap * domain_distance
6. Return top 20 connections
```

##### Implementation Details

**Files to Create**:
```
worker/lib/engines/
└── thematic.ts    # CREATE - Thematic bridge engine with Jaccard
```

**Code Pattern Reference**:
- **Jaccard Similarity**: `worker/lib/fuzzy-matching.ts` lines 100-147 (88.52% coverage)
- **JSONB Queries**: PostgreSQL `@>` (contains) operator

**Implementation**:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

interface Connection {
  source_chunk_id: string
  target_chunk_id: string
  connection_type: string
  strength: number
  auto_detected: boolean
  metadata: Record<string, any>
}

/**
 * Detects thematic bridges using Jaccard similarity on theme sets.
 * Prioritizes cross-domain connections (different structural patterns).
 * 
 * @param chunkId - Source chunk ID
 * @param themes - Array of theme strings
 * @param patterns - Structural patterns for domain detection
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections (empty on error)
 * 
 * @example
 * const connections = await findThematicBridges(
 *   'chunk-123',
 *   ['consciousness', 'emergence'],
 *   ['dialectical', 'synthetic'],
 *   'doc-456',
 *   supabase
 * )
 */
export async function findThematicBridges(
  chunkId: string,
  themes: string[],
  patterns: string[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  try {
    if (themes.length === 0) {
      return [] // No themes to match
    }
    
    // Query chunks with overlapping themes
    // NOTE: Using overlaps operator (?|) - verify PostgreSQL support
    const { data: candidates, error } = await supabase
      .from('chunks')
      .select('id, themes, metadata, document_id')
      .neq('document_id', documentId)
      .overlaps('themes', themes) // PostgreSQL JSONB overlaps operator
    
    if (error) {
      console.error('Thematic engine query failed:', error)
      return []
    }
    
    if (!candidates || candidates.length === 0) {
      return []
    }
    
    const connections: Connection[] = []
    
    for (const candidate of candidates) {
      const candidateThemes = (candidate.themes || []) as string[]
      const candidatePatterns = (candidate.metadata?.structural_patterns || []) as string[]
      
      // Calculate Jaccard similarity for themes
      const themeOverlap = calculateJaccardSimilarity(
        new Set(themes),
        new Set(candidateThemes)
      )
      
      // Calculate domain distance (different patterns = cross-domain)
      const patternOverlap = calculateJaccardSimilarity(
        new Set(patterns),
        new Set(candidatePatterns)
      )
      const domainDistance = 1 - patternOverlap
      
      // Filter: theme overlap ≥0.5 AND domain difference ≥0.6
      if (themeOverlap >= 0.5 && domainDistance >= 0.6) {
        const sharedThemes = themes.filter(t => candidateThemes.includes(t))
        
        connections.push({
          source_chunk_id: chunkId,
          target_chunk_id: candidate.id,
          connection_type: 'cross_domain_bridge',
          strength: themeOverlap * domainDistance, // Weight by both factors
          auto_detected: true,
          metadata: {
            engine: 'thematic',
            theme_overlap: themeOverlap,
            domain_distance: domainDistance,
            shared_themes: sharedThemes,
            source_patterns: patterns,
            target_patterns: candidatePatterns
          }
        })
      }
    }
    
    // Sort by strength, take top 20
    return connections
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 20)
  } catch (error) {
    console.error('Thematic engine exception:', error)
    return []
  }
}

/**
 * Calculates Jaccard similarity between two sets.
 * Reuses proven algorithm from fuzzy-matching.ts.
 * 
 * @param set1 - First set
 * @param set2 - Second set
 * @returns Similarity score (0.0 to 1.0)
 */
function calculateJaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  if (set1.size === 0 && set2.size === 0) return 1.0
  if (set1.size === 0 || set2.size === 0) return 0.0
  
  // Calculate intersection
  const intersection = new Set<T>()
  set1.forEach(item => {
    if (set2.has(item)) {
      intersection.add(item)
    }
  })
  
  // Calculate union
  const union = new Set<T>([...set1, ...set2])
  
  return intersection.size / union.size
}
```

##### Acceptance Criteria

**Scenario 1: Cross-domain bridge detected**
```gherkin
Given philosophy chunk with themes ['consciousness', 'emergence']
And biology chunk with themes ['consciousness', 'systems', 'complexity']
And different structural patterns (dialectical vs empirical)
When findThematicBridges() is called
Then cross_domain_bridge connection returned
And theme_overlap ≥0.5
And domain_distance ≥0.6
And strength = theme_overlap * domain_distance
```

**Scenario 2: Same domain filtered out**
```gherkin
Given two chunks with identical structural patterns
And high theme overlap (0.8)
When findThematicBridges() is called
Then no connection returned (domain_distance <0.6)
```

**Scenario 3: Weak theme overlap filtered**
```gherkin
Given chunks with <50% theme overlap
When findThematicBridges() is called
Then no connection returned (theme_overlap <0.5)
```

**Scenario 4: Top 20 connections returned**
```gherkin
Given 100 candidate chunks with varying theme overlaps
When findThematicBridges() is called
Then exactly 20 connections returned
And sorted by strength descending
```

**Checklist**:
- [ ] Jaccard similarity correctly calculates intersection/union
- [ ] Domain distance uses 1 - pattern_overlap formula
- [ ] Filtering thresholds enforced (0.5 theme, 0.6 domain)
- [ ] Strength weighted by both factors
- [ ] Top 20 sorting works
- [ ] Empty themes handled
- [ ] JSDoc on exported function
- [ ] Unit tests cover edge cases
- [ ] Detection time <1s validated

##### Manual Testing Steps
1. Create test philosophy document with themes
2. Create test biology document with overlapping themes
3. Ensure different structural patterns
4. Call findThematicBridges() on philosophy chunk
5. Verify cross-domain connection detected:
   ```typescript
   const connections = await findThematicBridges(
     philoChunkId,
     ['consciousness', 'emergence'],
     ['dialectical', 'synthetic'],
     philoDocId,
     supabase
   )
   console.log('Cross-domain bridges:', connections.length)
   console.log('Example:', connections[0]?.metadata)
   ```
6. Verify domain_distance >0.6
7. Run unit tests

---

#### Task T-004: Implement Engine 3 - Structural Isomorphisms

**Priority**: High  
**Dependencies**: T-003  
**Estimated Time**: 1.5 hours

##### Context & Purpose
**As a** connection detection system  
**I need** structural isomorphism engine using pattern matching  
**So that** chunks with similar analytical structures are discovered

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When structural patterns provided, engine shall calculate Jaccard similarity
- REQ-2: When pattern similarity ≥0.6, connection shall be created
- REQ-3: When no patterns provided, engine shall return empty array
- REQ-4: Detection time shall be <1s for typical chunk

**Algorithm**:
```
1. Query chunks with overlapping patterns (JSONB metadata->structural_patterns)
2. Calculate Jaccard similarity on patterns
3. Filter: pattern_similarity ≥0.6
4. Return top 20 connections sorted by strength
```

##### Implementation Details

**Files to Create**:
```
worker/lib/engines/
└── structural.ts    # CREATE - Structural isomorphism engine
```

**Implementation**:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

interface Connection {
  source_chunk_id: string
  target_chunk_id: string
  connection_type: string
  strength: number
  auto_detected: boolean
  metadata: Record<string, any>
}

/**
 * Detects structural isomorphisms using pattern matching.
 * Finds chunks with similar analytical structure (argument, example, dialectical, etc.).
 * 
 * @param chunkId - Source chunk ID
 * @param patterns - Structural patterns array
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections (empty on error)
 * 
 * @example
 * const connections = await findStructuralIsomorphisms(
 *   'chunk-123',
 *   ['dialectical', 'synthetic', 'argument'],
 *   'doc-456',
 *   supabase
 * )
 */
export async function findStructuralIsomorphisms(
  chunkId: string,
  patterns: string[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  try {
    if (patterns.length === 0) {
      return [] // No patterns to match
    }
    
    // Query all chunks (need to filter patterns in app layer)
    const { data: candidates, error } = await supabase
      .from('chunks')
      .select('id, metadata, document_id')
      .neq('document_id', documentId)
    
    if (error) {
      console.error('Structural engine query failed:', error)
      return []
    }
    
    if (!candidates || candidates.length === 0) {
      return []
    }
    
    const connections: Connection[] = []
    
    for (const candidate of candidates) {
      const candidatePatterns = (candidate.metadata?.structural_patterns || []) as string[]
      
      if (candidatePatterns.length === 0) {
        continue // No patterns to compare
      }
      
      // Calculate Jaccard similarity
      const patternSimilarity = calculateJaccardSimilarity(
        new Set(patterns),
        new Set(candidatePatterns)
      )
      
      // Filter: pattern similarity ≥0.6
      if (patternSimilarity >= 0.6) {
        const sharedPatterns = patterns.filter(p => candidatePatterns.includes(p))
        
        connections.push({
          source_chunk_id: chunkId,
          target_chunk_id: candidate.id,
          connection_type: 'structural_isomorphism',
          strength: patternSimilarity,
          auto_detected: true,
          metadata: {
            engine: 'structural',
            pattern_similarity: patternSimilarity,
            shared_patterns: sharedPatterns,
            source_patterns: patterns,
            target_patterns: candidatePatterns
          }
        })
      }
    }
    
    return connections
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 20)
  } catch (error) {
    console.error('Structural engine exception:', error)
    return []
  }
}

/**
 * Calculates Jaccard similarity between two sets.
 * 
 * @param set1 - First set
 * @param set2 - Second set
 * @returns Similarity score (0.0 to 1.0)
 */
function calculateJaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  if (set1.size === 0 && set2.size === 0) return 1.0
  if (set1.size === 0 || set2.size === 0) return 0.0
  
  const intersection = new Set<T>()
  set1.forEach(item => {
    if (set2.has(item)) {
      intersection.add(item)
    }
  })
  
  const union = new Set<T>([...set1, ...set2])
  
  return intersection.size / union.size
}
```

##### Acceptance Criteria

**Scenario 1: High pattern similarity detected**
```gherkin
Given chunk with patterns ['dialectical', 'synthetic', 'argument']
And candidate with patterns ['dialectical', 'synthetic', 'critical']
When findStructuralIsomorphisms() is called
Then connection returned with strength ≥0.6 (2/3 overlap)
And shared_patterns contains ['dialectical', 'synthetic']
```

**Scenario 2: Low pattern similarity filtered**
```gherkin
Given chunk with patterns ['empirical', 'quantitative']
And candidate with patterns ['dialectical', 'synthetic']
When findStructuralIsomorphisms() is called
Then no connection returned (0% overlap)
```

**Scenario 3: Empty patterns handled**
```gherkin
Given chunk with no patterns
When findStructuralIsomorphisms() is called
Then empty array returned
And no errors thrown
```

**Checklist**:
- [ ] Jaccard similarity calculated correctly
- [ ] Threshold 0.6 enforced
- [ ] Empty patterns return []
- [ ] Top 20 sorting works
- [ ] JSDoc on exported function
- [ ] Unit tests cover edge cases
- [ ] Detection time <1s validated

##### Manual Testing Steps
1. Create chunks with known patterns
2. Call findStructuralIsomorphisms()
3. Verify pattern similarity calculation
4. Verify threshold filtering
5. Run unit tests

---

#### Task T-005: Implement Engine 4 - Contradiction Tensions

**Priority**: High  
**Dependencies**: T-004  
**Estimated Time**: 2.5 hours

##### Context & Purpose
**As a** connection detection system  
**I need** contradiction detection engine using opposing tones  
**So that** conflicting viewpoints on same concepts are discovered

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When tones provided, engine shall find opposing tones
- REQ-2: When concepts overlap ≥0.7, contradiction requires high conceptual similarity
- REQ-3: When opposing tone pairs found, metadata shall list them
- REQ-4: Detection time shall be <1s for typical chunk

**Algorithm**:
```
1. Map tones to opposites (critical↔affirmative, skeptical↔confident, etc.)
2. Query chunks with overlapping opposing tones AND overlapping concepts
3. Calculate concept similarity (must be high for contradiction)
4. Filter: concept_similarity ≥0.7 (discussing same thing)
5. Return top 20 connections
```

##### Implementation Details

**Files to Create**:
```
worker/lib/engines/
└── contradiction.ts    # CREATE - Contradiction detection engine
```

**Implementation**:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

interface Connection {
  source_chunk_id: string
  target_chunk_id: string
  connection_type: string
  strength: number
  auto_detected: boolean
  metadata: Record<string, any>
}

/**
 * Detects contradiction tensions using opposing emotional tones.
 * Requires high conceptual overlap (discussing same thing with opposite stance).
 * 
 * @param chunkId - Source chunk ID
 * @param tones - Emotional tones array
 * @param concepts - Key concepts array
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections (empty on error)
 * 
 * @example
 * const connections = await findContradictions(
 *   'chunk-123',
 *   ['critical', 'skeptical'],
 *   ['consciousness', 'free will'],
 *   'doc-456',
 *   supabase
 * )
 */
export async function findContradictions(
  chunkId: string,
  tones: string[],
  concepts: string[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  try {
    if (tones.length === 0 || concepts.length === 0) {
      return []
    }
    
    // Define opposing tone mappings
    const opposingTones = getOpposingTones(tones)
    if (opposingTones.length === 0) {
      return [] // No oppositions possible
    }
    
    // Query chunks with opposing tones AND overlapping concepts
    const { data: candidates, error } = await supabase
      .from('chunks')
      .select('id, metadata, document_id')
      .neq('document_id', documentId)
      .overlaps('metadata->emotional_tone', opposingTones)
      .overlaps('metadata->key_concepts', concepts)
    
    if (error) {
      console.error('Contradiction engine query failed:', error)
      return []
    }
    
    if (!candidates || candidates.length === 0) {
      return []
    }
    
    const connections: Connection[] = []
    
    for (const candidate of candidates) {
      const candidateTones = (candidate.metadata?.emotional_tone || []) as string[]
      const candidateConcepts = (candidate.metadata?.key_concepts || []) as string[]
      
      // Calculate concept similarity (must be high for contradiction)
      const conceptSimilarity = calculateJaccardSimilarity(
        new Set(concepts),
        new Set(candidateConcepts)
      )
      
      // Filter: concept similarity ≥0.7 (discussing same thing)
      if (conceptSimilarity >= 0.7) {
        const sharedConcepts = concepts.filter(c => candidateConcepts.includes(c))
        const opposingPairs = findOpposingPairs(tones, candidateTones)
        
        connections.push({
          source_chunk_id: chunkId,
          target_chunk_id: candidate.id,
          connection_type: 'contradiction',
          strength: conceptSimilarity, // Higher concept overlap = stronger contradiction
          auto_detected: true,
          metadata: {
            engine: 'contradiction',
            concept_similarity: conceptSimilarity,
            shared_concepts: sharedConcepts,
            opposing_pairs: opposingPairs,
            source_tones: tones,
            target_tones: candidateTones
          }
        })
      }
    }
    
    return connections
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 20)
  } catch (error) {
    console.error('Contradiction engine exception:', error)
    return []
  }
}

/**
 * Maps tones to their opposites.
 */
function getOpposingTones(tones: string[]): string[] {
  const oppositionMap: Record<string, string> = {
    'critical': 'affirmative',
    'affirmative': 'critical',
    'skeptical': 'confident',
    'confident': 'skeptical',
    'pessimistic': 'optimistic',
    'optimistic': 'pessimistic',
    'confrontational': 'conciliatory',
    'conciliatory': 'confrontational'
  }
  
  const opposites: string[] = []
  for (const tone of tones) {
    if (oppositionMap[tone]) {
      opposites.push(oppositionMap[tone])
    }
  }
  
  return opposites
}

function findOpposingPairs(tones1: string[], tones2: string[]): string[][] {
  const pairs: string[][] = []
  const oppositionMap: Record<string, string> = {
    'critical': 'affirmative',
    'affirmative': 'critical',
    'skeptical': 'confident',
    'confident': 'skeptical',
    'pessimistic': 'optimistic',
    'optimistic': 'pessimistic',
    'confrontational': 'conciliatory',
    'conciliatory': 'confrontational'
  }
  
  for (const tone of tones1) {
    const opposite = oppositionMap[tone]
    if (opposite && tones2.includes(opposite)) {
      pairs.push([tone, opposite])
    }
  }
  
  return pairs
}

function calculateJaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  if (set1.size === 0 && set2.size === 0) return 1.0
  if (set1.size === 0 || set2.size === 0) return 0.0
  
  const intersection = new Set<T>()
  set1.forEach(item => {
    if (set2.has(item)) {
      intersection.add(item)
    }
  })
  
  const union = new Set<T>([...set1, ...set2])
  
  return intersection.size / union.size
}
```

##### Acceptance Criteria

**Scenario 1: Contradiction detected**
```gherkin
Given chunk with tones ['critical', 'skeptical'] and concepts ['free will']
And candidate with tones ['affirmative', 'confident'] and concepts ['free will', 'determinism']
When findContradictions() is called
Then contradiction connection returned
And concept_similarity ≥0.7 (high overlap)
And opposing_pairs contains [['critical', 'affirmative'], ['skeptical', 'confident']]
```

**Scenario 2: Low concept overlap filtered**
```gherkin
Given chunk with concepts ['consciousness']
And candidate with opposing tones but concepts ['economics']
When findContradictions() is called
Then no connection returned (concept_similarity <0.7)
```

**Scenario 3: No opposing tones filtered**
```gherkin
Given chunk with tones ['neutral', 'analytical']
When findContradictions() is called
Then empty array returned (no oppositions possible)
```

**Checklist**:
- [ ] Opposition map complete (8 pairs)
- [ ] Concept similarity threshold 0.7 enforced
- [ ] Opposing pairs correctly identified
- [ ] Empty results handled
- [ ] JSDoc on exported function
- [ ] Unit tests cover edge cases
- [ ] Detection time <1s validated

##### Manual Testing Steps
1. Create chunks with opposing tones and shared concepts
2. Call findContradictions()
3. Verify contradiction detected
4. Verify opposing_pairs metadata
5. Run unit tests

---

_(Due to length constraints, I'll continue with the remaining engines and phases in a structured summary format. Would you like me to continue with the complete detailed breakdown for all remaining tasks T-006 through T-029?)_

### Remaining Tasks Overview

**Week 3 (Engines)**:
- T-006: Engine 5 - Emotional Resonance (tone matching)
- T-007: Engine 6 - Methodological Echoes (method signatures)
- T-008: Engine 7 - Temporal Rhythms (narrative patterns)

**Week 4 (Pipeline)**:
- T-009: Background job handler (detect-connections.ts)
- T-010: Parallel execution with Promise.all
- T-011: Weighted scoring and connection limits
- T-012: Batch insertion and progress updates
- T-013: Performance optimization (<5s total)

**Week 5 (Integration)**:
- T-014: Modify reader page (query connections)
- T-015: Enhance RightPanel (re-ranking <100ms)
- T-016: Integration testing (10 diverse documents)
- T-017: Version tracking (no data loss on re-processing)
- T-018: Final validation gates

**Week 6 (Learning)**:
- T-019: Server Action: validateConnection()
- T-020: Validation dashboard page
- T-021: Starred connection boost (2x multiplier, 24h)
- T-022: Dogfooding protocol (50+ validations)
- T-023: Feedback analytics

**Week 7 (Obsidian)**:
- T-024: Sync function: syncToObsidian()
- T-025: Companion section generator
- T-026: Backup system (non-destructive)
- T-027: Conflict resolution (Rhizome source of truth)
- T-028: Obsidian graph integration testing

**Week 8 (Auto-Tuning)**:
- T-029: Nightly job: autoTuneWeights()
- T-030: 30-day feedback analysis
- T-031: (Optional) Personal model training
- T-032: (Optional) Model blending (70/30)
- T-033: Final feature review (Weeks 3-8)

---

## Critical Path Analysis

### Week 3-4 Critical Path
```
T-001 (Migrations) → T-002 (Engine 1) → T-003 (Engine 2) → T-004 (Engine 3) → T-005 (Engine 4) → T-006 (Engine 5) → T-007 (Engine 6) → T-008 (Engine 7) → T-009 (Job Handler) → T-010 (Parallel) → T-013 (Performance)
```

**Bottlenecks**:
- T-008 (Engine 7) has complex heuristic algorithm (2 hours)
- T-013 (Performance optimization) may require engine refactoring if >5s

**Parallelization Opportunities**:
- Week 6-8 can start in parallel with Week 5 integration testing

### Week 5-6 Critical Path
```
T-014 (Reader page) → T-015 (RightPanel) → T-016 (Integration tests) → T-019 (validateConnection) → T-020 (Dashboard) → T-022 (Dogfooding)
```

### Week 7-8 Critical Path
```
T-024 (syncToObsidian) → T-025 (Companion) → T-026 (Backup) → T-029 (autoTuneWeights) → T-030 (Analysis) → T-033 (Review)
```

---

## Implementation Recommendations

### Team Structure (Solo Developer)
**Week 3 Focus**: Sequential engine implementation (1 per day + testing)
**Week 4 Focus**: Pipeline integration and performance optimization
**Week 5 Focus**: UI integration and diverse document testing
**Week 6 Focus**: Validation system and dogfooding
**Week 7 Focus**: Obsidian sync and backup system
**Week 8 Focus**: Auto-tuning and optional ML model

### Risk Mitigation
**Risk**: 7 engines timeout >5s  
**Mitigation**: Profile each engine, optimize slow ones (add indexes, cache calculations)  
**Fallback**: Increase timeout to 10s or run sequential (accept 15s)

**Risk**: JSONB operators not supported  
**Mitigation**: Test PostgreSQL version (Supabase uses v15+)  
**Fallback**: Fetch all chunks, filter in app layer

**Risk**: Personal model overfits  
**Mitigation**: Simple model (logistic regression), blend with weighted scoring  
**Fallback**: Disable personal model, use weighted scoring only

---

## Validation Gates

### End of Week 3 Gate
**Requirements**:
- [ ] All 7 engines implemented with unit tests
- [ ] Each engine returns valid Connection[] format
- [ ] Detection time <1s per engine
- [ ] `npm run build` passes
- [ ] `npm run lint` passes

### End of Week 4 Gate
**Requirements**:
- [ ] Parallel pipeline runs all 7 engines
- [ ] Connection storage with limits working
- [ ] Total detection time <5s for 50 chunks
- [ ] ProcessingDock shows progress

### End of Week 5 Gate
**Requirements**:
- [ ] Mock data removed from reader
- [ ] Real connections display in right panel
- [ ] Weight sliders affect ranking <100ms
- [ ] 10 diverse documents tested
- [ ] Cross-domain bridges detected
- [ ] Contradictions detected

### End of Week 6 Gate
**Requirements**:
- [ ] Validation capture stores to database
- [ ] Dashboard displays stats per engine
- [ ] Starred connections boost engine weight
- [ ] 50+ real validations captured

### End of Week 7 Gate
**Requirements**:
- [ ] Obsidian sync generates companion section
- [ ] Wikilinks visible in graph view
- [ ] Sync completes <2s per document
- [ ] Backup system working

### End of Week 8 Gate
**Requirements**:
- [ ] Weight auto-tuning adjusts weights
- [ ] Changes logged for transparency
- [ ] (Optional) Personal model >70% accuracy
- [ ] All Week 3-8 features operational

---

## Definition of Done (Complete Feature)

### Functional Completeness
- [ ] All 7 engines operational and tested
- [ ] Parallel execution pipeline <5s
- [ ] Connection storage with limits working
- [ ] Real connections display in reader
- [ ] Weight tuning re-ranks in real-time
- [ ] Validation capture stores feedback
- [ ] Obsidian sync generates companion section
- [ ] Weight auto-tuning adjusts based on 30-day feedback
- [ ] (Optional) Personal model training works

### Quality Gates
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] All acceptance criteria met
- [ ] Performance targets met
- [ ] No P0/P1 blocking bugs
- [ ] Integration tests pass
- [ ] Manual dogfooding completed

### Documentation
- [ ] JSDoc on all exported functions
- [ ] Code comments on complex logic
- [ ] Migration scripts documented
- [ ] User guide for weight tuning
- [ ] Obsidian sync instructions

---

## Resources & References

### Primary Codebase References
- **Background Job Pipeline**: worker/handlers/process-document.ts (lines 41-695)
- **Fuzzy Matching (Jaccard)**: worker/lib/fuzzy-matching.ts (lines 100-147, 88.52% coverage)
- **pgvector RPC**: supabase/migrations/001_initial_schema.sql (lines 272-301)
- **ECS Operations**: src/lib/ecs/ecs.ts
- **Server Actions**: src/app/actions/documents.ts
- **ProcessingDock**: src/components/layout/ProcessingDock.tsx (real-time updates)

### External Documentation
- **PostgreSQL JSONB**: https://www.postgresql.org/docs/current/functions-json.html
- **pgvector**: https://github.com/pgvector/pgvector
- **Obsidian Wikilinks**: https://help.obsidian.md/Linking+notes+and+files/Internal+links
- **ml-logistic-regression**: https://www.npmjs.com/package/ml-logistic-regression

---

## Anti-Patterns to Avoid

### Architecture
- ❌ **Storing connections in ECS**: Use dedicated connections table
- ❌ **Bidirectional duplicates**: Store only A→B, query both directions
- ❌ **Sequential engine execution**: Use Promise.all()
- ❌ **No connection limits**: Apply 50/chunk and 10/engine limits

### Performance
- ❌ **Client-side weight tuning with DB queries**: Memoize filtered connections
- ❌ **No query optimization**: Add indexes on user_id, source_entity_id, strength
- ❌ **Batch size too large**: Keep batches ≤1000 rows
- ❌ **No progress updates**: Update every 10 chunks

---

## Next Steps

### Immediate Actions (Week 3 Start)
1. Create feature branch: `git checkout -b feature/connection-synthesis`
2. Run T-001: Create migrations 016-020
3. Run T-002: Implement Engine 1 (Semantic)
4. Validate detection time <1s
5. Commit with descriptive message

### Daily Checklist Template
```
Day N:
[ ] Complete assigned tasks (T-XXX to T-YYY)
[ ] Measure detection time (<1s per engine)
[ ] Run `npm run build` - verify no errors
[ ] Run `npm run lint` - verify no warnings
[ ] Write unit tests (80% coverage target)
[ ] Commit changes with descriptive message
[ ] Document any blockers or questions
```

### Weekly Review Questions
- Are detection times within target (<5s total)?
- Are connections high quality (validate with real documents)?
- Are weight adjustments effective (visible ranking changes)?
- Are users actually validating connections (>20% validation rate)?
- Is learning system improving rankings over time?

---

**Task Breakdown Version**: 1.0.0  
**Last Updated**: 2025-09-28  
**Total Tasks**: 33  
**Total Estimated Time**: 6 weeks (240 hours)  
**Confidence Score**: 8/10
