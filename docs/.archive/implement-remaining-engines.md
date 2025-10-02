# Implement Remaining Collision Detection Engines

**Status**: Ready to implement
**Prerequisites**: ✅ SemanticSimilarity engine working, ✅ chunk_connections schema deployed
**Estimated Time**: 2-3 hours

---

## Overview

With the SemanticSimilarity engine complete and tested, we now have a proven template for the other two engines. Both follow the exact same pattern:

```typescript
// Pattern for all engines
export async function run<EngineName>(documentId: string, config?: Config): Promise<ChunkConnection[]>
export async function saveChunkConnections(connections: ChunkConnection[]): Promise<void>
export async function validate<EngineName>Engine(): Promise<boolean>
```

---

## Task 1: Implement ContradictionDetection Engine

**File**: `worker/engines/contradiction-detection.ts`
**Complexity**: Medium (no AI calls, just metadata comparison)
**Time**: 45 minutes

### Implementation Strategy

ContradictionDetection finds conceptual tensions using existing metadata. No AI calls needed.

#### Algorithm

1. For each chunk in the document, get its `conceptual_metadata.concepts` and `emotional_metadata.polarity`
2. Query database for chunks with:
   - **Same concepts** (Jaccard similarity > 0.5 on concept terms)
   - **Opposite polarity** (source.polarity * target.polarity < 0)
   - **Different documents** (cross-document only)
3. Calculate strength based on:
   - Concept overlap (higher = stronger)
   - Polarity distance (further apart = stronger)
   - Importance scores (both chunks important = stronger)

#### Code Template

```typescript
/**
 * Contradiction Detection Engine
 * Finds conceptual tensions using metadata (no AI calls)
 */

import { createClient } from '@supabase/supabase-js';
import { ChunkConnection } from './semantic-similarity';

export interface ContradictionDetectionConfig {
  minConceptOverlap?: number;      // Default: 0.5 (50% shared concepts)
  polarityThreshold?: number;      // Default: 0.3 (sufficient opposition)
  maxResultsPerChunk?: number;     // Default: 20
  crossDocumentOnly?: boolean;     // Default: true
}

export async function runContradictionDetection(
  documentId: string,
  config: ContradictionDetectionConfig = {}
): Promise<ChunkConnection[]> {
  const {
    minConceptOverlap = 0.5,
    polarityThreshold = 0.3,
    maxResultsPerChunk = 20,
    crossDocumentOnly = true
  } = config;

  console.log(`[ContradictionDetection] Processing document ${documentId}`);

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get chunks with conceptual and emotional metadata
  const { data: sourceChunks, error } = await supabase
    .from('chunks')
    .select('id, document_id, conceptual_metadata, emotional_metadata, importance_score')
    .eq('document_id', documentId)
    .not('conceptual_metadata', 'is', null)
    .not('emotional_metadata', 'is', null);

  if (error || !sourceChunks?.length) {
    console.log('[ContradictionDetection] No chunks with required metadata');
    return [];
  }

  const connections: ChunkConnection[] = [];

  for (const chunk of sourceChunks) {
    // Extract concepts and polarity
    const concepts = chunk.conceptual_metadata?.concepts?.map((c: any) => c.text) || [];
    const polarity = chunk.emotional_metadata?.polarity || 0;

    if (concepts.length === 0 || Math.abs(polarity) < 0.1) {
      continue; // Skip neutral or conceptless chunks
    }

    // Find contradicting chunks
    // Strategy: Get all chunks, filter in-memory for prototype
    // TODO: Optimize with custom RPC function for production
    const { data: candidates } = await supabase
      .from('chunks')
      .select('id, document_id, conceptual_metadata, emotional_metadata, importance_score')
      .not('conceptual_metadata', 'is', null)
      .not('emotional_metadata', 'is', null)
      .neq('id', chunk.id);

    if (!candidates) continue;

    for (const candidate of candidates) {
      // Filter: Cross-document only
      if (crossDocumentOnly && candidate.document_id === chunk.document_id) {
        continue;
      }

      const candidateConcepts = candidate.conceptual_metadata?.concepts?.map((c: any) => c.text) || [];
      const candidatePolarity = candidate.emotional_metadata?.polarity || 0;

      // Check 1: Concept overlap (Jaccard similarity)
      const conceptOverlap = calculateJaccardSimilarity(concepts, candidateConcepts);
      if (conceptOverlap < minConceptOverlap) continue;

      // Check 2: Opposite polarity
      const polarityProduct = polarity * candidatePolarity;
      if (polarityProduct >= 0) continue; // Same direction, not contradictory

      const polarityDistance = Math.abs(polarity - candidatePolarity);
      if (polarityDistance < polarityThreshold) continue; // Not different enough

      // Calculate strength
      const conceptWeight = conceptOverlap * 0.4;
      const polarityWeight = (polarityDistance / 2) * 0.4; // Normalize to 0-1
      const importanceWeight = ((chunk.importance_score || 0) + (candidate.importance_score || 0)) / 2 * 0.2;
      const strength = Math.min(1.0, conceptWeight + polarityWeight + importanceWeight);

      connections.push({
        source_chunk_id: chunk.id,
        target_chunk_id: candidate.id,
        connection_type: 'contradiction_detection',
        strength,
        auto_detected: true,
        discovered_at: new Date().toISOString(),
        metadata: {
          concept_overlap: conceptOverlap,
          polarity_distance: polarityDistance,
          source_polarity: polarity,
          target_polarity: candidatePolarity,
          shared_concepts: concepts.filter((c: string) => candidateConcepts.includes(c)),
          engine_version: 'v2'
        }
      });
    }
  }

  // Sort by strength and limit per chunk
  const connectionsBySource = new Map<string, ChunkConnection[]>();
  for (const conn of connections) {
    if (!connectionsBySource.has(conn.source_chunk_id)) {
      connectionsBySource.set(conn.source_chunk_id, []);
    }
    connectionsBySource.get(conn.source_chunk_id)!.push(conn);
  }

  const limitedConnections: ChunkConnection[] = [];
  for (const [, conns] of connectionsBySource) {
    conns.sort((a, b) => b.strength - a.strength);
    limitedConnections.push(...conns.slice(0, maxResultsPerChunk));
  }

  console.log(`[ContradictionDetection] Found ${limitedConnections.length} contradictions`);
  return limitedConnections;
}

// Helper: Jaccard similarity for concept overlap
function calculateJaccardSimilarity(set1: string[], set2: string[]): number {
  if (set1.length === 0 || set2.length === 0) return 0;

  const s1 = new Set(set1.map(s => s.toLowerCase()));
  const s2 = new Set(set2.map(s => s.toLowerCase()));

  const intersection = new Set([...s1].filter(x => s2.has(x)));
  const union = new Set([...s1, ...s2]);

  return intersection.size / union.size;
}
```

