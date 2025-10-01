# PRP: Collision Detection System Simplification

**Document ID**: PRP-003  
**Feature**: 3-Engine Collision Detection System  
**Priority**: High  
**Estimated Effort**: 1-2 sprints  
**Created**: 2025-01-20  
**Status**: Ready for Implementation

## Executive Summary

Simplify Rhizome V2's collision detection system from 7 engines to a focused 3-engine architecture that eliminates redundant shallow pattern matchers while adding sophisticated AI-powered cross-domain connection discovery.

### Key Changes
- **Remove 5 engines**: Conceptual Density, Structural Pattern, Temporal Proximity, Citation Network, Emotional Resonance
- **Keep 2 engines**: Semantic Similarity (fast baseline), Contradiction Detection (enhanced as priority)
- **Add 1 engine**: Thematic Bridge (AI-powered cross-domain concept matching)
- **New weights**: SEMANTIC_SIMILARITY: 0.25, CONTRADICTION_DETECTION: 0.40, THEMATIC_BRIDGE: 0.35
- **Cost target**: ~$0.10-0.30 per document for AI engine

## Problem Statement

### Current Pain Points
1. **Over-engineered complexity**: 7 engines where 5 are shallow pattern matchers with limited value
2. **Redundant functionality**: Multiple engines detecting similar connection types  
3. **Maintenance overhead**: Complex orchestration for marginal benefit
4. **Missing sophistication**: No cross-domain conceptual bridge detection

### Success Criteria
- Reduced system complexity (3 vs 7 engines)
- Maintained or improved connection quality
- Added cross-domain conceptual bridge detection
- Cost-effective AI integration (~$0.20/document target)
- Improved maintainability and performance

## User Stories & Requirements

### Core Functionality
**As a user**, I want the system to detect three distinct types of connections:
1. **Similarity**: "These chunks say the same thing" (fast embedding-based)
2. **Contradiction**: "These chunks disagree about the same thing" (metadata-powered)
3. **Bridge**: "These chunks connect different domains through shared concepts" (AI-powered)

### Performance Requirements
- **Processing time**: Maintain current <500ms for 100 chunks
- **Cost constraints**: $0.10-0.30 per document for AI engine
- **Reliability**: 99.9% uptime with graceful degradation
- **Scalability**: Support documents up to 1000 chunks

### Migration Requirements
- **Backward compatibility**: Keep existing connections as-is
- **Future processing**: Apply new 3-engine system to new documents only
- **Data integrity**: No data loss during transition
- **Rollback capability**: Easy revert to 7-engine system if needed

## Technical Architecture

### System Overview
```
┌─────────────────────────────────────────────────────────┐
│                 Collision Orchestrator                  │
│                (Parallel Execution)                     │
├─────────────────┬─────────────────┬─────────────────────┤
│ Semantic        │ Contradiction   │ Thematic Bridge     │
│ Similarity      │ Detection       │ (NEW - AI)          │
│ (Keep)          │ (Keep/Enhance)  │                     │
│                 │                 │                     │
│ Weight: 0.25    │ Weight: 0.40    │ Weight: 0.35        │
│ Fast baseline   │ Priority focus  │ Cross-domain        │
└─────────────────┴─────────────────┴─────────────────────┘
```

### Thematic Bridge Engine Design

**Architecture**: AI-powered with aggressive pre-filtering to control costs

```typescript
class ThematicBridgeEngine extends BaseEngine {
  // 1. FILTER: Source importance > 0.6
  // 2. FILTER: Target importance > 0.6  
  // 3. FILTER: Cross-document only
  // 4. FILTER: Different domains
  // 5. FILTER: Concept overlap 0.2-0.7 (sweet spot)
  // 6. FILTER: Top 15 candidates by importance
  // Result: ~40 source chunks × 5 candidates = 200 AI calls per document
}
```

**Cost Analysis**:
- Pre-filtering reduces from 160,000 potential pairs to ~200 AI calls
- Gemini 2.0 Flash: ~$0.001 per call = $0.20 per document
- 47-hour caching reduces repeat processing costs
- Batch processing optimizes API usage

### Implementation Strategy

**Phase 1: Create ThematicBridgeEngine**
1. Extend BaseEngine with standard interface
2. Implement intelligent candidate filtering
3. Add Gemini integration with retry mechanisms
4. Include comprehensive error handling

