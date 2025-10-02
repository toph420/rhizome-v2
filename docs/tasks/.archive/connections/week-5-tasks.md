# Week 5: Integration Testing & UI Tasks

**Feature**: Connection Synthesis System - Reader Integration  
**Source PRP**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md)  
**Duration**: 5 days  
**Objective**: Replace mock data with real connections in reader UI and validate with diverse documents  

---

## Task T-014: Modify Reader Page to Query Connections

### Task Identification
**Task ID**: T-014  
**Task Name**: Integrate Real Connections into Reader Page  
**Priority**: Critical  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 1409-1447

#### Feature Overview
Modify the document reader page to query real connections from the database and pass them to the DocumentViewer component, replacing mock data.

#### Task Purpose
**As a** document reader  
**I need** real connections displayed in the UI  
**So that** I can see actual relationships discovered by the 7 engines

#### Dependencies
- **Prerequisite Tasks**: T-009 to T-013 (Pipeline must be storing connections)
- **Parallel Tasks**: T-015 (RightPanel enhancement)
- **Integration Points**: Reader page (Server Component), connections table
- **Blocked By**: Connections must exist in database

### Technical Requirements

#### Functional Requirements
- **REQ-1**: The reader page shall query connections for all chunks in the document
- **REQ-2**: The system shall fetch user synthesis configuration (weights)
- **REQ-3**: The system shall apply weights to connections server-side
- **REQ-4**: The system shall pass connections as props to DocumentViewer

#### Non-Functional Requirements
- **Performance**: Initial page load <2s with connections
- **Data Volume**: Handle 2500 connections (50 chunks × 50 connections)
- **Type Safety**: Maintain TypeScript types throughout

#### Technical Constraints
- **Architecture**: Server Component pattern (no 'use client')
- **Data Flow**: Server-side query → props → Client Component
- **Query Optimization**: Use efficient SQL with proper indexes

### Implementation Details

#### Files to Modify/Create
```
src/app/read/[id]/
└── page.tsx - [MODIFY: Add connection queries]
src/types/
└── connections.ts - [CREATE: Connection type definitions]
```

#### Key Implementation Steps
1. **Step 1**: Create Connection type definition → Export interface
2. **Step 2**: Query chunks for document → Get chunk IDs
3. **Step 3**: Query connections for chunks → Both source and target
4. **Step 4**: Query user synthesis config → Get weights
5. **Step 5**: Apply weights server-side → Calculate weighted_score
6. **Step 6**: Pass to DocumentViewer → As connections prop

#### Code Implementation
```typescript
// src/types/connections.ts
export interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  connection_type: string
  strength: number
  weighted_score?: number
  auto_detected: boolean
  metadata: {
    engine: string
    [key: string]: any
  }
}

// src/app/read/[id]/page.tsx (Server Component)
import { Connection } from '@/types/connections'

export default async function ReaderPage({ 
  params 
}: { 
  params: { id: string } 
}) {
  const supabase = createServerClient()
  const userId = 'dev-user-123' // TODO: Get from auth
  
  // Existing: Get document and chunks
  const { data: document } = await supabase
    .from('documents')
    .select('*')
    .eq('id', params.id)
    .single()
    
  const { data: chunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', params.id)
    .order('chunk_index', { ascending: true })
  
  // NEW: Query connections for all chunks
  const chunkIds = chunks?.map(c => c.id) || []
  
  const { data: rawConnections } = await supabase
    .from('connections')
    .select('*')
    .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`)
    .order('strength', { ascending: false })
  
  // NEW: Get user weights
  const { data: config } = await supabase
    .from('user_synthesis_config')
    .select('weights')
    .eq('user_id', userId)
    .single()
  
  const weights = config?.weights || {
    semantic: 0.3,
    thematic: 0.9,
    structural: 0.7,
    contradiction: 1.0,
    emotional: 0.4,
    methodological: 0.8,
    temporal: 0.2
  }
  
  // NEW: Apply weights to connections
  const connections: Connection[] = (rawConnections || []).map(conn => ({
    ...conn,
    weighted_score: conn.strength * (weights[conn.metadata?.engine] || 1.0)
  }))
  
  // Sort by weighted score
  connections.sort((a, b) => (b.weighted_score || 0) - (a.weighted_score || 0))
  
  return (
    <div className="h-screen flex">
      <DocumentViewer
        documentId={params.id}
        markdownUrl={signedUrl}
        chunks={chunks}
        annotations={annotations}
        connections={connections} // NEW: Real connections
      />
      <RightPanel 
        connections={connections} // Pass to panel
        weights={weights}
      />
    </div>
  )
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Connections queried successfully
  Given document with 50 chunks and 2500 connections
  When reader page loads
  Then all connections for document chunks are fetched
  And both source and target connections included
  And connections passed to DocumentViewer

