# [Feature Name] Implementation Plan

> Template for connection detection engine modifications (new engines, weight tuning, filtering strategies)

## Overview
[Brief description of connection engine feature and why it's needed]

## Current State Analysis
[What connection detection exists now, what's missing]

### Key Discoveries:
- [Current 3 engines with file:line]
- [Orchestrator coordination]
- [Filtering strategies]

## Desired End State
[Specific connection capability after completion, how to verify]

## Rhizome Architecture
- **Module**: Worker + Main App (for UI controls)
- **Storage**: Database (connections table)
- **Migration**: Yes/No - [053_description.sql if changes to schema]
- **Test Tier**: Critical/Stable
- **Engines Affected**:
  - [ ] Semantic Similarity (25%)
  - [ ] Contradiction Detection (40%)
  - [ ] Thematic Bridge (35%)
  - [ ] Orchestrator

## What We're NOT Doing
[Out-of-scope items]

## Implementation Approach

### 3-Engine System
Current engines:
1. **Semantic Similarity** (25%) - Vector-based, fast, "same thing"
2. **Contradiction Detection** (40%) - Metadata-based, "disagree about same thing"
3. **Thematic Bridge** (35%) - AI-powered, cross-domain connections

### Design Principles
- **Aggressive Filtering**: Keep AI calls < 300 per document
- **User Control**: Weights configurable in RightPanel
- **Validation**: User can validate/reject connections
- **Cost-Aware**: Track and minimize AI costs

## Phase 1: Engine Implementation/Modification

### Overview
[Implement new engine or modify existing one]

### Changes Required:

#### 1. Engine Module
**File**: `worker/engines/[engine-name].ts`
**Changes**:
```typescript
export class [Engine]Engine extends BaseEngine {
  async detect(input: CollisionDetectionInput): Promise<CollisionResult[]> {
    // 1. Filter candidates (reduce AI calls)
    // 2. Detect connections
    // 3. Score and explain
    return results
  }
}
```

#### 2. Orchestrator Integration
**File**: `worker/engines/orchestrator.ts`
**Changes**:
- Register new engine
- Update default weights if needed
- Coordinate parallel execution

#### 3. Types
**File**: `worker/engines/types.ts`
**Changes**: Add engine type to enum

### Success Criteria:

#### Automated Verification:
- [ ] Engine tests pass: `npm test worker/engines/[engine].test.ts`
- [ ] Orchestrator tests pass
- [ ] Type check: `npm run type-check`

#### Manual Verification:
- [ ] Process test document
- [ ] Verify new engine finds connections
- [ ] Check connection quality
- [ ] Verify AI call count < 300

---

## Phase 2: Filtering Strategy

### Overview
[Implement aggressive filtering to reduce costs]

### Changes Required:

#### 1. Candidate Filtering
**File**: `worker/engines/[engine-name].ts`
**Changes**:
```typescript
private filterCandidates(source, targets): ChunkWithMetadata[] {
  return targets.filter(t =>
    t.importance_score > 0.6 &&              // High importance only
    t.document_id !== source.document_id &&   // Cross-document
    this.conceptOverlap(source, t) > 0.2 &&  // Some overlap
    this.conceptOverlap(source, t) < 0.7     // Not too much
  ).slice(0, 15)  // Top 15 candidates max
}
```

#### 2. Cost Tracking
**File**: `worker/lib/cost-tracking.ts`
**Changes**: Track AI calls per engine

### Success Criteria:

#### Automated Verification:
- [ ] Filtering tests pass
- [ ] Cost tracking accurate

#### Manual Verification:
- [ ] Process 500-page document
- [ ] Verify AI calls < 300
- [ ] Check connection quality maintained
- [ ] Verify cost < $0.50 total

---

## Phase 3: UI Controls & Weight Tuning

### Overview
[Add user controls for engine weights in RightPanel]

### Changes Required:

#### 1. Weight Configuration UI
**File**: `src/components/sidebar/TuneTab.tsx`
**Changes**:
```typescript
export function TuneTab({ documentId }: TuneTabProps) {
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)

  return (
    <div>
      <WeightSlider engine="semantic" value={weights.semantic} />
      <WeightSlider engine="contradiction" value={weights.contradiction} />
      <WeightSlider engine="thematic" value={weights.thematic} />
    </div>
  )
}
```

#### 2. Dynamic Filtering
**File**: `src/app/read/[id]/page.tsx`
**Changes**: Apply weights to connection display

#### 3. Persistence
**File**: `supabase/migrations/053_connection_weights.sql`
**Changes**: Store user preferences

### Success Criteria:

#### Automated Verification:
- [ ] Component tests pass
- [ ] Weight calculation correct

#### Manual Verification:
- [ ] Open RightPanel → Tune tab
- [ ] Adjust weights
- [ ] Verify connections update
- [ ] Refresh page, weights persist

---

## Phase 4: Connection Validation Workflow

### Overview
[Allow users to validate/reject auto-detected connections]

### Changes Required:

#### 1. Validation Actions
**File**: `src/components/sidebar/ConnectionsList.tsx`
**Changes**: Add validate/reject buttons

#### 2. Database Updates
**File**: `worker/types/database.ts`
**Changes**: Update `user_validated` field

#### 3. Filtering Logic
**File**: `src/lib/connections.ts`
**Changes**: Respect user validation in filtering

### Success Criteria:

#### Automated Verification:
- [ ] Validation logic tests pass

#### Manual Verification:
- [ ] View auto-detected connection
- [ ] Click "Validate"
- [ ] Verify marked as validated
- [ ] Check validation persists
- [ ] Reject connection, verify removed

---

## Testing Strategy

### Unit Tests:
- Engine detection logic
- Filtering algorithms
- Weight calculations
- Validation state management

### Integration Tests:
- Full orchestrator with all engines
- Connection generation end-to-end
- UI controls update connections
- Validation workflow

### Manual Testing with Real Documents:
1. Process 3 diverse documents (tech, philosophy, fiction)
2. Verify cross-domain connections found
3. Check AI call count for each
4. Test weight tuning
5. Validate/reject connections
6. Verify cost per document

## Performance Considerations

### AI Call Budget:
- Semantic: 0 calls (vector-based)
- Contradiction: 0 calls (metadata-based)
- Thematic: <300 calls per document

### Cost Estimates:
- Small document (<50 chunks): ~$0.05
- Large document (500 chunks): ~$0.20

### Processing Time:
- Semantic: <1 second
- Contradiction: <5 seconds
- Thematic: 30-60 seconds (AI calls)

## Migration Notes
[If adding columns to connections table or user preferences]

## References
- Architecture: `docs/ARCHITECTURE.md` (3-Engine System section)
- Orchestrator: `worker/engines/orchestrator.ts`
- Existing engines: `worker/engines/`
- RightPanel: `src/components/sidebar/RightPanel.tsx`