### Testing

```bash
# Test contradiction detection
npx tsx worker/test-contradiction-detection.ts <document_id>

# Verify results
psql $DATABASE_URL -c "
  SELECT connection_type, COUNT(*), AVG(strength)
  FROM connections
  WHERE connection_type = 'contradiction_detection'
  GROUP BY connection_type;
"
```

---

## Task 2: Implement ThematicBridge Engine

**File**: `worker/engines/thematic-bridge.ts`
**Complexity**: High (AI-powered, requires filtering)
**Time**: 90 minutes

### Implementation Strategy

ThematicBridge uses AI to find cross-domain conceptual connections. Key: **aggressive pre-filtering** to minimize AI calls.

#### Pre-Filtering Strategy

From APP_VISION.md: "~200 chunk pairs per document" via aggressive filtering:

1. **Filter by importance**: `importance_score > 0.6`
2. **Filter by domain**: `domain_metadata.primaryDomain` must differ
3. **Filter by cross-document**: Different documents only
4. **Limit candidates**: Max 50 source chunks, top 10 candidates per source

#### Algorithm

1. Get high-importance chunks from new document (importance > 0.6)
2. For each source chunk:
   - Get top 10 candidates from different domains
   - Use Gemini to analyze thematic bridges (batch analysis)
3. Parse AI response for bridge type, strength, explanation
4. Return only connections with strength > 0.6

#### Code Template

