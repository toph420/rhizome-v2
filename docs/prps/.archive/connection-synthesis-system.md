# Product Requirements & Plans: 7-Engine Connection Synthesis System

**Feature Name**: Connection Synthesis System with Parallel Detection, Learning, and Obsidian Sync  
**Version**: 1.0.0  
**Status**: Ready for Implementation  
**Timeline**: 6 weeks (Weeks 3-8)  
**Prerequisites**: Document Reader & Annotation System (Weeks 1-2) MUST be complete  
**Confidence**: 8/10

---

## Executive Summary

### Feature Overview

Build a **7-engine parallel connection detection system** that discovers relationships between document chunks across multiple dimensions: semantic similarity, thematic bridges, structural patterns, contradictions, emotional resonance, methodological echoes, and temporal rhythms. The system includes user-configurable weights, validation learning with feedback capture, automatic weight tuning based on 30-day patterns, Obsidian bidirectional sync, and experimental personal model training.

**Core Innovation**: Instead of a single similarity metric, run 7 specialized engines in parallel, store everything (50 connections/chunk, 10/engine max), filter intelligently with weighted scoring, and learn continuously from user validation patterns.

### Business Value

- **Maximum Intelligence**: 7 engines running simultaneously catch every connection type (semantic, thematic, structural, contradiction, emotional, methodological, temporal)
- **Personal Adaptation**: System learns from validation patterns and auto-tunes weights over 30 days
- **Serendipitous Discovery**: Cross-domain bridges and contradictions surface unexpected insights
- **Obsidian Integration**: Bidirectional sync enables graph visualization and external knowledge management
- **Flow State Preservation**: No modals, connections displayed in right panel without interrupting reading

### Success Criteria

**Technical Metrics**:
- Connection detection completes <5 seconds per document
- System discovers 50+ connections per chunk (store everything)
- Weight re-ranking <100ms after slider adjustment
- Personal model achieves >70% accuracy predicting useful connections
- Obsidian sync generates companion section <2s per document

**User Metrics**:
- Validation rate >20% (indicates useful connections)
- Cross-domain bridges found between philosophy + biology documents
- Contradictions detected between opposing views on same concept
- Weight tuning feels responsive (<100ms)
- Validation is frictionless (single keypress v/r/s)

**Business Metrics**:
- All 7 engines operational by Week 5
- Learning system adapts weights automatically (visible improvements within 30 days)
- Obsidian graph integration works (wikilinks visible in graph view)
- Zero data loss during document re-processing (version tracking)

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 15)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Reader UI (from Week 2)                              │  │
│  │ • Weight tuning sliders (7 engines)                  │  │
│  │ • Connection filtering (by engine, strength)         │  │
│  │ • Validation capture (v/r/s hotkeys)                 │  │
│  │ • Right panel with connection display                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL (Supabase)                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Tables:                                              │  │
│  │ • chunks (embeddings, themes, metadata)              │  │
│  │ • connections (source, target, type, strength)       │  │
│  │ • user_synthesis_config (weights, limits)            │  │
│  │ • connection_feedback (validation tracking)          │  │
│  │ • weight_contexts (context-specific multipliers)     │  │
│  │ • user_models (personal model storage)               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Background Worker (Node.js)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Job Queue Processor (polls every 5s)                 │  │
│  │ • detect_connections job type                        │  │
│  │ • 7 engines run in parallel (Promise.all)            │  │
│  │ • Connection storage with limits (50/chunk, 10/eng)  │  │
│  │ • Progress updates for ProcessingDock                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 7 Detection Engines:                                 │  │
│  │ 1. Semantic Similarity (pgvector)                    │  │
│  │ 2. Thematic Bridges (Jaccard on themes)             │  │
│  │ 3. Structural Isomorphisms (pattern matching)       │  │
│  │ 4. Contradiction Tensions (opposing tones)           │  │
│  │ 5. Emotional Resonance (tone matching)               │  │
│  │ 6. Methodological Echoes (method signatures)         │  │
│  │ 7. Temporal Rhythms (narrative patterns)             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

**New Migrations Required** (016-020):

```sql
-- Migration 016: User synthesis configuration
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
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 017: Connection feedback tracking
CREATE TABLE connection_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  connection_id UUID REFERENCES connections NOT NULL,
  
  action TEXT NOT NULL, -- 'validated', 'rejected', 'starred', 'clicked', 'ignored'
  
  -- Rich context
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- {
  --   "reading_document_id": "uuid",
  --   "time_of_day": "morning|afternoon|evening",
  --   "day_of_week": "monday",
  --   "current_mode": "reading|writing",
  --   "time_spent_ms": 5000
  -- }
  
  note TEXT, -- Optional user note on why validated/rejected
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_connection_feedback_user ON connection_feedback(user_id);
CREATE INDEX idx_connection_feedback_connection ON connection_feedback(connection_id);
CREATE INDEX idx_connection_feedback_action ON connection_feedback(action);

-- Migration 018: Context-specific weight multipliers
CREATE TABLE weight_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  context TEXT NOT NULL, -- 'morning', 'evening', 'writing_criticism', 'starred_boost'
  engine TEXT NOT NULL,  -- 'semantic', 'thematic', etc.
  weight_multiplier FLOAT NOT NULL DEFAULT 1.0, -- 0.5-2.0 range
  
  expires_at TIMESTAMPTZ, -- For temporary boosts (starred connections)
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, context, engine)
);

CREATE INDEX idx_weight_contexts_user ON weight_contexts(user_id);
CREATE INDEX idx_weight_contexts_expires ON weight_contexts(expires_at);

-- Migration 019: Personal model storage
CREATE TABLE user_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  
  model_type TEXT NOT NULL, -- 'logistic_regression', 'decision_tree'
  model_data JSONB NOT NULL, -- Serialized model
  
  accuracy FLOAT, -- Last evaluated accuracy
  trained_on INTEGER NOT NULL, -- Number of samples used
  last_trained_at TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 020: Enhanced connections table (add indexes)
CREATE INDEX idx_connections_user ON connections(user_id);
CREATE INDEX idx_connections_source ON connections(source_entity_id);
CREATE INDEX idx_connections_target ON connections(target_entity_id);
CREATE INDEX idx_connections_strength ON connections(strength DESC);
CREATE INDEX idx_connections_type ON connections(connection_type);
CREATE INDEX idx_connections_metadata ON connections USING gin(metadata);
```

### Data Flow

**Phase 1: Connection Detection (Background Worker)**
```
Document Processing Complete (Week 2)
  ↓
1. chunks table populated with embeddings (768d), themes, metadata
  ↓
2. Background job created: 'detect_connections'
  ↓
3. Worker picks up job, queries all chunks for document
  ↓
4. Run 7 engines in parallel (Promise.all):
   - Engine 1: pgvector match_chunks RPC (semantic)
   - Engine 2: JSONB array overlap (thematic)
   - Engine 3: Jaccard on patterns (structural)
   - Engine 4: Opposing tone queries (contradiction)
   - Engine 5: Overlapping tone queries (emotional)
   - Engine 6: Method signature comparison (methodological)
   - Engine 7: Rhythm analysis (temporal)
  ↓
5. Collect all connections (~350 per chunk = 50 per engine)
  ↓
6. Apply weighted scoring: raw_strength * engineWeight
  ↓
7. Sort and apply limits:
   - Top 50 per chunk
   - Top 10 per engine (prevent single engine domination)
  ↓
8. Batch insert to connections table (1000 rows at a time)
  ↓
9. Update job status: completed
```

**Phase 2: User Interaction (Frontend)**
```
User opens document in reader
  ↓
1. Query connections for document (pre-filtered by user_synthesis_config)
  ↓
2. Apply user weights from config table
  ↓
3. Client-side re-ranking (memoized for performance)
  ↓
4. Display in right panel (grouped by engine)
  ↓
5. User adjusts weight slider
   ↓ <100ms
   Re-rank connections without database query
  ↓
6. User validates connection (v key)
   ↓
   Store to connection_feedback table with rich context
  ↓
7. User rejects connection (r key)
   ↓
   Store to connection_feedback table
  ↓
8. User stars connection (s key)
   ↓
   Store feedback + create weight_contexts entry (2x multiplier, 24h expiry)
```