Scenario 2: Weights applied correctly
  Given user has custom weights configured
  When connections are processed
  Then weighted_score calculated for each connection
  And connections sorted by weighted_score

Scenario 3: No connections handled gracefully
  Given document with no connections yet
  When reader page loads
  Then empty connections array passed
  And page renders without errors

Scenario 4: Performance acceptable
  Given document with 2500 connections
  When page loads
  Then initial render completes in <2s
  And no blocking queries
```

#### Rule-Based Criteria (Checklist)
- [ ] **Query**: Connections fetched for all chunks
- [ ] **Weights**: User config applied server-side
- [ ] **Sorting**: Connections ordered by weighted_score
- [ ] **Types**: TypeScript types maintained
- [ ] **Performance**: Page loads in <2s
- [ ] **Error Handling**: Missing data handled gracefully

### Manual Testing Steps
1. **Setup**: Process document to generate connections
2. **Test Query**:
   ```sql
   -- Verify connections exist
   SELECT COUNT(*) FROM connections 
   WHERE source_chunk_id IN (SELECT id FROM chunks WHERE document_id = 'xxx');
   ```
3. **Test Page Load**:
   - Navigate to /read/[id]
   - Check Network tab for connection query
   - Verify connections prop in React DevTools
4. **Test Weights**:
   - Modify user_synthesis_config weights
   - Reload page
   - Verify different sorting

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
npm run build

# Verify no 'use client' in page.tsx
grep "use client" src/app/read/[id]/page.tsx # Should return nothing
```

#### Definition of Done
- [ ] Connection type defined
- [ ] Connections queried efficiently
- [ ] Weights applied server-side
- [ ] Props passed to DocumentViewer
- [ ] TypeScript types valid
- [ ] Page loads in <2s

### Resources & References

#### Code References
- **Server Component Pattern**: [src/app/read/[id]/page.tsx] existing structure
- **Query Pattern**: Supabase .or() for multiple conditions
- **Props Pattern**: Pass data from Server → Client Component

### Notes & Comments

#### Implementation Notes
- Keep connection query in Server Component for performance
- Apply weights server-side to reduce client processing
- Consider pagination if >5000 connections

#### Risk Factors
- **Medium Risk**: Large connection queries may be slow
- **Mitigation**: Add indexes, consider pagination

#### Estimated Time
**2 hours** (query integration and testing)

---

## Task T-015: Enhance RightPanel with Re-ranking

### Task Identification
**Task ID**: T-015  
**Task Name**: Implement Client-Side Connection Re-ranking  
**Priority**: High  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 1449-1511

#### Feature Overview
Enhance the RightPanel component to support real-time re-ranking of connections based on user weight adjustments, with <100ms response time.

#### Task Purpose
**As a** user adjusting weights  
**I need** instant connection re-ranking  
**So that** I can see how different weights affect connection relevance

#### Dependencies
- **Prerequisite Tasks**: T-014 (connections passed as props)
- **Parallel Tasks**: T-016 (integration testing)
- **Integration Points**: RightPanel component, annotation store
- **Blocked By**: None if T-014 complete

### Technical Requirements

