# PRP: Processing Pipeline Optimization - Batched Document Processing

**Status**: Planning  
**Priority**: High  
**Estimated Effort**: 2-3 weeks  
**Target Release**: Next sprint  

## Executive Summary

Optimize Rhizome V2's document processing pipeline to support large documents (500+ pages) through intelligent batching while reducing AI processing costs by 60%. This addresses the current 65K token output limit in Gemini 2.0 Flash and implements cost-effective metadata extraction for personal knowledge synthesis.

**Key Outcomes:**
- Support documents up to 500+ pages without token limits
- Reduce processing costs from $0.80 to $0.50 per document (60% reduction)
- Maintain processing quality with focused 3-engine collision detection
- Implement robust error handling for personal tool reliability

## Business Context

### Problem Statement
Current processing pipeline hits Gemini 2.0 Flash's 65K output token limit on large documents (500+ pages generate ~200K tokens of markdown). This blocks processing of academic books, comprehensive reports, and large research papers - key content types for knowledge synthesis.

### Solution Approach
Implement intelligent batching with overlap handling for large document extraction, combined with batched AI-powered metadata extraction to replace current regex-based approach. This enables processing of any document size while optimizing costs through strategic batching.

### Personal Tool Philosophy
- **Automatic batching**: No UI configuration complexity
- **Graceful degradation**: Log failures, continue processing
- **Cost transparency**: Fixed $0.50/book cost model
- **No backward compatibility**: Greenfield implementation approach

## Technical Requirements

### Core Functionality

#### 1. Batched PDF Extraction
- **Input**: PDF documents of any size
- **Output**: Single stitched markdown with preserved structure
- **Batching**: 100 pages per batch with 10-page overlap
- **Stitching**: Fuzzy substring matching to remove duplicates

#### 2. AI-Powered Metadata Extraction  
- **Input**: Processed markdown content
- **Output**: Rich metadata (themes, concepts, importance scores)
- **Batching**: 100K character windows with Gemini processing
- **Quality**: Replace regex extractors with AI analysis

#### 3. Legacy Engine Cleanup
- **Remove**: References to 5 deprecated engines
- **Update**: Weight configuration for 3-engine system
- **Migrate**: User preferences to new engine structure

### Performance Targets

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Max document size | 200 pages | 500+ pages | 150%+ |
| Processing cost | $0.80/book | $0.50/book | 60% reduction |
| Processing time | <2 min/hour | <2 min/hour | Maintained |
| Success rate | 95% | 95%+ | Maintained/improved |

### Technical Constraints

- **Gemini 2.0 Flash**: 65K output token limit, 12-minute timeout
- **PostgreSQL**: 65,535 parameter limit for batch operations
- **Cache TTL**: 47-hour Gemini file cache (1-hour buffer)
- **ESM Requirements**: Strict ES module compliance in worker

## Implementation Blueprint

### Phase 1: Cleanup & Preparation (Week 1)

#### 1.1 Remove Legacy Engine References

**File**: `worker/engines/types.ts`
```typescript
// REMOVE these deprecated engine types
export enum EngineType {
  // DELETE:
  // STRUCTURAL_PATTERN = 'structural_pattern',
  // TEMPORAL_PROXIMITY = 'temporal_proximity', 
  // CONCEPTUAL_DENSITY = 'conceptual_density',
  // EMOTIONAL_RESONANCE = 'emotional_resonance',
  // CITATION_NETWORK = 'citation_network',
  
  // KEEP:
  SEMANTIC_SIMILARITY = 'semantic_similarity',
  CONTRADICTION_DETECTION = 'contradiction_detection',
  THEMATIC_BRIDGE = 'thematic_bridge',
}

// UPDATE weights for 3-engine system
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

#### 1.2 Update Weight Configuration

**File**: `worker/lib/weight-config.ts`  
**Pattern**: Follow existing configuration patterns from lines 44-89
```typescript
// Remove old engine references and update presets
const PRESET_CONFIGS = {
  balanced: {
    [EngineType.SEMANTIC_SIMILARITY]: 0.25,
    [EngineType.CONTRADICTION_DETECTION]: 0.40,
    [EngineType.THEMATIC_BRIDGE]: 0.35,
  },
  // ... other presets
};
```

#### 1.3 Validation Commands
```bash
# Verify cleanup completion
grep -r "TEMPORAL_PROXIMITY\|CONCEPTUAL_DENSITY\|EMOTIONAL_RESONANCE\|CITATION_NETWORK\|STRUCTURAL_PATTERN" worker/