```typescript
/**
 * Thematic Bridge Engine
 * AI-powered cross-domain connection detection with aggressive filtering
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChunkConnection } from './semantic-similarity';

export interface ThematicBridgeConfig {
  minImportance?: number;          // Default: 0.6
  minStrength?: number;            // Default: 0.6
  maxSourceChunks?: number;        // Default: 50
  maxCandidatesPerSource?: number; // Default: 10
  batchSize?: number;              // Default: 5 (pairs per AI call)
}

export async function runThematicBridge(
  documentId: string,
  config: ThematicBridgeConfig = {}
): Promise<ChunkConnection[]> {
  const {
    minImportance = 0.6,
    minStrength = 0.6,
    maxSourceChunks = 50,
    maxCandidatesPerSource = 10,
    batchSize = 5
  } = config;

  console.log(`[ThematicBridge] Processing document ${documentId}`);
  console.log(`[ThematicBridge] AI filtering: importance>${minImportance}, strength>${minStrength}`);

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get high-importance chunks from source document
  const { data: sourceChunks, error } = await supabase
    .from('chunks')
    .select('id, document_id, content, summary, domain_metadata, importance_score')
    .eq('document_id', documentId)
    .gte('importance_score', minImportance)
    .not('domain_metadata', 'is', null)
    .order('importance_score', { ascending: false })
    .limit(maxSourceChunks);

  if (error || !sourceChunks?.length) {
    console.log('[ThematicBridge] No high-importance chunks with domain metadata');
    return [];
  }

  console.log(`[ThematicBridge] Analyzing ${sourceChunks.length} high-importance chunks`);

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const connections: ChunkConnection[] = [];
  let aiCallCount = 0;

  for (const chunk of sourceChunks) {
    const sourceDomain = chunk.domain_metadata?.primaryDomain;
    if (!sourceDomain) continue;

    // Get candidates from different domains
    const { data: candidates } = await supabase
      .from('chunks')
      .select('id, document_id, content, summary, domain_metadata, importance_score')
      .neq('document_id', chunk.document_id)
      .gte('importance_score', minImportance)
      .not('domain_metadata', 'is', null)
      .neq('domain_metadata->>primaryDomain', sourceDomain)
      .order('importance_score', { ascending: false })
      .limit(maxCandidatesPerSource);

    if (!candidates?.length) continue;

    // Batch analyze with AI
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      aiCallCount++;

      const prompt = `Analyze thematic bridges between these chunk pairs. Return JSON array with:
{
  "bridges": [
    {
      "targetIndex": 0,  // Index in candidates array
      "bridgeType": "conceptual" | "causal" | "temporal" | "argumentative" | "metaphorical" | "contextual",
      "strength": 0.0-1.0,
      "explanation": "Brief explanation of the bridge",
      "bridgeConcepts": ["concept1", "concept2"]
    }
  ]
}

SOURCE CHUNK (${sourceDomain}):
${chunk.summary || chunk.content.substring(0, 500)}

CANDIDATES:
${batch.map((c, idx) => `[${idx}] (${c.domain_metadata?.primaryDomain}): ${c.summary || c.content.substring(0, 300)}`).join('\n\n')}

Only include bridges with strength > ${minStrength}. Be selective.`;

      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, ''));

        for (const bridge of parsed.bridges || []) {
          if (bridge.strength < minStrength) continue;

          const targetChunk = batch[bridge.targetIndex];
          if (!targetChunk) continue;

          connections.push({
            source_chunk_id: chunk.id,
            target_chunk_id: targetChunk.id,
            connection_type: 'thematic_bridge',
            strength: bridge.strength,
            auto_detected: true,
            discovered_at: new Date().toISOString(),
            metadata: {
              bridge_type: bridge.bridgeType,
              explanation: bridge.explanation,
              bridge_concepts: bridge.bridgeConcepts,
              source_domain: sourceDomain,
              target_domain: targetChunk.domain_metadata?.primaryDomain,
              engine_version: 'v2'
            }
          });
        }
      } catch (error) {
        console.error(`[ThematicBridge] AI analysis failed for batch:`, error);
        continue;
      }
    }
  }

  console.log(`[ThematicBridge] Found ${connections.length} bridges using ${aiCallCount} AI calls`);
  return connections;
}
```

### Testing

```bash
# Test thematic bridge
npx tsx worker/test-thematic-bridge.ts <document_id>

# Verify AI call count (should be ~200 pairs / 5 per batch = ~40 calls)
# Check results
psql $DATABASE_URL -c "
  SELECT
    connection_type,
    COUNT(*),
    AVG(strength),
    jsonb_object_keys(metadata->'bridge_type') as bridge_types
  FROM connections
  WHERE connection_type = 'thematic_bridge'
  GROUP BY connection_type;
"
```

---

## Task 3: Create Test Scripts

**Files**:
- `worker/test-contradiction-detection.ts`
- `worker/test-thematic-bridge.ts`

Copy the pattern from `worker/test-semantic-similarity.ts` and adjust for each engine.

---

## Task 4: Build Engine Orchestrator

**File**: `worker/engines/orchestrator.ts`
**Complexity**: Medium
**Time**: 30 minutes

### Implementation Strategy

Simple orchestrator that runs all 3 engines in sequence and aggregates results.