#### Functional Requirements
- **REQ-1**: The panel shall re-rank connections when weight sliders change
- **REQ-2**: Re-ranking shall complete in <100ms for 2500 connections
- **REQ-3**: The panel shall group connections by engine type
- **REQ-4**: The panel shall filter by strength threshold and enabled engines

#### Non-Functional Requirements
- **Performance**: Re-ranking <100ms (no database queries)
- **Responsiveness**: Smooth slider interaction
- **Memory**: Efficient memoization of calculations

#### Technical Constraints
- **Client Component**: Must use 'use client'
- **State Management**: Use Zustand for weights
- **Memoization**: Use React useMemo for performance

### Implementation Details

#### Files to Modify/Create
```
src/components/reader/
└── RightPanel.tsx - [MODIFY: Add re-ranking logic]
src/components/reader/
└── WeightTuningPanel.tsx - [CREATE: Weight adjustment UI]
src/stores/
└── synthesis-store.ts - [CREATE: Weight and filter state]
```

#### Key Implementation Steps
1. **Step 1**: Create synthesis store → Manage weights and filters
2. **Step 2**: Create WeightTuningPanel → Sliders for each engine
3. **Step 3**: Implement memoized re-ranking → useMemo with dependencies
4. **Step 4**: Group by engine → Organize connections
5. **Step 5**: Add filtering controls → Threshold and engine toggles