# Run stability tests
cd worker && npm run test:stable
```

### Phase 2: Batched Processing Implementation (Week 2-3)

#### 2.1 Batched PDF Extraction

**File**: `worker/processors/pdf-processor.ts`  
**Pattern**: Extend existing processor following lines 51-145

```typescript
// Add before PDFProcessor class
interface ExtractionBatch {
  markdown: string;
  startPage: number;
  endPage: number;
  overlapStart: number;
}

const MAX_PAGES_PER_BATCH = 100;
const OVERLAP_PAGES = 10;

async function extractLargePDF(
  ai: GoogleGenAI,
  fileUri: string,
  totalPages: number,
  updateProgress: (percent: number, stage: string, substage: string, details: string) => Promise<void>
): Promise<string> {
  const batches: ExtractionBatch[] = [];
  const batchCount = Math.ceil(totalPages / MAX_PAGES_PER_BATCH);
  
  // Extract batches with overlap
  for (let i = 0; i < batchCount; i++) {
    const startPage = i * MAX_PAGES_PER_BATCH + 1;
    const endPage = Math.min(startPage + MAX_PAGES_PER_BATCH - 1, totalPages);
    const overlapStart = Math.max(startPage - OVERLAP_PAGES, 1);
    
    await updateProgress(
      20 + (i / batchCount) * 40, // 20-60% of total
      'extract',
      'batch_processing', 
      `Extracting pages ${startPage}-${endPage} (batch ${i + 1}/${batchCount})`
    );
    
    const prompt = `Extract and convert pages ${startPage}-${endPage} to clean markdown...`;
    const result = await ai.generateContent({
      contents: [{ role: 'user', parts: [{ fileData: { fileUri, mimeType: 'application/pdf' } }, { text: prompt }] }]
    });
    
    batches.push({
      markdown: result.response.text(),
      startPage,
      endPage,
      overlapStart: i > 0 ? overlapStart : startPage
    });
  }
  
  return stitchMarkdownBatches(batches);
}

function stitchMarkdownBatches(batches: ExtractionBatch[]): string {
  if (batches.length === 1) return batches[0].markdown;
  
  let stitched = batches[0].markdown;
  
  for (let i = 1; i < batches.length; i++) {
    const current = batches[i].markdown;
    const overlap = findBestOverlap(stitched, current);
    
    if (overlap.found) {
      // Remove overlapping content and append
      const uniqueContent = current.substring(overlap.endIndex);
      stitched += uniqueContent;
    } else {
      // No overlap found, append with separator
      stitched += '\n\n---\n\n' + current;
    }
  }
  
  return stitched;
}

function findBestOverlap(existing: string, newContent: string): { found: boolean; endIndex: number } {
  // Implementation following fuzzy matching pattern from ai-chunking.ts:39-86
  const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  
  // Try different overlap sizes
  const testSizes = [500, 300, 150, 50];
  
  for (const size of testSizes) {
    const existingEnd = normalizeText(existing.slice(-size));
    const newStart = normalizeText(newContent.slice(0, size));
    
    if (existingEnd === newStart) {
      return { found: true, endIndex: size };
    }
  }
  
  return { found: false, endIndex: 0 };
}