**Phase 2: Update System Configuration**  
1. Add THEMATIC_BRIDGE to EngineType enum
2. Update DEFAULT_WEIGHTS configuration
3. Modify orchestrator initialization
4. Update maxConcurrency from 7 to 3

**Phase 3: Remove Deprecated Engines**
1. Delete 5 engine files
2. Remove from orchestrator registration  
3. Clean up imports and types
4. Update documentation

**Phase 4: Testing & Validation**
1. Add ThematicBridge engine tests
2. Update orchestrator tests
3. Run integration validation
4. Performance benchmarking

## Detailed Implementation

### Core Components

#### 1. ThematicBridgeEngine Implementation

**File**: `/worker/engines/thematic-bridge.ts`

```typescript
import { BaseEngine } from './base-engine.js';
import { GoogleGenAI } from '@google/genai';

export class ThematicBridgeEngine extends BaseEngine {
  readonly type: EngineType = EngineType.THEMATIC_BRIDGE;
  
  private ai: GoogleGenAI;
  private readonly IMPORTANCE_THRESHOLD = 0.6;
  private readonly MAX_CANDIDATES = 15;
  private readonly MIN_CONCEPT_OVERLAP = 0.2;
  private readonly MAX_CONCEPT_OVERLAP = 0.7;
  private readonly MIN_BRIDGE_STRENGTH = 0.6;

  protected async detectImpl(input: CollisionDetectionInput): Promise<CollisionResult[]> {
    // 1. Filter by importance threshold
    if ((input.sourceChunk.importance_score || 0) < this.IMPORTANCE_THRESHOLD) {
      return [];
    }
    
    // 2. Get promising candidates using metadata pre-filtering
    const candidates = this.filterCandidates(input.sourceChunk, input.targetChunks);
    
    // 3. Use AI for batch analysis of candidates
    const analyses = await this.batchAnalyzeBridges(input.sourceChunk, candidates);
    
    // 4. Convert successful analyses to collision results
    return this.buildCollisionResults(analyses, candidates, input.sourceChunk);
  }
  
  private filterCandidates(sourceChunk: ChunkWithMetadata, targetChunks: ChunkWithMetadata[]): ChunkWithMetadata[] {
    // Implement aggressive filtering logic as shown in user's code
    // Returns ~5-15 candidates per source chunk
  }
  
  private async analyzeBridge(sourceChunk: ChunkWithMetadata, targetChunk: ChunkWithMetadata): Promise<BridgeAnalysis> {
    // Gemini prompt for bridge detection
    // Returns: { connected, bridgeType, sharedConcept, explanation, strength }
  }
}
```

#### 2. Type System Updates

**File**: `/worker/engines/types.ts`

