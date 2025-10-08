# Zustand State Management Pattern

This guide explains when and how to use Zustand for global state management in Rhizome V2.

## When to Use Zustand

Use Zustand when you have **document-scoped data** that needs to be:
1. Accessed by components 3+ levels apart (avoids prop drilling)
2. Updated from multiple places (annotations, sparks, flashcards)
3. Shared across different parts of the UI (sidebar + reader + header)

**Current Zustand Stores**:
- `useAnnotationStore` - Annotations, weights, filters

**Future Candidates**:
- Flashcards (will be accessed in reader + study mode + sidebar)
- Sparks (quick captures used in sidebar + modal + export)
- Connections (already have some state, could consolidate)

## Basic Pattern

### 1. Add State to Store

```typescript
// src/stores/annotation-store.ts
interface AnnotationState {
  // Existing state...

  // Add new feature (keyed by documentId)
  flashcards: Record<string, Flashcard[]>
  setFlashcards: (documentId: string, flashcards: Flashcard[]) => void
  addFlashcard: (documentId: string, flashcard: Flashcard) => void
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  // Existing state...

  flashcards: {},

  setFlashcards: (documentId, flashcards) =>
    set((state) => ({
      flashcards: { ...state.flashcards, [documentId]: flashcards }
    })),

  addFlashcard: (documentId, flashcard) =>
    set((state) => ({
      flashcards: {
        ...state.flashcards,
        [documentId]: [...(state.flashcards[documentId] || []), flashcard]
      }
    })),
}))
```

### 2. Load Data (Component that owns the data)

```typescript
// VirtualizedReader.tsx or dedicated data-fetching component
import { useAnnotationStore } from '@/stores/annotation-store'

export function FlashcardLoader({ documentId }) {
  const setFlashcards = useAnnotationStore(state => state.setFlashcards)

  useEffect(() => {
    async function loadFlashcards() {
      const result = await getFlashcards(documentId)
      if (result.success) {
        setFlashcards(documentId, result.data)  // Store in Zustand
      }
    }

    loadFlashcards()
  }, [documentId, setFlashcards])

  return null // or children
}
```

### 3. Read Data (Any component, anywhere)

```typescript
// FlashcardsList.tsx (in sidebar)
import { useAnnotationStore } from '@/stores/annotation-store'

export function FlashcardsList({ documentId }) {
  // Direct access - no props needed!
  const flashcards = useAnnotationStore(
    state => state.flashcards[documentId] || []
  )

  return (
    <div>
      {flashcards.map(card => (
        <FlashcardCard key={card.id} card={card} />
      ))}
    </div>
  )
}
```

### 4. Update Data (Any component)

```typescript
// QuickCapturePanel.tsx
import { useAnnotationStore } from '@/stores/annotation-store'

export function QuickCapturePanel() {
  const addFlashcard = useAnnotationStore(state => state.addFlashcard)

  async function handleCreate() {
    const result = await createFlashcard(data)
    if (result.success) {
      // Update store immediately (optimistic)
      addFlashcard(documentId, result.flashcard)
      toast.success('Flashcard created!')
    }
  }

  return <button onClick={handleCreate}>Create</button>
}
```

## Key Principles

### 1. Document-Scoped Keys

Always key by `documentId` to isolate data:

```typescript
// ✅ Good - isolated per document
annotations: Record<string, StoredAnnotation[]>

// ❌ Bad - shared across all documents
annotations: StoredAnnotation[]
```

### 2. Selective Subscriptions

Use selectors to prevent unnecessary re-renders:

```typescript
// ✅ Good - only re-renders when THIS document's annotations change
const annotations = useAnnotationStore(
  state => state.annotations[documentId] || []
)

// ❌ Bad - re-renders on ANY document's annotations change
const { annotations } = useAnnotationStore()
const docAnnotations = annotations[documentId] || []
```

### 3. Optimistic Updates

Update the store immediately, don't wait for server:

```typescript
async function handleCreate() {
  // 1. Optimistic update (instant UI)
  addAnnotation(documentId, optimisticAnnotation)

  // 2. Server call
  const result = await createAnnotation(data)

  // 3. Replace optimistic with real data
  if (result.success) {
    updateAnnotation(documentId, result.id, result.annotation)
  } else {
    // Rollback on error
    removeAnnotation(documentId, optimisticAnnotation.id)
  }
}
```

## Migration Checklist

When migrating a feature to Zustand:

- [ ] Add state + actions to store (`src/stores/annotation-store.ts`)
- [ ] Load data in owner component (e.g., VirtualizedReader)
- [ ] Remove prop declarations from intermediate components
- [ ] Update consumer components to use `useAnnotationStore`
- [ ] Remove callback props (onAnnotationsChange, etc.)
- [ ] Test that data flows correctly

## Real Example: Annotations Refactor

**Before (Prop Drilling)**:
```
VirtualizedReader (owns serverAnnotations state)
  ↓ onAnnotationsChange callback
DocumentViewer (pass-through)
  ↓ onAnnotationsChange callback
ReaderLayout (liveAnnotations state)
  ↓ annotations prop
RightPanel (pass-through)
  ↓ annotations prop
AnnotationsList (consumer)
```

**After (Zustand)**:
```
VirtualizedReader
  → setAnnotations(documentId, data)  // Write to store

AnnotationsList
  → useAnnotationStore(state => state.annotations[documentId])  // Read from store
```

**Eliminated**:
- 6 prop declarations
- 2 callback functions
- 1 intermediate state variable
- 50+ lines of prop passing code

## When NOT to Use Zustand

Use local state when data is:
- **UI-only**: Modal open/closed, form input values
- **Component-scoped**: Doesn't need to be shared
- **Transient**: Doesn't persist across unmounts

```typescript
// ✅ Good - local UI state
const [isOpen, setIsOpen] = useState(false)

// ❌ Bad - doesn't need global state
const isOpen = useAnnotationStore(state => state.isModalOpen)
```

## Future Patterns

### Flashcards (Next to Implement)

```typescript
// Store
flashcards: Record<string, Flashcard[]>
setFlashcards: (documentId: string, flashcards: Flashcard[]) => void
addFlashcard: (documentId: string, flashcard: Flashcard) => void
updateFlashcard: (documentId: string, flashcardId: string, updates: Partial<Flashcard>) => void
```

### Sparks

```typescript
// Store
sparks: Record<string, Spark[]>
setSparks: (documentId: string, sparks: Spark[]) => void
addSpark: (documentId: string, spark: Spark) => void
```

### Connections (Consolidate Existing State)

```typescript
// Store
connections: Record<string, Connection[]>
setConnections: (documentId: string, connections: Connection[]) => void
// Already have weights/filters - just add connection data
```

## Summary

**Use Zustand for**:
- Annotations ✅ (Done)
- Flashcards (Next)
- Sparks (Next)
- Connections (Consolidate)

**Use local state for**:
- Modal open/closed
- Form inputs
- Loading states
- Scroll positions
- UI toggles

**Pattern**:
1. Key by documentId
2. Load in owner component
3. Access anywhere with selectors
4. Update optimistically
