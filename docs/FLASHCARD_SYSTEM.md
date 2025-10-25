# Flashcard System Documentation

**Status**: ⚠️ Backend Complete, UI Functional (Study Mode Missing)
**Version**: 1.0
**Last Updated**: 2025-10-24

---

## Current Implementation Status

### ✅ Fully Implemented (Production Ready)

**Backend (100% Complete)**:
- ✅ ECS operations (`FlashcardOperations` class)
- ✅ Storage helpers (Supabase Storage uploads)
- ✅ System decks (Inbox, Archive auto-creation)
- ✅ Prompt templates (4 system prompts seeded)
- ✅ Worker handler (`generate-flashcards.ts`)
- ✅ Cloze parser (Anki-compatible format)
- ✅ Template renderer (Mustache-style variables)
- ✅ Multi-source loaders (5 types: document, chunks, selection, annotation, connection)
- ✅ Server actions (CRUD + batch operations)
- ✅ Database schema (decks, prompt_templates, flashcards_cache)
- ✅ Cache rebuild RPC function
- ✅ FSRS integration (ts-fsrs library)

**Frontend (80% Complete)**:
- ✅ FlashcardsTab (2-tab interface in RightPanel)
- ✅ GenerationPanelClient (AI generation UI)
- ✅ FlashcardsListClient (card browsing/filtering)
- ✅ FlashcardCard component (keyboard shortcuts, inline editing)
- ✅ Flashcard store (Zustand - Pattern 2: Server Actions + Store)

### ❌ Not Implemented Yet

**Frontend Missing**:
- ❌ Study mode UI (`/flashcards/study` page)
- ❌ Study session interface (card flip, rating buttons)
- ❌ Deck management page (browse all decks)
- ❌ Advanced stats/analytics
- ❌ Prompt template editor UI
- ❌ Batch selection toolbar

**Known Issues**:
- ⚠️ React Query still in dependencies (handoff document proposes removal)
- ⚠️ Study mode referenced in docs but not implemented

