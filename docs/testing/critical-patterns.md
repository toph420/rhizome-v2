
# Critical Test Patterns for Rhizome

> **Rhizome-specific testing patterns for critical functionality**  
> Last Updated: October 2025  
> These patterns protect against data loss, cost explosions, and silent failures

## Table of Contents
1. [Annotation Recovery Patterns](#annotation-recovery-patterns)
2. [Chunk Remapping Patterns](#chunk-remapping-patterns)
3. [Stitching Test Patterns](#stitching-test-patterns)
4. [Filtering Validation Patterns](#filtering-validation-patterns)
5. [Connection Scoring Patterns](#connection-scoring-patterns)
6. [Cost Tracking Patterns](#cost-tracking-patterns)
7. [Real Fixture Patterns](#real-fixture-patterns)

---

## Annotation Recovery Patterns

### Pattern: Position Recovery After Content Edit

**Why**: Annotations represent hours of user work. Content edits (typo fixes, paragraph additions) invalidate positions. We must recover them.

```typescript
// tests/critical/annotation-recovery.test.ts
import { recoverAnnotationPosition } from '@/ecs/annotations/recovery'

describe('Annotation Position Recovery', () => {
  test('recovers position after typo fix', () => {
    const originalContent = "The opening scene intorduces Slothrop."
    const editedContent = "The opening scene introduces Slothrop."
    
    const annotation = {
      id: "ann_1",
      position: { start: 0, end: 38 },
      content: { note: "Character introduction" }
    }
    
    const recovered = recoverAnnotationPosition(
      annotation,
      originalContent,
      editedContent
    )
    
    expect(recovered.position.start).toBe(0)
    expect(recovered.position.end).toBe(38) // Same position
    expect(recovered.confidence).toBe(1.0)
    expect(recovered.status).toBe('recovered')
  })

  test('recovers position after paragraph insertion', () => {
    const originalContent = `
Chapter 1
The plot begins here.
More content follows.
    `.trim()

    const annotation = {
      id: "ann_1",
      position: { start: 10, end: 32 }, // "The plot begins here."
      content: { note: "Opening line" }
    }

    const editedContent = `
Chapter 1

This is a new paragraph inserted before.

The plot begins here.
More content follows.
    `.trim()

    const recovered = recoverAnnotationPosition(
      annotation,
      originalContent,
      editedContent
    )
    
    // Position should shift down
    expect(recovered.position.start).toBeGreaterThan(10)
    expect(recovered.confidence).toBeGreaterThan(0.9)
    expect(recovered.status).toBe('recovered')
    
    // Verify the excerpt matches
    const recoveredExcerpt = editedContent.substring(
      recovered.position.start,
      recovered.position.end
    )
    expect(recoveredExcerpt).toBe("The plot begins here.")
  })

  test('detects when annotated text was deleted', () => {
    const originalContent = `
First paragraph.
Second paragraph with annotation.
Third paragraph.
    `.trim()

    const annotation = {
      id: "ann_1",
      position: { start: 17, end: 50 }, // "Second paragraph with annotation."
      content: { note: "Key point" }
    }

    const editedContent = `
First paragraph.
Third paragraph.
    `.trim()

    const recovered = recoverAnnotationPosition(
      annotation,
      originalContent,
      editedContent
    )
    
    expect(recovered.status).toBe('deleted')
    expect(recovered.confidence).toBe(0)
    expect(recovered.originalExcerpt).toBe("Second paragraph with annotation.")
  })

  test('handles OCR-style whitespace variations', () => {
    const originalContent = "cognitive dissonance theory"
    
    const annotation = {
      id: "ann_1",
      position: { start: 0, end: 27 },
      content: { note: "Psychology concept" }
    }

    const editedContent = "cognitive  dissonance  theory" // Extra spaces

    const recovered = recoverAnnotationPosition(
      annotation,
      originalContent,
      editedContent
    )
    
    expect(recovered.confidence).toBeGreaterThan(0.85)
    expect(recovered.status).toBe('recovered')
    expect(recovered.fuzzyMatched).toBe(true)
  })

  test('provides manual recovery candidates on failure', () => {
    const originalContent = "The protagonist faces a moral dilemma."
    
    const annotation = {
      id: "ann_1",
      position: { start: 0, end: 38 },
      content: { note: "Central conflict" }
    }

    // Significant rewrite
    const editedContent = "Our hero confronts an ethical challenge."

    const recovered = recoverAnnotationPosition(
      annotation,
      originalContent,
      editedContent
    )
    
    expect(recovered.status).toBe('low_confidence')
    expect(recovered.confidence).toBeLessThan(0.7)
    expect(recovered.nearbyMatches).toBeInstanceOf(Array)
    expect(recovered.nearbyMatches.length).toBeGreaterThan(0)
    expect(recovered.originalExcerpt).toBeDefined()
  })
})
```

### Pattern: Batch Recovery After Document Edit

```typescript
describe('Batch Annotation Recovery', () => {
  test('recovers multiple annotations after single edit', async () => {
    const originalContent = await fs.readFile('storage/doc_123/content.md', 'utf8')
    const annotations = await loadAnnotations('storage/doc_123')
    
    // Simulate edit
    const editedContent = originalContent.replace(
      "first chapter",
      "opening chapter"
    )
    
    const recovered = await recoverAllAnnotations(
      annotations,
      originalContent,
      editedContent
    )
    
    // All should recover (edit affects none of them)
    expect(recovered.filter(a => a.status === 'recovered').length).toBe(annotations.length)
    
    // Track recovery quality
    const avgConfidence = recovered.reduce((sum, a) => sum + a.confidence, 0) / recovered.length
    expect(avgConfidence).toBeGreaterThan(0.9)
  })

  test('flags low-confidence recoveries for manual review', async () => {
    const annotations = fixtures.annotations.multipleWithVaryingRecovery
    const { original, edited } = fixtures.contentEdits.majorRewrite
    
    const recovered = await recoverAllAnnotations(annotations, original, edited)
    
    const needsReview = recovered.filter(a => a.confidence < 0.7)
    
    expect(needsReview.length).toBeGreaterThan(0)
    needsReview.forEach(ann => {
      expect(ann.nearbyMatches).toBeDefined()
      expect(ann.originalExcerpt).toBeDefined()
    })
  })
})
```

---

## Chunk Remapping Patterns

### Pattern: Remap After Document Reprocessing

**Why**: When documents are reprocessed, chunk IDs change. Annotations must remap to new chunks.

```typescript
// tests/critical/annotation-chunk-remap.test.ts
import { remapAnnotationToChunks } from '@/ecs/annotations/remap'

describe('Annotation Chunk Remapping', () => {
  test('remaps to new chunk with same boundaries', () => {
    const annotation = {
      id: "ann_1",
      position: { start: 1500, end: 1800 },
      chunkId: "old_chunk_3"
    }

    const oldChunks = [
      { id: "old_chunk_3", start_offset: 1200, end_offset: 2000 }
    ]

    const newChunks = [
      { id: "new_chunk_5", start_offset: 1200, end_offset: 2000 }
      // Same boundaries, new ID after reprocessing
    ]

    const remapped = remapAnnotationToChunks(annotation, oldChunks, newChunks)

    expect(remapped.chunkId).toBe("new_chunk_5")
    expect(remapped.confidence).toBe(1.0)
    expect(remapped.status).toBe('remapped')
  })

  test('handles chunks that were split', () => {
    const annotation = {
      id: "ann_1",
      position: { start: 1500, end: 1800 },
      chunkId: "old_chunk_3"
    }

    const oldChunks = [
      { id: "old_chunk_3", start_offset: 1000, end_offset: 2500 }
      // Single large chunk
    ]

    const newChunks = [
      { id: "new_chunk_4", start_offset: 1000, end_offset: 1700 },
      { id: "new_chunk_5", start_offset: 1700, end_offset: 2500 }
      // Split into two chunks
    ]

    const remapped = remapAnnotationToChunks(annotation, oldChunks, newChunks)

    // Annotation (1500-1800) overlaps both, but more with chunk_4 (200 chars vs 100 chars)
    expect(remapped.chunkId).toBe("new_chunk_4")
    expect(remapped.confidence).toBeGreaterThan(0.7)
    expect(remapped.spansMultipleChunks).toBe(true)
    expect(remapped.affectedChunkIds).toContain("new_chunk_5")
  })

  test('handles chunks that were merged', () => {
    const annotation = {
      id: "ann_1",
      position: { start: 1500, end: 1800 },
      chunkId: "old_chunk_3"
    }

    const oldChunks = [
      { id: "old_chunk_3", start_offset: 1000, end_offset: 1700 },
      { id: "old_chunk_4", start_offset: 1700, end_offset: 2500 }
      // Two separate chunks
    ]

    const newChunks = [
      { id: "new_chunk_2", start_offset: 1000, end_offset: 2500 }
      // Merged into one
    ]

    const remapped = remapAnnotationToChunks(annotation, oldChunks, newChunks)

    expect(remapped.chunkId).toBe("new_chunk_2")
    expect(remapped.confidence).toBe(1.0)
    expect(remapped.status).toBe('remapped')
  })

  test('flags orphaned annotation when chunk deleted', () => {
    const annotation = {
      id: "ann_1",
      position: { start: 5000, end: 5200 },
      chunkId: "old_chunk_10"
    }

    const oldChunks = [
      { id: "old_chunk_10", start_offset: 5000, end_offset: 5500 }
    ]

    const newChunks = [
      // Chunk removed (importance < threshold, or content deleted)
    ]

    const remapped = remapAnnotationToChunks(annotation, oldChunks, newChunks)

    expect(remapped.status).toBe('orphaned')
    expect(remapped.chunkId).toBeNull()
    expect(remapped.confidence).toBe(0)
    expect(remapped.originalChunkId).toBe("old_chunk_10")
  })
})
```

---

## Stitching Test Patterns

### Pattern: Fuzzy Overlap Detection

**Why**: Batched PDF extraction creates overlaps. Stitching must find them even with OCR variations.

```typescript
// tests/critical/stitching.test.ts
import { findBestOverlap, stitchBatches } from '@/worker/processors/stitcher'

describe('Batch Stitching', () => {
  test('finds exact overlap between batches', () => {
    const batch1 = "The end of chapter one. The beginning of chapter two."
    const batch2 = "The beginning of chapter two. And so it continues..."
    
    const overlap = findBestOverlap(batch1, batch2)
    
    expect(overlap.position).toBe(24) // Position of "The beginning"
    expect(overlap.length).toBeGreaterThan(20)
    expect(overlap.confidence).toBeGreaterThan(0.95)
  })

  test('handles OCR whitespace variations', () => {
    const batch1 = "cognitive  dissonance  theory" // Extra spaces
    const batch2 = "cognitive dissonance theory leads to" // Normal spaces
    
    const overlap = findBestOverlap(batch1, batch2)
    
    expect(overlap.position).toBeGreaterThan(0)
    expect(overlap.confidence).toBeGreaterThan(0.85)
    expect(overlap.matchedText).toContain("cognitive dissonance theory")
  })

  test('handles missing characters (OCR errors)', () => {
    const batch1 = "The protagonist's journey begins here."
    const batch2 = "The protagonists journey begins here." // Missing apostrophe
    
    const overlap = findBestOverlap(batch1, batch2)
    
    expect(overlap.position).toBeGreaterThan(0)
    expect(overlap.confidence).toBeGreaterThan(0.8)
  })

  test('falls back to paragraph boundary when no overlap', () => {
    const batch1 = "Completely different content from first batch."
    const batch2 = "Totally new material.\n\nA new paragraph starts here."
    
    const stitched = stitchBatches([batch1, batch2])
    
    // Should include both batches
    expect(stitched).toContain("Completely different content")
    expect(stitched).toContain("A new paragraph starts here")
    
    // Should not include the first line of batch2 (before paragraph break)
    expect(stitched).not.toContain("Totally new material.\n\nA new")
  })

  test('stitches multi-batch document without duplicates', () => {
    const batches = [
      "Batch 1 content ends with overlap text here.",
      "overlap text here. Batch 2 middle content. more overlap text",
      "more overlap text. Batch 3 final content."
    ]
    
    const stitched = stitchBatches(batches)
    
    // Each overlap phrase should appear only once
    expect(stitched.match(/overlap text here/g)).toHaveLength(1)
    expect(stitched.match(/more overlap text/g)).toHaveLength(1)
    
    // All unique content should be present
    expect(stitched).toContain("Batch 1 content")
    expect(stitched).toContain("Batch 2 middle content")
    expect(stitched).toContain("Batch 3 final content")
  })

  test('handles 6-batch 500-page book stitching', () => {
    // Simulate real 500-page book processing
    const batches = Array(6).fill(null).map((_, i) => {
      const batchContent = `Batch ${i + 1} content. `.repeat(100)
      const overlapText = i < 5 ? `Overlap ${i + 1}-${i + 2}. ` : ""
      return batchContent + overlapText
    })
    
    const stitched = stitchBatches(batches)
    
    // Each overlap should appear only once
    for (let i = 1; i <= 5; i++) {
      const overlapPattern = new RegExp(`Overlap ${i}-${i + 1}`, 'g')
      const matches = stitched.match(overlapPattern)
      expect(matches).toHaveLength(1)
    }
    
    // All batch content should be present
    for (let i = 1; i <= 6; i++) {
      expect(stitched).toContain(`Batch ${i} content`)
    }
  })
})
```

---

## Filtering Validation Patterns

### Pattern: ThematicBridge Cost Control

**Why**: Without aggressive filtering, ThematicBridge would make 160,000 AI calls per book (~$160). We must keep it under 300 calls (~$0.20).

```typescript
// tests/critical/thematic-bridge-filter.test.ts
import { filterCandidates } from '@/worker/engines/thematic-bridge/filter'
import { realChunks } from '@/tests/fixtures/chunks'

describe('ThematicBridge Candidate Filtering', () => {
  test('filters by importance threshold (0.6)', () => {
    const sourceChunk = realChunks.gravityRainbow_chunk0 // importance: 0.85
    const corpus = [
      realChunks.gravityRainbow_chunk5,   // importance: 0.9
      realChunks.nineteen84_chunk2,       // importance: 0.4 <- FILTERED
      realChunks.catchTwenty2_chunk8,     // importance: 0.7
    ]
    
    const candidates = filterCandidates(sourceChunk, corpus, {
      importanceThreshold: 0.6
    })
    
    expect(candidates.every(c => c.importance_score >= 0.6)).toBe(true)
    expect(candidates).not.toContain(realChunks.nineteen84_chunk2)
  })

  test('excludes same document', () => {
    const sourceChunk = realChunks.gravityRainbow_chunk0
    const corpus = [
      realChunks.gravityRainbow_chunk5,   // Same doc <- FILTERED
      realChunks.nineteen84_chunk2,       // Different doc
      realChunks.catchTwenty2_chunk8,     // Different doc
    ]
    
    const candidates = filterCandidates(sourceChunk, corpus)
    
    expect(candidates.every(c => c.document_id !== sourceChunk.document_id)).toBe(true)
    expect(candidates).not.toContain(realChunks.gravityRainbow_chunk5)
  })

  test('filters by concept overlap sweet spot (0.2-0.7)', () => {
    const sourceChunk = {
      concepts: [
        { text: "paranoia", importance: 0.9 },
        { text: "control", importance: 0.8 },
        { text: "surveillance", importance: 0.7 }
      ]
    }
    
    const corpus = [
      {
        id: "too-similar",
        concepts: [
          { text: "paranoia", importance: 0.9 },
          { text: "control", importance: 0.8 },
          { text: "surveillance", importance: 0.8 }
        ]
        // Overlap: 3/3 = 1.0 <- FILTERED (too similar)
      },
      {
        id: "sweet-spot",
        concepts: [
          { text: "paranoia", importance: 0.7 },
          { text: "data", importance: 0.9 }
        ]
        // Overlap: 1/3 = 0.33 <- KEEP (interesting bridge)
      },
      {
        id: "no-overlap",
        concepts: [
          { text: "cooking", importance: 0.8 },
          { text: "recipes", importance: 0.7 }
        ]
        // Overlap: 0/3 = 0.0 <- FILTERED (no connection)
      }
    ]
    
    const candidates = filterCandidates(sourceChunk, corpus)
    
    candidates.forEach(c => {
      const overlap = calculateConceptOverlap(sourceChunk, c)
      expect(overlap).toBeGreaterThanOrEqual(0.2)
      expect(overlap).toBeLessThanOrEqual(0.7)
    })
    
    expect(candidates.map(c => c.id)).toContain("sweet-spot")
    expect(candidates.map(c => c.id)).not.toContain("too-similar")
    expect(candidates.map(c => c.id)).not.toContain("no-overlap")
  })

  test('limits to top 15 candidates per chunk', () => {
    const sourceChunk = realChunks.gravityRainbow_chunk0
    const corpus = Array(50).fill(null).map((_, i) => ({
      ...realChunks.nineteen84_chunk2,
      id: `candidate_${i}`,
      importance_score: 0.7 + (i * 0.001) // Varying importance
    }))
    
    const candidates = filterCandidates(sourceChunk, corpus)
    
    expect(candidates.length).toBeLessThanOrEqual(15)
    
    // Should be top 15 by importance
    const sorted = corpus
      .filter(c => c.document_id !== sourceChunk.document_id)
      .sort((a, b) => b.importance_score - a.importance_score)
      .slice(0, 15)
    
    expect(candidates.map(c => c.id)).toEqual(sorted.map(c => c.id))
  })

  test('total AI calls for 382-chunk book stays under 300', () => {
    // Simulate full book: 382 chunks
    const allChunks = Array(382).fill(null).map((_, i) => ({
      id: `chunk_${i}`,
      document_id: "gravity-rainbow",
      importance_score: Math.random(), // Random importance
      concepts: [
        { text: "concept_a", importance: Math.random() },
        { text: "concept_b", importance: Math.random() }
      ]
    }))
    
    // Filter 1: Importance > 0.6 (reduces ~75%)
    const importantChunks = allChunks.filter(c => c.importance_score > 0.6)
    expect(importantChunks.length).toBeLessThan(382 * 0.3) // ~95 chunks
    
    // Filter 2-4: Cross-doc, domain, concept overlap (further reduces)
    let totalCandidates = 0
    importantChunks.forEach(sourceChunk => {
      const candidates = filterCandidates(sourceChunk, allChunks)
      totalCandidates += candidates.length
    })
    
    // At 15 candidates per chunk, max = 95 * 15 = 1,425 candidates
    // But we batch AI calls 5 at a time, so actual calls = 1,425 / 5 = 285
    const estimatedAICalls = Math.ceil(totalCandidates / 5)
    expect(estimatedAICalls).toBeLessThan(300)
  })
})
```

---

## Connection Scoring Patterns

### Pattern: Personal Weight Application

**Why**: Connection scoring uses user preference weights. Tests ensure weights are applied correctly and sum to 1.0.

```typescript
// tests/critical/connection-scoring.test.ts
import { scoreConnection, DEFAULT_WEIGHTS } from '@/lib/scoring'

describe('Connection Scoring', () => {
  test('weights sum to 1.0', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5) // Floating point precision
  })

  test('applies semantic weight correctly', () => {
    const connection = {
      type: 'semantic_similarity',
      semantic_strength: 0.8,
      contradiction_strength: 0,
      bridge_strength: 0
    }
    
    const score = scoreConnection(connection, DEFAULT_WEIGHTS)
    
    // DEFAULT_WEIGHTS.semantic = 0.25
    expect(score.finalScore).toBeCloseTo(0.8 * 0.25, 5)
    expect(score.components.semantic).toBe(0.2)
  })

  test('contradiction weighted highest', () => {
    const connections = [
      {
        type: 'semantic_similarity',
        semantic_strength: 0.9,
        contradiction_strength: 0,
        bridge_strength: 0
      },
      {
        type: 'contradiction_detection',
        semantic_strength: 0,
        contradiction_strength: 0.7,
        bridge_strength: 0
      },
      {
        type: 'thematic_bridge',
        semantic_strength: 0,
        contradiction_strength: 0,
        bridge_strength: 0.8
      }
    ]
    
    const scores = connections.map(c => scoreConnection(c, DEFAULT_WEIGHTS))
    
    // DEFAULT_WEIGHTS = { semantic: 0.25, contradiction: 0.40, bridge: 0.35 }
    // Scores: 0.225, 0.28, 0.28
    expect(scores[1].finalScore).toBeGreaterThan(scores[0].finalScore)
    expect(scores[1].finalScore).toBeCloseTo(scores[2].finalScore, 2)
  })

  test('handles multiple connection types in single connection', () => {
    const connection = {
      type: 'multi',
      semantic_strength: 0.8,
      contradiction_strength: 0.6,
      bridge_strength: 0.9
    }
    
    const score = scoreConnection(connection, DEFAULT_WEIGHTS)
    
    const expected = 
      (0.8 * 0.25) +  // semantic
      (0.6 * 0.40) +  // contradiction
      (0.9 * 0.35)    // bridge
    
    expect(score.finalScore).toBeCloseTo(expected, 5)
    expect(score.finalScore).toBeCloseTo(0.755, 3)
  })

  test('real-time weight adjustment', () => {
    const connection = {
      semantic_strength: 0.8,
      contradiction_strength: 0.6,
      bridge_strength: 0.9
    }
    
    // Default weights
    const score1 = scoreConnection(connection, DEFAULT_WEIGHTS)
    
    // User boosts thematic bridges
    const customWeights = {
      semantic: 0.20,
      contradiction: 0.30,
      bridge: 0.50  // Boosted from 0.35
    }
    
    const score2 = scoreConnection(connection, customWeights)
    
    // Bridge has highest strength (0.9), so boosting its weight should increase score
    expect(score2.finalScore).toBeGreaterThan(score1.finalScore)
    expect(score2.finalScore).toBeCloseTo(0.79, 2) // 0.16 + 0.18 + 0.45
  })

  test('handles missing connection strengths', () => {
    const connection = {
      type: 'semantic_similarity',
      semantic_strength: 0.8
      // No contradiction or bridge strength
    }
    
    const score = scoreConnection(connection, DEFAULT_WEIGHTS)
    
    // Should only apply semantic component
    expect(score.finalScore).toBeCloseTo(0.8 * 0.25, 5)
    expect(score.components.contradiction).toBe(0)
    expect(score.components.bridge).toBe(0)
  })
})
```

---

## Cost Tracking Patterns

### Pattern: Per-Stage Cost Validation

**Why**: Processing costs money. Tests ensure we stay within budget per document.

```typescript
// tests/critical/cost-tracking.test.ts
import { processDocument } from '@/worker/handlers/process-document'
import { CostTracker } from '@/worker/lib/cost-tracker'

describe('Cost Tracking', () => {
  test('tracks extraction cost per batch', async () => {
    const costTracker = new CostTracker()
    const document = fixtures.document.largePDF() // 500 pages
    
    await processDocument(document, { costTracker })
    
    // 6 batches @ ~$0.02 each
    expect(costTracker.extractionCost).toBeGreaterThan(0.10)
    expect(costTracker.extractionCost).toBeLessThan(0.15)
    expect(costTracker.extractionBatches).toBe(6)
  })

  test('tracks metadata cost per batch', async () => {
    const costTracker = new CostTracker()
    const document = fixtures.document.largePDF()
    
    await processDocument(document, { costTracker })
    
    // 10 metadata batches @ ~$0.02 each
    expect(costTracker.metadataCost).toBeGreaterThan(0.18)
    expect(costTracker.metadataCost).toBeLessThan(0.25)
  })

  test('tracks embedding cost', async () => {
    const costTracker = new CostTracker()
    const document = fixtures.document.largePDF()
    
    await processDocument(document, { costTracker })
    
    // 382 chunks @ $0.00005 per embedding
    expect(costTracker.embeddingCost).toBeGreaterThan(0.015)
    expect(costTracker.embeddingCost).toBeLessThan(0.025)
    expect(costTracker.embeddingsGenerated).toBe(382)
  })

  test('tracks ThematicBridge AI calls', async () => {
    const costTracker = new CostTracker()
    const document = fixtures.document.largePDF()
    
    await processDocument(document, { costTracker })
    
    // Should stay under 300 AI calls
    expect(costTracker.bridgeAICalls).toBeLessThan(300)
    
    // At ~$0.001 per call
    expect(costTracker.bridgeCost).toBeLessThan(0.30)
  })

  test('total cost stays under $0.60 per 500-page book', async () => {
    const costTracker = new CostTracker()
    const document = fixtures.document.largePDF() // 500 pages
    
    await processDocument(document, { costTracker })
    
    const breakdown = costTracker.getBreakdown()
    console.log('Cost breakdown:', breakdown)
    
    expect(costTracker.totalCost).toBeLessThan(0.60)
    
    // Log cost breakdown for visibility
    expect(breakdown).toMatchObject({
      extraction: expect.any(Number),
      metadata: expect.any(Number),
      embeddings: expect.any(Number),
      connections: expect.any(Number),
      total: expect.any(Number)
    })
  })

  test('small documents cost significantly less', async () => {
    const costTracker = new CostTracker()
    const document = fixtures.document.smallPDF() // 20 pages
    
    await processDocument(document, { costTracker })
    
    // Single-pass extraction, fewer chunks, fewer AI calls
    expect(costTracker.totalCost).toBeLessThan(0.10)
  })
})
```

### Pattern: Cost Budget Enforcement

```typescript
describe('Cost Budget Enforcement', () => {
  test('warns when approaching budget limit', async () => {
    const costTracker = new CostTracker({ budget: 0.50 })
    const warnSpy = jest.spyOn(console, 'warn')
    
    const document = fixtures.document.largePDF()
    await processDocument(document, { costTracker })
    
    // Should warn if > 80% of budget
    if (costTracker.totalCost > 0.40) {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('approaching budget')
      )
    }
  })

  test('fails if budget exceeded', async () => {
    const costTracker = new CostTracker({ 
      budget: 0.20,
      enforceLimit: true 
    })
    
    const document = fixtures.document.largePDF()
    
    await expect(
      processDocument(document, { costTracker })
    ).rejects.toThrow('Budget exceeded')
  })
})
```

---

## Real Fixture Patterns

### Pattern: Using Processed Chunks as Test Data

**Why**: Fake data doesn't catch real bugs. Use actual processed chunks from real books.

```typescript
// tests/fixtures/chunks.ts

/**
 * Real chunks from processed books
 * 
 * How to generate:
 * 1. Process a real book: npm run process -- ~/Downloads/book.pdf
 * 2. Export chunks: npm run export-chunks -- doc_id > fixtures/chunks-book.json
 * 3. Pick representative samples
 * 4. Add to this file
 */

export const realChunks = {
  // Gravity's Rainbow - High-importance literary chunk
  gravityRainbow_chunk0: {
    id: "gr_chunk_0",
    document_id: "gravity-rainbow",
    chunk_index: 0,
    content: "The opening scene of Pynchon's novel introduces Tyrone Slothrop, an American lieutenant stationed in London during World War II. Slothrop is being conditioned by a mysterious organization known only as 'The White Visitation.' His sexual encounters mysteriously correlate with V-2 rocket strikes across London. This Pavlovian connection between arousal and destruction sets the tone for the novel's exploration of paranoia, control, and the military-industrial complex.",
    start_offset: 0,
    end_offset: 447,
    themes: ["postmodern literature", "paranoia", "entropy", "military-industrial complex"],
    concepts: [
      { text: "V-2 rocket", importance: 0.9 },
      { text: "Pavlovian conditioning", importance: 0.8 },
      { text: "corporate control", importance: 0.7 },
      { text: "sexual politics", importance: 0.6 }
    ],
    emotional_tone: {
      polarity: -0.3,
      primaryEmotion: "anxiety"
    },
    importance_score: 0.85,
    word_count: 72,
    embedding: [0.023, -0.045, 0.067, /* ... 768 values */] // Real embedding vector
  },

  // 1984 - High-importance dystopian chunk
  nineteen84_chunk2: {
    id: "1984_chunk_2",
    document_id: "nineteen-eighty-four",
    chunk_index: 2,
    content: "The telescreen received and transmitted simultaneously. Any sound Winston made, above the level of a very low whisper, would be picked up by it; moreover, so long as he remained within the field of vision which the metal plaque commanded, he could be seen as well as heard. There was of course no way of knowing whether you were being watched at any given moment.",
    start_offset: 1247,
    end_offset: 1587,
    themes: ["dystopia", "surveillance", "authoritarianism", "privacy"],
    concepts: [
      { text: "totalitarianism", importance: 0.95 },
      { text: "surveillance", importance: 0.9 },
      { text: "thought control", importance: 0.85 },
      { text: "privacy violation", importance: 0.8 }
    ],
    emotional_tone: {
      polarity: -0.8,
      primaryEmotion: "dread"
    },
    importance_score: 0.92,
    word_count: 58,
    embedding: [0.034, -0.012, 0.089, /* ... */]
  },

  // Catch-22 - Military absurdism (conceptual overlap with GR)
  catchTwenty2_chunk8: {
    id: "c22_chunk_8",
    document_id: "catch-twenty-two",
    chunk_index: 8,
    content: "There was only one catch and that was Catch-22, which specified that a concern for one's own safety in the face of dangers that were real and immediate was the process of a rational mind. Orr was crazy and could be grounded. All he had to do was ask; and as soon as he did, he would no longer be crazy and would have to fly more missions.",
    start_offset: 4523,
    end_offset: 4857,
    themes: ["military absurdism", "bureaucracy", "logic paradox"],
    concepts: [
      { text: "logical paradox", importance: 0.9 },
      { text: "military bureaucracy", importance: 0.85 },
      { text: "institutional absurdity", importance: 0.8 }
    ],
    emotional_tone: {
      polarity: -0.5,
      primaryEmotion: "frustration"
    },
    importance_score: 0.88,
    word_count: 54,
    embedding: [0.045, 0.023, -0.034, /* ... */]
  },

  // Surveillance Capitalism - Tech book (cross-domain bridge to 1984)
  surveillanceCapitalism_chunk5: {
    id: "sc_chunk_5",
    document_id: "surveillance-capitalism",
    chunk_index: 5,
    content: "Surveillance capitalism unilaterally claims human experience as free raw material for translation into behavioral data. Some data are applied to service improvement, but the rest are declared as a proprietary behavioral surplus, fed into advanced manufacturing processes known as 'machine intelligence,' and fabricated into prediction products that anticipate what you will do now, soon, and later.",
    start_offset: 2847,
    end_offset: 3233,
    themes: ["technology", "capitalism", "privacy", "data extraction"],
    concepts: [
      { text: "behavioral data", importance: 0.9 },
      { text: "surveillance capitalism", importance: 0.95 },
      { text: "prediction products", importance: 0.85 },
      { text: "privacy commodification", importance: 0.8 }
    ],
    emotional_tone: {
      polarity: -0.6,
      primaryEmotion: "concern"
    },
    importance_score: 0.9,
    word_count: 57,
    embedding: [-0.012, 0.067, 0.045, /* ... */]
  },

  // Low-importance filler chunk (should be filtered)
  gravityRainbow_chunk42: {
    id: "gr_chunk_42",
    document_id: "gravity-rainbow",
    chunk_index: 42,
    content: "The room was dimly lit. A single bulb hung from the ceiling. Outside, rain pattered against the windows. Someone coughed in the hallway.",
    start_offset: 18347,
    end_offset: 18485,
    themes: ["setting description"],
    concepts: [
      { text: "atmospheric detail", importance: 0.3 }
    ],
    emotional_tone: {
      polarity: -0.1,
      primaryEmotion: "neutral"
    },
    importance_score: 0.25, // Low importance - should be filtered
    word_count: 22,
    embedding: [0.001, 0.002, -0.001, /* ... */]
  }
}

// Expected connections (for validation)
export const expectedConnections = {
  // Thematic bridge: paranoia in literature <-> surveillance in tech
  gravityRainbow_to_surveillanceCapitalism: {
    sourceChunkId: "gr_chunk_0",
    targetChunkId: "sc_chunk_5",
    type: "thematic_bridge",
    sharedConcept: "institutional paranoia",
    bridgeType: "cross_domain",
    expectedStrength: 0.75
  },

  // Contradiction: Orwell's surveillance <-> Zuboff's surveillance
  nineteen84_to_surveillanceCapitalism: {
    sourceChunkId: "1984_chunk_2",
    targetChunkId: "sc_chunk_5",
    type: "contradiction_detection",
    sharedConcepts: ["surveillance", "control"],
    polarityDifference: 0.2, // Both negative but different tones
    expectedStrength: 0.65
  },

  // Semantic similarity: Two literary takes on institutional absurdity
  gravityRainbow_to_catchTwenty2: {
    sourceChunkId: "gr_chunk_0",
    targetChunkId: "c22_chunk_8",
    type: "semantic_similarity",
    expectedStrength: 0.72
  }
}
```

### Pattern: Using Real Fixtures in Tests

```typescript
// tests/critical/thematic-bridge-real.test.ts
import { detectThematicBridge } from '@/worker/engines/thematic-bridge'
import { realChunks, expectedConnections } from '@/tests/fixtures/chunks'

describe('ThematicBridge with Real Data', () => {
  test('finds cross-domain bridge: literature → tech', async () => {
    const source = realChunks.gravityRainbow_chunk0
    const target = realChunks.surveillanceCapitalism_chunk5
    
    const connection = await detectThematicBridge(source, target)
    
    expect(connection.detected).toBe(true)
    expect(connection.bridgeType).toBe('cross_domain')
    expect(connection.sharedConcept).toContain('paranoia')
    expect(connection.strength).toBeGreaterThan(0.7)
  })

  test('detects contradiction: Orwell vs Zuboff on surveillance', async () => {
    const source = realChunks.nineteen84_chunk2
    const target = realChunks.surveillanceCapitalism_chunk5
    
    const connection = await detectContradiction(source, target)
    
    expect(connection.detected).toBe(true)
    expect(connection.sharedConcepts).toContain('surveillance')
    expect(connection.sharedConcepts).toContain('control')
    // Both are negative, but different mechanisms
    expect(connection.polarityDifference).toBeLessThan(0.3)
  })

  test('filters low-importance chunks', () => {
    const source = realChunks.gravityRainbow_chunk0 // importance: 0.85
    const corpus = [
      realChunks.nineteen84_chunk2,           // importance: 0.92
      realChunks.gravityRainbow_chunk42,      // importance: 0.25 <- FILTERED
      realChunks.surveillanceCapitalism_chunk5 // importance: 0.90
    ]
    
    const candidates = filterCandidates(source, corpus, {
      importanceThreshold: 0.6
    })
    
    expect(candidates.map(c => c.id)).not.toContain("gr_chunk_42")
  })
})
```

---

## Summary

These patterns protect against:
- ✅ **Data loss** - Annotation recovery and chunk remapping
- ✅ **Silent corruption** - Stitching validation
- ✅ **Cost explosions** - Filtering validation and cost tracking
- ✅ **Scoring bugs** - Weight application tests
- ✅ **False confidence** - Real fixture validation

**Use these patterns when:**
- Writing tests for new collision detection engines
- Adding annotation features
- Modifying document processing pipeline
- Implementing cost-sensitive features

**Remember:** If losing this data would make the user angry, write these tests. If the user can see it's broken immediately, skip the test.