// UPDATE existing process() method in PDFProcessor class
async process(): Promise<ProcessResult> {
  // ... existing setup code ...
  
  // Determine processing approach based on document size
  const totalPages = await this.getPageCount(fileUri); // Implement page counting
  
  if (totalPages > 200) {
    console.log(`[PDFProcessor] Large document detected (${totalPages} pages), using batched extraction`);
    markdown = await extractLargePDF(this.ai, fileUri, totalPages, this.updateProgress.bind(this));
  } else {
    console.log(`[PDFProcessor] Standard document (${totalPages} pages), using single-pass extraction`);
    markdown = await this.extractContent(fileUri); // Existing method
  }
  
  // ... continue with existing chunking logic ...
}
```

#### 2.2 AI-Powered Batched Metadata Extraction

**File**: `worker/lib/ai-chunking-batch.ts` (NEW FILE)  
**Pattern**: Follow ThematicBridge AI integration from `worker/engines/thematic-bridge.ts:94-98`

```typescript
import { GoogleGenAI } from '@google/genai';
import type { ProcessedChunk } from '../types/processor';

const BATCH_SIZE_CHARS = 100000; // 100K characters per batch
const MAX_CHUNKS_PER_BATCH = 100; // Gemini output limit consideration

export async function batchChunkAndExtractMetadata(
  ai: GoogleGenAI,
  markdown: string,
  documentId: string,
  updateProgress?: (percent: number, stage: string, substage: string, details: string) => Promise<void>
): Promise<ProcessedChunk[]> {
  
  // Split into character-based batches
  const batches = createCharacterBatches(markdown, BATCH_SIZE_CHARS);
  const allChunks: ProcessedChunk[] = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    if (updateProgress) {
      await updateProgress(
        60 + (i / batches.length) * 30, // 60-90% of total
        'chunk',
        'ai_analysis',
        `Analyzing batch ${i + 1}/${batches.length} (${Math.round(batch.length / 1000)}K chars)`
      );
    }
    
    try {
      const batchChunks = await processBatch(ai, batch, i * BATCH_SIZE_CHARS, documentId);
      allChunks.push(...batchChunks);
    } catch (error) {
      console.warn(`[AIChunking] Batch ${i + 1} failed, processing individually:`, error);
      
      // Fallback: process failed batch as smaller chunks
      const fallbackChunks = await processBatchFallback(ai, batch, i * BATCH_SIZE_CHARS, documentId);
      allChunks.push(...fallbackChunks);
    }
  }
  
  return allChunks;
}

async function processBatch(
  ai: GoogleGenAI,
  content: string,
  baseOffset: number,
  documentId: string
): Promise<ProcessedChunk[]> {
  
  const prompt = `Analyze this content and create semantic chunks with rich metadata.
  
For each chunk, provide:
- content: The actual text content
- themes: Array of 2-3 main themes
- concepts: Array of 3-5 key concepts  
- emotional_tone: Emotional tone description
- importance: Score 0.0-1.0 for content importance
- summary: 1-2 sentence summary

Return as JSON array: [{"content": "...", "themes": [...], "concepts": [...], "emotional_tone": "...", "importance": 0.8, "summary": "..."}]

Content to analyze:
${content}`;

  const result = await ai.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1, // Low temperature for consistent metadata
      maxOutputTokens: 65000,
    }
  });
  
  const response = result.response.text();
  const chunks = JSON.parse(response) as Array<{
    content: string;
    themes: string[];
    concepts: string[];
    emotional_tone: string;
    importance: number;
    summary: string;
  }>;
  
  // Convert to ProcessedChunk format with calculated offsets
  return chunks.map((chunk, index) => {
    const startOffset = baseOffset + content.indexOf(chunk.content);
    const endOffset = startOffset + chunk.content.length;
    
    return {
      id: `${documentId}-batch-${Math.floor(baseOffset / BATCH_SIZE_CHARS)}-${index}`,
      content: chunk.content,
      start_offset: startOffset,
      end_offset: endOffset,
      chunk_index: index,
      metadata: {
        themes: chunk.themes,
        concepts: chunk.concepts,
        emotional_tone: chunk.emotional_tone,
        importance: chunk.importance,
        summary: chunk.summary,
        processing_method: 'ai_batch'
      }
    };
  });
}