**Phase 3: Learning & Adaptation (Nightly Cron)**
```
Nightly at 3am (or manual trigger)
  ↓
1. Query last 30 days of connection_feedback
  ↓
2. Calculate adjustment per engine:
   score = (validated * 1 + starred * 2 - rejected * 1) / total_feedback
   adjustment = score * 0.1  (±10% max per cycle)
  ↓
3. Update user_synthesis_config.weights
   - Clamp to [0.1, 1.0]
   - Log changes for transparency
  ↓
4. (Optional) Train personal model:
   - Extract features: engine, strength, time_of_day, context
   - Labels: validated/starred = 1, rejected = 0
   - Train logistic regression or decision tree
   - Save to user_models table
  ↓
5. (Optional) Apply personal model:
   - Blend: 70% model score + 30% weighted score
   - Use for connection ranking in UI
```

---

## Implementation Details

### Week 3: 7-Engine Implementation

#### Engine 1: Semantic Similarity (Baseline)

**Algorithm**: pgvector cosine similarity with threshold

**Implementation**:
```typescript
// worker/lib/engines/semantic.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Connection } from '@/types/connections'

/**
 * Detects semantic similarity connections using pgvector.
 * 
 * @param chunkId - Source chunk ID
 * @param chunkEmbedding - 768d embedding vector
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections
 */
export async function findSemanticMatches(
  chunkId: string,
  chunkEmbedding: number[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
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
  return matches.map(match => ({
    source_chunk_id: chunkId,
    target_chunk_id: match.id,
    connection_type: 'semantic_similarity',
    strength: match.similarity, // Already 0-1 from RPC
    auto_detected: true,
    metadata: {
      engine: 'semantic',
      similarity_score: match.similarity,
      target_summary: match.summary,
      target_themes: match.themes
    }
  }))
}
```

**Code Pattern Reference**: 
- pgvector RPC: `supabase/migrations/001_initial_schema.sql` lines 272-301
- Existing embedding usage: `worker/handlers/process-document.ts` lines 577-621

**Threshold Rationale**: 0.3 minimum to capture weak connections (users can filter with UI sliders)

---

#### Engine 2: Thematic Bridges (Cross-Domain)

**Algorithm**: Jaccard similarity on themes with domain distance filtering

**Implementation**:
```typescript
// worker/lib/engines/thematic.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Connection } from '@/types/connections'

/**
 * Detects thematic bridges using Jaccard similarity on theme sets.
 * Prioritizes cross-domain connections (different structural patterns).
 * 
 * @param chunkId - Source chunk ID
 * @param themes - Array of theme strings
 * @param patterns - Structural patterns for domain detection
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections
 */
export async function findThematicBridges(
  chunkId: string,
  themes: string[],
  patterns: string[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  if (themes.length === 0) {
    return [] // No themes to match
  }
  
  // Query chunks with overlapping themes
  // NOTE: Using contains (@>) operator - verify PostgreSQL support
  const { data: candidates, error } = await supabase
    .from('chunks')
    .select('id, themes, metadata, document_id')
    .neq('document_id', documentId)
    .contains('themes', themes) // PostgreSQL JSONB contains operator
  
  if (error) {
    console.error('Thematic engine query failed:', error)
    return []
  }
  
  if (!candidates || candidates.length === 0) {
    return []
  }
  
  const connections: Connection[] = []
  
  for (const candidate of candidates) {
    const candidateThemes = candidate.themes as string[]
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
          shared_themes: sharedThemes
        }
      })
    }
  }
  
  // Sort by strength, take top 20
  return connections
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 20)
}

/**
 * Calculates Jaccard similarity between two sets.
 * Reuses proven algorithm from fuzzy-matching.ts.
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

**Code Pattern Reference**:
- Jaccard similarity: `worker/lib/fuzzy-matching.ts` lines 100-147
- JSONB queries: Need to verify PostgreSQL `@>` operator support

**Threshold Rationale**:
- Theme overlap ≥0.5: At least half themes must match (strong thematic link)
- Domain distance ≥0.6: Significantly different domains (surprising connection)

---

#### Engine 3: Structural Isomorphisms (Pattern Matching)

**Algorithm**: Jaccard similarity on structural_patterns metadata

**Implementation**:
```typescript
// worker/lib/engines/structural.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Connection } from '@/types/connections'

/**
 * Detects structural isomorphisms using pattern matching.
 * Finds chunks with similar analytical structure (argument, example, dialectical, etc.).
 * 
 * @param chunkId - Source chunk ID
 * @param patterns - Structural patterns array
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections
 */
export async function findStructuralIsomorphisms(
  chunkId: string,
  patterns: string[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  if (patterns.length === 0) {
    return [] // No patterns to match
  }
  
  // Query chunks with overlapping patterns
  const { data: candidates, error } = await supabase
    .from('chunks')
    .select('id, metadata, document_id')
    .neq('document_id', documentId)
    .contains('metadata->structural_patterns', patterns)
  
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
          shared_patterns: sharedPatterns
        }
      })
    }
  }
  
  return connections
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 20)
}

// Reuse Jaccard similarity from thematic.ts
```

**Code Pattern Reference**:
- Pattern matching: Same Jaccard similarity as Engine 2
- JSONB path queries: `metadata->structural_patterns`

**Threshold Rationale**: 0.6 minimum (60% pattern overlap = strong structural similarity)

---

#### Engine 4: Contradiction Tensions (Opposing Views)

**Algorithm**: Detect opposing emotional tones + high concept similarity

**Implementation**:
```typescript
// worker/lib/engines/contradiction.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Connection } from '@/types/connections'

/**
 * Detects contradiction tensions using opposing emotional tones.
 * Requires high conceptual overlap (discussing same thing with opposite stance).
 * 
 * @param chunkId - Source chunk ID
 * @param tones - Emotional tones array
 * @param concepts - Key concepts array
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections
 */
export async function findContradictions(
  chunkId: string,
  tones: string[],
  concepts: string[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
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
          opposing_pairs: opposingPairs
        }
      })
    }
  }
  
  return connections
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 20)
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
    'optimistic': 'pessimistic'
  }
  
  for (const tone of tones1) {
    const opposite = oppositionMap[tone]
    if (opposite && tones2.includes(opposite)) {
      pairs.push([tone, opposite])
    }
  }
  
  return pairs
}
```

**Code Pattern Reference**:
- JSONB array queries with `overlaps` operator
- Concept similarity uses same Jaccard algorithm

**Threshold Rationale**: 0.7 concept similarity minimum (must discuss same thing to truly contradict)

---

#### Engine 5: Emotional Resonance (Mood/Tone)

**Algorithm**: Overlapping emotional tones with Jaccard similarity

**Implementation**:
```typescript
// worker/lib/engines/emotional.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Connection } from '@/types/connections'

/**
 * Detects emotional resonance using tone overlap.
 * Finds chunks with similar emotional qualities.
 * 
 * @param chunkId - Source chunk ID
 * @param tones - Emotional tones array
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections
 */