**Recent Fixes** (2025-10-24):
- ✅ Fixed component inserts in generation handler (removed invalid `user_id` field)
- ✅ Added automatic cache rebuild after flashcard generation
- ✅ Cards now appear in UI immediately after generation

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Features](#features)
5. [Implementation Details](#implementation-details)
6. [Usage Guide](#usage-guide)
7. [API Reference](#api-reference)
8. [Troubleshooting](#troubleshooting)
9. [Future Enhancements](#future-enhancements)

---

## Overview

The Flashcard System is an AI-powered spaced repetition system integrated into Rhizome V2. It allows users to generate flashcards from documents using Gemini AI and manage them with FSRS (Free Spaced Repetition Scheduler) algorithm.

### Key Features

- **AI-Powered Generation**: Generate flashcards using Gemini 2.0 Flash with customizable prompts
- **Multi-Source Support**: Create flashcards from documents, chunks, selections, annotations, connections
- **4 Prompt Templates**: Pre-configured templates for different learning styles (all system prompts seeded)
- **Cloze Support**: Anki-compatible cloze deletion format (`{{c1::text}}`)
- **FSRS Integration**: Evidence-based spaced repetition algorithm (ts-fsrs)
- **ECS Architecture**: 4-component entity system (Card, Content, Temporal, ChunkRef)
- **Storage-First**: Individual JSON files per card for portability
- **System Decks**: Auto-created Inbox and Archive decks

---

## Architecture

### Design Philosophy

**Backend-First Approach**: Build complete, extensible backend architecture first. Add UI incrementally without refactoring.

**Data Fetching Pattern**: Uses **Pattern 2 (Zustand + Server Actions)** - consistent with SparksTab and ConnectionsList.

### 4-Component ECS Structure

Every flashcard is an entity with exactly 4 components:

```typescript
Flashcard Entity = {
  Card: {
    type: 'basic' | 'cloze',
    question: string,
    answer: string,
    content?: string,  // For cloze cards
    clozeIndex?: number,
    clozeCount?: number,
    status: 'draft' | 'active' | 'suspended',  // Derived from srs
    srs: FSRSState | null,  // null = draft, not-null = approved
    deckId: UUID,
    deckAddedAt: timestamp,
    parentCardId?: UUID,  // For grouping cloze cards
    generatedBy: 'manual' | 'ai' | 'import',
    generationPromptVersion?: string
  },
  Content: {
    note?: string,
    tags: string[]
  },
  Temporal: {
    createdAt: timestamp,
    updatedAt: timestamp
  },
  ChunkRef: {
    documentId?: UUID,
    chunkId?: UUID,
    chunkIds: UUID[],
    chunkPosition: number,
    connectionId?: UUID,
    annotationId?: UUID,
    generationJobId?: UUID
  }
}
```

**Status Derivation**:
- `Card.srs === null` → **draft** (not yet approved for study)
- `Card.srs !== null` → **active** (approved, in study rotation)

### Storage Strategy

**Storage = Source of Truth, Database = Queryable Cache**

```
{userId}/flashcards/
├── card_{entityId}.json  (individual file per card)
├── card_{entityId}.json
└── card_{entityId}.json
```

Each file contains the complete 4-component structure as JSON.

**Benefits**:
- ✅ Portability (ZIP export, Obsidian sync)
- ✅ Disaster recovery (rebuild cache from Storage)
- ✅ Version control friendly
- ✅ Human-readable backups

### Database Tables

#### `decks` Table
```sql
CREATE TABLE decks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_id UUID,  -- For nested decks
  is_system BOOLEAN DEFAULT FALSE,  -- Inbox, Archive
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `prompt_templates` Table
```sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL,  -- Mustache-style {{variables}}
  variables TEXT[],  -- ['count', 'content', 'chunks', 'custom']
  is_default BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,  -- Pre-configured templates
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

**4 System Prompts Seeded**:
1. Comprehensive Concepts (default)
2. Deep Details
3. Connections & Synthesis
4. Contradiction Focus

#### `flashcards_cache` Table
```sql
CREATE TABLE flashcards_cache (
  entity_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  deck_id UUID NOT NULL,

  -- Card data (for quick queries)
  card_type TEXT NOT NULL,  -- 'basic' | 'cloze'
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'draft' | 'active' | 'suspended'

  -- SRS data
  next_review TIMESTAMPTZ,
  stability DOUBLE PRECISION,
  difficulty DOUBLE PRECISION,
  reps INTEGER,
  lapses INTEGER,
  srs_state INTEGER,

  -- Source tracking
  document_id UUID,
  chunk_ids UUID[],
  connection_id UUID,
  annotation_id UUID,
  generation_job_id UUID,

  -- Content
  tags TEXT[],

  -- Storage
  storage_path TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ,
  cached_at TIMESTAMPTZ
);
```

**Cache Rebuild**: RPC function `rebuild_flashcards_cache(p_user_id UUID)` regenerates cache from ECS components. This function is **automatically called** by the generation handler after creating flashcard entities.

---

## Core Components

### Backend Components

#### 1. FlashcardOperations (`src/lib/ecs/flashcards.ts`)

Type-safe CRUD wrapper over ECS:

```typescript
const ecs = createECS()
const ops = new FlashcardOperations(ecs, userId)

// Create (draft by default)
await ops.create({
  type: 'basic',
  question: 'What is a rhizome?',
  answer: 'Non-hierarchical network structure',
  deckId: inboxId,
  tags: ['philosophy'],
  documentId: docId,
  chunkIds: [chunkId]
})

// Approve (draft → active, adds SRS)
await ops.approve(entityId)

// Review (updates FSRS schedule)
await ops.review(entityId, {
  rating: 3,  // 1=Again, 2=Hard, 3=Good, 4=Easy
  timeSpentMs: 5000
})

// Update
await ops.update(entityId, {
  question: 'New question',
  tags: ['updated']
})

// Archive (move to Archive deck)
await ops.archive(entityId)

// Delete (hard delete)
await ops.delete(entityId)

// Query
await ops.getByDeck(deckId)
await ops.getDue(limit = 50)
```

#### 2. Storage Helpers (`src/lib/flashcards/storage.ts`)

```typescript
// Upload flashcard to Storage
uploadFlashcardToStorage(userId, entityId, data): Promise<string>

// Download flashcard from Storage
downloadFlashcardFromStorage(userId, entityId): Promise<FlashcardStorage>

// List all flashcard files
listUserFlashcards(userId): Promise<string[]>

// Delete flashcard from Storage
deleteFlashcardFromStorage(userId, entityId): Promise<void>

// Verify storage integrity
verifyFlashcardsIntegrity(userId): Promise<{ total, valid, invalid }>
```

**Pattern**: Exactly like `src/lib/sparks/storage.ts` - fire-and-forget async uploads.

#### 3. Prompt Templates System

**4 Pre-configured Templates** (seeded in database):
1. **Comprehensive Concepts** (default) - Key definitions, core ideas, concept relationships
2. **Deep Details** - Specific claims, evidence, precise terminology
3. **Connections & Synthesis** - How ideas connect, comparisons, applications
4. **Contradiction Focus** - Conceptual tensions, opposing viewpoints, paradoxes

**Template Rendering**:
```typescript
// worker/lib/template-renderer.ts
renderTemplate(template: string, variables: Record<string, string>): string

// Example
renderTemplate("Generate {{count}} cards from {{content}}", {
  count: "5",
  content: "Document text..."
})
// → "Generate 5 cards from Document text..."
```

**Variables**:
- `{{count}}` - Number of cards to generate
- `{{content}}` - Source content (up to 50K chars)
- `{{chunks}}` - Chunk metadata (JSON, top 10 chunks)
- `{{custom}}` - Custom user instructions

#### 4. Multi-Source Generation (`worker/lib/source-loaders.ts`)

**5 Source Types**:

```typescript
// 1. Document - Full document markdown
new DocumentSourceLoader(documentIds: string[])

// 2. Chunks - Specific chunks by ID
new ChunksSourceLoader(chunkIds: string[])

// 3. Selection - Text selection from reader
new SelectionSourceLoader({
  text: string,
  documentId: string,
  startOffset: number,
  endOffset: number
})

// 4. Annotation - From annotation entities
new AnnotationSourceLoader(annotationIds: string[])

// 5. Connection - From connection entities
new ConnectionSourceLoader(connectionIds: string[])

// Factory
createSourceLoader(type, ids, selectionData?): SourceLoader
```

#### 5. Cloze Support (`worker/lib/cloze-parser.ts`)

Anki-compatible cloze deletion format:

```typescript
// Extract cloze deletions
extractClozeDeletions("The {{c1::rhizome}} opposes {{c2::hierarchy}}")
// → [
//   { index: 1, text: 'rhizome', hint: null },
//   { index: 2, text: 'hierarchy', hint: null }
// ]

// Render question for specific deletion
renderClozeQuestion("The {{c1::rhizome}} opposes {{c2::hierarchy}}", 1)
// → "The [...] opposes hierarchy"

// Check if content is cloze
isClozeContent(content): boolean
```

**Hint Support**: `{{c1::text::hint}}` → Renders as `[...hint]`

**Multi-Card Generation**: One card per deletion, automatically creates siblings with `parentCardId`.

#### 6. System Deck Helpers (`src/lib/decks/system-decks.ts`)

```typescript
// Auto-creates if doesn't exist
getInboxDeck(userId): Promise<Deck>
getArchiveDeck(userId): Promise<Deck>

// Check if system deck
isSystemDeck(deckName: string): boolean

// Constants
SYSTEM_DECKS.INBOX = 'Inbox'
SYSTEM_DECKS.ARCHIVE = 'Archive'
```

#### 7. Server Actions (`src/app/actions/flashcards.ts`)

```typescript
// Create flashcard
createFlashcard(input: CreateFlashcardInput): Promise<Result>

// Update flashcard
updateFlashcard(entityId: string, updates: UpdateFlashcardInput): Promise<Result>

// Approve flashcard (draft → active)
approveFlashcard(entityId: string): Promise<Result>

// Review flashcard (update FSRS)
reviewFlashcard(entityId: string, review: ReviewCardInput): Promise<Result>

// Delete flashcard
deleteFlashcard(entityId: string): Promise<Result>

// Archive flashcard
archiveFlashcard(entityId: string): Promise<Result>

// Get flashcards by document
getFlashcardsByDocument(documentId: string, status?: 'draft' | 'approved'): Promise<FlashcardCache[]>

// Get due flashcards
getDueFlashcards(deckId?: string, limit?: number): Promise<FlashcardCache[]>

// Generate flashcards (creates background job)
generateFlashcards(input: GenerateFlashcardsInput): Promise<Result>

// Batch operations
batchApproveFlashcards(entityIds: string[]): Promise<Result>
batchDeleteFlashcards(entityIds: string[]): Promise<Result>
batchAddTags(entityIds: string[], tags: string[]): Promise<Result>
batchMoveToDeck(entityIds: string[], deckId: string): Promise<Result>
```

### Frontend Components

#### 1. FlashcardsTab (`src/components/sidebar/FlashcardsTab.tsx`)

**Pattern 2: Client Component with Zustand Store**

Tabbed interface in RightPanel:

**Tabs**:
1. **Generate** - Shows GenerationPanelClient
2. **Cards** - Shows FlashcardsListClient

**Data Flow**:
```typescript
useEffect(() => {
  async function loadData() {
    // Call Server Actions
    const [promptsData, decksData, cardsData, dueCardsData] = await Promise.all([
      getPromptTemplates(),
      getDecksWithStats(),
      getFlashcardsByDocument(documentId),
      getDueFlashcards()
    ])

    // Store in Zustand
    setPrompts(promptsData)
    setDecks(decksData)
    setCards(documentId, cardsData)
    setDueCount(dueCardsData.length)
  }
  loadData()
}, [documentId])
```

**Props**:
```typescript
interface FlashcardsTabProps {
  documentId: string
}
```

#### 2. GenerationPanelClient (`src/components/flashcards/GenerationPanelClient.tsx`)

UI for triggering AI generation:

**Features**:
- Source type selector (document/chunks)
- Prompt template dropdown (4 defaults + custom)
- Card count slider (1-20)
- Deck picker (auto-selects Inbox)
- Custom instructions textarea
- Cost estimate display

**Props**:
```typescript
interface GenerationPanelClientProps {
  documentId: string
}
```

**Uses Zustand store** for prompts and decks (Pattern 2).

#### 3. FlashcardsListClient (`src/components/flashcards/FlashcardsListClient.tsx`)

Browse and manage flashcards for a document:

**Features**:
- Filter by status (all/draft/approved)
- Due count display
- Study button (appears when cards are due)
- Card selection (click to make active)
- Integration with FlashcardCard component

**Props**:
```typescript
interface FlashcardsListClientProps {
  documentId: string
}
```

**Uses Zustand store** for cards (Pattern 2).

#### 4. FlashcardCard (`src/components/rhizome/flashcard-card.tsx`)

Feature-rich display component:

**Features**:
- Keyboard shortcuts (e=edit, a=approve, d=delete when active)
- Inline editing (question/answer)
- Approve/delete actions
- Source chunk links
- Tag display
- Colored borders based on status (draft/active)
- Server action integration
- Optimistic updates

**Pattern**: Self-contained smart component (no prop drilling) - exactly like ConnectionCard.

**Props**:
```typescript
interface FlashcardCardProps {
  flashcard: FlashcardCacheRow
  isActive: boolean
  onClick: () => void
  onApproved?: () => void
  onDeleted?: () => void
  onNavigateToChunk?: (chunkId: string) => void
}
```

#### 5. Flashcard Store (`src/stores/flashcard-store.ts`)

**Pattern 2: Zustand Store + Server Actions**

```typescript
interface FlashcardState {
  // Cards state keyed by documentId for isolation
  cards: Record<string, FlashcardCacheRow[]>

  // Global state (not document-specific)
  prompts: PromptTemplate[]
  decks: Deck[]
  dueCount: number

  // Loading states
  loading: Record<string, boolean>
  globalLoading: boolean

  // Card actions (per-document)
  setCards: (documentId: string, cards: FlashcardCacheRow[]) => void
  addCard: (documentId: string, card: FlashcardCacheRow) => void
  updateCard: (documentId: string, cardId: string, updates: Partial<FlashcardCacheRow>) => void
  removeCard: (documentId: string, cardId: string) => void

  // Global actions
  setPrompts: (prompts: PromptTemplate[]) => void
  setDecks: (decks: Deck[]) => void
  setDueCount: (count: number) => void

  // Computed selectors
  getCardsByDocument: (documentId: string) => FlashcardCacheRow[]
  getCardById: (documentId: string, cardId: string) => FlashcardCacheRow | undefined
}
```

**Why Pattern 2?**
- ✅ Single source of truth (Zustand cache)
- ✅ Optimistic updates
- ✅ Server Actions enforce RLS
- ✅ Consistent with SparksTab, ConnectionsList, AnnotationReviewTab
- ✅ No QueryProvider setup needed

---

## Features

### 1. AI-Powered Generation

**Workflow**:
1. User opens FlashcardsTab → "Generate" tab appears
2. Selects prompt template (or uses default "Comprehensive Concepts")
3. Adjusts card count (1-20)
4. Adds custom instructions (optional)
5. Clicks "Generate"
6. Background job processes document
7. Cards appear in "Cards" tab as drafts

**Cost**: ~$0.01 per 5-10 cards (Gemini 2.0 Flash)

**Processing Time**: 5-10 seconds per 5 cards

### 2. Multi-Source Generation

**5 Source Types**:

| Type | Description | Use Case |
|------|-------------|----------|
| **Document** | Full document markdown | Comprehensive coverage |
| **Chunks** | Specific chunks by ID | Focused on section |
| **Selection** | Text selection from reader | Generate from highlight |
| **Annotation** | From annotation entities | Study your notes |
| **Connection** | From connection entities | Study relationships |

**Implementation**: Clean loader abstraction, easy to extend.

### 3. Cloze Support

**Format**: Anki-compatible `{{c1::text::hint}}`

**Example**:
```
The {{c1::rhizome::plant structure}} opposes {{c2::hierarchy::vertical structure}}.
```

**Generates 2 cards**:
- Card 1: "The [...plant structure] opposes hierarchy." → Answer: "rhizome"
- Card 2: "The rhizome opposes [...vertical structure]." → Answer: "hierarchy"

**Auto-Grouping**: Cards share `parentCardId` for sibling relationship.

### 4. Prompt Templates

**4 Pre-configured Templates** (seeded in database):

#### Template 1: Comprehensive Concepts (Default)
**Focus**: Key definitions, core ideas, concept relationships
**Best for**: Initial understanding, terminology learning

#### Template 2: Deep Details
**Focus**: Specific claims, evidence, precise terminology
**Best for**: Detailed retention, technical material

#### Template 3: Connections & Synthesis
**Focus**: How ideas connect, comparisons, applications
**Best for**: Critical thinking, synthesis

#### Template 4: Contradiction Focus
**Focus**: Conceptual tensions, opposing viewpoints
**Best for**: Philosophy, debate preparation

**Custom Templates**: Users can create custom prompts with variable substitution.

### 5. FSRS Integration

**Algorithm**: Free Spaced Repetition Scheduler (evidence-based) via ts-fsrs

**Review Ratings**:
- 1 = **Again** (forgot, reset interval)
- 2 = **Hard** (difficult, slightly increase interval)
- 3 = **Good** (correct, standard increase)
- 4 = **Easy** (trivial, large interval increase)

**Parameters**:
```typescript
maximum_interval: 365 days
enable_fuzz: true  // Randomization for natural distribution
enable_short_term: false
```

**State Tracking**:
```typescript
srs: {
  due: timestamp,
  stability: number,
  difficulty: number,
  elapsed_days: number,
  scheduled_days: number,
  learning_steps: number,
  reps: number,
  lapses: number,
  state: number,  // 0=new, 1=learning, 2=review, 3=relearning
  last_review: timestamp | null
}
```

### 6. Deck System

**System Decks** (auto-created):
- **Inbox** - Default for new cards
- **Archive** - For archived cards

**Custom Decks**:
- User-created decks
- Hierarchical structure (parent_id)
- Cannot delete system decks

**Deck Stats**:
- Total cards
- Draft count
- Active count
- Due count

### 7. Storage-First Portability

**Individual JSON Files**:
```
{userId}/flashcards/
├── card_5ab24f88.json
├── card_7cd36e9a.json
└── card_9ef48c1b.json
```

**Benefits**:
- ✅ ZIP export (all cards in one archive)
- ✅ Obsidian sync (individual file tracking)
- ✅ Disaster recovery (rebuild cache from files)
- ✅ Version control (git-friendly)

**File Format**:
```json
{
  "entityId": "uuid",
  "userId": "uuid",
  "card": { /* Card component */ },
  "content": { /* Content component */ },
  "temporal": { /* Temporal component */ },
  "chunkRef": { /* ChunkRef component */ }
}
```

### 8. Batch Operations

**Operations** (backend complete, UI pending):
- **Approve All** - Convert multiple drafts to active
- **Delete All** - Remove multiple cards
- **Add Tags** - Append tags to multiple cards
- **Move to Deck** - Bulk deck transfer

**Server Actions**:
```typescript
batchApproveFlashcards(entityIds: string[]): Promise<Result>
batchDeleteFlashcards(entityIds: string[]): Promise<Result>
batchAddTags(entityIds: string[], tags: string[]): Promise<Result>
batchMoveToDeck(entityIds: string[], deckId: string): Promise<Result>
```

---

## Implementation Details

### Generation Handler Flow

**File**: `worker/handlers/generate-flashcards.ts`

```
1. Load Source Content (10%)
   ├─ Create source loader (factory)
   ├─ Load content + chunks
   └─ Validate content exists

2. Load & Render Prompt (15-20%)
   ├─ Fetch prompt template from DB
   ├─ Render with variables
   └─ Track usage stats

3. Call Gemini AI (20-70%)
   ├─ Send rendered prompt
   ├─ Parse JSON response
   └─ Validate card structure

4. Create ECS Entities (70-95%)
   ├─ Match cards to chunks (keyword heuristics)
   ├─ Check for cloze type
   │  ├─ If cloze → extract deletions
   │  └─ Create multiple cards (one per deletion)
   ├─ Create entity in entities table
   ├─ Create components (Card, Content, Temporal, ChunkRef)
   └─ Upload to Storage (async, fire-and-forget)

5. Rebuild Cache (95%)
   ├─ Call rebuild_flashcards_cache(userId)
   └─ Populate flashcards_cache table from ECS

6. Complete (100%)
   ├─ Validate output with Zod
   └─ Mark job complete
```

### Chunk Matching Algorithm

**Heuristic**: Keyword overlap between card and chunks.

```typescript
// AI includes keywords in generation
card.keywords = ["rhizome", "network", "hierarchy"]

// Find chunks containing any keyword
matchingChunks = chunks.filter(chunk =>
  card.keywords.some(kw =>
    chunk.content.toLowerCase().includes(kw.toLowerCase())
  )
)

// Use top 3 matches
bestChunkIds = matchingChunks.slice(0, 3).map(c => c.id)
```

**Future Enhancement**: Embedding-based similarity for better matching.

### Status Derivation

**Rule**: Status is derived from `srs` field, not stored separately.

```typescript
function getCardStatus(card: CardComponent): 'draft' | 'active' | 'suspended' {
  if (card.srs === null) return 'draft'
  // Future: check suspended flag
  return 'active'
}
```

**Cache Sync**: `flashcards_cache.status` mirrors this derivation.

### Cache Rebuild

**Automatic Rebuild**: The generation handler automatically calls `rebuild_flashcards_cache()` after creating entities, so cards appear immediately in the UI.

**Manual Rebuild** (when needed):
- After batch approve operations
- After batch operations
- When cache appears stale
- After manual entity/component modifications

**Function**: `rebuild_flashcards_cache(p_user_id UUID)`

**Usage**:
```sql
-- Rebuild cache for user
SELECT rebuild_flashcards_cache('user-id-here');
```

**Implementation**:
```sql
-- Delete old cache
DELETE FROM flashcards_cache WHERE user_id = p_user_id;

-- Rebuild from ECS components
INSERT INTO flashcards_cache
SELECT /* join entities + components */
FROM entities e
JOIN components card ON ...
JOIN components content ON ...
WHERE e.user_id = p_user_id
  AND e.entity_type = 'flashcard';
```

**How It Works**:
1. Deletes all cached flashcards for the user
2. Queries all flashcard entities from ECS
3. Joins with Card, Content, Temporal, ChunkRef components
4. Extracts all data into denormalized cache table
5. Enables fast queries for UI without complex joins

---

## Usage Guide

### For Users

#### Generating Flashcards

1. **Open Document**: Navigate to document in reader
2. **Open FlashcardsTab**: Click "Flashcards" in RightPanel sidebar
3. **Generate Tab**: Click "Generate" tab
4. **Configure**:
   - Source: "Full Document" or "Visible Chunks"
   - Prompt: Select template (default: "Comprehensive Concepts")
   - Count: Adjust slider (1-20 cards)
   - Deck: Auto-selects "Inbox"
   - Instructions: Add custom focus (optional)
5. **Click "Generate"**: Background job starts
6. **Monitor Progress**: ProcessingDock shows progress (bottom-right)
7. **View Cards**: Switch to "Cards" tab when complete

#### Reviewing Flashcards

1. **Browse Cards**: "Cards" tab in FlashcardsTab
2. **Filter**: Select "All", "Draft", or "Approved"
3. **Click Card**: Make active for editing
4. **Edit** (optional): Click question/answer to edit inline
5. **Approve**: Click "Approve" button to add to study rotation
6. **Study**: Click "Study (N due)" button when ready

#### Studying

**Note**: Study mode UI not yet implemented. Backend supports:
- `getDueFlashcards()` - Get cards due for review
- `reviewFlashcard()` - Submit review rating
- FSRS scheduling - Automatic interval calculation

**Planned Flow** (when implemented):
1. **Study Mode**: Click "Study" button or navigate to `/flashcards/study`
2. **Review Card**: Read question, think of answer
3. **Reveal**: Click "Show Answer"
4. **Rate**:
   - 1 = Again (forgot)
   - 2 = Hard (difficult)
   - 3 = Good (correct)
   - 4 = Easy (trivial)
5. **Next Card**: FSRS schedules next review automatically

### For Developers

#### Creating a Flashcard Programmatically

```typescript
import { createECS } from '@/lib/ecs'
import { FlashcardOperations } from '@/lib/ecs/flashcards'
import { getInboxDeck } from '@/lib/decks/system-decks'

const ecs = createECS()
const ops = new FlashcardOperations(ecs, userId)
const inbox = await getInboxDeck(userId)

const entityId = await ops.create({
  type: 'basic',
  question: 'What is a rhizome?',
  answer: 'A non-hierarchical network structure connecting multiple heterogeneous elements.',
  deckId: inbox.id,
  tags: ['philosophy', 'deleuze'],
  documentId: documentId,
  chunkIds: [chunkId],
})

// Approve immediately
await ops.approve(entityId)
```

#### Creating a Custom Prompt Template

```typescript
import { createPromptTemplate } from '@/app/actions/prompts'

await createPromptTemplate({
  name: 'Technical Deep Dive',
  description: 'Detailed technical questions for engineering content',
  template: `Generate {{count}} technical flashcards from this content.

Focus on:
- Implementation details
- System architecture
- Design patterns

Text: {{content}}

Custom instructions: {{custom}}

Return ONLY a JSON array of flashcards.`,
  variables: ['count', 'content', 'custom']
})
```

#### Adding a New Source Type

```typescript
// worker/lib/source-loaders.ts

export class SparkSourceLoader implements SourceLoader {
  constructor(private sparkIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    // Load sparks from ECS
    const { data: entities } = await supabase
      .from('entities')
      .select(`id, components!inner(component_type, data)`)
      .in('id', this.sparkIds)
      .eq('user_id', userId)

    let content = ''
    const chunkIds: string[] = []

    for (const entity of entities || []) {
      const sparkComp = entity.components?.find(c => c.component_type === 'Spark')
      const chunkRefComp = entity.components?.find(c => c.component_type === 'ChunkRef')

      if (sparkComp?.data.content) {
        content += sparkComp.data.content + '\n\n'
      }
      if (chunkRefComp?.data.chunkIds) {
        chunkIds.push(...chunkRefComp.data.chunkIds)
      }
    }

    // Load chunks
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, embedding')
      .in('id', chunkIds)
      .order('chunk_index')

    return { content, chunks: chunks || [] }
  }
}

// Add to factory
export function createSourceLoader(...) {
  switch (sourceType) {
    // ... existing cases
    case 'spark':
      return new SparkSourceLoader(sourceIds)
  }
}
```

---

## API Reference

### Server Actions

See [Core Components](#7-server-actions-srcappactionsflashcardsts) section for full API reference.

---

## Troubleshooting

### Common Issues

#### 1. "No decks available"

**Problem**: System decks (Inbox, Archive) not created.

**Solution**: System decks are auto-created by `getDecksWithStats()`. In FlashcardsTab, decks are loaded via useEffect:
```typescript
useEffect(() => {
  async function loadData() {
    const decksData = await getDecksWithStats()  // Ensures system decks exist
    setDecks(decksData)
  }
  loadData()
}, [])
```

#### 2. "Loaded 0 chars from X chunks"

**Problem**: Markdown not loading from Storage, fallback to chunks didn't work.

**Solution**: Check `storage_path` in documents table:
```typescript
// DocumentSourceLoader uses storage_path
const markdownPath = `${doc.storage_path}/content.md`
```

Verify path format: `{userId}/{documentId}/content.md`

#### 3. Cards not appearing in "Cards" tab

**Problem**: Cache not rebuilt after generation.

**Solution**: As of 2025-10-24, the generation handler automatically calls `rebuild_flashcards_cache(userId)` after creating entities. If cards still don't appear, manually rebuild:
```sql
SELECT rebuild_flashcards_cache('user-id-here');
```

**Note**: This issue was fixed by adding automatic cache rebuild to the generation handler.

#### 4. Cloze cards not generating multiple cards

**Problem**: AI not returning cloze type or content format incorrect.

**Solution**: Check AI response:
- Must have `type: 'cloze'`
- Must have `content` field with `{{c1::text}}` format
- Handler checks `isClozeContent(card.content)` before parsing

#### 5. Prompt template variables not substituting

**Problem**: Variable names don't match.

**Solution**: Template must use exact variable names:
```typescript
template.variables = ['count', 'content', 'chunks', 'custom']
// Template must use: {{count}}, {{content}}, {{chunks}}, {{custom}}
```

### Debug Commands

```sql
-- Check flashcard count
SELECT COUNT(*) FROM entities WHERE entity_type = 'flashcard' AND user_id = 'user-id';

-- Check cache count
SELECT COUNT(*) FROM flashcards_cache WHERE user_id = 'user-id';

-- Check system decks
SELECT * FROM decks WHERE user_id = 'user-id' AND is_system = TRUE;

-- Check prompt templates
SELECT name, is_default FROM prompt_templates WHERE user_id = 'user-id';

-- Rebuild cache
SELECT rebuild_flashcards_cache('user-id');
```

---

## Future Enhancements

### Planned Features (Backend Ready, UI Missing)

The backend architecture supports these features with **minimal code changes**:

#### 1. Study Mode Interface ⚠️ **HIGH PRIORITY**
- Full-page study interface (`/flashcards/study`)
- Card flip animations
- Rating buttons (Again/Hard/Good/Easy)
- Keyboard shortcuts (1/2/3/4)
- Progress tracking (cards reviewed today)

**Backend Status**: ✅ Complete (`getDueFlashcards`, `reviewFlashcard`, FSRS integration)
**Frontend Status**: ❌ Not started

#### 2. Deck Management Page
- Full-page deck browser
- Nested deck visualization
- Deck statistics (retention rate, due count)
- Create/edit/delete UI

#### 3. Batch Operations Toolbar
- Select multiple cards in UI
- Floating action toolbar
- Keyboard shortcuts
- Undo/redo support

**Backend Status**: ✅ Complete (batch server actions exist)
**Frontend Status**: ❌ Not started

#### 4. Selection-Based Generation
- Generate from text selection in reader
- Context-aware prompts
- Quick capture workflow

#### 5. Prompt Template Editor
- Visual editor for prompts
- Variable autocomplete
- Preview rendering
- Template marketplace

#### 6. Obsidian Sync
- Export individual card files
- Sync updates bidirectionally
- Markdown format conversion

#### 7. Anki Export
- `.apkg` file generation
- Deck hierarchy mapping
- Media attachment support

#### 8. Advanced Stats
- Retention rate graphs
- Study time analytics
- Difficulty distribution
- Tag-based insights

### Architecture Extensions

If you want to extend the system:

1. **New Source Type**: Add loader class to `source-loaders.ts`
2. **New Prompt Template**: Create via `createPromptTemplate()`
3. **New Job Handler**: Add to `worker/handlers/`
4. **New UI Component**: Add to `src/components/flashcards/`
5. **New Server Action**: Add to `src/app/actions/flashcards.ts`

**No refactoring needed** - architecture is complete!

---

## Migration Guide

### From Other Systems

#### From Anki

**Export**:
1. Anki → Export → `.apkg` or `.txt`
2. Parse format
3. Create flashcards via `createFlashcard()`

**Cloze Compatibility**: Direct import of Anki cloze format `{{c1::text}}`.

#### From Obsidian

**Vault Sync**:
1. Export flashcards to Storage (individual JSON files)
2. Obsidian plugin reads/writes files
3. Bidirectional sync via file watching

---

## Performance Considerations

### Optimization Strategies

#### 1. Use Cache for Queries

**Good**:
```typescript
// Use flashcards_cache (indexed)
await supabase
  .from('flashcards_cache')
  .select('*')
  .eq('user_id', userId)
  .lte('next_review', now)
```

**Bad**:
```typescript
// Query ECS components directly (slow)
const entities = await ecs.query(['Card'], userId)
const due = entities.filter(e => /* check due date */)
```

#### 2. Batch Operations

**Good**:
```typescript
// Batch approve
await batchApproveFlashcards(entityIds)  // One cache rebuild
```

**Bad**:
```typescript
// Sequential approves
for (const id of entityIds) {
  await ops.approve(id)  // Rebuilds cache each time
}
```

#### 3. Async Storage Uploads

**Pattern**: Fire-and-forget async uploads during card creation:
```typescript
// Create entity first
const entityId = await ops.create(input)

// Upload to Storage async (don't await)
uploadFlashcardToStorage(userId, entityId, data).catch(err => {
  console.error('Storage upload failed:', err)
  // Continue - can rebuild from ECS if needed
})
```

#### 4. Limit Query Results

```typescript
// Use limit for due cards
await getDueFlashcards(deckId, limit = 50)  // Don't load all cards

// Use pagination for large lists
await getFlashcardsByDocument(docId, status)  // Add offset/limit if needed
```

---

## Testing

### Test Coverage

#### Unit Tests (Planned)
- `worker/lib/cloze-parser.ts` - Cloze extraction and rendering
- `worker/lib/template-renderer.ts` - Variable substitution
- `src/lib/flashcards/storage.ts` - Storage helpers

#### Integration Tests (Planned)
- Generation flow (document → AI → cards)
- Approval flow (draft → active → FSRS)
- Study flow (review → rating → schedule update)
- Batch operations (approve all, delete all)

#### Manual Testing Checklist

**Phase 1: Generation**
- [ ] Open FlashcardsTab → Generate tab appears
- [ ] Select prompt template → 4 defaults available
- [ ] Adjust count → Slider works (1-20)
- [ ] Click Generate → Background job starts
- [ ] ProcessingDock → Shows progress
- [ ] Cards tab → Generated cards appear

**Phase 2: Review**
- [ ] Click card → Makes active
- [ ] Edit question → Updates successfully
- [ ] Edit answer → Updates successfully
- [ ] Add tags → Saves properly

**Phase 3: Approve**
- [ ] Click Approve → Status changes to active
- [ ] Card has SRS data → next_review set
- [ ] Study button appears → Shows due count

**Phase 4: Study** ⚠️ **NOT IMPLEMENTED**
- [ ] Click Study → Redirects to `/flashcards/study` (404 currently)
- [ ] Review card → Question shows first
- [ ] Show Answer → Reveals answer
- [ ] Rate 3 (Good) → FSRS updates
- [ ] Next card → Loads correctly

**Phase 5: Batch** ⚠️ **BACKEND ONLY**
- [ ] Select multiple cards → UI not implemented
- [ ] Batch approve → Backend works, no UI
- [ ] Batch delete → Backend works, no UI
- [ ] Batch add tags → Backend works, no UI

---

## Conclusion

The Flashcard System has:

✅ **Complete Backend** (100%)
- Storage helpers
- Prompt templates (4 defaults seeded)
- Multi-source generation (5 types)
- Cloze support
- Batch operations
- System deck helpers
- Template rendering
- Generation handler integration
- FSRS integration
- Cache rebuild function

✅ **Functional UI** (80%)
- FlashcardsTab
- GenerationPanelClient
- FlashcardsListClient
- FlashcardCard (keyboard shortcuts, inline editing)
- Flashcard store (Pattern 2: Zustand + Server Actions)

⚠️ **Missing Features** (20%)
- Study mode interface (backend complete, UI missing)
- Batch operation toolbar (backend complete, UI missing)
- Deck management page
- Advanced stats/analytics
- Prompt template editor

✅ **Extensible Architecture**
- Add new source types without refactoring
- Add new UI components without backend changes
- Add new job handlers for export/sync features

✅ **Storage-First Portability**
- Individual JSON files per card
- ZIP export ready
- Obsidian sync ready

✅ **FSRS Spaced Repetition**
- Evidence-based algorithm (ts-fsrs)
- Automatic scheduling
- Progress tracking (backend ready)

**Next Steps**:
1. Implement study mode UI (`/flashcards/study` page)
2. Add batch operation toolbar
3. Consider removing React Query dependency (see handoff document)

**Recent Improvements** (2025-10-24):
- ✅ Fixed generation handler component inserts
- ✅ Added automatic cache rebuild
- ✅ Cards now appear in UI immediately after generation

---

**Version**: 1.1
**Status**: Backend Complete, UI Functional, Generation Fixed (Study Mode Pending)
**Last Updated**: 2025-10-24
