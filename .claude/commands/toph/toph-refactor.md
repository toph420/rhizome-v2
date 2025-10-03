---
description: Facilitate refactoring 
---

# Refactor TypeScript/React Code (Rhizome Personal Tool)

You are refactoring code for Rhizome, a personal knowledge synthesis tool. This is a **single-user application**, not enterprise software. Apply pragmatic refactoring that improves maintainability without over-engineering.

## Tech Stack
- TypeScript (strict mode)
- Next.js 14+ (App Router)
- React Server/Client Components
- Supabase (PostgreSQL + Storage)
- Tailwind CSS 4 + shadcn/ui
- Zustand (state management)

## Project Philosophy
- **Personal tool for one user** - No multi-tenancy, no permission systems
- **File-over-app** - Local files are source of truth, database for queries
- **Ship working code** - Extract and organize, don't rewrite algorithms
- **Measure before optimizing** - No premature performance work
- **Greenfield** - No backward compatibility concerns

## Analysis Focus

### Code Smells (Specific to This Project)
- **Monolithic files** (>500 lines)
  - Example: `ai-chunk-batch.ts` (1000+ lines) needs extraction
- **Embedded utilities** (>100 lines of helper functions)
  - Extract to separate modules with single responsibility
- **Duplicate implementations**
  - Multiple fuzzy matching systems, consolidate to one
- **Inline configuration** (hardcoded values scattered)
  - Extract to config objects with defaults
- **Mixed concerns** (orchestration + validation + retry logic)
  - Separate layers: orchestration → validation → execution

### Anti-Patterns to Avoid
- Don't create abstract factories (personal tool doesn't need them)
- Don't add dependency injection containers (overkill for one user)
- Don't build plugin systems (no plugins planned)
- Don't add configuration UIs (hardcode in files)
- Don't extract single-use functions (inline is fine)

## Refactoring Strategy

### 1. Immediate Extractions (Do These First)

**Extract Large Utility Blocks**
```typescript
// Before: 200 lines of fuzzy matching inside processing file
function processDocument() {
  // ... fuzzy matching logic inline ...
}

// After: Separate module
import { fuzzyMatchContent } from './fuzzy-matcher'

function processDocument() {
  const match = fuzzyMatchContent(...)
}
```

**Extract Configuration**
```typescript
// Before: Magic numbers scattered
const BATCH_SIZE = 100000
const OVERLAP = 2000
const MAX_RETRIES = 3

// After: Config object
export const CHUNKING_CONFIG = {
  batchSize: 100000,
  overlapSize: 2000,
  maxRetries: 3,
  maxChunkSize: 10000
} as const
```

**Extract Validation**
```typescript
// Before: Validation mixed with logic
function processChunks(chunks) {
  for (const chunk of chunks) {
    if (!chunk.content) throw new Error('...')
    if (chunk.size > 10000) throw new Error('...')
    // ... actual processing ...
  }
}

// After: Separate validation
function validateChunks(chunks: Chunk[]): ValidationResult {
  // All validation logic here
}

function processChunks(chunks: Chunk[]) {
  const validation = validateChunks(chunks)
  if (!validation.valid) throw new ValidationError(...)
  // ... processing ...
}
```

### 2. File Organization Patterns

**Monolithic File → Module**
```
Before:
worker/lib/ai-chunk-batch.ts (1000 lines)

After:
worker/lib/chunking/
├── orchestrator.ts         # Main entry point (200 lines)
├── batch-creator.ts        # Windowing logic
├── chunk-validator.ts      # Validation rules
├── fuzzy-matcher.ts       # Offset correction
├── retry-handler.ts       # Retry with backoff
├── config.ts              # All constants
└── types.ts               # Shared types
```

**React Component → Composition**
```typescript
// Before: 400-line component
export function DocumentReader() {
  // viewport tracking
  // selection handling
  // annotation rendering
  // connection surfacing
  // scroll management
}

// After: Composed
export function DocumentReader() {
  return (
    <ViewportTracker>
      <SelectionHandler>
        <AnnotationLayer />
        <ConnectionSidebar />
      </SelectionHandler>
    </ViewportTracker>
  )
}
```