export async function findEmotionalResonance(
  chunkId: string,
  tones: string[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  if (tones.length === 0) {
    return []
  }
  
  // Query chunks with overlapping tones
  const { data: candidates, error } = await supabase
    .from('chunks')
    .select('id, metadata, document_id')
    .neq('document_id', documentId)
    .overlaps('metadata->emotional_tone', tones)
  
  if (error) {
    console.error('Emotional engine query failed:', error)
    return []
  }
  
  if (!candidates || candidates.length === 0) {
    return []
  }
  
  const connections: Connection[] = []
  
  for (const candidate of candidates) {
    const candidateTones = (candidate.metadata?.emotional_tone || []) as string[]
    
    // Calculate tone overlap
    const toneOverlap = calculateJaccardSimilarity(
      new Set(tones),
      new Set(candidateTones)
    )
    
    // No threshold - return all matches with tone overlap >0
    if (toneOverlap > 0) {
      const sharedTones = tones.filter(t => candidateTones.includes(t))
      
      connections.push({
        source_chunk_id: chunkId,
        target_chunk_id: candidate.id,
        connection_type: 'emotional_resonance',
        strength: toneOverlap,
        auto_detected: true,
        metadata: {
          engine: 'emotional',
          tone_overlap: toneOverlap,
          shared_tones: sharedTones
        }
      })
    }
  }
  
  return connections
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 20)
}
```

**Code Pattern Reference**: Same Jaccard similarity as previous engines

**Threshold Rationale**: No threshold (return all overlaps) - let user filter with weight sliders

---

#### Engine 6: Methodological Echoes (Analytical Approaches)

**Algorithm**: Method signature comparison

**Implementation**:
```typescript
// worker/lib/engines/methodological.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Connection } from '@/types/connections'

/**
 * Detects methodological echoes using method signature comparison.
 * Finds chunks with similar analytical approaches (dialectical, genealogical, etc.).
 * 
 * @param chunkId - Source chunk ID
 * @param methods - Method signatures array
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections
 */
export async function findMethodologicalEchoes(
  chunkId: string,
  methods: string[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  if (methods.length === 0) {
    return []
  }
  
  // Query all chunks (need to compare methods, no filtering yet)
  const { data: candidates, error } = await supabase
    .from('chunks')
    .select('id, metadata, document_id')
    .neq('document_id', documentId)
  
  if (error) {
    console.error('Methodological engine query failed:', error)
    return []
  }
  
  if (!candidates || candidates.length === 0) {
    return []
  }
  
  const connections: Connection[] = []
  
  for (const candidate of candidates) {
    const candidateMethods = (candidate.metadata?.method_signatures || []) as string[]
    
    if (candidateMethods.length === 0) {
      continue // No methods to compare
    }
    
    // Calculate method similarity
    const methodSimilarity = calculateMethodSimilarity(methods, candidateMethods)
    
    // Filter: methodology similarity ≥0.3
    if (methodSimilarity >= 0.3) {
      const sharedMethods = methods.filter(m => candidateMethods.includes(m))
      
      connections.push({
        source_chunk_id: chunkId,
        target_chunk_id: candidate.id,
        connection_type: 'methodological_echo',
        strength: methodSimilarity,
        auto_detected: true,
        metadata: {
          engine: 'methodological',
          method_similarity: methodSimilarity,
          shared_methods: sharedMethods
        }
      })
    }
  }
  
  return connections
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 20)
}

/**
 * Calculates method similarity using custom weighting.
 * Exact matches weighted higher than partial overlaps.
 */
function calculateMethodSimilarity(methods1: string[], methods2: string[]): number {
  const set1 = new Set(methods1)
  const set2 = new Set(methods2)
  
  // Exact matches
  const exactMatches = methods1.filter(m => set2.has(m)).length
  
  // Partial matches (substring contains)
  let partialMatches = 0
  for (const m1 of methods1) {
    for (const m2 of methods2) {
      if (m1 !== m2 && (m1.includes(m2) || m2.includes(m1))) {
        partialMatches += 0.5 // Half weight for partial
      }
    }
  }
  
  const totalMatches = exactMatches + partialMatches
  const totalMethods = Math.max(methods1.length, methods2.length)
  
  return totalMatches / totalMethods
}
```

**Code Pattern Reference**: Custom similarity metric (not Jaccard)

**Threshold Rationale**: 0.3 minimum (30% method overlap = similar analytical approach)

---

#### Engine 7: Temporal Rhythms (Narrative Patterns)

**Algorithm**: Rhythm analysis (density, momentum, transitions)

**Implementation**:
```typescript
// worker/lib/engines/temporal.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Connection } from '@/types/connections'

/**
 * Detects temporal rhythms using narrative pattern analysis.
 * Analyzes rhythm (buildup, reveal, reflection, etc.) and momentum.
 * 
 * @param chunkId - Source chunk ID
 * @param content - Chunk text content
 * @param themes - Themes array
 * @param documentId - Current document (for exclusion)
 * @param supabase - Supabase client
 * @returns Array of detected connections
 */
export async function findTemporalRhythms(
  chunkId: string,
  content: string,
  themes: string[],
  documentId: string,
  supabase: SupabaseClient
): Promise<Connection[]> {
  // Analyze rhythm of source chunk
  const sourceRhythm = analyzeRhythm(content, themes)
  
  if (!sourceRhythm) {
    return [] // No rhythm detected
  }
  
  // Query all chunks (need to compare rhythms)
  const { data: candidates, error } = await supabase
    .from('chunks')
    .select('id, content, themes, document_id')
    .neq('document_id', documentId)
  
  if (error) {
    console.error('Temporal engine query failed:', error)
    return []
  }
  
  if (!candidates || candidates.length === 0) {
    return []
  }
  
  const connections: Connection[] = []
  
  for (const candidate of candidates) {
    const candidateRhythm = analyzeRhythm(
      candidate.content,
      (candidate.themes || []) as string[]
    )
    
    if (!candidateRhythm) {
      continue
    }
    
    // Calculate rhythm similarity
    const rhythmSimilarity = calculateRhythmSimilarity(sourceRhythm, candidateRhythm)
    
    // Filter: rhythm similarity ≥0.3
    if (rhythmSimilarity >= 0.3) {
      connections.push({
        source_chunk_id: chunkId,
        target_chunk_id: candidate.id,
        connection_type: 'temporal_rhythm',
        strength: rhythmSimilarity,
        auto_detected: true,
        metadata: {
          engine: 'temporal',
          rhythm_similarity: rhythmSimilarity,
          source_rhythm: sourceRhythm,
          target_rhythm: candidateRhythm
        }
      })
    }
  }
  
  return connections
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 20)
}

interface Rhythm {
  pattern: string // 'buildup', 'reveal', 'reflection', 'argument', 'example'
  density: number // themes per sentence
  momentum: number // change rate
}

/**
 * Analyzes narrative rhythm of chunk.
 */
function analyzeRhythm(content: string, themes: string[]): Rhythm | null {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0)
  
  if (sentences.length < 3) {
    return null // Too short for rhythm analysis
  }
  
  // Calculate density (themes per sentence)
  const density = themes.length / sentences.length
  
  // Detect pattern (heuristic based on sentence structure)
  let pattern: string
  if (content.includes('therefore') || content.includes('thus') || content.includes('because')) {
    pattern = 'argument'
  } else if (content.includes('for example') || content.includes('such as') || content.includes('instance')) {
    pattern = 'example'
  } else if (content.includes('however') || content.includes('but') || content.includes('although')) {
    pattern = 'reveal'
  } else if (content.includes('consider') || content.includes('imagine') || content.includes('suppose')) {
    pattern = 'buildup'
  } else {
    pattern = 'reflection'
  }
  
  // Calculate momentum (simplified: density * sentence count)
  const momentum = density * sentences.length
  
  return { pattern, density, momentum }
}

/**
 * Calculates rhythm similarity.
 */