```typescript
// Update EngineType enum
export enum EngineType {
  SEMANTIC_SIMILARITY = 'semantic_similarity',
  CONTRADICTION_DETECTION = 'contradiction_detection',
  THEMATIC_BRIDGE = 'thematic_bridge'  // NEW
}

// Update DEFAULT_WEIGHTS
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

#### 3. Orchestrator Updates

**File**: `/worker/handlers/detect-connections.ts`

```typescript
function initializeOrchestrator(weights?: WeightConfig): CollisionOrchestrator {
  orchestrator = new CollisionOrchestrator({
    parallel: true,
    maxConcurrency: 3,  // Reduced from 7
    globalTimeout: 10000,  // Increased for AI calls
    weights: weights,
  });
  
  // Register only the 3 engines
  const engines = [
    new SemanticSimilarityEngine(),
    new ContradictionDetectionEngine(),
    new ThematicBridgeEngine(process.env.GOOGLE_AI_API_KEY!),
  ];
  
  orchestrator.registerEngines(engines);
  return orchestrator;
}
```

### Error Handling & Resilience

**Retry Strategy**: Leverage existing `withRetry` patterns from processor base class
```typescript
private async analyzeBridge(sourceChunk: ChunkWithMetadata, targetChunk: ChunkWithMetadata): Promise<BridgeAnalysis> {
  try {
    return await this.withRetry(
      async () => {
        const result = await this.ai.models.generateContent({...});
        return JSON.parse(result.text);
      },
      'Thematic bridge analysis'
    );
  } catch (error) {
    console.warn(`[ThematicBridge] Failed after retries:`, error);
    return { connected: false, bridgeType: null, sharedConcept: '', explanation: '', strength: 0 };
  }
}
```

**Graceful Degradation**: If AI engine fails, system continues with 2-engine mode
- Individual bridge analysis failures logged but don't fail entire job
- Return empty analysis instead of throwing errors
- Orchestrator completes with available engines

### Caching Strategy

**Leverage Existing Infrastructure**:
- **GeminiFileCache**: 47-hour TTL for API responses  
- **CollisionCacheManager**: Engine result caching
- **BaseEngine caching**: Method-level @Cached decorator

**ThematicBridge-Specific Caching**:
```typescript
// Cache key includes chunk content hash + concepts for deduplication
const cacheKey = this.cacheManager.createKey(
  sourceChunk.id,
  targetChunk.id, 
  [sourceChunk.metadata?.concepts, targetChunk.metadata?.concepts]
);
```

## Validation Gates

### Pre-Implementation Validation
```bash
# Verify current system state
npm run test:engines                    # All engine tests pass
npm run test:integration               # Integration tests pass  
npm run validate:metadata             # Metadata quality check
```

### Implementation Validation
```bash
# During development
npm run test:watch                     # Continuous testing
npm run test:thematic-bridge          # New engine tests
npm run benchmark:thematic-bridge     # Performance validation
```

### Pre-Deployment Validation  
```bash
# Final validation before deployment
npm run test:full-validation          # Complete test suite
npm run validate:semantic-accuracy    # Accuracy validation
npm run benchmark:all                 # Performance benchmarks
npm run validate:cost-analysis        # Cost verification (~$0.20/doc)
```

### Success Metrics
- **Test Coverage**: >90% for new ThematicBridge engine
- **Performance**: <500ms orchestrator execution for 100 chunks
- **Cost**: $0.10-0.30 per document for AI engine
- **Quality**: Bridge connections have >0.6 strength threshold
- **Reliability**: <1% failure rate with graceful degradation

## Rollback Plan

### Immediate Rollback (if critical issues)
1. **Revert orchestrator registration** to include all 7 engines
2. **Restore DEFAULT_WEIGHTS** to original configuration  
3. **Keep ThematicBridge** implementation for future use
4. **No data migration needed** - connections table unchanged

### Gradual Rollback (if performance issues)
1. **Disable specific engines** via orchestrator config
2. **Adjust weights** to reduce problematic engine impact
3. **Monitor metrics** and gradually re-enable engines
4. **A/B testing** between 3-engine and 7-engine systems

## Dependencies & Prerequisites

### Technical Dependencies
- **Google Generative AI SDK**: Already integrated (`@google/genai`)
- **Gemini API Key**: Environment variable configuration in place
- **BaseEngine Interface**: Existing foundation supports new engine
- **Caching Infrastructure**: GeminiFileCache and CollisionCacheManager ready

### Development Prerequisites  
- **Testing Framework**: Jest configuration for worker module
- **Mock Infrastructure**: Test utilities and factories available
- **Performance Monitoring**: PerformanceMonitor and benchmarking tools
- **Validation Suite**: Existing validation framework for quality assurance

### Deployment Prerequisites
- **Environment Variables**: GOOGLE_AI_API_KEY in production
- **Database Schema**: No changes required - existing connections table compatible
- **API Rate Limits**: Monitor Gemini API usage within quotas
- **Cost Monitoring**: Track AI API costs in production

## Implementation Tasks

### Task 1: Create ThematicBridgeEngine
**Acceptance Criteria**:
- GIVEN a source chunk with >0.6 importance score
- WHEN the engine processes target chunks
- THEN it filters to ~5-15 promising candidates using metadata
- AND analyzes each candidate with Gemini for bridge connections
- AND returns CollisionResult[] with bridge explanations

### Task 2: Update System Configuration
**Acceptance Criteria**: 
- GIVEN the EngineType enum
- WHEN THEMATIC_BRIDGE is added
- THEN DEFAULT_WEIGHTS includes all 3 engines with specified weights
- AND orchestrator maxConcurrency is reduced to 3
- AND no breaking changes to existing interfaces

### Task 3: Remove Deprecated Engines
**Acceptance Criteria**:
- GIVEN the 5 deprecated engine files
- WHEN they are removed from the codebase
- THEN orchestrator no longer registers them
- AND imports are cleaned up
- AND no dead code remains

### Task 4: Implement Error Handling
**Acceptance Criteria**:
- GIVEN Gemini API failures or rate limits
- WHEN ThematicBridge processes chunks  
- THEN individual failures are logged but don't fail the job
- AND retry mechanisms with exponential backoff are used
- AND graceful degradation returns empty analysis

### Task 5: Add Comprehensive Testing
**Acceptance Criteria**:
- GIVEN the new ThematicBridge engine
- WHEN test suite runs
- THEN >90% code coverage is achieved
- AND integration tests validate 3-engine system
- AND performance benchmarks confirm <500ms execution
- AND cost analysis validates $0.10-0.30 per document

### Task 6: Update Documentation
**Acceptance Criteria**:
- GIVEN the simplified 3-engine system
- WHEN documentation is updated
- THEN architecture diagrams reflect new design
- AND API documentation includes bridge detection types
- AND migration notes explain transition approach

## Success Metrics & KPIs

### Performance Metrics
- **Processing Time**: <500ms for 100 chunks (same as current)
- **Throughput**: Support 1000+ chunk documents
- **Memory Usage**: <1GB per worker process
- **Cache Hit Rate**: >70% for repeated queries

### Quality Metrics  
- **Bridge Quality**: >0.6 strength threshold for AI-detected bridges
- **False Positive Rate**: <10% for bridge connections
- **Connection Diversity**: Bridge connections span different domains
- **User Satisfaction**: Positive feedback on cross-domain insights

### Cost Metrics
- **AI API Cost**: $0.10-0.30 per document processed
- **Infrastructure Cost**: No increase from current system
- **Development Cost**: 1-2 sprint implementation effort
- **Maintenance Cost**: Reduced complexity saves ongoing effort

### Operational Metrics
- **Uptime**: 99.9% system availability
- **Error Rate**: <1% processing failures
- **Recovery Time**: <30 seconds for graceful degradation
- **Monitoring**: Real-time metrics and alerting

## Risk Assessment

### High-Risk Areas
- **AI API Rate Limits**: Mitigation through caching and retry mechanisms
- **Cost Overruns**: Mitigation through aggressive pre-filtering
- **Quality Degradation**: Mitigation through comprehensive testing
- **Performance Impact**: Mitigation through parallel execution and caching

### Medium-Risk Areas  
- **Integration Complexity**: Mitigated by leveraging existing BaseEngine patterns
- **Migration Issues**: Mitigated by keeping existing data as-is
- **User Adoption**: Mitigated by maintaining existing functionality

### Low-Risk Areas
- **Technical Feasibility**: All required infrastructure exists
- **Team Knowledge**: Codebase patterns well-established
- **External Dependencies**: Gemini SDK already integrated

## Appendix

### Code Examples from Codebase

#### BaseEngine Pattern (Reference Implementation)
```typescript
// From /worker/engines/base-engine.ts
export abstract class BaseEngine implements CollisionEngine {
  abstract readonly type: EngineType;
  