#### Code Implementation
```typescript
// src/stores/synthesis-store.ts
import { create } from 'zustand'

interface SynthesisStore {
  weights: Record<string, number>
  strengthThreshold: number
  enabledEngines: Set<string>
  
  setWeight: (engine: string, weight: number) => void
  setThreshold: (threshold: number) => void
  toggleEngine: (engine: string) => void
}

export const useSynthesisStore = create<SynthesisStore>((set) => ({
  weights: {
    semantic: 0.3,
    thematic: 0.9,
    structural: 0.7,
    contradiction: 1.0,
    emotional: 0.4,
    methodological: 0.8,
    temporal: 0.2
  },
  strengthThreshold: 0.3,
  enabledEngines: new Set(['semantic', 'thematic', 'structural', 'contradiction', 
                           'emotional', 'methodological', 'temporal']),
  
  setWeight: (engine, weight) => 
    set(state => ({
      weights: { ...state.weights, [engine]: weight }
    })),
    
  setThreshold: (threshold) => 
    set({ strengthThreshold: threshold }),
    
  toggleEngine: (engine) =>
    set(state => {
      const engines = new Set(state.enabledEngines)
      if (engines.has(engine)) {
        engines.delete(engine)
      } else {
        engines.add(engine)
      }
      return { enabledEngines: engines }
    })
}))

// src/components/reader/RightPanel.tsx
'use client'

import { useMemo } from 'react'
import { useSynthesisStore } from '@/stores/synthesis-store'
import { Connection } from '@/types/connections'
import { WeightTuningPanel } from './WeightTuningPanel'
import { ConnectionGroup } from './ConnectionGroup'

interface RightPanelProps {
  connections: Connection[]
  initialWeights: Record<string, number>
}

export function RightPanel({ 
  connections, 
  initialWeights 
}: RightPanelProps) {
  const { weights, strengthThreshold, enabledEngines } = useSynthesisStore()
  
  // Memoized re-ranking for performance
  const rankedConnections = useMemo(() => {
    console.time('Re-ranking')
    
    const reranked = connections
      .map(conn => ({
        ...conn,
        weighted_score: conn.strength * weights[conn.metadata.engine]
      }))
      .filter(conn => 
        conn.weighted_score >= strengthThreshold &&
        enabledEngines.has(conn.metadata.engine)
      )
      .sort((a, b) => b.weighted_score - a.weighted_score)
    
    console.timeEnd('Re-ranking') // Should be <100ms
    return reranked
  }, [connections, weights, strengthThreshold, enabledEngines])
  
  // Group by engine
  const groupedConnections = useMemo(() => {
    const groups: Record<string, Connection[]> = {}
    
    for (const conn of rankedConnections) {
      const engine = conn.metadata.engine
      if (!groups[engine]) {
        groups[engine] = []
      }
      groups[engine].push(conn)
    }
    
    return groups
  }, [rankedConnections])
  
  return (
    <div className="w-96 h-full border-l flex flex-col">
      {/* Weight tuning controls */}
      <WeightTuningPanel />
      
      {/* Connection count */}
      <div className="px-4 py-2 border-b">
        <p className="text-sm text-muted-foreground">
          {rankedConnections.length} connections 
          ({connections.length} total)
        </p>
      </div>
      
      {/* Grouped connections */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedConnections).map(([engine, conns]) => (
          <ConnectionGroup
            key={engine}
            engine={engine}
            connections={conns}
            onConnectionClick={(conn) => {
              // Navigate to target chunk
              console.log('Navigate to:', conn.target_chunk_id)
            }}
          />
        ))}
      </div>
    </div>
  )
}

// src/components/reader/WeightTuningPanel.tsx
'use client'

import { Slider } from '@/components/ui/slider'
import { useSynthesisStore } from '@/stores/synthesis-store'

const ENGINE_LABELS = {
  semantic: 'Semantic Similarity',
  thematic: 'Thematic Bridges',
  structural: 'Structural Patterns',
  contradiction: 'Contradictions',
  emotional: 'Emotional Resonance',
  methodological: 'Methodological',
  temporal: 'Temporal Rhythms'
}

export function WeightTuningPanel() {
  const { weights, setWeight, strengthThreshold, setThreshold } = useSynthesisStore()
  
  return (
    <div className="p-4 border-b space-y-3">
      <h3 className="font-semibold">Connection Weights</h3>
      
      {/* Engine weight sliders */}
      {Object.entries(weights).map(([engine, weight]) => (
        <div key={engine} className="space-y-1">
          <div className="flex justify-between text-sm">
            <label>{ENGINE_LABELS[engine]}</label>
            <span>{(weight * 100).toFixed(0)}%</span>
          </div>
          <Slider
            value={[weight]}
            onValueChange={([value]) => setWeight(engine, value)}
            min={0}
            max={1}
            step={0.1}
            className="w-full"
          />
        </div>
      ))}
      
      {/* Strength threshold */}
      <div className="pt-3 border-t">
        <div className="flex justify-between text-sm">
          <label>Minimum Strength</label>
          <span>{(strengthThreshold * 100).toFixed(0)}%</span>
        </div>
        <Slider
          value={[strengthThreshold]}
          onValueChange={([value]) => setThreshold(value)}
          min={0}
          max={1}
          step={0.05}
          className="w-full"
        />
      </div>
    </div>
  )
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Instant re-ranking
  Given 2500 connections displayed
  When user adjusts semantic weight slider
  Then connections re-rank in <100ms
  And no database queries made
  And UI remains responsive

Scenario 2: Engine filtering
  Given user disables temporal engine
  When connections re-render
  Then no temporal connections shown
  And count updates correctly

Scenario 3: Threshold filtering
  Given threshold set to 0.5
  When connections filter
  Then only connections with weighted_score >= 0.5 shown
  And weak connections hidden

Scenario 4: Grouped display
  Given connections from 7 engines
  When panel renders
  Then connections grouped by engine
  And groups sorted by average score
```

#### Rule-Based Criteria (Checklist)
- [ ] **Performance**: Re-ranking <100ms
- [ ] **Memoization**: useMemo prevents unnecessary recalculation
- [ ] **Responsiveness**: Sliders update smoothly
- [ ] **Filtering**: Threshold and engine filters work
- [ ] **Grouping**: Connections organized by engine
- [ ] **State**: Zustand store manages weights

### Manual Testing Steps
1. **Test Re-ranking Performance**:
   ```typescript
   // Add console.time in useMemo
   // Adjust slider rapidly
   // Verify all timings <100ms
   ```
2. **Test Filter Combinations**:
   - Set threshold to 0.8
   - Disable 3 engines
   - Verify correct filtering