function calculateRhythmSimilarity(rhythm1: Rhythm, rhythm2: Rhythm): number {
  // Pattern match (exact = 0.5, different = 0.0)
  const patternScore = rhythm1.pattern === rhythm2.pattern ? 0.5 : 0.0
  
  // Density similarity (normalized difference)
  const densityDiff = Math.abs(rhythm1.density - rhythm2.density)
  const densityScore = Math.max(0, 1 - densityDiff) * 0.3
  
  // Momentum similarity (normalized difference)
  const momentumDiff = Math.abs(rhythm1.momentum - rhythm2.momentum)
  const momentumScore = Math.max(0, 1 - momentumDiff / 10) * 0.2
  
  return patternScore + densityScore + momentumScore
}
```

**Code Pattern Reference**: Custom heuristic algorithm

**Threshold Rationale**: 0.3 minimum (30% rhythm similarity = similar narrative flow)

---

### Week 4: Parallel Execution Pipeline

**File**: `worker/handlers/detect-connections.ts` (NEW)

**Implementation**:
```typescript
import { createClient } from '@supabase/supabase-js'
import { findSemanticMatches } from '../lib/engines/semantic'
import { findThematicBridges } from '../lib/engines/thematic'
import { findStructuralIsomorphisms } from '../lib/engines/structural'
import { findContradictions } from '../lib/engines/contradiction'
import { findEmotionalResonance } from '../lib/engines/emotional'
import { findMethodologicalEchoes } from '../lib/engines/methodological'
import { findTemporalRhythms } from '../lib/engines/temporal'
import type { Connection } from '@/types/connections'

/**
 * Main connection detection handler.
 * Runs all 7 engines in parallel and stores results.
 */
export async function detectConnectionsHandler(supabase: any, job: any) {
  const { document_id } = job.input_data
  
  try {
    // Update progress: Starting detection
    await updateProgress(supabase, job.id, 10, 'detection', 'starting', 'Loading chunks...')
    
    // 1. Query all chunks for document
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', document_id)
      .order('chunk_index', { ascending: true })
    
    if (chunksError) {
      throw new Error(`Failed to load chunks: ${chunksError.message}`)
    }
    
    if (!chunks || chunks.length === 0) {
      throw new Error('No chunks found for document')
    }
    
    await updateProgress(supabase, job.id, 20, 'detection', 'engines', `Processing ${chunks.length} chunks...`)
    
    // 2. Get user synthesis config
    const { data: config } = await supabase
      .from('user_synthesis_config')
      .select('*')
      .eq('user_id', job.user_id)
      .single()
    
    const weights = config?.weights || DEFAULT_WEIGHTS
    const maxPerChunk = config?.max_connections_per_chunk || 50
    const maxPerEngine = config?.max_connections_per_engine || 10
    
    // 3. Run all 7 engines in parallel for each chunk
    const allConnections: Connection[] = []
    const chunkCount = chunks.length
    
    for (let i = 0; i < chunkCount; i++) {
      const chunk = chunks[i]
      
      // Run 7 engines in parallel
      const engineResults = await Promise.all([
        findSemanticMatches(
          chunk.id,
          chunk.embedding,
          document_id,
          supabase
        ).catch(err => {
          console.error('Engine 1 (semantic) failed:', err)
          return []
        }),
        
        findThematicBridges(
          chunk.id,
          chunk.themes || [],
          chunk.metadata?.structural_patterns || [],
          document_id,
          supabase
        ).catch(err => {
          console.error('Engine 2 (thematic) failed:', err)
          return []
        }),
        
        findStructuralIsomorphisms(
          chunk.id,
          chunk.metadata?.structural_patterns || [],
          document_id,
          supabase
        ).catch(err => {
          console.error('Engine 3 (structural) failed:', err)
          return []
        }),
        
        findContradictions(
          chunk.id,
          chunk.metadata?.emotional_tone || [],
          chunk.metadata?.key_concepts || [],
          document_id,
          supabase
        ).catch(err => {
          console.error('Engine 4 (contradiction) failed:', err)
          return []
        }),
        
        findEmotionalResonance(
          chunk.id,
          chunk.metadata?.emotional_tone || [],
          document_id,
          supabase
        ).catch(err => {
          console.error('Engine 5 (emotional) failed:', err)
          return []
        }),
        
        findMethodologicalEchoes(
          chunk.id,
          chunk.metadata?.method_signatures || [],
          document_id,
          supabase
        ).catch(err => {
          console.error('Engine 6 (methodological) failed:', err)
          return []
        }),
        
        findTemporalRhythms(
          chunk.id,
          chunk.content,
          chunk.themes || [],
          document_id,
          supabase
        ).catch(err => {
          console.error('Engine 7 (temporal) failed:', err)
          return []
        })
      ])
      
      // Flatten engine results
      const chunkConnections = engineResults.flat()
      
      // Apply weighted scoring
      const scoredConnections = chunkConnections.map(conn => ({
        ...conn,
        weighted_score: conn.strength * weights[conn.metadata.engine]
      }))
      
      // Apply limits: top 50 per chunk, top 10 per engine
      const limitedConnections = applyConnectionLimits(
        scoredConnections,
        maxPerChunk,
        maxPerEngine
      )
      
      allConnections.push(...limitedConnections)
      
      // Update progress every 10 chunks
      if (i % 10 === 0 || i === chunkCount - 1) {
        const progress = 20 + Math.floor((i / chunkCount) * 60)
        await updateProgress(
          supabase,
          job.id,
          progress,
          'detection',
          'engines',
          `${i + 1}/${chunkCount} chunks processed`
        )
      }
    }
    
    await updateProgress(supabase, job.id, 85, 'detection', 'storing', 'Saving connections...')
    
    // 4. Batch insert connections (1000 at a time)
    const BATCH_SIZE = 1000
    for (let i = 0; i < allConnections.length; i += BATCH_SIZE) {
      const batch = allConnections.slice(i, i + BATCH_SIZE)
      
      // Prepare for insert
      const inserts = batch.map(conn => ({
        user_id: job.user_id,
        source_chunk_id: conn.source_chunk_id,
        target_chunk_id: conn.target_chunk_id,
        connection_type: conn.connection_type,
        strength: conn.strength,
        auto_detected: conn.auto_detected,
        metadata: conn.metadata
      }))
      
      const { error: insertError } = await supabase
        .from('connections')
        .insert(inserts)
      
      if (insertError) {
        console.error(`Batch ${i} failed:`, insertError)
        // Continue with next batch
      }
      
      const progress = 85 + Math.floor((i / allConnections.length) * 10)
      await updateProgress(
        supabase,
        job.id,
        progress,
        'detection',
        'storing',
        `${i + batch.length}/${allConnections.length} connections saved`
      )
    }
    
    // 5. Mark job complete
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: {
          percent: 100,
          stage: 'complete',
          details: `${allConnections.length} connections detected`
        }
      })
      .eq('id', job.id)
    
    console.log(`✅ Connection detection complete: ${allConnections.length} connections`)
    
  } catch (error) {
    console.error('Connection detection failed:', error)
    
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        last_error: (error as Error).message
      })
      .eq('id', job.id)
  }
}

/**
 * Applies connection limits per chunk and per engine.
 */
function applyConnectionLimits(
  connections: Connection[],
  maxPerChunk: number,
  maxPerEngine: number
): Connection[] {
  // Group by engine
  const byEngine: Record<string, Connection[]> = {}
  for (const conn of connections) {
    const engine = conn.metadata.engine
    if (!byEngine[engine]) {
      byEngine[engine] = []
    }
    byEngine[engine].push(conn)
  }
  
  // Take top N per engine
  const limited: Connection[] = []
  for (const engine in byEngine) {
    const engineConns = byEngine[engine]
      .sort((a, b) => b.weighted_score - a.weighted_score)
      .slice(0, maxPerEngine)
    limited.push(...engineConns)
  }
  
  // Take top N overall (by weighted score)
  return limited
    .sort((a, b) => b.weighted_score - a.weighted_score)
    .slice(0, maxPerChunk)
}

async function updateProgress(
  supabase: any,
  jobId: string,
  percent: number,
  stage: string,
  substage?: string,
  details?: string
) {
  await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent,
        stage,
        substage,
        details,
        updated_at: new Date().toISOString()
      }
    })
    .eq('id', jobId)
}

