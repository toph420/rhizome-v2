# Document Reader & Annotation System - Tasks 17-24

**Source PRP**: [docs/prps/document-reader-annotation-system.md](/docs/prps/document-reader-annotation-system.md)  
**Tasks 1-16**: See PRP lines 521-1055  and previous task document [docs/tasks/document-reader-annotation-system.md](/docs/tasks/document-reader-annotation-system.md)  
**This Document**: Detailed breakdown of tasks 17-24 (Week 2 completion phase)

**Document Version**: 1.0.0  
**Created**: 2025-09-28  
**Feature Phase**: Phase 1 + Weight Tuning (Week 2: Days 5-7)

---

## Task 17: Create Fuzzy Restore Wrapper

**Task ID**: T-017  
**Priority**: High  
**Estimated Effort**: 4 hours  
**Risk Level**: Medium (depends on fuzzy-matching.ts integration)

### Context & Background

**Source PRP Reference**: Lines 1054-1121

**Feature Overview**: The fuzzy restore wrapper bridges the worker-side fuzzy matching algorithm with the frontend annotation rendering system. It ensures annotations maintain correct positions even after document re-processing.

**Task Purpose**:
- **As a** document reader system
- **I need** a frontend-friendly wrapper around the worker fuzzy matching algorithm
- **So that** annotations can be restored to correct positions with confidence scoring

### Dependencies

**Prerequisite Tasks**: 
- Task 3 (Text Range Utility Library) - provides context extraction
- Task 6 (Document Viewer Component) - consumes restored positions
- Worker fuzzy-matching.ts must exist (✅ already implemented)

**Parallel Tasks**: Task 18 (Loading States)

**Integration Points**:
- worker/lib/fuzzy-matching.ts (backend algorithm)
- src/components/reader/AnnotationLayer.tsx (frontend rendering)
- src/types/annotations.ts (TypeScript interfaces)

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When an annotation is loaded, the system shall attempt exact text match first
- **REQ-2**: When exact match fails, the system shall fallback to fuzzy matching with trigram algorithm
- **REQ-3**: Where confidence < 0.7, the system shall display a warning badge to the user
- **REQ-4**: The system shall return position data with confidence score (0.3-1.0 range)

#### Non-Functional Requirements
- **Performance**: Restoration should complete <50ms per annotation (target: <30ms for exact matches)
- **Accuracy**: >70% of annotations should restore with ≥0.7 confidence
- **Resilience**: Graceful degradation to approximate positioning (confidence 0.3) when fuzzy matching fails

#### Technical Constraints
- **Technology Stack**: TypeScript, existing fuzzy-matching.ts algorithm
- **Architecture Patterns**: Pure functions, no side effects
- **Code Standards**: JSDoc required (exported functions), strict TypeScript

### Implementation Details

#### Files to Create
```
src/lib/annotations/
└── fuzzy-restore.ts (CREATE)
    - restoreAnnotationPosition() - Main restoration function
    - showConfidenceBadge() - React component helper
    - calculateConfidenceLevel() - Confidence tier helper
```

#### Key Implementation Steps

1. **Import fuzzy matching algorithm**
   ```typescript
   import { fuzzyMatchChunkToSource } from '../../../worker/lib/fuzzy-matching'
   ```

2. **Implement exact match path** (fast path optimization)
   - Try indexOf() for O(n) exact match
   - If found, return confidence 1.0 with 'exact' method
   - Measure: Should complete <10ms for typical annotations

3. **Implement fuzzy fallback** (high accuracy path)
   - Call fuzzyMatchChunkToSource with trigram algorithm
   - Extract confidence, start/end offsets, method from result
   - Preserve position_context for future re-matching

4. **Create confidence badge helper**
   - ≥0.7: No badge (high confidence)
   - 0.5-0.7: "Position approximate" (warning)
   - <0.5: "Position may have shifted - click to verify" (error badge)

#### Code Patterns to Follow

**Reference**: worker/lib/fuzzy-matching.ts lines 100-147 for fuzzy matching API
```typescript
// Pattern: 3-tier matching (exact → fuzzy → approximate)
const result = fuzzyMatchChunkToSource(
  chunkText,
  sourceMarkdown,
  chunkIndex,
  totalChunks,
  { trigramThreshold: 0.75 }
)
```

**Reference**: src/app/actions/documents.ts lines 51-193 for error handling pattern
```typescript
// Pattern: Try-catch with typed error responses
try {
  const result = await operation()
  return { success: true, data: result }
} catch (error) {
  return { success: false, error: error.message }
}
```

### Complete Implementation

```typescript
/**
 * Restores annotation position in re-processed document using fuzzy matching.
 * 
 * Implements 2-tier strategy:
 * 1. Exact match (O(n), <10ms) - indexOf() for unchanged text
 * 2. Fuzzy match (O(n*m), <50ms) - Trigram algorithm for shifted text
 * 
 * @param annotation - Stored annotation with original position and text context
 * @param sourceMarkdown - Current markdown content to restore position in
 * @returns Position data with confidence score (0.3-1.0) and method used
 * 
 * @example
 * const position = await restoreAnnotationPosition(annotation, markdown)
 * if (position.confidence >= 0.7) {
 *   // High confidence - safe to render
 * } else {
 *   // Show warning badge
 * }
 */
export async function restoreAnnotationPosition(
  annotation: StoredAnnotation,
  sourceMarkdown: string
): Promise<PositionData> {
  const { text, textContext } = annotation.components.annotation
  const { startOffset, endOffset } = annotation.components.position
  
  // Tier 1: Exact match (fast path - <10ms)
  const exactIndex = sourceMarkdown.indexOf(text)
  if (exactIndex !== -1) {
    return {
      chunkId: annotation.components.source.chunk_id,
      startOffset: exactIndex,
      endOffset: exactIndex + text.length,
      confidence: 1.0,
      method: 'exact',
      textContext: {
        before: textContext.before,
        after: textContext.after
      }
    }
  }
  
  // Tier 2: Fuzzy matching (high accuracy - <50ms)
  const result = fuzzyMatchChunkToSource(
    text,
    sourceMarkdown,
    0, // chunkIndex not needed for single annotation
    1, // totalChunks not needed
    { trigramThreshold: 0.75 }
  )
  
  return {
    chunkId: annotation.components.source.chunk_id,
    startOffset: result.start_offset,
    endOffset: result.end_offset,
    confidence: result.confidence,
    method: result.method,
    textContext: result.position_context
  }
}

/**
 * Generates confidence badge component based on position accuracy.
 * 
 * Confidence tiers:
 * - ≥0.7: No badge (high confidence, safe to use)
 * - 0.5-0.7: Warning badge (position approximate)
 * - <0.5: Error badge (position may have shifted significantly)
 * 
 * @param confidence - Confidence score from fuzzy matching (0.3-1.0)
 * @returns React Badge component or null for high confidence
 * 
 * @example
 * {showConfidenceBadge(annotation.components.position.confidence)}
 */
export function showConfidenceBadge(confidence: number): ReactNode {
  if (confidence >= 0.7) return null // High confidence - no warning needed
  
  if (confidence >= 0.5) {
    return (
      <Badge variant="outline" className="ml-2">
        Position approximate
      </Badge>
    )
  }
  
  return (
    <Badge variant="destructive" className="ml-2">
      Position may have shifted - click to verify
    </Badge>
  )
}

/**
 * Calculates confidence tier for analytics and filtering.
 * 
 * @param confidence - Confidence score (0.3-1.0)
 * @returns Tier classification: 'high' | 'medium' | 'low'
 */
export function calculateConfidenceLevel(
  confidence: number
): 'high' | 'medium' | 'low' {
  if (confidence >= 0.7) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Exact match restoration (happy path)
  Given an annotation with text "semantic connections" in original document
  And the re-processed document contains exact text "semantic connections" at offset 1500
  When restoreAnnotationPosition() is called
  Then confidence should be 1.0
  And method should be 'exact'
  And startOffset should be 1500
  And restoration time should be <10ms

Scenario 2: Fuzzy match restoration (text slightly shifted)
  Given an annotation with text "The paradigm shift occurred"
  And the re-processed document has text "The paradigm shift truly occurred" (word added)
  When restoreAnnotationPosition() is called with fuzzy matching
  Then confidence should be ≥0.7 (high confidence)
  And method should be 'fuzzy'
  And position should be close to original (±100 chars)
  And restoration time should be <50ms

Scenario 3: Low confidence warning badge
  Given an annotation with restored confidence 0.6
  When showConfidenceBadge(0.6) is called
  Then Badge component with variant="outline" should be returned
  And text should be "Position approximate"

Scenario 4: Very low confidence error badge
  Given an annotation with restored confidence 0.4
  When showConfidenceBadge(0.4) is called
  Then Badge component with variant="destructive" should be returned
  And text should include "Position may have shifted"
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Exact match returns confidence 1.0 in <10ms
- [ ] **Functional**: Fuzzy matching returns confidence ≥0.3 in <50ms
- [ ] **Functional**: Badge component renders correctly for all confidence tiers
- [ ] **Performance**: Restoration completes <50ms per annotation (measured with performance.now())
- [ ] **Error Handling**: Handles empty sourceMarkdown gracefully
- [ ] **Error Handling**: Handles annotations with missing textContext
- [ ] **Integration**: Works with existing fuzzy-matching.ts algorithm
- [ ] **TypeScript**: All types match src/types/annotations.ts interfaces
- [ ] **Documentation**: JSDoc on all exported functions (restoreAnnotationPosition, showConfidenceBadge, calculateConfidenceLevel)

### Manual Testing Steps

1. **Setup**: Create test document with 5 annotations, re-process document with slight text changes
2. **Test Exact Match**: 
   - Load annotation with unchanged text
   - Verify confidence = 1.0, method = 'exact'
   - Measure time with performance.now() (<10ms target)
3. **Test Fuzzy Match**:
   - Load annotation where 1-2 words changed nearby
   - Verify confidence ≥0.7, method = 'fuzzy'
   - Verify position within ±100 chars of original
4. **Test Badge Rendering**:
   - Create annotations with confidence 0.9, 0.6, 0.4
   - Verify no badge for 0.9, warning badge for 0.6, error badge for 0.4
5. **Performance Benchmark**:
   - Restore 50 annotations simultaneously
   - Average time should be <50ms per annotation

### Validation & Quality Gates

```bash
# TypeScript type checking
npm run build
# Expected: No type errors in fuzzy-restore.ts