```typescript
/**
 * Engine Orchestrator
 * Coordinates all 3 collision detection engines
 */

import { runSemanticSimilarity, saveChunkConnections } from './semantic-similarity';
import { runContradictionDetection } from './contradiction-detection';
import { runThematicBridge } from './thematic-bridge';
import { ChunkConnection } from './semantic-similarity';

export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  semanticSimilarity?: any;
  contradictionDetection?: any;
  thematicBridge?: any;
}

export async function processDocument(
  documentId: string,
  config: OrchestratorConfig = {}
): Promise<{ totalConnections: number; byEngine: Record<string, number> }> {
  const {
    enabledEngines = ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
  } = config;

  console.log(`[Orchestrator] Processing document ${documentId}`);
  console.log(`[Orchestrator] Enabled engines: ${enabledEngines.join(', ')}`);

  const allConnections: ChunkConnection[] = [];
  const byEngine: Record<string, number> = {};

  // Run engines in sequence (can parallelize later if needed)
  if (enabledEngines.includes('semantic_similarity')) {
    console.log('\n[Orchestrator] Running SemanticSimilarity...');
    const connections = await runSemanticSimilarity(documentId, config.semanticSimilarity);
    allConnections.push(...connections);
    byEngine.semantic_similarity = connections.length;
  }

  if (enabledEngines.includes('contradiction_detection')) {
    console.log('\n[Orchestrator] Running ContradictionDetection...');
    const connections = await runContradictionDetection(documentId, config.contradictionDetection);
    allConnections.push(...connections);
    byEngine.contradiction_detection = connections.length;
  }

  if (enabledEngines.includes('thematic_bridge')) {
    console.log('\n[Orchestrator] Running ThematicBridge...');
    const connections = await runThematicBridge(documentId, config.thematicBridge);
    allConnections.push(...connections);
    byEngine.thematic_bridge = connections.length;
  }

  // Save all connections
  console.log(`\n[Orchestrator] Saving ${allConnections.length} total connections...`);
  await saveChunkConnections(allConnections);

  console.log('[Orchestrator] Complete!');
  return { totalConnections: allConnections.length, byEngine };
}
```

---

## Task 5: Integration with Document Processor

**File**: `worker/handlers/document-processing-handler.ts`
**Complexity**: Low
**Time**: 15 minutes

Add orchestrator call after embeddings are generated:

```typescript
// After embeddings complete
if (result.embeddings?.length > 0) {
  console.log('[DocumentProcessor] Running collision detection...');

  const { totalConnections, byEngine } = await processDocument(documentId, {
    enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
  });

  console.log(`[DocumentProcessor] Found ${totalConnections} connections:`, byEngine);
}
```

---

## Success Criteria

### Must Have
- ✅ All 3 engines implemented with same function-based pattern
- ✅ Test scripts for each engine showing non-zero results
- ✅ Orchestrator coordinates all engines
- ✅ Database queries show all 3 connection types

### Should Have
- ✅ ContradictionDetection finds metadata-based tensions
- ✅ ThematicBridge uses <50 AI calls per document
- ✅ Performance: <2 minutes for 50-chunk document

### Nice to Have
- Parallel execution of engines (currently sequential)
- Custom RPC functions for contradiction detection filtering
- Connection deduplication across engines

---

## Testing Checklist

```bash
# 1. Test each engine individually
npx tsx worker/test-semantic-similarity.ts <doc_id>
npx tsx worker/test-contradiction-detection.ts <doc_id>
npx tsx worker/test-thematic-bridge.ts <doc_id>

# 2. Test orchestrator
npx tsx worker/test-orchestrator.ts <doc_id>

# 3. Verify database results
psql $DATABASE_URL -c "
  SELECT
    connection_type,
    COUNT(*) as count,
    ROUND(AVG(strength)::numeric, 3) as avg_strength
  FROM connections
  GROUP BY connection_type
  ORDER BY connection_type;
"

# Expected output:
# connection_type          | count | avg_strength
# ------------------------ | ----- | ------------
# contradiction_detection  | 23    | 0.712
# semantic_similarity      | 47    | 0.784
# thematic_bridge          | 15    | 0.821
```

---

## Notes

- **SemanticSimilarity** is already done ✅
- **ContradictionDetection** requires no AI (fastest to implement)
- **ThematicBridge** is the most complex (AI + batching)
- All engines share the same `ChunkConnection` type
- All engines use the same `saveChunkConnections()` function
- The hard work (migration, schema, template) is complete!

---

## Questions to Answer Before Starting

1. Should engines run in parallel or sequence? (Current: sequence, can optimize later)
2. Should we deduplicate connections across engines? (Current: no, keep separate)
3. What's the AI call budget for ThematicBridge? (Current: ~40 calls per document)
4. Should ContradictionDetection use a custom RPC for filtering? (Current: in-memory, optimize later)

**Recommendation**: Ship working engines first, optimize performance second. The template is solid.
