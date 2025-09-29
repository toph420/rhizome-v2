# 7-Engine Collision Detection Architecture

## Overview

The 7-engine collision detection system enables sophisticated knowledge synthesis by analyzing document chunks from multiple perspectives simultaneously. Each engine detects different types of connections between chunks, and their combined results provide rich insights into how knowledge relates across documents.

## Architecture Design

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator Layer                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  CollisionOrchestrator                                 │ │
│  │  - Parallel execution coordination                     │ │
│  │  - Result aggregation                                  │ │
│  │  - Weighted scoring system                             │ │
│  │  - Performance monitoring                              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Engine Layer                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  BaseEngine (Abstract)                                │  │
│  │  - Common validation                                  │  │
│  │  - Caching logic                                      │  │
│  │  - Error boundaries                                   │  │
│  │  - Post-processing                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│     ┌─────────────────────┼─────────────────────┐          │
│     ▼                     ▼                     ▼          │
│  ┌─────────┐        ┌──────────┐        ┌──────────┐      │
│  │Semantic │        │Structural│        │Temporal  │      │
│  │Similarity│       │Pattern   │        │Proximity │      │
│  └─────────┘        └──────────┘        └──────────┘      │
│                                                             │
│     ▼                     ▼                     ▼          │
│  ┌─────────┐        ┌──────────┐        ┌──────────┐      │
│  │Conceptual│       │Emotional │        │Citation  │      │
│  │Density  │        │Resonance │        │Network   │      │
│  └─────────┘        └──────────┘        └──────────┘      │
│                           ▼                                 │
│                    ┌──────────────┐                        │
│                    │Contradiction │                        │
│                    │Detection     │                        │
│                    └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### Parallel Execution Strategy

The system uses `Promise.allSettled()` for parallel engine execution, ensuring:
- All engines run concurrently
- Partial failures don't stop other engines
- Results are aggregated even with failures
- Performance target: <5 seconds for 50 chunks

```typescript
// Parallel execution with timeout protection
const detectionPromises = engines.map(engine => 
  this.executeEngineWithTimeout(engine, input)
);

const results = await Promise.allSettled(detectionPromises);
```

### Scoring System Design

#### Weight Configuration

Default weights optimized for knowledge synthesis:

| Engine | Weight | Purpose |
|--------|--------|---------|
| Semantic Similarity | 0.25 | Core conceptual connections |
| Conceptual Density | 0.20 | Knowledge-rich areas |
| Structural Pattern | 0.15 | Similar organization |
| Citation Network | 0.15 | Reference-based links |
| Temporal Proximity | 0.10 | Time-based relationships |
| Emotional Resonance | 0.10 | Sentiment alignment |
| Contradiction Detection | 0.05 | Conflict identification |

#### Scoring Algorithm

```typescript
// For each target chunk:
totalScore = Σ(engineScore × engineWeight)

// Apply normalization:
if (method === 'sigmoid') {
  totalScore = 1 / (1 + exp(-totalScore))
}
```

## The 7 Engines

### 1. Semantic Similarity Engine
- **Purpose**: Find conceptually related chunks using vector embeddings
- **Method**: Cosine similarity with pgvector
- **Metadata Used**: embeddings, key_concepts
- **Performance Target**: <500ms for 50 chunks

### 2. Structural Pattern Engine
- **Purpose**: Identify similarly organized content
- **Method**: Pattern matching on document structure
- **Metadata Used**: structural_patterns (headings, lists, sections)
- **Performance Target**: <300ms pattern matching

### 3. Temporal Proximity Engine
- **Purpose**: Find time-related connections
- **Method**: Temporal distance calculations
- **Metadata Used**: temporal_info (timestamps, dates)
- **Performance Target**: <200ms temporal analysis

### 4. Conceptual Density Engine
- **Purpose**: Find knowledge-rich connections
- **Method**: Concept overlap and importance weighting
- **Metadata Used**: key_concepts, domain
- **Performance Target**: <400ms density calculation

### 5. Emotional Resonance Engine
- **Purpose**: Detect emotionally connected content
- **Method**: Sentiment similarity and harmony detection
- **Metadata Used**: emotional_tone (polarity, emotions)
- **Performance Target**: <250ms resonance calculation

### 6. Citation Network Engine
- **Purpose**: Find reference-based connections
- **Method**: Citation graph analysis
- **Metadata Used**: citations (references, cited_by)
- **Performance Target**: <500ms network analysis

### 7. Contradiction Detection Engine
- **Purpose**: Identify conflicting information
- **Method**: Logic checking and fact comparison
- **Metadata Used**: key_concepts, semantic content
- **Performance Target**: <600ms contradiction check

## Implementation Patterns

### Engine Implementation Pattern

Each engine extends `BaseEngine`:

```typescript
export class SemanticSimilarityEngine extends BaseEngine {
  readonly type = EngineType.SEMANTIC_SIMILARITY;
  
  protected async detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]> {
    // Engine-specific logic
  }
  
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    return !!chunk.embedding && chunk.embedding.length > 0;
  }
}
```

### Caching Strategy

- **LRU Cache**: In-memory caching for repeated queries
- **Cache Key**: `engineType:sourceId:targetIds`
- **TTL**: 5 minutes default
- **Max Size**: 1000 entries per engine

### Error Handling

- **Graceful Degradation**: Failed engines return empty results
- **Timeout Protection**: 5-second global timeout
- **Partial Success**: System continues with available results
- **Error Logging**: Detailed error tracking per engine

## Performance Optimization

### Parallelization
- All 7 engines run concurrently using Web Workers or Worker Threads
- Independent execution with no blocking
- Result aggregation happens after all complete or timeout

### Database Optimization
- pgvector indexes for similarity search: `CREATE INDEX USING ivfflat`
- GIN indexes for JSONB metadata queries
- Batch queries to reduce round trips

### Caching Layers
1. **Engine-level**: Each engine caches its own results
2. **Orchestrator-level**: Aggregated results cached
3. **Database-level**: Query result caching in PostgreSQL

## Extensibility

### Adding New Engines

1. Extend `BaseEngine` class
2. Implement required abstract methods
3. Register with orchestrator
4. Add to weight configuration

### Custom Weight Profiles

Support for preset configurations:
- **Research Mode**: Higher weight on citations and concepts
- **Creative Mode**: Higher weight on emotional and structural patterns
- **Fact-Checking Mode**: Higher weight on contradictions

## Testing Strategy

### Unit Tests
- Each engine tested independently
- Mock data for predictable results
- Performance benchmarks per engine

### Integration Tests
- Full orchestration testing
- Parallel execution validation
- Failure handling scenarios

### Performance Tests
- 50-chunk benchmark suite
- Load testing with 100+ chunks
- Memory usage profiling

## Success Metrics

✅ **Performance**: <5 seconds for 50-chunk detection
✅ **Scalability**: Linear scaling to 100+ chunks  
✅ **Reliability**: 95% uptime with partial failure handling
✅ **Accuracy**: >80% relevant connections identified
✅ **Flexibility**: User-configurable weights and thresholds

## Next Steps

1. Implement individual engines (T-025 to T-031)
2. Integrate with existing metadata from Week 2
3. Add user preference configuration (T-034)
4. Performance optimization (T-035)
5. Comprehensive integration testing (T-036)