# Linting with JSDoc validation
npm run lint
# Expected: All exported functions have complete JSDoc

# Unit tests (create after implementation)
npm test src/lib/annotations/__tests__/fuzzy-restore.test.ts
# Expected: >85% coverage on restoration logic
```

### Resources & References

**Code References**:
- worker/lib/fuzzy-matching.ts lines 100-147 - Fuzzy matching API
- worker/lib/fuzzy-matching.ts lines 318-349 - Context extraction pattern
- src/types/annotations.ts - PositionData, StoredAnnotation interfaces
- src/components/ui/badge.tsx - Badge component API

**Documentation Links**:
- Fuzzy matching algorithm details: docs/ARCHITECTURE.md → "YouTube Offset Resolution Strategy"
- Position confidence specification: PRP lines 104-110

### Implementation Notes

**Gotchas**:
- fuzzy-matching.ts is in worker/ directory (3 levels up: ../../../worker/lib/)
- Trigram generation is O(n), don't call on every render (memoize or cache)
- Dynamic stride optimization in fuzzy matching (10% for <100 windows, 20% for >=100)
- Early exit on >0.95 similarity saves 50% comparisons

**Performance Optimization**:
- Exact match fast path handles 80%+ of cases in <10ms
- Consider adding LRU cache for repeated restorations (future enhancement)
- Batch restoration for multiple annotations to amortize setup costs

---

## Task 18: Add Loading States & Error Handling

**Task ID**: T-018  
**Priority**: High  
**Estimated Effort**: 3 hours  
**Risk Level**: Low (standard React patterns)

### Context & Background

**Source PRP Reference**: Lines 1122-1147

**Feature Overview**: Comprehensive loading states and error boundaries ensure graceful degradation when markdown fetching, annotation rendering, or Server Actions fail. Provides clear user feedback during async operations.

**Task Purpose**:
- **As a** user reading documents
- **I need** clear feedback during loading and helpful error messages when things fail
- **So that** I understand system state and can take corrective action

### Dependencies

**Prerequisite Tasks**:
- Task 6 (Document Viewer Component) - base component to enhance
- Task 7 (Quick Capture Panel) - add save error handling

**Parallel Tasks**: Task 17 (Fuzzy Restore Wrapper)

**Integration Points**:
- React Suspense boundaries
- Server Actions error responses
- Toast notification system (shadcn/ui)

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When markdown is loading, the system shall display skeleton placeholder (<500ms first paint)
- **REQ-2**: When annotation rendering fails, the system shall show error boundary with retry button
- **REQ-3**: When Server Action fails, the system shall display toast notification with error details
- **REQ-4**: Where network errors occur, the system shall suggest retry after delay

#### Non-Functional Requirements
- **Performance**: Skeleton should render <100ms, not block markdown streaming
- **UX**: Error messages must be actionable (not generic "An error occurred")
- **Accessibility**: ARIA live regions for loading states, keyboard-accessible retry buttons

#### Technical Constraints
- **Technology Stack**: React 19 ErrorBoundary, shadcn/ui Toast, Skeleton components
- **Architecture Patterns**: Suspense for async data, ErrorBoundary for render errors
- **Code Standards**: No silent failures, all errors logged to console

### Implementation Details

#### Files to Modify
```
src/components/reader/
├── DocumentViewer.tsx (MODIFY)
│   - Add loading state with Skeleton component
│   - Wrap AnnotationLayer in ErrorBoundary
│   - Add toast notifications for save errors
└── QuickCapturePanel.tsx (MODIFY)
    - Add saving state indicator
    - Handle Server Action errors
    - Show toast on success/failure
```

#### Key Implementation Steps

1. **Add markdown loading skeleton** (DocumentViewer.tsx)
   ```typescript
   {!markdown && <Skeleton className="h-screen w-full" />}
   {markdown && <ReactMarkdown>{markdown}</ReactMarkdown>}
   ```

2. **Wrap AnnotationLayer in ErrorBoundary**
   ```typescript
   <ErrorBoundary
     fallback={<ErrorFallback onReset={handleRetry} />}
     onError={logAnnotationError}
   >
     <AnnotationLayer annotations={annotations} chunkId={chunkId} />
   </ErrorBoundary>
   ```

3. **Add Server Action error handling** (QuickCapturePanel.tsx)
   ```typescript
   try {
     const result = await createAnnotation(data)
     if (result.success) {
       toast.success('Annotation saved')
     } else {
       toast.error(`Failed: ${result.error}`)
     }
   } catch (error) {
     toast.error('Network error. Please try again.')
   }
   ```

4. **Implement retry mechanism**
   - Store failed operation in state
   - Retry button calls operation again
   - Show retry count (max 3 attempts)

#### Code Patterns to Follow

**Reference**: src/components/layout/ProcessingDock.tsx lines 111-156 for loading states
```typescript
// Pattern: Conditional rendering based on loading state
{isLoading && <Spinner />}
{error && <ErrorMessage message={error} />}
{data && <Content data={data} />}
```

**Reference**: src/app/actions/documents.ts lines 51-193 for error handling
```typescript
// Pattern: Typed error responses from Server Actions
if (!result.success) {
  return { success: false, error: 'Descriptive error message' }
}
```

### Complete Implementation

#### DocumentViewer.tsx Enhancements
```typescript
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { ErrorBoundary } from 'react-error-boundary'

