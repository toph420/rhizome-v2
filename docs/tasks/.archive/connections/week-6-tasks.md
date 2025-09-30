# Week 6: Validation Learning System Tasks

**Feature**: Connection Synthesis System - User Validation & Feedback  
**Source PRP**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md)  
**Duration**: 5 days  
**Objective**: Capture user validation feedback with rich context for learning  

---

## Task T-019: Create validateConnection Server Action

### Task Identification
**Task ID**: T-019  
**Task Name**: Implement Server Action for Connection Validation  
**Priority**: Critical  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 1524-1601

#### Task Purpose
**As a** validation system  
**I need** server action to record feedback  
**So that** user validations are captured with rich context for learning

#### Dependencies
- **Prerequisite Tasks**: T-014 to T-018 (UI integration complete)
- **Parallel Tasks**: T-020 (dashboard UI)
- **Integration Points**: connection_feedback table, weight_contexts table

### Technical Requirements

#### Functional Requirements
- **REQ-1**: Record validation action (validated/rejected/starred)
- **REQ-2**: Capture rich context (time_of_day, mode, document)
- **REQ-3**: Create temporary weight boost for starred connections (2x for 24h)
- **REQ-4**: Support optional user notes

### Implementation Details

#### Files to Modify/Create
```
src/app/actions/
└── connections.ts - [CREATE: Server actions for connections]
src/components/reader/
└── ConnectionCard.tsx - [MODIFY: Add validation buttons]
```

#### Code Implementation
```typescript
// src/app/actions/connections.ts
'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function validateConnection(
  connectionId: string,
  action: 'validated' | 'rejected' | 'starred',
  context: {
    reading_document_id: string
    time_of_day: 'morning' | 'afternoon' | 'evening'
    day_of_week: string
    current_mode: 'reading' | 'writing'
    time_spent_ms: number
  },
  note?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerClient()
    const userId = 'dev-user-123' // TODO: Get from auth
    
    // Insert feedback
    const { error: feedbackError } = await supabase
      .from('connection_feedback')
      .insert({
        user_id: userId,
        connection_id: connectionId,
        action,
        context,
        note,
        created_at: new Date().toISOString()
      })
    
    if (feedbackError) {
      return { success: false, error: feedbackError.message }
    }
    
    // If starred, create temporary weight boost
    if (action === 'starred') {
      // Get connection to find engine
      const { data: connection } = await supabase
        .from('connections')
        .select('metadata')
        .eq('id', connectionId)
        .single()
      
      if (connection) {
        const engine = connection.metadata.engine
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 24)
        
        // Upsert weight context
        await supabase
          .from('weight_contexts')
          .upsert({
            user_id: userId,
            context: 'starred_boost',
            engine,
            weight_multiplier: 2.0,
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString()
          })
      }
    }
    
    // Revalidate reader page to reflect changes
    revalidatePath('/read/[id]')
    
    return { success: true }
  } catch (error) {
    console.error('Validation failed:', error)
    return { success: false, error: (error as Error).message }
  }
}

// Helper to get context
export function getCurrentContext(documentId: string) {
  const now = new Date()
  const hour = now.getHours()
  
  let timeOfDay: 'morning' | 'afternoon' | 'evening'
  if (hour < 12) timeOfDay = 'morning'
  else if (hour < 18) timeOfDay = 'afternoon'
  else timeOfDay = 'evening'
  
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 
                'thursday', 'friday', 'saturday']
  const dayOfWeek = days[now.getDay()]
  
  return {
    reading_document_id: documentId,
    time_of_day: timeOfDay,
    day_of_week: dayOfWeek,
    current_mode: 'reading' as const,
    time_spent_ms: 0 // Will be calculated on client
  }
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Validation recorded
  Given user clicks validate on connection
  When validateConnection() is called
  Then feedback stored in database
  And context captured correctly
  And success returned

Scenario 2: Starred boost applied
  Given user stars a connection
  When validateConnection() processes
  Then weight_contexts entry created
  And 2x multiplier set for engine
  And expires in 24 hours

Scenario 3: Optional note saved
  Given user provides note with validation
  When stored in database
  Then note field populated
  And retrievable for analysis
```

### Manual Testing Steps
1. Click validation buttons on connections
2. Check connection_feedback table for records
3. Verify starred connections create weight_contexts
4. Test note submission

### Estimated Time
**2.5 hours**

---

## Task T-020: Create Validation Dashboard Page

### Task Identification
**Task ID**: T-020  
**Task Name**: Build Validation Analytics Dashboard  
**Priority**: High  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 1604-1678

#### Task Purpose
**As a** user tracking validation patterns  
**I need** dashboard showing feedback statistics  
**So that** I can see which engines perform best

#### Dependencies
- **Prerequisite Tasks**: T-019 (validation recording)
- **Parallel Tasks**: T-021 (starred boost logic)

### Implementation Details

#### Files to Create
```
src/app/synthesis/
└── page.tsx - [CREATE: Dashboard page]
src/components/synthesis/
└── EngineStats.tsx - [CREATE: Stats component]
```