async function processBatchFallback(
  ai: GoogleGenAI,
  content: string,
  baseOffset: number,
  documentId: string
): Promise<ProcessedChunk[]> {
  // Split failed batch into smaller pieces and process individually
  // Follow existing error recovery pattern from metadata-extractor.ts:156-167
  const smallerChunks = content.match(/.{1,10000}/g) || [content];
  const results: ProcessedChunk[] = [];
  
  for (let i = 0; i < smallerChunks.length; i++) {
    try {
      const chunkResult = await processBatch(ai, smallerChunks[i], baseOffset + i * 10000, documentId);
      results.push(...chunkResult);
    } catch (error) {
      console.warn(`[AIChunking] Individual chunk ${i} failed, creating minimal chunk:`, error);
      
      // Create minimal chunk with basic metadata
      results.push({
        id: `${documentId}-fallback-${baseOffset}-${i}`,
        content: smallerChunks[i],
        start_offset: baseOffset + i * 10000,
        end_offset: baseOffset + i * 10000 + smallerChunks[i].length,
        chunk_index: i,
        metadata: {
          themes: ['uncategorized'],
          concepts: ['content'],
          emotional_tone: 'neutral',
          importance: 0.5,
          summary: 'Content processed with minimal metadata due to processing error',
          processing_method: 'fallback'
        }
      });
    }
  }
  
  return results;
}

function createCharacterBatches(content: string, batchSize: number): string[] {
  const batches: string[] = [];
  
  for (let i = 0; i < content.length; i += batchSize) {
    const batch = content.slice(i, i + batchSize);
    batches.push(batch);
  }
  
  return batches;
}
```

#### 2.3 Integration with PDF Processor

**File**: `worker/processors/pdf-processor.ts`  
**Update**: Import and use new batched metadata extraction

```typescript
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch';

// In process() method, replace existing chunking logic:
if (totalPages > 200 || markdown.length > 50000) {
  console.log('[PDFProcessor] Using AI-powered batched metadata extraction');
  
  chunks = await batchChunkAndExtractMetadata(
    this.ai,
    markdown,
    this.documentId,
    this.updateProgress.bind(this)
  );
} else {
  console.log('[PDFProcessor] Using standard chunking');
  chunks = await this.chunkContent(markdown); // Existing method
}
```

### Phase 3: Validation & Optimization (Week 3)

#### 3.1 Performance Validation

**Commands**:
```bash
# Test with large document (500+ pages)
cd worker && npm run test:integration -- --testNamePattern="large document processing"

# Validate metadata quality
cd worker && npm run validate:metadata:real

# Benchmark performance and costs
cd worker && npm run benchmark:pdf -- --document-size=500

# Check batch processing efficiency  
cd worker && npm run benchmark:batch
```

#### 3.2 Cost Monitoring

**File**: `worker/lib/cost-tracker.ts` (NEW FILE)
```typescript
export class CostTracker {
  private static instance: CostTracker;
  private costs: { [documentId: string]: number } = {};
  
  logAPICall(documentId: string, inputTokens: number, outputTokens: number) {
    // Gemini 2.0 Flash pricing: $0.075/1M input, $0.30/1M output
    const cost = (inputTokens * 0.075 + outputTokens * 0.30) / 1000000;
    this.costs[documentId] = (this.costs[documentId] || 0) + cost;
  }
  
  getCost(documentId: string): number {
    return this.costs[documentId] || 0;
  }
}
```

#### 3.3 Quality Validation

**Criteria**:
- Stitched documents maintain structural integrity
- Metadata quality matches or exceeds current regex approach
- Processing time remains under 2 minutes per hour of content
- Cost target of $0.50 per 500-page book achieved

## Error Handling Strategy

### Personal Tool Philosophy
- **Log failures, continue processing**: Don't block entire job for partial failures
- **Individual retry**: Process failed chunks separately, not entire batches
- **Graceful degradation**: Create minimal chunks for failed AI processing
- **No automatic retries**: User can manually reprocess if needed

### Implementation Pattern
```typescript
// Follow existing pattern from batch-operations.ts:213-229
try {
  const result = await processBatch(batch);
  return result;
} catch (error) {
  console.warn(`[BatchProcessor] Batch failed, processing individually:`, error);
  return await processBatchFallback(batch);
}
```

## Validation Gates

### Development Validation
```bash
# Code quality
cd worker && npm run lint
cd worker && npm run build

# Unit tests
cd worker && npm test

# Integration tests
cd worker && npm run test:integration