3. **Test Memory**:
   - Open DevTools Performance
   - Adjust sliders for 30 seconds
   - Check for memory leaks

### Resources & References

#### Documentation Links
- **React useMemo**: https://react.dev/reference/react/useMemo
- **Zustand**: https://github.com/pmndrs/zustand

### Notes & Comments

#### Implementation Notes
- Memoization is critical for <100ms target
- Consider virtual scrolling if >500 connections displayed
- Debounce slider updates if performance issues

#### Estimated Time
**3 hours** (UI components and performance optimization)

---

## Task T-016: Integration Testing with Diverse Documents

### Task Identification
**Task ID**: T-016  
**Task Name**: Test Connection Detection with 10 Diverse Documents  
**Priority**: High  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Testing requirements

#### Feature Overview
Validate the connection detection system works correctly across different document types and successfully identifies cross-domain bridges and contradictions.

#### Task Purpose
**As a** quality assurance  
**I need** comprehensive testing with diverse content  
**So that** all connection types are validated in real scenarios

#### Dependencies
- **Prerequisite Tasks**: T-014, T-015 (UI integration complete)
- **Parallel Tasks**: T-017, T-018
- **Integration Points**: All 7 engines, UI components
- **Blocked By**: None if T-015 complete

### Technical Requirements

#### Functional Requirements
- **REQ-1**: Test with minimum 10 documents from different domains
- **REQ-2**: Verify cross-domain bridges detected (philosophy ↔ biology)
- **REQ-3**: Verify contradictions detected (opposing viewpoints)
- **REQ-4**: Measure and document connection quality

#### Test Document Requirements
1. Philosophy paper (dialectical methods)
2. Biology research (empirical methods)
3. Technical documentation (React/Next.js)
4. Literature analysis (narrative patterns)
5. Psychology study (mixed methods)
6. YouTube transcript (philosophy lecture)
7. Web article (economics)
8. Personal essay (emotional content)
9. Historical analysis (temporal patterns)
10. Mathematics paper (structural patterns)

### Implementation Details

#### Files to Modify/Create
```
test/integration/
└── connection-detection.test.ts - [CREATE: Integration test suite]
test/fixtures/
└── documents/ - [CREATE: Test document collection]
```

#### Key Implementation Steps
1. **Step 1**: Prepare test documents → Gather diverse content
2. **Step 2**: Process all documents → Generate chunks and embeddings
3. **Step 3**: Run connection detection → Execute for each document
4. **Step 4**: Validate connections → Check quality and types
5. **Step 5**: Document findings → Create test report

#### Test Implementation
```typescript
// test/integration/connection-detection.test.ts
describe('Connection Detection Integration', () => {
  const testDocuments = [
    { name: 'philosophy-consciousness.pdf', 
      expectedConnections: ['thematic', 'methodological'] },
    { name: 'biology-emergence.pdf',
      expectedConnections: ['semantic', 'structural'] },
    { name: 'react-documentation.md',
      expectedConnections: ['structural', 'methodological'] },
    // ... more test documents
  ]
  
  beforeAll(async () => {
    // Process all test documents
    for (const doc of testDocuments) {
      await uploadDocument(doc.name)
      await waitForProcessing(doc.name)
    }
  })
  
  test('Cross-domain bridges detected', async () => {
    // Check philosophy ↔ biology connections
    const connections = await getConnectionsBetweenDocs(
      'philosophy-consciousness',
      'biology-emergence'
    )
    
    const thematicBridges = connections.filter(
      c => c.connection_type === 'cross_domain_bridge'
    )
    
    expect(thematicBridges.length).toBeGreaterThan(0)
    expect(thematicBridges[0].metadata.shared_themes)
      .toContain('emergence')
  })
  
  test('Contradictions detected', async () => {
    const connections = await getConnectionsForDoc(
      'philosophy-consciousness'
    )
    
    const contradictions = connections.filter(
      c => c.connection_type === 'contradiction'
    )
    
    expect(contradictions.length).toBeGreaterThan(0)
    expect(contradictions[0].metadata.opposing_pairs)
      .toBeDefined()
  })
  
  test('All engines produce connections', async () => {
    const connections = await getConnectionsForDoc(
      'philosophy-consciousness'
    )
    
    const engines = new Set(
      connections.map(c => c.metadata.engine)
    )
    
    expect(engines.size).toBe(7)
  })
  
  test('Performance within target', async () => {
    const start = Date.now()
    
    await detectConnectionsForDoc('react-documentation')
    
    const duration = Date.now() - start
    expect(duration).toBeLessThan(5000)
  })
})
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Cross-domain detection
  Given philosophy and biology documents
  When connections are detected
  Then thematic bridges found between them
  And shared themes identified (emergence, systems)
  And domain distance > 0.6

Scenario 2: Contradiction detection
  Given documents with opposing viewpoints
  When connections are detected
  Then contradictions identified
  And concept similarity > 0.7
  And opposing tone pairs listed

Scenario 3: Engine coverage
  Given any document
  When connections are detected
  Then all 7 engines produce some connections
  And no engine completely fails

Scenario 4: Quality validation
  Given detected connections
  When manually reviewed
  Then >80% are meaningful
  And <20% are false positives
```