#### Implementation
```typescript
// src/app/synthesis/page.tsx
export default async function SynthesisPage() {
  const supabase = createServerClient()
  const userId = 'dev-user-123'
  
  // Query feedback with connection details
  const { data: feedback } = await supabase
    .from('connection_feedback')
    .select(`
      *,
      connection:connections(
        metadata,
        connection_type,
        strength
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  
  // Calculate stats per engine
  const engineStats = calculateEngineStats(feedback)
  
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">
        Connection Validation Dashboard
      </h1>
      
      {/* Engine performance grid */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {Object.entries(engineStats).map(([engine, stats]) => (
          <EngineStats
            key={engine}
            engine={engine}
            stats={stats}
          />
        ))}
      </div>
      
      {/* Recent validations list */}
      <RecentValidations feedback={feedback} />
    </div>
  )
}
```

### Acceptance Criteria
- [ ] Dashboard displays stats per engine
- [ ] Validation rate calculated correctly
- [ ] Recent validations listed
- [ ] Starred connections highlighted

### Estimated Time
**3 hours**

---

## Task T-021: Implement Starred Connection Boost

### Task Identification
**Task ID**: T-021  
**Task Name**: Apply Temporary Weight Boost for Starred Connections  
**Priority**: Medium  

### Context & Background

#### Task Purpose
**As a** weight adjustment system  
**I need** temporary boosts for starred connections  
**So that** similar connections are prioritized for 24 hours

### Implementation Details
- Modify connection queries to check weight_contexts
- Apply multipliers to base weights
- Clean expired contexts via cron

### Code Snippet
```typescript
// Apply weight contexts
const { data: contexts } = await supabase
  .from('weight_contexts')
  .select('*')
  .eq('user_id', userId)
  .gt('expires_at', new Date().toISOString())

const effectiveWeights = { ...baseWeights }
for (const ctx of contexts) {
  effectiveWeights[ctx.engine] *= ctx.weight_multiplier
}
```

### Estimated Time
**2 hours**

---

## Task T-022: Dogfooding Protocol

### Task Identification
**Task ID**: T-022  
**Task Name**: Execute Dogfooding Protocol for 50+ Validations  
**Priority**: High  

### Context & Background

#### Task Purpose
**As a** validation data collection  
**I need** real usage validation data  
**So that** the learning system has training data

### Protocol Steps
1. Process 5+ personal documents
2. Read each document for 10+ minutes
3. Validate/reject/star connections encountered
4. Aim for 50+ total validations
5. Document patterns observed

### Validation Targets
- 20+ validated connections
- 20+ rejected connections
- 10+ starred connections
- Coverage of all 7 engines

### Estimated Time
**3 hours** (actual usage and validation)

---

## Task T-023: Feedback Analytics

### Task Identification
**Task ID**: T-023  
**Task Name**: Analyze Validation Patterns  
**Priority**: Medium  

### Context & Background

#### Task Purpose
**As a** system optimization  
**I need** analysis of validation patterns  
**So that** weights can be adjusted based on performance

### Analysis Queries
```sql
-- Validation rate by engine
SELECT 
  metadata->>'engine' as engine,
  COUNT(*) FILTER (WHERE action = 'validated') as validated,
  COUNT(*) FILTER (WHERE action = 'rejected') as rejected,
  COUNT(*) as total,
  ROUND(COUNT(*) FILTER (WHERE action = 'validated')::numeric / 
        COUNT(*)::numeric * 100, 1) as validation_rate
FROM connection_feedback cf
JOIN connections c ON cf.connection_id = c.id
GROUP BY metadata->>'engine'
ORDER BY validation_rate DESC;

-- Time of day patterns
SELECT 
  context->>'time_of_day' as time_of_day,
  COUNT(*) as feedback_count,
  AVG(CASE WHEN action = 'validated' THEN 1 ELSE 0 END) as validation_rate
FROM connection_feedback
GROUP BY context->>'time_of_day';
```

### Deliverables
- Validation rate per engine
- Patterns by time of day
- Most validated connection types
- Recommendations for weight adjustments

### Estimated Time
**2 hours**

---

## Week 6 Summary

### Total Estimated Time
- T-019: 2.5 hours (Server action)
- T-020: 3 hours (Dashboard)
- T-021: 2 hours (Starred boost)
- T-022: 3 hours (Dogfooding)
- T-023: 2 hours (Analytics)
- **Total**: 12.5 hours

### Critical Path
T-019 → T-020 → T-022 → T-023

### Validation Gate (End of Week 6)
- [ ] Validation capture working
- [ ] Dashboard displays statistics
- [ ] Starred boost applied (2x for 24h)
- [ ] 50+ validations captured
- [ ] Analytics complete

### Key Deliverables
1. Working validation system with context capture
2. Analytics dashboard showing engine performance
3. 50+ real validations for learning
4. Documented patterns for weight tuning

### Next Steps
Begin Week 7: Obsidian Sync implementation

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-09-28  
**Week**: 6 of 6  
**Status**: Ready for Implementation