const DEFAULT_WEIGHTS = {
  semantic: 0.3,
  thematic: 0.9,
  structural: 0.7,
  contradiction: 1.0,
  emotional: 0.4,
  methodological: 0.8,
  temporal: 0.2
}
```

**Code Pattern Reference**:
- Background job handler: `worker/handlers/process-document.ts` lines 41-695
- Progress updates: `updateProgress()` pattern from process-document.ts
- Error handling: Catch individual engine failures, continue processing

---

### Week 5: Integration Testing

**Integration Pattern**: Replace mock data in reader UI

**File**: `src/app/read/[id]/page.tsx` (MODIFY)

**Changes**:
```typescript
// EXISTING: Document and chunks query
const { data: chunks } = await supabase
  .from('chunks')
  .select('*')
  .eq('document_id', params.id)
  .order('chunk_index', { ascending: true })

// ADD: Query connections for document
const { data: rawConnections } = await supabase
  .from('connections')
  .select('*')
  .or(`source_chunk_id.in.(${chunks.map(c => c.id).join(',')}),target_chunk_id.in.(${chunks.map(c => c.id).join(',')})`)

// ADD: Get user weights
const { data: config } = await supabase
  .from('user_synthesis_config')
  .select('weights')
  .eq('user_id', userId)
  .single()

// ADD: Apply weights to connections
const connections = rawConnections.map(conn => ({
  ...conn,
  weighted_score: conn.strength * (config?.weights[conn.metadata.engine] || 1.0)
}))

// MODIFY: Pass connections to DocumentViewer
return (
  <DocumentViewer
    documentId={params.id}
    markdownUrl={signedUrl}
    chunks={chunks}
    annotations={annotations}
    connections={connections} // NEW: Real connections
  />
)
```

**Right Panel Component**: `src/components/reader/RightPanel.tsx` (MODIFY)

**Changes**:
```typescript
'use client'

import { useMemo } from 'react'
import { useAnnotationStore } from '@/stores/annotation-store'
import type { Connection } from '@/types/connections'

interface RightPanelProps {
  connections: Connection[] // FROM: Server Component query
}

export function RightPanel({ connections }: RightPanelProps) {
  const { weights, strengthThreshold, enabledEngines } = useAnnotationStore()
  
  // Client-side re-ranking (memoized for performance)
  const filteredConnections = useMemo(() => {
    return connections
      .map(conn => ({
        ...conn,
        weighted_score: conn.strength * weights[conn.metadata.engine]
      }))
      .filter(conn => 
        conn.weighted_score >= strengthThreshold &&
        enabledEngines.has(conn.metadata.engine)
      )
      .sort((a, b) => b.weighted_score - a.weighted_score)
  }, [connections, weights, strengthThreshold, enabledEngines])
  
  // Group by engine
  const byEngine = useMemo(() => {
    const grouped: Record<string, Connection[]> = {}
    for (const conn of filteredConnections) {
      const engine = conn.metadata.engine
      if (!grouped[engine]) {
        grouped[engine] = []
      }
      grouped[engine].push(conn)
    }
    return grouped
  }, [filteredConnections])
  
  return (
    <div className="h-full flex flex-col">
      {/* Weight tuning sliders */}
      <WeightTuningPanel />
      
      {/* Connection display */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(byEngine).map(([engine, conns]) => (
          <ConnectionGroup
            key={engine}
            engine={engine}
            connections={conns}
          />
        ))}
      </div>
    </div>
  )
}
```

**Code Pattern Reference**:
- Memoization: `useMemo()` for re-ranking (<100ms target)
- Zustand store: `useAnnotationStore()` for client state
- Server Component query: Pass connections as props

---

### Week 6: Validation Learning System

**Server Action**: `src/app/actions/connections.ts` (NEW)

**Implementation**:
```typescript
'use server'

import { getCurrentUser, getSupabaseClient } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Records user validation feedback for a connection.
 */
export async function validateConnection(
  connectionId: string,
  action: 'validated' | 'rejected' | 'starred',
  context: {
    reading_document_id: string
    time_of_day: 'morning' | 'afternoon' | 'evening'
    day_of_week: string
    current_mode: 'reading' | 'writing'
    time_spent_ms: number
  },
  note?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    const supabase = getSupabaseClient()
    
    // Insert feedback
    const { error } = await supabase
      .from('connection_feedback')
      .insert({
        user_id: user.id,
        connection_id: connectionId,
        action,
        context,
        note
      })
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    // If starred, create temporary weight boost
    if (action === 'starred') {
      // Get connection to find engine
      const { data: connection } = await supabase
        .from('connections')
        .select('metadata')
        .eq('id', connectionId)
        .single()
      
      if (connection) {
        const engine = connection.metadata.engine
        
        // Create 2x multiplier for 24 hours
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 24)
        
        await supabase
          .from('weight_contexts')
          .upsert({
            user_id: user.id,
            context: 'starred_boost',
            engine,
            weight_multiplier: 2.0,
            expires_at: expiresAt.toISOString()
          })
      }
    }
    
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}
```

**Validation Dashboard**: `src/app/synthesis/page.tsx` (NEW)

**Implementation**:
```typescript
import { getCurrentUser, getSupabaseClient } from '@/lib/auth'