### 3. TypeScript Patterns

**Use Discriminated Unions**
```typescript
// Before: Optional fields everywhere
type Result = {
  success?: boolean
  data?: Data
  error?: Error
}

// After: Explicit states
type Result = 
  | { status: 'success'; data: Data }
  | { status: 'error'; error: Error }
```

**Const Assertions for Config**
```typescript
export const ENGINES = {
  semantic: { weight: 0.25, name: 'Semantic Similarity' },
  thematic_bridge: { weight: 0.35, name: 'Thematic Bridges' },
  contradiction: { weight: 0.40, name: 'Contradictions' }
} as const

type EngineType = keyof typeof ENGINES
```

### 4. React-Specific Patterns

**Extract Custom Hooks**
```typescript
// Before: Logic in component
function Reader() {
  const [selection, setSelection] = useState(null)
  
  useEffect(() => {
    function handleSelection() { /* 50 lines */ }
    document.addEventListener('mouseup', handleSelection)
    return () => document.removeEventListener('mouseup', handleSelection)
  }, [])
}

// After: Custom hook
function Reader() {
  const { selection, clearSelection } = useTextSelection(blocks, chunks)
}
```

**Server Actions**
```typescript
// Keep server logic in server actions
'use server'

export async function createAnnotation(input: CreateInput) {
  const supabase = createClient()
  // Database operations here
  revalidatePath(`/documents/${input.documentId}`)
}
```

## Refactoring Checklist

**Structure**
- [ ] No file >500 lines (split if larger)
- [ ] Utilities extracted to separate files
- [ ] Config in dedicated files (no inline magic numbers)
- [ ] Types in separate `.ts` files (not mixed with logic)

**TypeScript**
- [ ] Strict mode enabled, no `any` types
- [ ] Discriminated unions for result types
- [ ] Const assertions for config objects
- [ ] Proper error types (extend Error)

**React**
- [ ] Client components marked with 'use client'
- [ ] Server actions in separate files with 'use server'
- [ ] Custom hooks extracted (>20 lines of effect logic)
- [ ] No useState for derived state (use useMemo)

**Testing**
- [ ] Extracted utilities have unit tests
- [ ] Integration tests for orchestration
- [ ] No need for 100% coverage (personal tool)

## Migration Strategy

**Incremental Extraction**
1. Extract one utility module (e.g., fuzzy-matching.ts)
2. Run existing tests to verify no behavior change
3. Ship and use for a day
4. Extract next module if first worked

**No Big Rewrites**
- Don't refactor everything at once
- Extract 1-2 modules per session
- Test each extraction independently
- Keep original working until new version validated

## Output Format

1. **File Structure**: Proposed module organization
2. **Extracted Modules**: Complete code for each new file
3. **Updated Orchestrator**: Simplified main file using extracted modules
4. **Types File**: Shared types between modules
5. **Config File**: All constants in one place
6. **Migration Notes**: What changed, how to test

## Example Refactoring

**Before**: `ai-chunk-batch.ts` (1000 lines)
- Batching logic: 150 lines
- Fuzzy matching: 200 lines
- Validation: 100 lines
- Retry logic: 80 lines
- Deduplication: 70 lines
- Telemetry: 50 lines
- Main orchestration: 350 lines

**After**: 8 focused files
```
chunking/
├── orchestrator.ts (200 lines) - Main entry point
├── batch-creator.ts (150 lines) - Window batching
├── fuzzy-matcher.ts (200 lines) - Offset correction
├── validator.ts (120 lines) - All validation
├── retry-handler.ts (100 lines) - Backoff logic
├── deduplicator.ts (80 lines) - Overlap removal
├── config.ts (50 lines) - Constants
└── types.ts (100 lines) - Shared types
```

**Metrics**
- Cyclomatic complexity: 25 → 8 (per function)
- Largest file: 1000 → 200 lines
- Testability: Embedded → Independent modules
- Reusability: Fuzzy matching now used by 2 systems

Focus on **extraction over abstraction**. Move code to logical modules, don't redesign algorithms.