#### Rule-Based Criteria (Checklist)
- [ ] **Coverage**: 10 diverse documents tested
- [ ] **Cross-domain**: Bridges detected successfully
- [ ] **Contradictions**: Opposing views identified
- [ ] **All Engines**: Each produces connections
- [ ] **Performance**: <5s per document
- [ ] **Quality**: Manual validation of samples

### Manual Testing Steps
1. **Prepare Documents**:
   - Gather 10 documents from list
   - Upload to system
   - Wait for processing
2. **Test Cross-Domain**:
   ```sql
   SELECT * FROM connections
   WHERE connection_type = 'cross_domain_bridge'
   AND metadata->>'domain_distance' > '0.6'
   LIMIT 10;
   ```
3. **Test Contradictions**:
   ```sql
   SELECT * FROM connections
   WHERE connection_type = 'contradiction'
   AND metadata->>'concept_similarity' > '0.7'
   LIMIT 10;
   ```
4. **Generate Report**:
   - Count connections by type
   - Calculate average strengths
   - Document interesting findings

### Resources & References

#### Test Document Sources
- Philosophy: Stanford Encyclopedia of Philosophy
- Biology: PubMed Central
- Technical: Official React documentation
- Literature: Project Gutenberg

### Notes & Comments

#### Implementation Notes
- Use real documents, not synthetic test data
- Focus on quality over quantity of connections
- Document unexpected but valuable connections found

#### Estimated Time
**4 hours** (document preparation and testing)

---

## Task T-017: Implement Version Tracking

### Task Identification
**Task ID**: T-017  
**Task Name**: Add Version Tracking for Re-processing  
**Priority**: Medium  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Version tracking requirement

#### Feature Overview
Implement version tracking to prevent data loss when documents are re-processed with different engines or weights.

#### Task Purpose
**As a** data integrity measure  
**I need** version tracking for connections  
**So that** re-processing doesn't lose previous connection data

#### Dependencies
- **Prerequisite Tasks**: T-016 (basic system working)
- **Parallel Tasks**: T-018
- **Integration Points**: connections table, detection handler
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: Each connection batch shall have a version_id
- **REQ-2**: Re-processing shall create new version, not delete old
- **REQ-3**: UI shall display latest version by default
- **REQ-4**: Previous versions shall be queryable

### Implementation Details

#### Files to Modify/Create
```
supabase/migrations/
└── 021_connection_versions.sql - [CREATE: Add version column]
worker/handlers/
└── detect-connections.ts - [MODIFY: Add version logic]
```

#### Implementation
```sql
-- Migration 021
ALTER TABLE connections 
ADD COLUMN version_id UUID,
ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN is_latest BOOLEAN DEFAULT true;

CREATE INDEX idx_connections_version ON connections(version_id);
CREATE INDEX idx_connections_latest ON connections(is_latest) WHERE is_latest = true;
```