export default async function SynthesisPage() {
  const user = await getCurrentUser()
  const supabase = getSupabaseClient()
  
  // Query feedback stats
  const { data: feedback } = await supabase
    .from('connection_feedback')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  
  // Group by engine
  const byEngine: Record<string, { validated: number; rejected: number; starred: number }> = {}
  
  for (const fb of feedback || []) {
    const { data: conn } = await supabase
      .from('connections')
      .select('metadata')
      .eq('id', fb.connection_id)
      .single()
    
    if (conn) {
      const engine = conn.metadata.engine
      if (!byEngine[engine]) {
        byEngine[engine] = { validated: 0, rejected: 0, starred: 0 }
      }
      
      if (fb.action === 'validated') byEngine[engine].validated++
      if (fb.action === 'rejected') byEngine[engine].rejected++
      if (fb.action === 'starred') byEngine[engine].starred++
    }
  }
  
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Validation Dashboard</h1>
      
      <div className="grid grid-cols-2 gap-8">
        {/* Stats per engine */}
        {Object.entries(byEngine).map(([engine, stats]) => (
          <div key={engine} className="border p-4 rounded-lg">
            <h2 className="text-xl font-semibold capitalize">{engine}</h2>
            <p>Validated: {stats.validated}</p>
            <p>Rejected: {stats.rejected}</p>
            <p>Starred: {stats.starred}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Validation Rate: {Math.round((stats.validated / (stats.validated + stats.rejected)) * 100)}%
            </p>
          </div>
        ))}
      </div>
      
      {/* Recent feedback */}
      <div className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">Recent Validations</h2>
        {feedback?.slice(0, 20).map(fb => (
          <div key={fb.id} className="border-b py-2">
            <p className="font-medium">{fb.action}</p>
            <p className="text-sm text-muted-foreground">
              {new Date(fb.created_at).toLocaleString()}
            </p>
            {fb.note && <p className="text-sm mt-1">{fb.note}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Code Pattern Reference**:
- Server Component: Default export, no 'use client'
- Query patterns: From `src/app/read/[id]/page.tsx`

---

### Week 7: Obsidian Bidirectional Sync

**Sync Function**: `worker/lib/obsidian-sync.ts` (NEW)

**Implementation**:
```typescript
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Syncs document to Obsidian vault with companion section.
 * Rhizome is source of truth (overwrites Obsidian on conflict).
 */
export async function syncToObsidian(
  documentId: string,
  userId: string,
  obsidianVaultPath: string,
  supabase: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get document metadata
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('title, storage_path')
      .eq('id', documentId)
      .single()
    
    if (docError || !doc) {
      return { success: false, error: 'Document not found' }
    }
    
    // 2. Download markdown from storage
    const { data: markdownData, error: downloadError } = await supabase
      .storage
      .from('documents')
      .download(`${doc.storage_path}/content.md`)
    
    if (downloadError) {
      return { success: false, error: downloadError.message }
    }
    
    const originalMarkdown = await markdownData.text()
    
    // 3. Query strong connections (≥0.8 strength)
    const { data: connections } = await supabase
      .from('connections')
      .select(`
        *,
        target_chunk:chunks!target_chunk_id(id, document_id),
        target_doc:documents!target_chunk.document_id(title)
      `)
      .or(`source_chunk_id.in.(SELECT id FROM chunks WHERE document_id = '${documentId}')`)
      .gte('strength', 0.8)
      .order('strength', { ascending: false })
    
    // 4. Build companion section
    const companionSection = buildCompanionSection(
      documentId,
      connections || [],
      doc.title
    )
    
    // 5. Merge with original markdown
    const mergedMarkdown = mergeCompanionSection(originalMarkdown, companionSection)
    
    // 6. Write to Obsidian vault
    const fs = await import('fs/promises')
    const path = await import('path')
    const obsidianPath = path.join(obsidianVaultPath, `${doc.title}.md`)
    
    // Backup if file exists
    try {
      const existing = await fs.readFile(obsidianPath, 'utf-8')
      const backupPath = path.join(obsidianVaultPath, `.backups`, `${doc.title}-${Date.now()}.md`)
      await fs.mkdir(path.dirname(backupPath), { recursive: true })
      await fs.writeFile(backupPath, existing)
    } catch (err) {
      // File doesn't exist, no backup needed
    }
    
    // Write merged markdown
    await fs.writeFile(obsidianPath, mergedMarkdown)
    
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

function buildCompanionSection(
  documentId: string,
  connections: any[],
  title: string
): string {
  const icons: Record<string, string> = {
    contradiction: '⚡',
    cross_domain_bridge: '🌉',
    structural_isomorphism: '🏗️',
    semantic_similarity: '🔗',
    emotional_resonance: '💭',
    methodological_echo: '🔧',
    temporal_rhythm: '⏱️'
  }
  
  let section = `\n\n---\n\n## Rhizome Connections\n\n`
  section += `<!-- AUTO-GENERATED - DO NOT EDIT BELOW THIS LINE -->\n\n`
  
  for (const conn of connections) {
    const icon = icons[conn.connection_type] || '🔗'
    const targetTitle = conn.target_doc?.title || 'Unknown Document'
    const strength = conn.strength.toFixed(2)
    const typeLabel = conn.connection_type.replace(/_/g, ' ')
    
    section += `- ${icon} [[${targetTitle}]] - (${strength}) ${typeLabel}\n`
  }
  
  section += `\n**Metadata**:\n`
  section += `- Rhizome ID: \`${documentId}\`\n`
  section += `- Connection Count: ${connections.length}\n`
  section += `- Last Synced: ${new Date().toISOString()}\n`
  
  return section
}

function mergeCompanionSection(original: string, companion: string): string {
  // Check if companion section already exists
  const sectionMarker = '## Rhizome Connections'
  const existingIndex = original.indexOf(sectionMarker)
  
  if (existingIndex !== -1) {
    // Replace existing section
    return original.substring(0, existingIndex) + companion
  } else {
    // Append to end
    return original + companion
  }
}
```

**Code Pattern Reference**:
- File I/O: Node.js `fs/promises` API
- Storage download: `supabase.storage.from().download()`
- Conflict resolution: Rhizome overwrites Obsidian (source of truth)

**Obsidian Integration**:
- Wikilinks: `[[Target Doc]]` format (Obsidian auto-detects)
- Graph view: Wikilinks appear as connections in Obsidian graph
- Metadata: YAML frontmatter preserved (not modified)

---

### Week 8: Weight Auto-Tuning & Personal Model

**Nightly Job**: `worker/jobs/auto-tune-weights.ts` (NEW)

**Implementation**:
```typescript
import { createClient } from '@supabase/supabase-js'

/**
 * Auto-tunes user weights based on last 30 days of feedback.
 * Runs nightly at 3am via cron job.
 */
export async function autoTuneWeights(userId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  try {
    // 1. Get last 30 days of feedback
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const { data: feedback } = await supabase
      .from('connection_feedback')
      .select(`
        *,
        connection:connections(metadata)
      `)
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString())
    
    if (!feedback || feedback.length < 30) {
      console.log(`User ${userId}: Not enough feedback (<30), skipping auto-tune`)
      return
    }
    
    // 2. Calculate adjustments per engine
    const byEngine: Record<string, { validated: number; rejected: number; starred: number }> = {}
    
    for (const fb of feedback) {
      const engine = fb.connection?.metadata?.engine
      if (!engine) continue
      
      if (!byEngine[engine]) {
        byEngine[engine] = { validated: 0, rejected: 0, starred: 0 }
      }
      
      if (fb.action === 'validated') byEngine[engine].validated++
      if (fb.action === 'rejected') byEngine[engine].rejected++
      if (fb.action === 'starred') byEngine[engine].starred++
    }
    
    // 3. Get current weights
    const { data: config } = await supabase
      .from('user_synthesis_config')
      .select('weights')
      .eq('user_id', userId)
      .single()
    
    const currentWeights = config?.weights || DEFAULT_WEIGHTS
    const newWeights: Record<string, number> = { ...currentWeights }
    
    // 4. Adjust weights
    for (const engine in byEngine) {
      const stats = byEngine[engine]
      const total = stats.validated + stats.rejected + stats.starred
      
      if (total < 5) {
        continue // Not enough data for this engine
      }
      
      // Calculate score: validated * 1 + starred * 2 - rejected * 1
      const score = (stats.validated + stats.starred * 2 - stats.rejected) / total
      
      // Adjustment: ±0.1 max per cycle
      const adjustment = score * 0.1
      
      // Apply adjustment with clamping [0.1, 1.0]
      const oldWeight = currentWeights[engine]
      const newWeight = Math.max(0.1, Math.min(1.0, oldWeight + adjustment))
      newWeights[engine] = newWeight
      
      console.log(`Engine ${engine}: ${oldWeight.toFixed(2)} → ${newWeight.toFixed(2)} (score: ${score.toFixed(2)})`)
    }
    
    // 5. Update config
    await supabase
      .from('user_synthesis_config')
      .update({ weights: newWeights, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    
    console.log(`✅ Auto-tuned weights for user ${userId}`)
    
  } catch (error) {
    console.error(`Auto-tune failed for user ${userId}:`, error)
  }
}

const DEFAULT_WEIGHTS = {
  semantic: 0.3,
  thematic: 0.9,
  structural: 0.7,
  contradiction: 1.0,
  emotional: 0.4,
  methodological: 0.8,
  temporal: 0.2
}
```

**Cron Setup**: `worker/index.ts` (MODIFY)

**Add to main worker loop**:
```typescript
import cron from 'node-cron'
import { autoTuneWeights } from './jobs/auto-tune-weights'

// Schedule nightly at 3am
cron.schedule('0 3 * * *', async () => {
  console.log('Running nightly auto-tune job...')
  
  // Get all active users
  const { data: users } = await supabase
    .from('user_synthesis_config')
    .select('user_id')
  
  for (const user of users || []) {
    await autoTuneWeights(user.user_id)
  }
  
  console.log('Auto-tune job complete')
})
```

**Personal Model** (EXPERIMENTAL): `worker/jobs/train-personal-model.ts` (NEW)

**Implementation**:
```typescript
import { createClient } from '@supabase/supabase-js'

/**
 * Trains personal model for connection ranking.
 * EXPERIMENTAL: Requires 100+ validations minimum.
 */
export async function trainPersonalModel(userId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  try {
    // 1. Get all feedback with connection metadata
    const { data: feedback } = await supabase
      .from('connection_feedback')
      .select(`
        *,
        connection:connections(
          strength,
          connection_type,
          metadata
        )
      `)
      .eq('user_id', userId)
    
    if (!feedback || feedback.length < 100) {
      console.log(`User ${userId}: Not enough feedback (<100), skipping model training`)
      return
    }
    
    // 2. Extract features
    const features: number[][] = []
    const labels: number[] = []
    
    for (const fb of feedback) {
      if (!fb.connection) continue
      
      // Features: [engine_id, strength, time_of_day_id, day_of_week_id, mode_id]
      const engineId = ENGINE_IDS[fb.connection.metadata.engine] || 0
      const strength = fb.connection.strength
      const timeOfDayId = TIME_IDS[fb.context.time_of_day] || 0
      const dayOfWeekId = DAY_IDS[fb.context.day_of_week] || 0
      const modeId = fb.context.current_mode === 'reading' ? 0 : 1
      
      features.push([engineId, strength, timeOfDayId, dayOfWeekId, modeId])
      
      // Labels: validated/starred = 1, rejected = 0
      labels.push((fb.action === 'validated' || fb.action === 'starred') ? 1 : 0)
    }
    
    // 3. Train simple logistic regression (using external library)
    // NOTE: Requires ml-logistic-regression library
    const { LogisticRegression } = await import('ml-logistic-regression')
    const model = new LogisticRegression({ numSteps: 1000, learningRate: 0.01 })
    model.train(features, labels)
    
    // 4. Evaluate accuracy
    const predictions = model.predict(features)
    const correct = predictions.filter((p: number, i: number) => p === labels[i]).length
    const accuracy = correct / labels.length
    
    console.log(`Model accuracy: ${(accuracy * 100).toFixed(1)}%`)
    
    if (accuracy < 0.7) {
      console.log(`Accuracy too low (<70%), not saving model`)
      return
    }
    
    // 5. Save model to database
    await supabase
      .from('user_models')
      .upsert({
        user_id: userId,
        model_type: 'logistic_regression',
        model_data: model.toJSON(),
        accuracy,
        trained_on: features.length,
        last_trained_at: new Date().toISOString()
      })
    
    console.log(`✅ Trained personal model for user ${userId}`)
    
  } catch (error) {
    console.error(`Model training failed for user ${userId}:`, error)
  }
}

const ENGINE_IDS: Record<string, number> = {
  semantic: 0,
  thematic: 1,
  structural: 2,
  contradiction: 3,
  emotional: 4,
  methodological: 5,
  temporal: 6
}

const TIME_IDS: Record<string, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2
}

const DAY_IDS: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
}
```

**Code Pattern Reference**: Machine learning integration (experimental)

**Minimum Dataset**: 100 validations (user preference from clarification)

---

## Validation Gates

### End of Week 3 Gate
**Requirements**:
- [ ] All 7 engines implemented with unit tests
- [ ] Each engine returns valid Connection[] format
- [ ] Engines tested independently with real document chunks
- [ ] Detection time <1s per engine (7s total acceptable)
- [ ] No errors or exceptions during detection
- [ ] `npm run build` passes
- [ ] `npm run lint` passes

**Blocker Criteria**: If any engine fails or >5s detection time, do NOT proceed to Week 4

### End of Week 4 Gate
**Requirements**:
- [ ] Parallel pipeline runs all 7 engines with Promise.all()
- [ ] Connection storage with limits working (50/chunk, 10/engine)
- [ ] Background job integration complete
- [ ] ProcessingDock shows connection detection progress
- [ ] Total detection time <5s for typical document (50 chunks)
- [ ] Database queries optimized (indexes created)

### End of Week 5 Gate
**Requirements**:
- [ ] Mock data removed from reader
- [ ] Real connections display in right panel
- [ ] Weight sliders affect connection ranking (<100ms)
- [ ] Connection filtering by engine works
- [ ] 10 diverse documents tested (philosophy, biology, technical, etc.)
- [ ] Cross-domain bridges detected
- [ ] Contradictions detected
- [ ] No data loss on document re-processing

### End of Week 6 Gate
**Requirements**:
- [ ] Validation capture stores to database
- [ ] Rich context captured (time_of_day, mode, time_spent_ms)
- [ ] Validation dashboard displays stats per engine
- [ ] Starred connections boost engine weight (2x for 24h)
- [ ] 50+ real validations captured (dogfooding)
- [ ] No blocking bugs

### End of Week 7 Gate
**Requirements**:
- [ ] Obsidian sync generates companion section
- [ ] Wikilinks visible in Obsidian graph view
- [ ] Sync completes <2s per document
- [ ] Non-destructive (original content preserved)
- [ ] Conflict resolution works (Rhizome overwrites)
- [ ] Backup system working

### End of Week 8 Gate
**Requirements**:
- [ ] Weight auto-tuning adjusts weights based on 30-day feedback
- [ ] Weights clamp to [0.1, 1.0]
- [ ] Changes logged for transparency
- [ ] (Optional) Personal model achieves >70% accuracy
- [ ] (Optional) Model blending works (70/30)
- [ ] All Week 3-8 features operational

---

## Risk Mitigation

### Technical Risks

**Risk: 7 engines take >5s to run in parallel**
- **Mitigation**: Profile each engine with `console.time()`, optimize slow engines (add indexes, cache calculations)
- **Fallback**: Increase timeout to 10s, or run engines sequentially (accept 15s)

**Risk: JSONB operators not supported**
- **Mitigation**: Test PostgreSQL version (Supabase uses v15+, supports all operators)
- **Fallback**: Fetch all chunks, filter in application layer (slower but works)

**Risk: pgvector performance degrades with 10,000+ chunks**
- **Mitigation**: IVFFlat index already exists, tune parameters (lists, probes)
- **Fallback**: Limit semantic similarity to top 1000 candidates before sorting

**Risk: Weight auto-tuning makes connections worse**
- **Mitigation**: Conservative ±0.1 adjustment, manual override always available
- **Fallback**: Disable auto-tuning, keep manual tuning only

**Risk: Personal model overfits to recent behavior**
- **Mitigation**: Simple model (logistic regression), blend with weighted scoring (70/30)
- **Fallback**: Disable personal model, use weighted scoring only

### Business Risks

**Risk: 7 engines don't provide enough value vs 3 engines**
- **Mitigation**: Track validation rates per engine in Week 6, deprecate low-value engines
- **Fallback**: Keep top 5 engines, disable 2 lowest-performing

**Risk: Obsidian sync breaks user's vault**
- **Mitigation**: Backup original markdown before syncing, non-destructive companion section
- **Fallback**: Manual export to separate folder if auto-sync causes issues

**Risk: Learning system doesn't adapt to personal preferences**
- **Mitigation**: Start with explicit tracking (Week 6), defer auto-tuning until 30 days data
- **Fallback**: Keep manual tuning as primary interface, auto-tuning as "suggestion"

---

## Performance Targets

| Operation | Target | Measurement Method |
|-----------|--------|-------------------|
| Connection detection (total) | <5s | `console.time()` in worker |
| Individual engine | <1s | `console.time()` per engine |
| Weight re-ranking (client) | <100ms | `performance.now()` in React |
| Obsidian sync | <2s | `console.time()` in sync function |
| Personal model training | <10s | `console.time()` in training job |

---

## Testing Strategy

### Unit Tests (Week 3)

**Per Engine**:
```typescript
// worker/__tests__/engines/semantic.test.ts
describe('Semantic Engine', () => {
  test('detects high similarity connections', async () => {
    const connections = await findSemanticMatches(testChunk, testEmbedding, testDoc, supabase)
    expect(connections.length).toBeGreaterThan(0)
    expect(connections[0].strength).toBeGreaterThan(0.7)
  })
  
  test('excludes same document', async () => {
    const connections = await findSemanticMatches(testChunk, testEmbedding, testDoc, supabase)
    expect(connections.every(c => c.target_chunk_id !== testChunk)).toBe(true)
  })
  
  test('handles empty results gracefully', async () => {
    const connections = await findSemanticMatches(testChunk, zeroEmbedding, testDoc, supabase)
    expect(connections).toEqual([])
  })
})
```

**Coverage Target**: 80% per engine

### Integration Tests (Week 5)

**Test Documents**:
1. Philosophy paper (Foucault)
2. Biology paper (genetics)
3. Technical documentation (React)
4. YouTube transcript (philosophy lecture)
5. Web article (economics)

**Validation**:
- Cross-domain bridges found (philosophy ↔ biology)
- Contradictions found (opposing views on ethics)
- Connection density ~50/chunk
- Detection time <5s

### Manual Dogfooding (Week 6)

**Protocol**:
1. Process 3 documents
2. Create 10+ annotations per document
3. Validate 20+ connections with v/r/s keys
4. Adjust weight sliders, observe re-ranking
5. Apply all 4 presets
6. Document UX friction points

---

## Definition of Done

### Functional Completeness
- [ ] All 7 engines operational and tested
- [ ] Parallel execution pipeline <5s
- [ ] Connection storage with limits working
- [ ] Real connections display in reader
- [ ] Weight tuning re-ranks in real-time (<100ms)
- [ ] Validation capture stores feedback reliably
- [ ] Obsidian sync generates companion section correctly
- [ ] Weight auto-tuning adjusts based on 30-day feedback
- [ ] (Optional) Personal model training works with >70% accuracy

### Quality Gates
- [ ] `npm run build` passes (TypeScript strict mode)
- [ ] `npm run lint` passes (JSDoc on all exports)
- [ ] All acceptance criteria met
- [ ] Performance targets met (<5s detection, <100ms re-ranking, <2s sync)
- [ ] No P0/P1 blocking bugs
- [ ] Integration tests pass
- [ ] Manual dogfooding completed

### Documentation
- [ ] JSDoc on all exported functions
- [ ] Code comments on complex logic (engine algorithms)
- [ ] Migration scripts documented
- [ ] User guide for weight tuning
- [ ] Obsidian sync instructions

### Handoff Readiness
- [ ] Connection schema matches real data
- [ ] Validation feedback structure finalized
- [ ] Learning system operational (auto-tuning + optional model)
- [ ] Obsidian integration documented
- [ ] No data loss during re-processing (version tracking)

---

## Resources & References

### Primary Codebase References

**Existing Patterns to Reuse**:
- Background job pipeline: `worker/handlers/process-document.ts` (lines 41-695)
- Batch embedding generation: `worker/lib/embeddings.ts` (lines 55-157)
- pgvector similarity: `supabase/migrations/001_initial_schema.sql` (match_chunks RPC)
- ECS entity creation: `src/lib/ecs/ecs.ts` (lines 27-76)
- Server Action pattern: `src/app/actions/documents.ts` (lines 45-193)
- Fuzzy matching (Jaccard): `worker/lib/fuzzy-matching.ts` (lines 100-147)
- Real-time subscriptions: `src/components/layout/ProcessingDock.tsx` (lines 111-156)

**Database Schemas**:
- chunks table: `supabase/migrations/001_initial_schema.sql` (lines 272-301)
- connections table: `supabase/migrations/001_initial_schema.sql` (lines 92-108)
- New migrations: 016-020 (user_synthesis_config, connection_feedback, weight_contexts, user_models)

**Test Infrastructure**:
- Jest setup: `worker/__tests__/embeddings.test.ts`
- Integration patterns: `worker/__tests__/multi-format-integration.test.ts`

### External Documentation

**PostgreSQL**:
- JSONB operators: https://www.postgresql.org/docs/current/functions-json.html
- pgvector: https://github.com/pgvector/pgvector
- IVFFlat index tuning: https://github.com/pgvector/pgvector#ivfflat

**Machine Learning** (Personal Model):
- Logistic Regression: https://www.npmjs.com/package/ml-logistic-regression
- Model serialization: JSONB storage in PostgreSQL

**Cron Jobs**:
- node-cron: https://www.npmjs.com/package/node-cron
- Scheduling patterns: Nightly at 3am (`0 3 * * *`)

**Obsidian**:
- Wikilinks: https://help.obsidian.md/Linking+notes+and+files/Internal+links
- Graph view: https://help.obsidian.md/Plugins/Graph+view

### Design Resources

**Connection Type Icons**:
```typescript
{
  'contradiction': '⚡',
  'cross_domain_bridge': '🌉',
  'structural_isomorphism': '🏗️',
  'semantic_similarity': '🔗',
  'emotional_resonance': '💭',
  'methodological_echo': '🔧',
  'temporal_rhythm': '⏱️'
}
```

**UI Components**:
- Slider: Weight tuning (shadcn/ui)
- Badge: Connection type indicators
- Tabs: Validation dashboard sections
- Progress: Detection progress bar
- HoverCard: Connection previews

---

## Anti-Patterns to Avoid

### Architecture
- ❌ **Storing connections in ECS**: Use dedicated connections table (queries are simpler)
- ❌ **Bidirectional connection duplicates**: Store only A→B, query both directions at read time
- ❌ **Sequential engine execution**: Use Promise.all() for parallel execution
- ❌ **No connection limits**: Apply 50/chunk and 10/engine limits to prevent database bloat

### Performance
- ❌ **Client-side weight tuning with database queries**: Memoize filtered connections, no re-query
- ❌ **No query optimization**: Add indexes on user_id, source_entity_id, target_entity_id, strength
- ❌ **Batch size too large**: Keep batches ≤1000 rows (PostgreSQL parameter limit)
- ❌ **No progress updates**: Update progress every 10 chunks (user feedback)

### Data Integrity
- ❌ **No version tracking**: Add version_id to connections table for re-processing scenarios
- ❌ **Cascade deletes unhandled**: Add ON DELETE CASCADE for connections when chunks deleted
- ❌ **No deduplication**: Check for duplicate connections (same source/target/type)

---

## Confidence Assessment

**Overall Confidence**: 8/10

**Strengths**:
- Existing patterns cover 60% of implementation (pgvector, ECS, background jobs, Jaccard similarity)
- Clear architecture with proven patterns
- Comprehensive codebase research (88.52% test coverage on fuzzy matching)
- Realistic timeline with validation gates

**Risks**:
- JSONB operators need verification (Medium risk, fallback available)
- 7 engines in parallel may timeout (Medium risk, can optimize or increase timeout)
- Personal model experimental (Low risk, optional feature)
- Obsidian sync file I/O (Low risk, simple implementation)

**Unknowns**:
- Actual detection time per engine (need profiling in Week 3)
- Connection quality (need Week 5 validation with diverse documents)
- Learning system effectiveness (need 30 days feedback data)

**Mitigation**: Strong validation gates at end of each week ensure early detection of issues.

---

## Next Steps

### Immediate Actions (Week 3 Start)
1. Create feature branch: `git checkout -b feature/connection-synthesis`
2. Create migrations: 016-020 (user_synthesis_config, connection_feedback, weight_contexts, user_models)
3. Implement Engine 1 (Semantic): Use existing match_chunks RPC
4. Unit test Engine 1 with 5 test cases
5. Validate detection time <1s

### Daily Checklist
```
Day N:
[ ] Complete assigned engine(s)
[ ] Write 5 unit tests per engine
[ ] Measure detection time (<1s target)
[ ] Run `npm run build` - verify no errors
[ ] Run `npm run lint` - verify no warnings
[ ] Commit with descriptive message
```

### Weekly Review Questions
- Are detection times within target?
- Are connections high quality (validate with real documents)?
- Are weight adjustments effective (visible ranking changes)?
- Are users actually validating connections (>20% validation rate)?
- Is learning system improving rankings over time?

---

**PRP Version**: 1.0.0  
**Last Updated**: 2025-09-28  
**Total Implementation Time**: 6 weeks (Weeks 3-8)  
**Confidence Score**: 8/10  
**Prerequisites**: Document Reader & Annotation System (Weeks 1-2) MUST be complete