# Performance validation
cd worker && npm run validate:metadata:real
cd worker && npm run benchmark:pdf
```

### Pre-deployment Validation
```bash
# Full validation suite
cd worker && npm run test:full-validation

# Cost validation (should show ~$0.50/book)
cd worker && npm run benchmark:cost-analysis

# Large document test
cd worker && npm run test:large-documents
```

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stitching quality issues | Medium | Fuzzy matching with fallback to separator |
| AI metadata cost overrun | High | Aggressive batching, cost tracking |
| Large document timeout | Medium | Progress tracking, chunked processing |
| Memory usage on large docs | Low | Streaming processing, no full-doc loading |

### Implementation Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing functionality | High | Comprehensive test suite, feature flags |
| Performance regression | Medium | Benchmarking, performance validation |
| Cost estimation accuracy | Medium | Real-world testing, cost monitoring |

## Success Metrics

### Functional Requirements
- [ ] Support 500+ page documents without token limits
- [ ] Maintain processing quality (connection discovery accuracy)
- [ ] Achieve 60% cost reduction ($0.80 → $0.50 per book)
- [ ] Process documents in under 2 minutes per hour of content

### Quality Metrics  
- [ ] Stitching accuracy >95% (no lost content)
- [ ] Metadata completeness >90% (all required fields)
- [ ] Error recovery >99% (graceful degradation)
- [ ] Cost prediction accuracy ±10%

### Performance Metrics
- [ ] Processing time: <2 min per hour of content
- [ ] Memory usage: <500MB peak for any document size
- [ ] API success rate: >99% with retry logic
- [ ] Cache hit rate: >70% for repeated operations

## Implementation Timeline

### Week 1: Cleanup & Preparation
- [ ] Remove legacy engine references
- [ ] Update weight configuration system  
- [ ] Validate 3-engine system consistency
- [ ] Update documentation and tests

### Week 2: Batched Processing Core
- [ ] Implement batched PDF extraction with overlap
- [ ] Create AI-powered metadata extraction
- [ ] Integrate with existing progress tracking
- [ ] Add cost monitoring utilities

### Week 3: Integration & Validation
- [ ] Integrate batched processing with PDF processor
- [ ] Comprehensive testing with large documents
- [ ] Performance benchmarking and optimization
- [ ] Cost validation and monitoring setup

## Files Modified

### Core Implementation
- `worker/processors/pdf-processor.ts` - Add batched extraction logic
- `worker/lib/ai-chunking-batch.ts` - NEW: AI metadata batching
- `worker/lib/cost-tracker.ts` - NEW: Cost monitoring utilities

### Configuration Updates  
- `worker/engines/types.ts` - Remove deprecated engine types
- `worker/lib/weight-config.ts` - Update for 3-engine system
- `worker/lib/user-preferences.ts` - Clean up old engine references

### Testing & Validation
- `worker/tests/integration/large-document.test.ts` - NEW: Large document tests
- `worker/benchmarks/batch-processing.ts` - NEW: Batch performance tests

## Dependencies

### New Dependencies
None - all functionality built with existing Gemini SDK and Supabase client

### Version Requirements
- Gemini 2.0 Flash (or compatible model with 65K+ output tokens)
- Node.js with ESM support (existing requirement)
- PostgreSQL with pgvector (existing requirement)

## Post-Implementation

### Monitoring
- Cost tracking per document processed
- Processing time monitoring for performance regression
- Error rate monitoring for batch processing
- Quality metrics for connection discovery

### Future Optimizations
- Dynamic batch sizing based on content complexity
- Intelligent cache warming for frequently accessed documents
- Cross-document batch optimization for multiple uploads
- Advanced stitching algorithms for improved accuracy

---

**PRP Confidence Score: 9/10**

This implementation leverages extensive codebase analysis and follows established patterns throughout. The approach is conservative, building on proven functionality while adding targeted optimizations. Risk mitigation is comprehensive with multiple fallback strategies and validation gates.

The business requirements are clearly defined with user clarifications, and the technical approach is well-documented with specific file paths and code examples. Success criteria are measurable and achievable based on current system performance.