# [Feature Name] Implementation Plan

> Template for document processing features (new formats, chunking strategies, pipeline stages)

## Overview
[Brief description of the processing feature and why it's needed]

## Current State Analysis
[What processing capabilities exist now, what's missing]

### Key Discoveries:
- [Current pipeline stages with file:line]
- [Existing processors to model after]
- [Constraints or dependencies]

## Desired End State
[Specific processing capability after completion, how to verify]

## Rhizome Architecture
- **Module**: Worker
- **Storage**: Database + Storage
- **Migration**: Yes/No - [053_description.sql if yes]
- **Test Tier**: Critical/Stable
- **Pipeline Stages**: [Which of 10 stages - see docs/PROCESSING_PIPELINE.md]
- **Processing Mode**: LOCAL / CLOUD / BOTH

## What We're NOT Doing
[Out-of-scope items to prevent feature creep]

## Implementation Approach

### Pipeline Integration
[How does this fit into the 10-stage pipeline?]
1. Download (Stage 1) → [changes needed?]
2. Extract (Stage 2) → [changes needed?]
3. Chunk (Stage 3) → [changes needed?]
4. [Continue through relevant stages]

### Processing Mode Decision
- **LOCAL**: Uses Docling + Ollama (zero cost)
- **CLOUD**: Uses Gemini API (cost per document)
- **BOTH**: Hybrid approach with fallback

Chosen: [mode] because [rationale]

## Phase 1: Processor Implementation

### Overview
[Create/modify processor for new format/capability]

### Changes Required:

#### 1. Processor Module
**File**: `worker/processors/[format]-processor.ts`
**Changes**:
```typescript
// Implement processor following pattern from pdf-processor.ts
export class [Format]Processor extends BaseProcessor {
  async process(input: ProcessorInput): Promise<ProcessorOutput> {
    // Processing logic
  }
}
```

#### 2. Router Integration
**File**: `worker/processors/router.ts`
**Changes**: Register new processor

#### 3. Types
**File**: `worker/types/database.ts`
**Changes**: Add source_type if new format

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test worker/processors/[format]-processor.test.ts`
- [ ] Type check: `npm run type-check`
- [ ] Integration test: `npm test worker/tests/integration/[format].test.ts`

#### Manual Verification:
- [ ] Upload sample document (small)
- [ ] Verify processing completes
- [ ] Check chunks in database
- [ ] Verify content.md in Storage

### Service Restarts:
- [ ] Worker: restart via `npm run dev`

---

## Phase 2: Pipeline Stage Integration

### Overview
[Integrate with specific pipeline stages]

### Changes Required:

#### 1. Stage Modifications
**Files**: `worker/handlers/[relevant-stages].ts`
**Changes**: [specific modifications]

#### 2. Orchestrator Updates
**File**: `worker/handlers/import-document.ts`
**Changes**: [orchestration logic]

### Success Criteria:

#### Automated Verification:
- [ ] End-to-end test: `npm test worker/tests/integration/full-pipeline.test.ts`
- [ ] All stages complete successfully

#### Manual Verification:
- [ ] Test with large document (500+ pages)
- [ ] Verify all pipeline stages execute
- [ ] Check ProcessingDock shows progress
- [ ] Confirm Storage has all artifacts

---

## Phase 3: Error Handling & Edge Cases

### Overview
[Robust error handling for production]

### Changes Required:

#### 1. Error Recovery
**Files**: [processor and handler files]
**Changes**:
- Graceful degradation
- Retry logic
- Fallback strategies

### Success Criteria:

#### Automated Verification:
- [ ] Error handling tests pass

#### Manual Verification:
- [ ] Test with corrupted document
- [ ] Test with unsupported variant
- [ ] Verify error messages clear
- [ ] Check job system shows failure correctly

---

## Testing Strategy

### Unit Tests:
- Processor logic
- Format parsing
- Chunk extraction
- Error conditions

### Integration Tests:
- Full pipeline with test documents
- Storage artifact validation
- Database state verification

### Manual Testing:
1. Upload variety of documents (small, large, edge cases)
2. Verify processing completes end-to-end
3. Check quality of extracted content
4. Test error scenarios

## Performance Considerations

### Processing Time:
- Small documents (<50p): [target]
- Large documents (500p): [target]

### Cost (if CLOUD mode):
- Estimated cost per document: [calculation]
- Total for 100 documents: [cost]

### Resource Usage:
- Memory requirements
- CPU usage
- Storage impact

## Migration Notes
[If database changes needed, describe migration strategy]

## References
- Architecture: `docs/ARCHITECTURE.md`
- Pipeline: `docs/PROCESSING_PIPELINE.md`
- Similar processor: `worker/processors/[example].ts`
- Testing: `docs/testing/TESTING_RULES.md`