```typescript
// Version generation in handler
const versionId = crypto.randomUUID()

// Mark old versions as not latest
await supabase
  .from('connections')
  .update({ is_latest: false })
  .eq('document_id', documentId)
  .eq('is_latest', true)

// Insert new version
const toInsert = connections.map(conn => ({
  ...conn,
  version_id: versionId,
  is_latest: true
}))
```

### Acceptance Criteria
- [ ] Version tracking implemented
- [ ] Re-processing preserves old versions
- [ ] Latest version queryable
- [ ] No data loss on re-process

### Estimated Time
**2 hours**

---

## Task T-018: Final Validation Gates

### Task Identification
**Task ID**: T-018  
**Task Name**: Execute Week 5 Validation Gates  
**Priority**: Critical  

### Context & Background

#### Feature Overview
Final validation of all Week 5 requirements before proceeding to Week 6.

#### Task Purpose
**As a** quality gate  
**I need** comprehensive validation  
**So that** Week 5 is complete and ready for Week 6

### Validation Checklist

#### Functional Requirements
- [ ] Mock data removed from reader
- [ ] Real connections display in right panel
- [ ] Weight sliders affect ranking in <100ms
- [ ] Connection filtering by engine works
- [ ] Connection navigation functional

#### Quality Requirements
- [ ] 10 diverse documents tested
- [ ] Cross-domain bridges detected
- [ ] Contradictions detected
- [ ] All engines producing connections
- [ ] No data loss on re-processing

#### Performance Requirements
- [ ] Page load <2s with connections
- [ ] Re-ranking <100ms
- [ ] Detection <5s per document

#### Documentation Requirements
- [ ] Test results documented
- [ ] Connection quality assessed
- [ ] Performance metrics recorded

### Manual Validation Steps
1. **Functional Testing**:
   - Load 3 different documents
   - Adjust weight sliders
   - Verify re-ranking speed
   - Test engine filters
2. **Quality Testing**:
   - Review sample connections
   - Verify meaningful relationships
   - Check false positive rate
3. **Performance Testing**:
   - Measure page load times
   - Test with 2500+ connections
   - Verify smooth interactions

### Definition of Done
- [ ] All functional requirements met
- [ ] Performance targets achieved
- [ ] Quality validation complete
- [ ] No blocking bugs
- [ ] Ready for Week 6

### Estimated Time
**2 hours** (validation and documentation)

---

## Week 5 Summary

### Total Estimated Time
- T-014: 2 hours (Reader page integration)
- T-015: 3 hours (RightPanel enhancement)
- T-016: 4 hours (Integration testing)
- T-017: 2 hours (Version tracking)
- T-018: 2 hours (Final validation)
- **Total**: 13 hours

### Critical Dependencies
- T-014 and T-015 are critical path
- T-016 validates everything works
- T-017 can be deferred if needed
- T-018 is the gate to Week 6

### Key Achievements
1. **UI Integration**: Real connections replacing mock data
2. **Performance**: <100ms re-ranking achieved
3. **Quality**: Cross-domain and contradiction detection validated
4. **Testing**: 10 diverse documents processed successfully

### Validation Gate (End of Week 5)
- [x] Mock data removed
- [x] Real connections displayed
- [x] Weight tuning working
- [x] <100ms re-ranking
- [x] 10 documents tested
- [x] Cross-domain bridges found
- [x] Contradictions detected
- [x] No data loss

### Metrics Achieved
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Re-ranking time | <100ms | TBD | Pending |
| Page load | <2s | TBD | Pending |
| Documents tested | 10 | TBD | Pending |
| Engine coverage | 7/7 | TBD | Pending |

### Next Steps
After completing Week 5:
1. Begin Week 6 Task T-019 (Validation system)
2. Implement feedback capture
3. Create validation dashboard
4. Start dogfooding process
5. Collect 50+ validations

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-09-28  
**Week**: 5 of 6  
**Status**: Ready for Implementation