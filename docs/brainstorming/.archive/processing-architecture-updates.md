# Rhizome Processing Architecture: Implementation Summary

## What We're Building

A 3-engine collision detection system that finds meaningful connections between document chunks:
1. **Semantic Similarity** - Fast baseline using embeddings
2. **Contradiction Detection** - Finds conceptual tensions using metadata
3. **Thematic Bridge** - AI-powered cross-domain concept matching

We're dropping 5 weak engines (Conceptual Density, Temporal Proximity, Citation Network, Emotional Resonance, Structural Pattern) because they're either redundant or too shallow to be useful.

## The Processing Pipeline

### For Large Documents (500+ pages)

**Problem:** Gemini 2.0 Flash has 65k output token limit. A 500-page book outputs ~200k tokens of markdown.

**Solution:** Batched extraction with intelligent stitching

```
1. PDF → Gemini (batched)
   - Extract 100 pages at a time with 10-page overlap
   - 5-6 API calls for 500-page book
   - Cost: ~$0.12

2. Stitch markdown sections
   - Find overlapping content via fuzzy substring matching
   - Remove duplicates at boundaries
   - Local processing, free

3. Chunk + extract metadata (batched)
   - Process 100k chars at a time
   - Extract: content, themes, concepts, emotional_tone, importance
   - 10 API calls for 500-page book
   - Cost: ~$0.20

Total: $0.32 per 500-page book
```

### Why This Architecture

**Alternative rejected:** Per-chunk metadata extraction
- Would need 400+ API calls per document
- Cost: ~$0.80 per document
- Our approach is 60% cheaper

**Alternative rejected:** Single-pass extraction
- Hits 65k token output limit on large books
- Can't output full markdown in one call
- Batching is necessary, not optional

**Why batched metadata extraction:** 
- Gemini can process 100 chunks in one call (65k output limit)
- Reduces from 400 calls to 10 calls
- Maintains quality while cutting costs 40x

## Connection Detection Strategy

**Cost control through aggressive filtering:**

For ThematicBridge engine (the expensive AI-powered one):
- Only analyze chunks with importance > 0.6 (filters ~75%)
- Only cross-document pairs (filters ~50% more)
- Only different domains (filters ~60% more)
- Only 5-15 candidates per source chunk

Result: 200 AI calls per document instead of 160,000

**Cost: $0.20 per document for connection detection**

## Total System Cost

Per 500-page book:
- Extraction: $0.12
- Metadata: $0.20
- Connection detection: $0.20
- **Total: $0.52**

For 100 books: $52 total
For 1000 books: $520 total

This scales linearly. No surprise costs.

## Key Technical Decisions

**1. Why overlap in extraction?**
- Page boundaries split sentences mid-thought
- 10-page overlap ensures we capture complete content
- Stitching algorithm removes duplicates

**2. Why fuzzy matching for stitching?**
- OCR/extraction may have slight variations
- Normalized whitespace matching handles formatting differences
- Falls back to paragraph boundaries if no match found

**3. Why batch metadata extraction?**
- 40x cost reduction vs per-chunk
- Maintains rich metadata (concepts, emotional tone, themes)
- Gemini handles batch context well at temperature 0.1

**4. Why only 3 engines?**
- 7 engines was over-engineering
- 5 were shallow regex pattern matchers
- 3 engines each solve distinct problems:
  - Similarity: "same topic, same view"
  - Contradiction: "same topic, opposing views"
  - Bridge: "different domains, shared concept"

## What Your Developer Needs to Implement

1. **Batched extraction** (`extractLargePDF`)
   - Loop: extract 100 pages at a time
   - Track: page ranges and overlap regions

2. **Stitching** (`stitchMarkdownBatches`)
   - Find overlap via substring matching
   - Remove duplicates at boundaries
   - Handle edge case: no overlap found

3. **Batched chunking** (`batchChunkAndExtractMetadata`)
   - Process 100k char windows
   - Track: absolute character positions
   - Parse: JSON with chunks array

4. **Update orchestrator**
   - Register only 3 engines
   - Set weights: Contradiction 0.40, ThematicBridge 0.35, Semantic 0.25

