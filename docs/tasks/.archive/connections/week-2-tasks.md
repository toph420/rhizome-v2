# Week 2: Core Engines - Pattern Detection

**Timeline**: Week 2 (6.5 hours total)  
**Tasks**: T-003 to T-005  
**Focus**: Implementing three core detection engines for thematic, structural, and contradiction patterns

## Summary

This week implements three sophisticated detection engines that go beyond simple semantic similarity. The thematic bridge engine discovers cross-domain connections through shared themes, the structural isomorphism engine finds similar analytical patterns, and the contradiction engine identifies opposing viewpoints on the same concepts. Together, these engines enable rich connection discovery across diverse content.

## Tasks

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

## Progress Tracking

### Prerequisites (Week 1)
- [x] T-001: Database migrations 016-020
- [x] T-002: Semantic similarity engine

### Completed
- [ ] T-003: Thematic bridge engine
- [ ] T-004: Structural isomorphism engine  
- [ ] T-005: Contradiction detection engine

### Upcoming (Week 3)
- T-006: Emotional resonance engine
- T-007: Methodological echoes engine
- T-008: Temporal rhythms engine

## Notes

- All engines use Jaccard similarity for set comparison
- Cross-domain detection is unique to thematic bridges
- Contradiction requires high concept overlap (≥0.7) unlike other engines
- Performance target remains <1s per engine
- All engines return max 20 connections sorted by strength
- Error handling consistent: console.error and return empty array