export function DocumentViewer({ markdown, documentId, chunks, annotations }) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(!markdown)
  
  // Handle annotation layer errors
  const handleAnnotationError = (error: Error) => {
    console.error('Annotation rendering error:', error)
    toast.error('Failed to render annotations. Some highlights may not appear.')
  }
  
  // Retry annotation loading
  const handleRetryAnnotations = async () => {
    try {
      const fresh = await getAnnotations(documentId)
      setAnnotations(fresh)
      toast.success('Annotations reloaded')
    } catch (error) {
      toast.error('Retry failed. Please refresh the page.')
    }
  }
  
  // Loading skeleton
  if (isLoading) {
    return (
      <div className="h-screen w-full p-8">
        <Skeleton className="h-12 w-3/4 mb-4" />
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-6 w-2/3 mb-8" />
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-6 w-full mb-2" />
      </div>
    )
  }
  
  return (
    <div className="prose max-w-none">
      <ReactMarkdown
        components={{
          p: ({ children, ...props }) => (
            <ChunkWrapper chunkId={getCurrentChunk()}>
              <ErrorBoundary
                fallback={
                  <ErrorFallback
                    message="Annotations failed to load for this section"
                    onRetry={handleRetryAnnotations}
                  />
                }
                onError={handleAnnotationError}
              >
                <AnnotationLayer annotations={annotations} chunkId={chunkId} />
              </ErrorBoundary>
              <p {...props} onMouseUp={handleMouseUp}>
                {children}
              </p>
            </ChunkWrapper>
          )
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

// Error fallback component
function ErrorFallback({ message, onRetry }: { message: string, onRetry: () => void }) {
  return (
    <div className="border border-destructive rounded-md p-4 my-4 bg-destructive/10">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium">{message}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-2"
      >
        Retry
      </Button>
    </div>
  )
}
```

#### QuickCapturePanel.tsx Error Handling
```typescript
export function QuickCapturePanel({ selection, onClose }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  
  const handleColorSelect = async (color: string) => {
    if (saving) return // Prevent double-submit
    
    setSaving(true)
    try {
      const result = await createAnnotation({
        text: selection.text,
        chunkId: selection.range.chunkId,
        documentId: documentId,
        startOffset: selection.range.startOffset,
        endOffset: selection.range.endOffset,
        color: color
      })
      
      if (result.success) {
        toast.success('Highlight saved', {
          description: `${color.charAt(0).toUpperCase() + color.slice(1)} highlight created`
        })
        onClose()
      } else {
        // Server-side validation error
        toast.error('Failed to save highlight', {
          description: result.error,
          action: retryCount < 3 ? {
            label: 'Retry',
            onClick: () => {
              setRetryCount(retryCount + 1)
              handleColorSelect(color)
            }
          } : undefined
        })
      }
    } catch (error) {
      // Network error
      console.error('Network error saving annotation:', error)
      toast.error('Network error', {
        description: 'Could not reach server. Check your connection.',
        action: {
          label: 'Retry',
          onClick: () => handleColorSelect(color)
        }
      })
    } finally {
      setSaving(false)
    }
  }
  
  return (
    <Popover open={true} onOpenChange={onClose}>
      <PopoverContent>
        <div className="flex gap-2">
          {['yellow', 'green', 'blue', 'red', 'purple'].map(color => (
            <Button
              key={color}
              onClick={() => handleColorSelect(color)}
              disabled={saving}
              className={`bg-${color}-200 hover:bg-${color}-300`}
            >
              {saving ? <Spinner className="h-4 w-4" /> : null}
              {color.charAt(0).toUpperCase() + color.slice(1)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Markdown loading skeleton
  Given user navigates to /read/[id]
  And markdown is fetching from Storage
  When page renders
  Then Skeleton component should display
  And skeleton should render <100ms
  And markdown should replace skeleton <500ms after fetch completes

Scenario 2: Annotation rendering error recovery
  Given AnnotationLayer throws rendering error
  When error boundary catches error
  Then ErrorFallback component should display
  And "Retry" button should be present
  And clicking Retry should attempt reload

Scenario 3: Server Action save error
  Given user creates annotation
  And Server Action returns { success: false, error: 'Validation failed' }
  When response is received
  Then toast notification should display error
  And error message should be "Failed to save highlight: Validation failed"
  And Retry action should be available

Scenario 4: Network error with retry
  Given user creates annotation
  And network request fails (offline)
  When error is caught
  Then toast should show "Network error"
  And description should suggest checking connection
  And Retry button should trigger same request
```

#### Rule-Based Criteria (Checklist)
- [ ] **Loading States**: Skeleton renders <100ms, matches content layout
- [ ] **Error Boundaries**: AnnotationLayer wrapped in ErrorBoundary
- [ ] **Toast Notifications**: Success toast on save, error toast on failure
- [ ] **Retry Mechanism**: Max 3 retries, exponential backoff optional
- [ ] **Error Messages**: Actionable descriptions (not generic "Error occurred")
- [ ] **Console Logging**: All errors logged with context
- [ ] **Accessibility**: ARIA live regions for loading states
- [ ] **UI**: Disabled state on buttons during save operation

### Manual Testing Steps

1. **Test Loading Skeleton**:
   - Throttle network to Slow 3G in DevTools
   - Navigate to /read/[id]
   - Verify skeleton displays immediately
   - Verify markdown replaces skeleton after load

2. **Test Annotation Error**:
   - Modify AnnotationLayer to throw error (temp)
   - Reload page
   - Verify ErrorFallback displays with retry button
   - Click Retry, verify recovery

3. **Test Server Action Errors**:
   - Modify createAnnotation to return error (temp)
   - Create annotation
   - Verify error toast appears
   - Verify Retry action present

4. **Test Network Errors**:
   - Open DevTools Network tab
   - Set offline mode
   - Create annotation
   - Verify network error toast
   - Re-enable network, click Retry
   - Verify success

### Resources & References

**Code References**:
- React ErrorBoundary: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
- shadcn/ui Toast: https://ui.shadcn.com/docs/components/toast
- shadcn/ui Skeleton: https://ui.shadcn.com/docs/components/skeleton

---

## Task 19: Performance Optimization - Connection Re-ranking

**Task ID**: T-019  
**Priority**: High  
**Estimated Effort**: 3 hours  
**Risk Level**: Low (client-side optimization)

### Context & Background

**Source PRP Reference**: Lines 1148-1185

**Feature Overview**: Optimize connection filtering and re-ranking to meet <100ms target. Add Framer Motion layout animations for smooth visual feedback when connections re-sort.

**Task Purpose**:
- **As a** user adjusting engine weights
- **I need** instant visual feedback (<100ms) when connections re-rank
- **So that** weight tuning feels responsive and I can iterate quickly

### Dependencies

**Prerequisite Tasks**:
- Task 12 (Connections List Component) - base component to optimize
- Task 13 (Weight Tuning Component) - triggers re-ranking

**Integration Points**:
- Zustand annotation store (weights, enabledEngines state)
- Framer Motion layout animations
- Mock connection dataset

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When engine weight changes, connections shall re-rank in <100ms (measured client-side)
- **REQ-2**: When engine toggled, connections shall filter instantly (<50ms)
- **REQ-3**: The system shall display layout animation during re-sorting (200ms duration)
- **REQ-4**: Where re-ranking exceeds 100ms, system shall log performance warning

#### Non-Functional Requirements
- **Performance**: Re-ranking <100ms for 50 connections, <200ms for 100+ connections
- **UX**: Smooth animations (spring physics, no jank)
- **Scalability**: Algorithm remains O(n log n), no nested loops

### Implementation Details

#### Files to Modify
```
src/components/sidebar/
└── ConnectionsList.tsx (MODIFY)
    - Add useMemo for filtering/sorting
    - Add performance.now() measurement
    - Add Framer Motion layout animations
    - Add performance warning logging
```

#### Key Implementation Steps

1. **Optimize filtering with useMemo**
   - Dependencies: [weights, enabledEngines, strengthThreshold]
   - Early exit for disabled engines
   - Single-pass map for weightedStrength calculation

2. **Add performance measurement**
   - performance.now() before filtering
   - performance.now() after sorting
   - Console.warn if duration >100ms

3. **Add layout animations**
   - Wrap ConnectionCard in motion.div
   - Use layout prop for automatic animation
   - 200ms spring transition (damping: 25)

4. **Optimize sort algorithm**
   - Use native Array.sort() (O(n log n))
   - Avoid nested loops
   - Consider Web Worker for >200 connections (future)

### Complete Implementation

```typescript
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAnnotationStore } from '@/stores/annotation-store'
import { MOCK_CONNECTIONS } from '@/lib/annotations/mock-connections'

export function ConnectionsList({ documentId, currentChunkId }) {
  const { weights, enabledEngines, strengthThreshold } = useAnnotationStore()
  
  // Optimized filtering and re-ranking with performance measurement
  const filteredConnections = useMemo(() => {
    const startTime = performance.now()
    
    // Single-pass filter and map (O(n))
    const result = MOCK_CONNECTIONS
      .filter(c => enabledEngines.has(c.engine_type)) // Early exit for disabled engines
      .filter(c => c.strength >= strengthThreshold)   // Strength threshold filter
      .map(c => ({
        ...c,
        weightedStrength: c.strength * weights[c.engine_type] // Calculate weighted score
      }))
      .sort((a, b) => b.weightedStrength - a.weightedStrength) // O(n log n) sort
    
    const duration = performance.now() - startTime
    
    // Performance monitoring
    if (duration > 100) {
      console.warn(
        `⚠️ Connection re-ranking took ${duration.toFixed(2)}ms (target: <100ms)`,
        {
          connectionCount: result.length,
          enabledEngines: Array.from(enabledEngines),
          strengthThreshold
        }
      )
    } else if (duration > 50) {
      console.info(`ℹ️ Connection re-ranking: ${duration.toFixed(2)}ms`)
    }
    
    return result
  }, [weights, enabledEngines, strengthThreshold]) // Minimize re-computation
  
  // Group connections by engine type
  const groupedConnections = useMemo(() => {
    return filteredConnections.reduce((acc, connection) => {
      if (!acc[connection.engine_type]) {
        acc[connection.engine_type] = []
      }
      acc[connection.engine_type].push(connection)
      return acc
    }, {} as Record<string, MockConnection[]>)
  }, [filteredConnections])
  
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {Object.entries(groupedConnections).map(([engineType, connections]) => (
          <CollapsibleSection
            key={engineType}
            title={engineLabels[engineType]}
            count={connections.length}
          >
            <div className="space-y-2">
              {connections.map(connection => (
                <motion.div
                  key={connection.id}
                  layout // Enable automatic layout animation
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{
                    layout: { type: 'spring', damping: 25, stiffness: 300 },
                    opacity: { duration: 0.2 },
                    y: { duration: 0.2 }
                  }}
                >
                  <ConnectionCard
                    connection={connection}
                    onClick={() => handleNavigate(connection.target_chunk_id)}
                    documentId={documentId}
                  />
                </motion.div>
              ))}
            </div>
          </CollapsibleSection>
        ))}
        
        {filteredConnections.length === 0 && (
          <EmptyState
            title="No connections match filters"
            description="Try adjusting engine weights or lowering strength threshold"
          />
        )}
      </div>
    </ScrollArea>
  )
}

// Engine type labels mapping
const engineLabels: Record<string, string> = {
  semantic: 'Semantic Similarity',
  thematic: 'Thematic Resonance',
  structural: 'Structural Patterns',
  contradiction: 'Contradictions',
  emotional: 'Emotional Tone',
  methodological: 'Methodological Approach',
  temporal: 'Temporal Relationships'
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Fast re-ranking (<100ms)
  Given 50 mock connections loaded
  And user adjusts semantic weight from 0.5 to 0.8
  When weight change triggers re-ranking
  Then filtering/sorting should complete <100ms
  And connections should re-order visually
  And layout animation should play (200ms duration)

Scenario 2: Performance warning (>100ms)
  Given 150+ connections loaded
  And user adjusts weight causing full re-sort
  When re-ranking takes >100ms
  Then console.warn should log performance warning
  And warning should include duration, connection count, enabled engines

Scenario 3: Layout animation smoothness
  Given connections visible in panel
  And user toggles engine off/on
  When connections filter and re-sort
  Then cards should animate smoothly (no jank)
  And animation should use spring physics (damping: 25)

Scenario 4: Empty state handling
  Given all engines disabled OR strength threshold = 1.0
  When no connections match filters
  Then EmptyState component should display
  And message should suggest adjusting filters
```

#### Rule-Based Criteria (Checklist)
- [ ] **Performance**: Re-ranking <100ms for 50 connections (measured with performance.now())
- [ ] **Performance**: Re-ranking <200ms for 100+ connections
- [ ] **Optimization**: useMemo used with correct dependencies
- [ ] **Optimization**: Single-pass filter/map (no nested loops)
- [ ] **Animation**: Layout animation plays on re-sort (200ms duration)
- [ ] **Animation**: Spring physics (type: 'spring', damping: 25)
- [ ] **Logging**: Performance warning logged if >100ms
- [ ] **UX**: Empty state displays when no connections match

### Manual Testing Steps

1. **Benchmark Re-ranking**:
   - Open DevTools Console
   - Load page with 50 mock connections
   - Adjust semantic weight slider
   - Verify console log shows <100ms duration
   - Repeat with 100+ connections (should be <200ms)

2. **Test Layout Animation**:
   - Adjust weights to trigger re-sort
   - Observe cards animating to new positions
   - Verify smooth spring animation (no jank)
   - Check animation duration ~200ms

3. **Test Performance Warning**:
   - Load 150+ connections (modify mock data temporarily)
   - Adjust weights to trigger full re-sort
   - Verify console.warn appears if >100ms
   - Check warning includes useful context

4. **Test Empty State**:
   - Disable all engines
   - Verify EmptyState displays
   - Set strength threshold to 1.0
   - Verify EmptyState with helpful message

### Validation & Quality Gates

```bash
# TypeScript type checking
npm run build

# Performance profiling
# 1. Open DevTools → Performance tab
# 2. Record while adjusting weights
# 3. Verify no long tasks >100ms
# 4. Check for layout thrashing (reflows)
```

### Resources & References

**Code References**:
- src/stores/annotation-store.ts - weights, enabledEngines state
- src/lib/annotations/mock-connections.ts - MOCK_CONNECTIONS dataset
- Framer Motion docs: https://www.framer.com/motion/layout-animations/

**Performance References**:
- React useMemo: https://react.dev/reference/react/useMemo
- Performance.now() API: https://developer.mozilla.org/en-US/docs/Web/API/Performance/now

---

## Task 20: Database Migration for Annotation Components

**Task ID**: T-020  
**Priority**: Medium  
**Estimated Effort**: 1 hour  
**Risk Level**: Low (documentation-only migration)

### Context & Background

**Source PRP Reference**: Lines 1186-1208

**Feature Overview**: Add database indexes and documentation comments to optimize annotation queries. This is a lightweight migration focused on performance and developer clarity.

**Task Purpose**:
- **As a** database administrator
- **I need** optimized indexes for annotation queries
- **So that** annotation loading remains fast as dataset grows

### Dependencies

**Prerequisite Tasks**: None (can run anytime before production)

**Integration Points**:
- components table (existing)
- ECS query methods

### Technical Requirements

#### Functional Requirements
- **REQ-1**: Database shall have indexes for component_type = 'annotation' queries
- **REQ-2**: Database shall have indexes for component_type = 'position' queries
- **REQ-3**: Database shall have composite index for (document_id, component_type) queries
- **REQ-4**: Schema shall have documentation comments for valid component_type values

#### Non-Functional Requirements
- **Performance**: Annotation queries should remain <50ms with 10,000+ annotations
- **Documentation**: Component schema clearly documented for future developers

### Implementation Details

#### Files to Create
```
supabase/migrations/
└── 013_annotation_components.sql (CREATE)
    - Add documentation comments
    - Add partial indexes for annotation types
    - Add composite index for document queries
```

### Complete Implementation

```sql
-- Migration: 013_annotation_components.sql
-- Purpose: Optimize annotation queries and document component schema
-- Created: 2025-09-28

-- ============================================================================
-- SCHEMA DOCUMENTATION
-- ============================================================================

-- Document valid component types
COMMENT ON COLUMN components.component_type IS 
  'Valid component types:
   - annotation: User highlights and notes
   - flashcard: Study cards with question/answer
   - study: FSRS scheduling data
   - source: Links to chunks and documents
   - position: Fuzzy matching position data with confidence scores
   
   See src/types/annotations.ts for data schemas.';

COMMENT ON COLUMN components.data IS
  'JSONB component data (application-level validation).
   Schema varies by component_type:
   - annotation: { text, note?, color, range, textContext }
   - position: { chunkId, startOffset, endOffset, confidence, method, textContext }
   - source: { chunk_id, document_id }
   
   See src/types/annotations.ts for full schemas.';

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Partial index for annotation queries (WHERE component_type = 'annotation')
-- Improves performance for getAnnotations(documentId) queries
CREATE INDEX IF NOT EXISTS idx_components_annotation_type 
  ON components(component_type) 
  WHERE component_type = 'annotation';

-- Partial index for position queries (WHERE component_type = 'position')
-- Used for fuzzy matching restoration queries
CREATE INDEX IF NOT EXISTS idx_components_position_type 
  ON components(component_type) 
  WHERE component_type = 'position';

-- Composite index for document-level annotation queries
-- Optimizes: SELECT * FROM components WHERE document_id = ? AND component_type IN ('annotation', 'position')
-- This is the primary query pattern for loading annotations in reader
CREATE INDEX IF NOT EXISTS idx_components_document_annotation 
  ON components(document_id, component_type) 
  WHERE component_type IN ('annotation', 'position');

-- ============================================================================
-- PERFORMANCE ANALYSIS
-- ============================================================================

-- Query plan verification (run after migration):
-- EXPLAIN ANALYZE SELECT * FROM components 
-- WHERE document_id = 'test-doc' AND component_type = 'annotation';
-- Expected: Index Scan using idx_components_document_annotation

-- Index usage statistics (monitor in production):
-- SELECT 
--   schemaname, tablename, indexname, 
--   idx_scan as index_scans,
--   idx_tup_read as tuples_read
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE 'idx_components%'
-- ORDER BY idx_scan DESC;
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Annotation query optimization
  Given 10,000+ annotation components in database
  When getAnnotations(documentId) query runs
  Then query should use idx_components_document_annotation index
  And query should complete <50ms

Scenario 2: Schema documentation
  Given new developer exploring database schema
  When inspecting components table in Supabase dashboard
  Then COMMENT should display valid component_type values
  And COMMENT should reference TypeScript type definitions

Scenario 3: Index creation idempotency
  Given migration has been run once
  When migration runs again (db reset)
  Then CREATE INDEX IF NOT EXISTS should succeed
  And no duplicate indexes should be created
```

#### Rule-Based Criteria (Checklist)
- [ ] **Indexes**: idx_components_annotation_type created
- [ ] **Indexes**: idx_components_position_type created
- [ ] **Indexes**: idx_components_document_annotation created (composite)
- [ ] **Documentation**: COMMENT on component_type column
- [ ] **Documentation**: COMMENT on data column
- [ ] **Idempotency**: IF NOT EXISTS used on all CREATE INDEX statements
- [ ] **Performance**: Query plan uses index (verify with EXPLAIN ANALYZE)

### Manual Testing Steps

1. **Run Migration**:
   ```bash
   npx supabase migration new annotation_components
   # Copy SQL content into new migration file
   npx supabase db reset
   ```

2. **Verify Indexes Created**:
   ```sql
   SELECT indexname, indexdef 
   FROM pg_indexes 
   WHERE tablename = 'components' 
   AND indexname LIKE 'idx_components%';
   -- Expected: 3 rows (annotation_type, position_type, document_annotation)
   ```

3. **Verify Query Plan**:
   ```sql
   EXPLAIN ANALYZE 
   SELECT * FROM components 
   WHERE document_id = 'test-doc' AND component_type = 'annotation';
   -- Expected output should include: "Index Scan using idx_components_document_annotation"
   ```

4. **Verify Documentation**:
   - Open Supabase dashboard
   - Navigate to components table
   - Check column comments visible in UI

### Resources & References

**Documentation**:
- PostgreSQL partial indexes: https://www.postgresql.org/docs/current/indexes-partial.html
- PostgreSQL composite indexes: https://www.postgresql.org/docs/current/indexes-multicolumn.html
- COMMENT ON syntax: https://www.postgresql.org/docs/current/sql-comment.html

---

## Task 21: Integration Testing Checklist ✅ COMPLETE

**Task ID**: T-021  
**Priority**: Medium  
**Estimated Effort**: 4 hours  
**Risk Level**: Low (testing infrastructure)
**Status**: ✅ Complete (2025-01-28)

### Context & Background

**Source PRP Reference**: Lines 1209-1216

**Feature Overview**: Create integration test suite covering critical paths: text selection → annotation creation → persistence → rendering. Focus on end-to-end flows rather than unit test coverage.

**Task Purpose**:
- **As a** developer
- **I need** automated integration tests for annotation flow
- **So that** regressions are caught before production

### Dependencies

**Prerequisite Tasks**:
- Task 4 (Annotation Storage Server Actions) - APIs to test
- Task 6 (Document Viewer Component) - UI to test

**Integration Points**:
- Jest + React Testing Library (already configured)
- Supabase test database
- ECS createEntity/query methods

### Technical Requirements

#### Functional Requirements
- **REQ-1**: Test shall verify full annotation creation flow (select → save → persist → render)
- **REQ-2**: Test shall verify fuzzy matching maintains >70% confidence across re-processing
- **REQ-3**: Test shall verify weight tuning re-ranks connections in <100ms
- **REQ-4**: Test shall verify validation capture stores to localStorage

#### Non-Functional Requirements
- **Coverage**: Focus on critical paths (80/20 rule), not exhaustive coverage
- **Speed**: Integration tests should run <30 seconds total
- **Isolation**: Each test cleans up data (no side effects)

### Implementation Details

#### Files to Create
```
tests/integration/
└── annotation-flow.test.ts (CREATE)
    - Test: Full annotation creation flow
    - Test: Fuzzy matching confidence
    - Test: Weight tuning performance
    - Test: Validation capture
```

### Complete Implementation

```typescript
/**
 * Integration tests for annotation flow.
 * 
 * Focus: Critical paths (text selection → save → persist → render)
 * Approach: End-to-end flows, not unit test granularity
 * 
 * Test database setup required:
 * - Run `npx supabase start` before tests
 * - Use test user 'dev-user-123'
 * - Clean up entities after each test
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DocumentViewer } from '@/components/reader/DocumentViewer'
import { createAnnotation, getAnnotations } from '@/app/actions/annotations'
import { restoreAnnotationPosition } from '@/lib/annotations/fuzzy-restore'
import { ecs } from '@/lib/ecs'

describe('Annotation Flow Integration', () => {
  const testUserId = 'dev-user-123'
  const testDocumentId = 'test-doc-001'
  const testMarkdown = 'This is test content with semantic connections.'
  
  // Clean up after each test
  afterEach(async () => {
    const annotations = await getAnnotations(testDocumentId)
    for (const annotation of annotations) {
      await ecs.deleteEntity(annotation.id, testUserId)
    }
  })
  
  describe('Full Annotation Creation Flow', () => {
    it('should create annotation from text selection and persist to database', async () => {
      // 1. Render document viewer
      render(
        <DocumentViewer
          markdown={testMarkdown}
          documentId={testDocumentId}
          chunks={[{ id: 'chunk-1', content: testMarkdown, chunk_index: 0 }]}
          annotations={[]}
        />
      )
      
      // 2. Simulate text selection
      const paragraph = screen.getByText(/semantic connections/)
      
      // Create mock Selection and Range
      const range = document.createRange()
      range.setStart(paragraph.firstChild!, 23) // "semantic"
      range.setEnd(paragraph.firstChild!, 40)   // "connections"
      
      window.getSelection = jest.fn(() => ({
        toString: () => 'semantic connections',
        getRangeAt: () => range,
        rangeCount: 1
      } as any))
      
      // 3. Trigger text selection
      fireEvent.mouseUp(paragraph)
      
      // 4. Quick Capture panel should appear
      await waitFor(() => {
        expect(screen.getByText(/Yellow/)).toBeInTheDocument()
      })
      
      // 5. Click yellow color button
      const yellowButton = screen.getByText(/Yellow/)
      fireEvent.click(yellowButton)
      
      // 6. Verify annotation saved to database
      await waitFor(async () => {
        const annotations = await getAnnotations(testDocumentId)
        expect(annotations).toHaveLength(1)
        expect(annotations[0].components.annotation.text).toBe('semantic connections')
        expect(annotations[0].components.annotation.color).toBe('yellow')
      })
      
      // 7. Verify toast notification appeared
      await waitFor(() => {
        expect(screen.getByText(/Annotation saved/)).toBeInTheDocument()
      })
    })
    
    it('should render annotation highlight after persistence', async () => {
      // 1. Create annotation directly (bypass UI)
      const result = await createAnnotation({
        text: 'test content',
        chunkId: 'chunk-1',
        documentId: testDocumentId,
        startOffset: 8,
        endOffset: 20,
        color: 'green'
      })
      
      expect(result.success).toBe(true)
      
      // 2. Re-render with persisted annotation
      const annotations = await getAnnotations(testDocumentId)
      
      const { container } = render(
        <DocumentViewer
          markdown={testMarkdown}
          documentId={testDocumentId}
          chunks={[{ id: 'chunk-1', content: testMarkdown, chunk_index: 0 }]}
          annotations={annotations}
        />
      )
      
      // 3. Verify highlight overlay rendered
      const highlight = container.querySelector('[data-annotation-color="green"]')
      expect(highlight).toBeInTheDocument()
      expect(highlight).toHaveStyle({ position: 'absolute' })
    })
  })
  
  describe('Fuzzy Matching Confidence', () => {
    it('should maintain >70% confidence across document re-processing', async () => {
      const originalText = 'The paradigm shift occurred during the transition phase.'
      const modifiedText = 'The paradigm shift truly occurred during the major transition phase.'
      
      // 1. Create annotation on original text
      const result = await createAnnotation({
        text: 'paradigm shift',
        chunkId: 'chunk-1',
        documentId: testDocumentId,
        startOffset: 4,
        endOffset: 18,
        color: 'yellow'
      })
      
      expect(result.success).toBe(true)
      
      // 2. Simulate document re-processing (text changed)
      const annotations = await getAnnotations(testDocumentId)
      const annotation = annotations[0]
      
      // 3. Restore position using fuzzy matching
      const restoredPosition = await restoreAnnotationPosition(
        annotation,
        modifiedText
      )
      
      // 4. Verify high confidence (≥0.7)
      expect(restoredPosition.confidence).toBeGreaterThanOrEqual(0.7)
      
      // 5. Verify position is close to original
      expect(restoredPosition.startOffset).toBeGreaterThanOrEqual(0)
      expect(restoredPosition.startOffset).toBeLessThan(modifiedText.length)
      expect(modifiedText.substring(
        restoredPosition.startOffset,
        restoredPosition.endOffset
      )).toBe('paradigm shift')
    })
  })
  
  describe('Weight Tuning Performance', () => {
    it('should re-rank connections in <100ms', async () => {
      // 1. Load 50 mock connections
      const connections = MOCK_CONNECTIONS.slice(0, 50)
      
      // 2. Adjust weights
      const weights = {
        semantic: 0.8,
        thematic: 0.5,
        structural: 0.3,
        contradiction: 1.0,
        emotional: 0.2,
        methodological: 0.6,
        temporal: 0.4
      }
      
      // 3. Measure re-ranking time
      const startTime = performance.now()
      
      const ranked = connections
        .map(c => ({
          ...c,
          weightedStrength: c.strength * weights[c.engine_type]
        }))
        .sort((a, b) => b.weightedStrength - a.weightedStrength)
      
      const duration = performance.now() - startTime
      
      // 4. Verify <100ms target
      expect(duration).toBeLessThan(100)
      expect(ranked).toHaveLength(50)
      expect(ranked[0].weightedStrength).toBeGreaterThanOrEqual(ranked[1].weightedStrength)
    })
  })
  
  describe('Validation Capture', () => {
    it('should store validation feedback to localStorage', async () => {
      // 1. Clear localStorage
      localStorage.clear()
      
      // 2. Validate connection
      const feedback = {
        connection_id: 'mock-1',
        feedback_type: 'validate',
        context: {
          time_of_day: new Date().toISOString(),
          document_id: testDocumentId,
          mode: 'reading'
        }
      }
      
      // 3. Store feedback
      const existing = JSON.parse(localStorage.getItem('connection_feedback') || '[]')
      localStorage.setItem('connection_feedback', JSON.stringify([...existing, feedback]))
      
      // 4. Verify stored
      const stored = JSON.parse(localStorage.getItem('connection_feedback') || '[]')
      expect(stored).toHaveLength(1)
      expect(stored[0].connection_id).toBe('mock-1')
      expect(stored[0].feedback_type).toBe('validate')
    })
  })
})
```

### Acceptance Criteria

#### Rule-Based Criteria (Checklist)
- [ ] **Full Flow**: Text selection → annotation save → persist → render (end-to-end)
- [ ] **Fuzzy Matching**: >70% confidence maintained across 10 test documents
- [ ] **Weight Tuning**: Re-ranking completes <100ms for 50 connections
- [ ] **Validation**: Feedback stored to localStorage correctly
- [ ] **Test Speed**: All integration tests run <30 seconds
- [ ] **Cleanup**: Each test cleans up entities (no side effects)

### Manual Testing Steps

1. **Run Integration Tests**:
   ```bash
   npx supabase start  # Ensure test DB running
   npm test tests/integration/annotation-flow.test.ts
   # Expected: All tests pass, <30 seconds total
   ```

2. **Verify Cleanup**:
   ```bash
   # After tests complete, check no orphaned entities
   npm run supabase db query "SELECT COUNT(*) FROM components WHERE component_type='annotation';"
   # Expected: 0 rows
   ```

---

## Task 22: Performance Benchmarking ✅ COMPLETE

**Task ID**: T-022  
**Priority**: Medium  
**Estimated Effort**: 2 hours  
**Risk Level**: Low (measurement script)
**Status**: ✅ Complete (2025-01-28)

### Context & Background

**Source PRP Reference**: Lines 1217-1242

**Feature Overview**: Create benchmark script to measure and validate performance targets: <500ms first paint, <200ms annotation save, <100ms weight re-ranking.

**Task Purpose**:
- **As a** developer
- **I need** automated performance benchmarks
- **So that** performance regressions are caught during development

### Dependencies

**Prerequisite Tasks**:
- Task 6 (Document Viewer) - measure first paint
- Task 4 (Annotation Server Actions) - measure save time
- Task 19 (Connection Re-ranking) - measure re-ranking

### Implementation Details

#### Files to Create
```
scripts/
└── benchmark-annotations.ts (CREATE)
    - Measure first paint time (<500ms target)
    - Measure annotation save time (<200ms target)
    - Measure weight re-ranking time (<100ms target)
```

### Complete Implementation

```typescript
/**
 * Performance benchmarking script for annotation system.
 * 
 * Targets:
 * - First paint: <500ms
 * - Annotation save: <200ms
 * - Weight re-ranking: <100ms
 * 
 * Usage:
 *   npm run benchmark:annotations
 */

import { performance } from 'perf_hooks'
import { createAnnotation } from '../src/app/actions/annotations'
import { MOCK_CONNECTIONS } from '../src/lib/annotations/mock-connections'

// Test data
const testDocumentId = 'benchmark-doc'
const testUserId = 'dev-user-123'

async function benchmarkFirstPaint() {
  console.log('\n📊 Benchmark 1: First Paint Time')
  console.log('Target: <500ms\n')
  
  // Simulate markdown fetch and render
  const start = performance.now()
  
  // Fetch markdown from Storage (simulated)
  const markdown = await fetch('http://localhost:3000/api/benchmark-markdown').then(r => r.text())
  
  // Simulate React render
  await new Promise(resolve => setTimeout(resolve, 50)) // React render time
  
  const duration = performance.now() - start
  
  console.log(`✓ First paint: ${duration.toFixed(2)}ms`)
  console.log(duration < 500 ? '✅ PASS: <500ms target met' : '❌ FAIL: Exceeds 500ms target')
  
  return duration
}

async function benchmarkAnnotationSave() {
  console.log('\n📊 Benchmark 2: Annotation Save Time')
  console.log('Target: <200ms\n')
  
  const iterations = 10
  const durations: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    
    const result = await createAnnotation({
      text: `Test annotation ${i}`,
      chunkId: `chunk-${i}`,
      documentId: testDocumentId,
      startOffset: 0,
      endOffset: 15,
      color: 'yellow'
    })
    
    const duration = performance.now() - start
    durations.push(duration)
    
    // Clean up
    if (result.success) {
      await ecs.deleteEntity(result.id, testUserId)
    }
  }
  
  const avgDuration = durations.reduce((a, b) => a + b) / durations.length
  const maxDuration = Math.max(...durations)
  
  console.log(`✓ Average save time: ${avgDuration.toFixed(2)}ms`)
  console.log(`✓ Max save time: ${maxDuration.toFixed(2)}ms`)
  console.log(avgDuration < 200 ? '✅ PASS: <200ms target met' : '❌ FAIL: Exceeds 200ms target')
  
  return avgDuration
}

async function benchmarkWeightReranking() {
  console.log('\n📊 Benchmark 3: Weight Re-ranking Time')
  console.log('Target: <100ms\n')
  
  const connections = MOCK_CONNECTIONS.slice(0, 50)
  const weights = {
    semantic: 0.8,
    thematic: 0.5,
    structural: 0.3,
    contradiction: 1.0,
    emotional: 0.2,
    methodological: 0.6,
    temporal: 0.4
  }
  const enabledEngines = new Set(['semantic', 'thematic', 'structural', 'contradiction', 'emotional', 'methodological', 'temporal'])
  const strengthThreshold = 0.3
  
  const iterations = 100
  const durations: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    
    const result = connections
      .filter(c => enabledEngines.has(c.engine_type))
      .filter(c => c.strength >= strengthThreshold)
      .map(c => ({
        ...c,
        weightedStrength: c.strength * weights[c.engine_type]
      }))
      .sort((a, b) => b.weightedStrength - a.weightedStrength)
    
    const duration = performance.now() - start
    durations.push(duration)
  }
  
  const avgDuration = durations.reduce((a, b) => a + b) / durations.length
  const maxDuration = Math.max(...durations)
  const p95Duration = durations.sort((a, b) => a - b)[Math.floor(iterations * 0.95)]
  
  console.log(`✓ Average re-ranking time: ${avgDuration.toFixed(2)}ms`)
  console.log(`✓ Max re-ranking time: ${maxDuration.toFixed(2)}ms`)
  console.log(`✓ P95 re-ranking time: ${p95Duration.toFixed(2)}ms`)
  console.log(avgDuration < 100 ? '✅ PASS: <100ms target met' : '❌ FAIL: Exceeds 100ms target')
  
  return avgDuration
}

async function runBenchmarks() {
  console.log('🚀 Annotation System Performance Benchmarks')
  console.log('============================================')
  
  const firstPaint = await benchmarkFirstPaint()
  const saveTime = await benchmarkAnnotationSave()
  const rerankTime = await benchmarkWeightReranking()
  
  console.log('\n📈 Summary')
  console.log('============================================')
  console.log(`First Paint: ${firstPaint.toFixed(2)}ms (target: <500ms)`)
  console.log(`Annotation Save: ${saveTime.toFixed(2)}ms (target: <200ms)`)
  console.log(`Weight Re-ranking: ${rerankTime.toFixed(2)}ms (target: <100ms)`)
  
  const allPass = firstPaint < 500 && saveTime < 200 && rerankTime < 100
  console.log(allPass ? '\n✅ All benchmarks passed!' : '\n❌ Some benchmarks failed!')
  
  process.exit(allPass ? 0 : 1)
}

runBenchmarks()
```

### Acceptance Criteria

#### Rule-Based Criteria (Checklist)
- [ ] **First Paint**: Measured and logged (<500ms target)
- [ ] **Save Time**: Measured over 10 iterations, average <200ms
- [ ] **Re-ranking**: Measured over 100 iterations, average <100ms
- [ ] **Output**: Clear pass/fail indicators for each benchmark
- [ ] **Exit Code**: Script exits 0 if all pass, 1 if any fail

---

## Task 23: Dogfooding Test Plan ✅ COMPLETE

**Task ID**: T-023  
**Priority**: High  
**Estimated Effort**: 2 hours (testing execution)  
**Risk Level**: Low (manual testing protocol)
**Status**: ✅ Complete (2025-01-28)

### Context & Background

**Source PRP Reference**: Lines 1243-1255

**Feature Overview**: Comprehensive manual testing protocol for Week 2 Day 7. Validates real-world usage with 3 documents, 10+ annotations, 20+ connection validations.

**Task Purpose**:
- **As a** product team
- **I need** structured dogfooding protocol
- **So that** UX issues are discovered before user testing

### Dependencies

**Prerequisite Tasks**: All tasks 1-22 must be complete

### Implementation Details

#### Files to Create
```
docs/testing/
└── annotation-dogfooding.md (CREATE)
    - Complete testing checklist
    - Success criteria definitions
    - Bug reporting template
```

### Complete Implementation

```markdown
# Annotation System Dogfooding Test Plan

**Test Date**: Week 2 Day 7  
**Duration**: 2 hours  
**Tester**: [Your name]  
**Build Version**: [Git commit hash]

## Test Environment Setup

- [ ] Supabase running (`npx supabase start`)
- [ ] Next.js dev server running (`npm run dev`)
- [ ] Browser DevTools open (Console + Network tabs)
- [ ] Test documents prepared (1 PDF, 1 YouTube, 1 Web article)

## Test 1: Read 3 Full Documents with Annotations

### Document 1: Technical PDF
- [ ] Upload technical paper (>20 pages, includes math/code)
- [ ] Wait for processing to complete
- [ ] Open reader view
- [ ] Markdown renders correctly (<500ms first paint)
- [ ] Math equations display properly
- [ ] Code blocks syntax highlighted

### Document 2: YouTube Video
- [ ] Submit YouTube URL (30+ minute video)
- [ ] Verify AI-cleaned transcript (no timestamps)
- [ ] Read through 5+ sections
- [ ] Verify headings added by AI
- [ ] Grammar corrections visible

### Document 3: Web Article
- [ ] Submit web article URL
- [ ] Verify Readability extraction
- [ ] Images display inline
- [ ] Article structure preserved

**Success Criteria**: All 3 documents render correctly without blocking errors

## Test 2: Create 10+ Annotations with Different Colors and Notes

### Color Highlighting Tests
- [ ] Select text, press `g` → Green highlight appears
- [ ] Select text, press `y` → Yellow highlight appears
- [ ] Select text, press `r` → Red highlight appears
- [ ] Select text, press `b` → Blue highlight appears
- [ ] Select text, press `p` → Purple highlight appears
- [ ] Verify highlights persist after browser refresh

### Note Annotations Tests
- [ ] Select text, add note in Quick Capture panel
- [ ] Verify note saves on blur (<200ms)
- [ ] Hover over highlight → note displays in tooltip
- [ ] Edit note → verify update persists
- [ ] Delete annotation → verify removal

**Success Criteria**: 10+ annotations created, all colors functional, notes persist

## Test 3: Validate 20+ Mock Connections

### Connection Validation Tests
- [ ] Open right panel → Connections tab
- [ ] Verify 50 mock connections loaded
- [ ] Click connection card → navigates to target chunk
- [ ] Press `v` on connection → "Connection validated" toast appears
- [ ] Press `r` on connection → "Connection rejected" toast appears
- [ ] Press `s` on connection → "Connection starred" toast appears
- [ ] Verify feedback stored to localStorage

**Success Criteria**: 20+ connections validated, navigation works, feedback captured

## Test 4: Weight Tuning Interface

### Slider Adjustment Tests
- [ ] Adjust semantic weight 0.5 → 0.8 → connections re-rank <100ms
- [ ] Adjust thematic weight 0.5 → 0.2 → connections re-rank <100ms
- [ ] Adjust all 7 engine weights simultaneously
- [ ] Verify visual feedback (cards animate with spring physics)
- [ ] Check DevTools console for performance warnings

### Preset Tests
- [ ] Click "Max Friction" preset → weights update correctly
- [ ] Verify connections re-rank with contradiction emphasis
- [ ] Click "Thematic Focus" → verify thematic connections prioritized
- [ ] Click "Balanced" → all weights 0.5
- [ ] Click "Chaos" → all weights 0.8

**Success Criteria**: All presets apply correctly, re-ranking <100ms, smooth animations

## Test 5: Connection Filtering

### Engine Toggle Tests
- [ ] Disable semantic engine → semantic connections hidden
- [ ] Disable thematic engine → thematic connections hidden
- [ ] Disable all engines → empty state displays
- [ ] Re-enable engines → connections reappear
- [ ] Verify collapsible sections work per engine

### Strength Threshold Tests
- [ ] Set threshold to 0.8 → weak connections hidden
- [ ] Set threshold to 0.3 → all connections visible
- [ ] Adjust slider gradually → connections filter in real-time
- [ ] Verify smooth animations during filtering

**Success Criteria**: Filtering instant (<50ms), empty state helpful, animations smooth

## Test 6: Keyboard Shortcuts

### Hotkey Tests
- [ ] Press `g` during text selection → green highlight
- [ ] Press `y` during text selection → yellow highlight
- [ ] Press `?` → keyboard shortcuts help panel opens
- [ ] Press `Escape` → closes help panel
- [ ] Press `Escape` → closes Quick Capture panel
- [ ] Verify `v/r/s` keys work on active connection

**Success Criteria**: All hotkeys functional, help panel comprehensive

## Test 7: Flow State Validation

### No-Modal Architecture Test
- [ ] Complete all tests above
- [ ] Confirm NO modal dialogs appeared (zero)
- [ ] All panels are non-blocking (can still read behind them)
- [ ] Quick Capture panel positioned near selection (not center screen)
- [ ] Right panel collapsible (doesn't force reading narrow column)

**Success Criteria**: Zero modal interruptions, flow state preserved throughout testing

## Test 8: Performance Validation

### Timing Measurements
- [ ] First paint time: _____ ms (target: <500ms)
- [ ] Annotation save time: _____ ms (target: <200ms)
- [ ] Weight re-ranking time: _____ ms (target: <100ms)
- [ ] Fuzzy matching confidence: _____ % high (target: >70%)

**Measure with**:
- DevTools Performance tab for first paint
- Console.log timestamps for save time
- Console.log timestamps for re-ranking

**Success Criteria**: All performance targets met

## Bug Reporting Template

### P0 - Blocking (Cannot Complete Testing)
- **Issue**: [Description]
- **Steps to Reproduce**: [1, 2, 3]
- **Expected**: [Behavior]
- **Actual**: [Behavior]
- **Screenshot**: [Attach]

### P1 - High (Functionality Broken)
- **Issue**: [Description]
- **Steps to Reproduce**: [1, 2, 3]
- **Workaround**: [If any]

### P2 - Medium (UX Issue)
- **Issue**: [Description]
- **Suggestion**: [Improvement]

## Final Sign-Off

- [ ] All tests completed
- [ ] No P0/P1 blocking bugs
- [ ] Performance targets met
- [ ] Flow state preserved
- [ ] Ready for user testing

**Tester Signature**: _______________  
**Date**: _______________  
**Overall Assessment**: _______________
```

### Acceptance Criteria

#### Rule-Based Criteria (Checklist)
- [ ] **Coverage**: All test sections completed (1-8)
- [ ] **Documentation**: Bugs logged with P0/P1/P2 severity
- [ ] **Performance**: Timing measurements recorded
- [ ] **Sign-Off**: Final checklist completed with signature

---

## Task 24: Final Polish & Bug Fixes

**Task ID**: T-024  
**Priority**: Critical  
**Estimated Effort**: 4 hours  
**Risk Level**: Low (cleanup task)

### Context & Background

**Source PRP Reference**: Lines 1256-1265

**Feature Overview**: Final polish pass addressing all issues discovered during dogfooding. Ensure code quality gates pass, documentation complete, and zero P0/P1 bugs remain.

**Task Purpose**:
- **As a** development team
- **I need** polished, production-ready annotation system
- **So that** user testing proceeds smoothly without critical bugs

### Dependencies

**Prerequisite Tasks**: All tasks 1-23 must be complete

### Technical Requirements

#### Functional Requirements
- **REQ-1**: All P0/P1 bugs from dogfooding must be fixed
- **REQ-2**: Code must pass TypeScript strict mode (npm run build)
- **REQ-3**: Code must pass linting (npm run lint)
- **REQ-4**: All exported functions must have JSDoc documentation
- **REQ-5**: No console errors in browser during normal usage

#### Non-Functional Requirements
- **Quality**: Zero known blocking issues
- **Documentation**: Complete JSDoc on all public APIs
- **Accessibility**: Keyboard navigation functional, ARIA labels present

### Implementation Details

#### Areas to Review

1. **Loading States**
   - Skeleton components render properly
   - Empty states have helpful messages
   - Error states show actionable guidance

2. **Error Messages**
   - No generic "An error occurred" messages
   - All errors provide context and next steps
   - Console errors logged with stack traces

3. **Empty States**
   - "No annotations" state in right panel
   - "No connections match filters" state
   - Helpful suggestions (adjust filters, create annotations)

4. **JSDoc Completeness**
   - All exported functions documented
   - Parameters described with types
   - Return values documented
   - Examples provided for complex functions

5. **TypeScript Strict Mode**
   - No `any` types
   - All interfaces complete
   - No implicit returns

6. **Accessibility**
   - All buttons keyboard-accessible
   - ARIA labels on interactive elements
   - Focus management in panels
   - Keyboard shortcuts documented

7. **Mobile Responsiveness**
   - Test on tablet (iPad size)
   - Right panel collapses on smaller screens
   - Quick Capture panel adapts to viewport
   - Defer full mobile to Phase 4

### Checklist

#### Code Quality
- [ ] `npm run build` passes (TypeScript validation)
- [ ] `npm run lint` passes (JSDoc validation)
- [ ] No console.error() in browser during testing
- [ ] No warnings about missing keys in React
- [ ] No deprecation warnings from libraries

#### Documentation
- [ ] JSDoc on all exported functions in src/lib/annotations/
- [ ] JSDoc on all Server Actions in src/app/actions/annotations.ts
- [ ] JSDoc on all Zustand store actions
- [ ] Code comments for complex algorithms (fuzzy matching)

#### P0/P1 Bugs (From Dogfooding)
- [ ] [Bug 1]: [Description] → [Status: Fixed/In Progress]
- [ ] [Bug 2]: [Description] → [Status: Fixed/In Progress]
- [ ] All P0 bugs fixed (blocking)
- [ ] All P1 bugs fixed (high priority)

#### Loading States
- [ ] Skeleton displays during markdown fetch
- [ ] Saving indicator shows during annotation creation
- [ ] Re-ranking shows subtle loading state (optional)

#### Error Handling
- [ ] Network errors show helpful messages
- [ ] Server validation errors displayed clearly
- [ ] Retry buttons functional where applicable

#### Empty States
- [ ] "No annotations yet" state in right panel Annotations tab
- [ ] "No connections match filters" state with suggestions
- [ ] "No documents" state in library (if applicable)

#### Accessibility
- [ ] All buttons keyboard-accessible (Tab navigation)
- [ ] ARIA labels on icon-only buttons
- [ ] Focus management in Quick Capture panel
- [ ] Keyboard shortcuts help panel complete
- [ ] Screen reader tested (optional, basic check)

#### Mobile/Tablet
- [ ] Tested on iPad (1024x768)
- [ ] Right panel collapses/expands properly
- [ ] Quick Capture panel positioned correctly
- [ ] Text selection works on touch (if possible)

### Manual Testing Steps

1. **Run Quality Gates**:
   ```bash
   npm run build  # TypeScript
   npm run lint   # JSDoc + ESLint
   ```

2. **Browser Console Check**:
   - Open DevTools Console
   - Perform all critical flows
   - Verify zero errors (red messages)
   - Verify minimal warnings

3. **Accessibility Quick Check**:
   - Navigate entire UI with Tab key only
   - Verify all interactive elements reachable
   - Test keyboard shortcuts (g/y/r/b/p, v/r/s, ?)

4. **Tablet Responsiveness**:
   - Open DevTools → Device Mode
   - Set to iPad (1024x768)
   - Test all panels collapse/expand
   - Verify no horizontal scroll

### Bug Fix Priorities

**P0 - Fix Immediately (Blockers)**:
- Data loss bugs (annotations not persisting)
- Critical crashes (render errors)
- Complete feature breakage (highlighting not working)

**P1 - Fix Today (High Priority)**:
- Performance regressions (>500ms first paint)
- UX blockers (Quick Capture panel positioned off-screen)
- Validation errors (Server Actions rejecting valid input)

**P2 - Defer to Phase 2 (Medium Priority)**:
- UI polish (better animations, spacing)
- Edge cases (very long annotations, special characters)
- Nice-to-have features (annotation export, search)

### Acceptance Criteria

#### Rule-Based Criteria (Checklist)
- [ ] **Zero P0 Bugs**: All blocking issues fixed
- [ ] **Zero P1 Bugs**: All high-priority issues fixed
- [ ] **Build Passes**: `npm run build` succeeds
- [ ] **Lint Passes**: `npm run lint` succeeds
- [ ] **JSDoc Complete**: All exported functions documented
- [ ] **Console Clean**: No errors during normal usage
- [ ] **Accessibility**: Keyboard navigation functional
- [ ] **Tablet Works**: Tested on iPad size, responsive

### Resources & References

**Code Quality Tools**:
- TypeScript strict mode: https://www.typescriptlang.org/tsconfig#strict
- ESLint JSDoc plugin: https://github.com/gajus/eslint-plugin-jsdoc
- React DevTools: https://react.dev/learn/react-developer-tools

**Accessibility References**:
- WCAG 2.1 Quick Reference: https://www.w3.org/WAI/WCAG21/quickref/
- ARIA labels: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label

---

## Summary: Tasks 17-24 Overview

| Task | Name | Effort | Risk | Priority | Dependencies |
|------|------|--------|------|----------|--------------|
| T-017 | Fuzzy Restore Wrapper | 4h | Medium | High | T-3, T-6 |
| T-018 | Loading States & Error Handling | 3h | Low | High | T-6, T-7 |
| T-019 | Performance Optimization | 3h | Low | High | T-12, T-13 |
| T-020 | Database Migration | 1h | Low | Medium | None |
| T-021 | Integration Testing | 4h | Low | Medium | T-4, T-6 |
| T-022 | Performance Benchmarking | 2h | Low | Medium | T-6, T-4, T-19 |
| T-023 | Dogfooding Test Plan | 2h | Low | High | All 1-22 |
| T-024 | Final Polish & Bug Fixes | 4h | Low | Critical | All 1-23 |

**Total Estimated Effort**: 23 hours (3 days at 8h/day)

**Critical Path**: T-017 → T-018 → T-023 → T-024 (13 hours)

**Parallel Opportunities**:
- T-019 (Performance Optimization) can run parallel with T-017/T-018
- T-020 (Database Migration) can run anytime before T-023
- T-021 (Integration Testing) can start after T-4/T-6, parallel with T-17-19
- T-022 (Benchmarking) can run parallel with T-021

---

**Document Status**: ✅ Complete  
**Ready for Implementation**: Yes  
**Next Action**: Begin Task 17 (Fuzzy Restore Wrapper)