  async detect(input: CollisionDetectionInput): Promise<CollisionResult[]> {
    // Standard validation and caching
    if (!this.canProcess(input)) return [];
    
    // Delegate to implementation
    const results = await this.detectImpl(input);
    
    // Post-processing and metrics
    return this.postProcess(results);
  }
  
  protected abstract detectImpl(input: CollisionDetectionInput): Promise<CollisionResult[]>;
}
```

#### Existing Weight Configuration
```typescript
// From /worker/lib/weight-config.ts  
export const WEIGHT_PRESETS = {
  DEFAULT: {
    weights: {
      [EngineType.SEMANTIC_SIMILARITY]: 0.25,
      [EngineType.CONCEPTUAL_DENSITY]: 0.20,
      // ... other engines
    }
  }
};
```

#### Gemini Integration Pattern
```typescript
// From /worker/lib/ai-client.ts
export function createGeminiClient(apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }
  return new GoogleGenAI(apiKey);
}
```

### Estimated Effort Breakdown
- **ThematicBridge Engine**: 3-4 days (core implementation)
- **System Updates**: 1-2 days (types, orchestrator, weights)  
- **Cleanup & Removal**: 1 day (remove deprecated engines)
- **Testing**: 2-3 days (unit, integration, performance)
- **Documentation**: 1 day (updates and migration notes)
- **Total**: 8-11 days (1-2 sprints)

### Quality Score Assessment
**PRP Quality Score: 9/10**

**Strengths**:
- Comprehensive codebase analysis with specific file references
- Detailed implementation plan with code examples
- Clear success criteria and validation gates
- Risk mitigation strategies defined
- Leverages existing infrastructure extensively

**Confidence Level**: High confidence for one-pass implementation success due to:
- All required patterns exist in codebase
- No external research needed
- Clear architectural foundation
- Comprehensive testing framework available
- User requirements well-defined