5. **Add ThematicBridge engine**
   - Filter candidates aggressively
   - Batch AI calls (5 at a time)
   - Handle failures gracefully (skip, don't fail job)

## Testing Strategy

1. Test stitching on one 500-page book first
2. Verify chunks have correct offsets
3. Process 5 books, check connection quality
4. If connections are useful, process full library
5. Monitor costs: should be ~$0.50/book

## The Trade-off We're Making

**Chose:** Batched AI extraction with rich metadata ($0.32/book)
**Over:** Local regex extraction with shallow metadata ($0.02/book)

**Why:** The vision requires semantic understanding. Regex can't find "paranoia in Gravity's Rainbow ↔ surveillance capitalism" connections. AI can. The cost difference ($0.30/book) is worth it for meaningful discovery.

If after testing the connections aren't useful, we can fall back to regex. But test the AI version first.


## File-by-File Code Placement

### 1. Large PDF Extraction Logic

**File:** `worker/processors/pdf-processor.ts`

Add these functions at the top of the file (after imports, before the PDFProcessor class):

```typescript
// Add these interfaces and functions BEFORE the PDFProcessor class

interface ExtractionBatch {
  markdown: string;
  startPage: number;
  endPage: number;
  overlapStart: number;
}

async function extractLargePDF(...) { /* the full function */ }
function stitchMarkdownBatches(...) { /* the full function */ }
function findBestOverlap(...) { /* the full function */ }
```

Then **replace** the existing `process()` method in PDFProcessor class with the updated version that checks `totalPages` and calls either single-pass or batched extraction.

---

### 2. Batched Chunking + Metadata

**File:** `worker/lib/ai-chunking-batch.ts` (NEW FILE)

```typescript
import { GoogleGenAI } from '@google/genai';
import type { ProcessedChunk } from '../types/processor';

export async function batchChunkAndExtractMetadata(
  ai: GoogleGenAI,
  markdown: string
): Promise<ProcessedChunk[]> {
  // ... the full function from my code
}
```

Then import it in `pdf-processor.ts`:
```typescript
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch';
```

---

### 3. Enhanced Contradiction Engine

**File:** `worker/engines/contradiction-detection.ts`

**REPLACE the entire file** with the enhanced version I provided. Keep the imports at the top, replace everything else.

---

### 4. Thematic Bridge Engine

**File:** `worker/engines/thematic-bridge.ts` (NEW FILE)

```typescript
// Copy the entire ThematicBridgeEngine class I provided
```

---

### 5. Update Engine Types

**File:** `worker/engines/types.ts`

Find the `EngineType` enum and add:

```typescript
export enum EngineType {
  SEMANTIC_SIMILARITY = 'semantic_similarity',
  CONTRADICTION_DETECTION = 'contradiction_detection',
  THEMATIC_BRIDGE = 'thematic_bridge',  // ADD THIS
  
  // REMOVE or comment out:
  // STRUCTURAL_PATTERN = 'structural_pattern',
  // TEMPORAL_PROXIMITY = 'temporal_proximity',
  // CONCEPTUAL_DENSITY = 'conceptual_density',
  // EMOTIONAL_RESONANCE = 'emotional_resonance',
  // CITATION_NETWORK = 'citation_network',
}
```

Update `DEFAULT_WEIGHTS`:

```typescript
export const DEFAULT_WEIGHTS: WeightConfig = {
  weights: {
    [EngineType.SEMANTIC_SIMILARITY]: 0.25,
    [EngineType.CONTRADICTION_DETECTION]: 0.40,
    [EngineType.THEMATIC_BRIDGE]: 0.35,
  },
  normalizationMethod: 'linear',
  combineMethod: 'sum',
};
```

---

### 6. Update Orchestrator

**File:** `worker/handlers/detect-connections.ts`

Replace the `initializeOrchestrator` function:

```typescript
import { ThematicBridgeEngine } from '../engines/thematic-bridge';

function initializeOrchestrator(weights?: WeightConfig): CollisionOrchestrator {
  if (!orchestrator) {
    console.log('[DetectConnections] Initializing orchestrator with 3 engines');
    
    orchestrator = new CollisionOrchestrator({
      parallel: true,
      maxConcurrency: 3,  // Down from 7
      globalTimeout: 10000,  // 10 seconds (AI takes longer)
      weights: weights,
      cache: {
        enabled: true,
        ttl: 300000,
        maxSize: 1000,
      },
    });
    
    // Register only 3 engines
    const apiKey = process.env.GOOGLE_AI_API_KEY!;
    const engines = [
      new SemanticSimilarityEngine(),
      new ContradictionDetectionEngine(),
      new ThematicBridgeEngine(apiKey),
    ];
    
    orchestrator.registerEngines(engines);
    
    console.log('[DetectConnections] Orchestrator initialized with 3 engines');
  } else if (weights) {
    orchestrator.updateWeights(weights);
  }
  
  return orchestrator;
}
```

---

### 7. Remove Old Engine Files

**Delete or comment out these files** (they're no longer used):

- `worker/engines/structural-pattern.ts`
- `worker/engines/temporal-proximity.ts`
- `worker/engines/conceptual-density.ts`
- `worker/engines/emotional-resonance.ts`
- `worker/engines/citation-network.ts`

---

## Summary

```
worker/
├── engines/
│   ├── types.ts                      [MODIFY: Update EngineType enum and DEFAULT_WEIGHTS]
│   ├── contradiction-detection.ts    [REPLACE: New enhanced version]
│   ├── thematic-bridge.ts           [NEW: Add this file]
│   └── semantic-similarity.ts        [NO CHANGE]
├── lib/
│   ├── ai-chunking-batch.ts         [NEW: Add this file]
│   └── markdown-chunking.ts          [NO CHANGE]
├── processors/
│   └── pdf-processor.ts             [MODIFY: Add extraction functions, update process()]
└── handlers/
    └── detect-connections.ts        [MODIFY: Update initializeOrchestrator()]
```

**Implementation order:**
1. Add `ai-chunking-batch.ts`
2. Update `pdf-processor.ts` with batched extraction
3. Replace `contradiction-detection.ts`
4. Add `thematic-bridge.ts`
5. Update `types.ts`
6. Update `detect-connections.ts`
7. Test on one 500-page book