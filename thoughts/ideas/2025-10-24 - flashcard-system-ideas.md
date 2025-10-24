# Flashcard System: Complete Implementation Plan

**Target:** Personal knowledge synthesis through spaced repetition  
**Philosophy:** File-over-app, ECS architecture, ambient integration with reading flow  
**Estimated effort:** 3-4 weeks (phased rollout)

---

## Overview

### What We're Building

A flashcard system deeply integrated with Rhizome's knowledge graph. Generate cards from any source (documents, chunks, annotations, connections), review them in an SRS-powered study interface, and maintain bidirectional sync with Obsidian/Anki.

### Core Features

1. **Multi-source generation**: Full documents, visible chunks, selections, annotations, connections
2. **Custom prompt system**: Editable templates with variable substitution
3. **Rich review workflow**: Edit cards, batch operations, inline regeneration
4. **Smart study mode**: Desktop + mobile, filtered sessions, contextual sidebar
5. **Nested deck organization**: Parent/child structure, Anki-compatible
6. **External integrations**: Obsidian bidirectional sync, Anki export

### Success Metrics

- Generate 8 cards from 500-page book in <30s (~$0.01 cost)
- Study 50 cards in <10min with full context access
- 95%+ chunk recovery rate for multi-chunk cards
- Zero data loss (file-over-app guarantee)

---

## Data Architecture

### ECS Entities: Flashcards

Flashcards are ECS entities with 5-6 components:

```typescript
// Entity with all components
{
  entity_id: "card_abc123",
  user_id: "user_xyz",
  created_at: "2025-10-24T...",
  updated_at: "2025-10-24T...",
  components: [
    {
      id: "comp_1",
      component_type: "Card",
      data: {
        type: "basic" | "cloze",
        question: "What is Deleuze's concept of rhizome?",
        answer: "A non-hierarchical network structure...",
        content: null,  // For cloze: "The {{c1::rhizome}} opposes..."
        clozeCount: null
      }
    },
    {
      id: "comp_2",
      component_type: "SRS",  // Optional: added on approval
      data: {
        interval: 5,           // days
        easeFactor: 2.5,
        nextReview: "2025-10-29T...",
        lastReviewed: "2025-10-24T...",
        reviewsCount: 3,
        lapsesCount: 0,
        isMature: false        // true when interval > 21
      }
    },
    {
      id: "comp_3",
      component_type: "DeckMembership",
      data: {
        deckId: "deck_philosophy",
        addedAt: "2025-10-24T..."
      }
    },
    {
      id: "comp_4",
      component_type: "Content",  // SHARED component
      data: {
        tags: ["deleuze", "philosophy", "concepts"]
      }
    },
    {
      id: "comp_5",
      component_type: "Temporal",  // SHARED component
      data: {
        createdAt: "2025-10-24T...",
        updatedAt: "2025-10-24T..."
      }
    },
    {
      id: "comp_6",
      component_type: "ChunkRef",  // SHARED component
      data: {
        documentId: "doc_gravity_rainbow",
        document_id: "doc_gravity_rainbow",  // Supabase format
        chunkId: "chunk_42",
        chunk_id: "chunk_42",  // Supabase format
        chunkIds: ["chunk_42", "chunk_43"],  // Multi-chunk support
        connectionId: null,      // If generated from connection
        annotationId: null,      // If generated from annotation
        generationJobId: "job_123"
      }
    }
  ]
}
```

**Status derivation:**
- **Draft**: Has Card component, NO SRS component
- **Approved**: Has Card component, HAS SRS component
- **Archived**: DeckMembership.deckId = archive deck ID

### Regular Tables: Supporting Structures

**Decks table:**
```sql
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES decks(id),  -- NULL for root decks
  is_system BOOLEAN DEFAULT FALSE,       -- TRUE for Inbox/Archive
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decks_user ON decks(user_id);
CREATE INDEX idx_decks_parent ON decks(parent_id);

-- System decks created on user signup
INSERT INTO decks (user_id, name, is_system) VALUES
  (user_id, 'Inbox', TRUE),
  (user_id, 'Archive', TRUE);
```

**Prompt templates table:**
```sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL,  -- With {{variables}}
  variables TEXT[],        -- ['count', 'content', 'focus']
  is_default BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,  -- Can't delete system prompts
  created_at TIMESTAMPTZ DEFAULT NOW(),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_prompts_user ON prompt_templates(user_id);

-- System prompts created on user signup
INSERT INTO prompt_templates (user_id, name, template, variables, is_system, is_default) VALUES
  (user_id, 'Comprehensive Concepts', '...template...', ARRAY['count', 'content'], TRUE, TRUE),
  (user_id, 'Deep Details', '...template...', ARRAY['count', 'content'], TRUE, FALSE),
  (user_id, 'Connections & Synthesis', '...template...', ARRAY['count', 'content'], TRUE, FALSE),
  (user_id, 'Contradiction Focus', '...template...', ARRAY['count', 'content'], TRUE, FALSE);
```

**Study sessions table:**
```sql
CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  deck_id UUID REFERENCES decks(id),  -- NULL for filtered study
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  cards_reviewed INTEGER DEFAULT 0,
  ratings JSONB DEFAULT '{"again": 0, "hard": 0, "good": 0, "easy": 0}',
  total_time_ms INTEGER DEFAULT 0,
  filters_applied JSONB  -- {tags: ['philosophy'], dateRange: {...}}
);

CREATE INDEX idx_sessions_user ON study_sessions(user_id);
CREATE INDEX idx_sessions_started ON study_sessions(started_at DESC);
```

**Flashcards cache table** (for performance):
```sql
CREATE TABLE flashcards_cache (
  entity_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  card_type TEXT NOT NULL,  -- 'basic' | 'cloze'
  question TEXT,
  answer TEXT,
  content TEXT,  -- For cloze
  cloze_count INTEGER,
  deck_id UUID,
  tags TEXT[],
  status TEXT NOT NULL,  -- 'draft' | 'approved' | 'archived'
  next_review TIMESTAMPTZ,
  interval INTEGER,
  ease_factor NUMERIC,
  is_mature BOOLEAN,
  chunk_ids TEXT[],
  document_ids TEXT[],
  connection_id UUID,
  annotation_id UUID,
  generation_job_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_flashcards_cache_user ON flashcards_cache(user_id);
CREATE INDEX idx_flashcards_cache_deck ON flashcards_cache(deck_id);
CREATE INDEX idx_flashcards_cache_status ON flashcards_cache(status);
CREATE INDEX idx_flashcards_cache_due ON flashcards_cache(next_review) 
  WHERE status = 'approved';
CREATE INDEX idx_flashcards_cache_tags ON flashcards_cache USING GIN(tags);

-- Function to rebuild cache from ECS
CREATE OR REPLACE FUNCTION rebuild_flashcards_cache(p_user_id UUID)
RETURNS void AS $$
BEGIN
  DELETE FROM flashcards_cache WHERE user_id = p_user_id;
  
  INSERT INTO flashcards_cache (
    entity_id, user_id, card_type, question, answer, content, cloze_count,
    deck_id, tags, status, next_review, interval, ease_factor, is_mature,
    chunk_ids, document_ids, connection_id, annotation_id, generation_job_id,
    created_at, updated_at
  )
  SELECT
    e.id,
    e.user_id,
    (card_comp.data->>'type')::TEXT,
    card_comp.data->>'question',
    card_comp.data->>'answer',
    card_comp.data->>'content',
    (card_comp.data->>'clozeCount')::INTEGER,
    (deck_comp.data->>'deckId')::UUID,
    ARRAY(SELECT jsonb_array_elements_text(content_comp.data->'tags')),
    CASE WHEN srs_comp.id IS NULL THEN 'draft' ELSE 'approved' END,
    (srs_comp.data->>'nextReview')::TIMESTAMPTZ,
    (srs_comp.data->>'interval')::INTEGER,
    (srs_comp.data->>'easeFactor')::NUMERIC,
    (srs_comp.data->>'isMature')::BOOLEAN,
    ARRAY(SELECT jsonb_array_elements_text(chunk_ref_comp.data->'chunkIds')),
    ARRAY(SELECT jsonb_array_elements_text(
      jsonb_build_array(chunk_ref_comp.data->>'documentId')
    )),
    (chunk_ref_comp.data->>'connectionId')::UUID,
    (chunk_ref_comp.data->>'annotationId')::UUID,
    (chunk_ref_comp.data->>'generationJobId')::UUID,
    (temporal_comp.data->>'createdAt')::TIMESTAMPTZ,
    (temporal_comp.data->>'updatedAt')::TIMESTAMPTZ
  FROM entities e
  JOIN components card_comp ON card_comp.entity_id = e.id 
    AND card_comp.component_type = 'Card'
  LEFT JOIN components srs_comp ON srs_comp.entity_id = e.id 
    AND srs_comp.component_type = 'SRS'
  JOIN components deck_comp ON deck_comp.entity_id = e.id 
    AND deck_comp.component_type = 'DeckMembership'
  JOIN components content_comp ON content_comp.entity_id = e.id 
    AND content_comp.component_type = 'Content'
  JOIN components temporal_comp ON temporal_comp.entity_id = e.id 
    AND temporal_comp.component_type = 'Temporal'
  JOIN components chunk_ref_comp ON chunk_ref_comp.entity_id = e.id 
    AND chunk_ref_comp.component_type = 'ChunkRef'
  WHERE e.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
```

### File Storage Structure

```
storage/
├── flashcards/
│   ├── cards.json                      # All flashcard entities (source of truth)
│   └── by-document/
│       ├── {document_id}.json          # Cards per document (fast lookup)
│       └── ...
├── decks/
│   └── {user_id}/
│       └── decks.json                  # Deck metadata + stats
├── study-sessions/
│   └── {user_id}/
│       └── {year-month}.json           # Sessions by month
└── obsidian-sync/
    └── flashcards/
        ├── card_{entity_id}.md         # Individual card files
        └── ...
```

---

## File Structure

```
src/
├── lib/
│   ├── ecs/
│   │   ├── flashcards.ts              # FlashcardOperations wrapper (NEW)
│   │   ├── components.ts              # Add Card, SRS, DeckMembership types
│   │   └── index.ts                   # Export FlashcardOperations
│   ├── flashcards/
│   │   ├── srs.ts                     # SM-2 algorithm implementation
│   │   ├── cache.ts                   # Cache rebuild helpers
│   │   ├── storage.ts                 # Storage export/sync
│   │   └── prompts.ts                 # Prompt template rendering
│   └── decks/
│       ├── operations.ts              # Deck CRUD + stats
│       └── system-decks.ts            # Inbox/Archive management
├── app/
│   ├── actions/
│   │   ├── flashcards.ts              # CRUD server actions (NEW)
│   │   ├── decks.ts                   # Deck management (NEW)
│   │   ├── study.ts                   # Study session actions (NEW)
│   │   └── prompts.ts                 # Prompt CRUD (NEW)
│   └── api/
│       └── flashcards/
│           ├── generate/route.ts      # POST - trigger generation job
│           ├── jobs/[id]/route.ts     # GET - poll job status
│           └── export/route.ts        # POST - Anki export
├── components/
│   ├── flashcards/
│   │   ├── GenerationPanel.tsx        # Sidebar tab for generation config
│   │   ├── ReviewPanel.tsx            # Floating panel for post-gen review
│   │   ├── CardEditor.tsx             # Inline card editing component
│   │   ├── DeckManager.tsx            # Full-page deck management
│   │   ├── DeckView.tsx               # Individual deck with tabs
│   │   ├── StudyInterface.tsx         # Fullscreen study mode
│   │   ├── StudyCard.tsx              # Single card display
│   │   ├── PromptEditor.tsx           # Slide-in prompt editing
│   │   └── TagManager.tsx             # Tag filtering/selection
│   └── sidebar/
│       └── FlashcardsTab.tsx          # Update existing placeholder
├── stores/
│   ├── flashcard-store.ts             # Zustand store for cards (NEW)
│   └── deck-store.ts                  # Zustand store for decks (NEW)
└── hooks/
    ├── useFlashcards.ts               # React hook for card operations
    ├── useStudySession.ts             # React hook for study flow
    └── useDeckStats.ts                # React hook for deck statistics

worker/
├── handlers/
│   ├── generate-flashcards.ts         # Main generation handler (NEW)
│   ├── regenerate-card.ts             # Single card regeneration (NEW)
│   ├── obsidian-sync.ts               # Bidirectional sync (NEW)
│   └── export-anki.ts                 # Anki .apkg generation (NEW)
├── lib/
│   ├── ai-generation.ts               # Gemini 2.0 Flash calls with PydanticAI
│   ├── chunk-matching.ts              # Embedding-based chunk assignment
│   └── template-renderer.ts           # Prompt variable substitution
└── jobs/
    └── types.ts                       # Job type definitions

supabase/
└── migrations/
    ├── 060_create_decks.sql
    ├── 061_create_flashcards_cache.sql
    ├── 062_create_prompt_templates.sql
    └── 063_create_study_sessions.sql
```

---

## API Surface

### Server Actions

**Flashcard CRUD (`src/app/actions/flashcards.ts`):**

```typescript
'use server'

import { FlashcardOperations } from '@/lib/ecs/flashcards'
import { createECS } from '@/lib/ecs'
import { getCurrentUser } from '@/lib/auth'

export async function createFlashcard(input: CreateFlashcardInput) {
  const user = await getCurrentUser()
  const ops = new FlashcardOperations(createECS(), user.id)
  
  const entityId = await ops.create(input)
  
  // Dual-write to cache
  await rebuildFlashcardCache(entityId)
  
  // Export to storage (async)
  exportFlashcardToStorage(entityId).catch(console.error)
  
  return { success: true, id: entityId }
}

export async function updateFlashcard(
  entityId: string,
  updates: UpdateFlashcardInput
) {
  const user = await getCurrentUser()
  const ops = new FlashcardOperations(createECS(), user.id)
  
  await ops.update(entityId, updates)
  await rebuildFlashcardCache(entityId)
  
  return { success: true }
}

export async function approveFlashcard(entityId: string) {
  const user = await getCurrentUser()
  const ops = new FlashcardOperations(createECS(), user.id)
  
  // Adds SRS component (draft → approved)
  await ops.approve(entityId)
  await rebuildFlashcardCache(entityId)
  
  return { success: true }
}

export async function deleteFlashcard(entityId: string) {
  const user = await getCurrentUser()
  const ops = new FlashcardOperations(createECS(), user.id)
  
  // Soft delete: moves to Archive deck
  await ops.delete(entityId)
  await rebuildFlashcardCache(entityId)
  
  return { success: true }
}

export async function batchApproveFlashcards(entityIds: string[]) {
  const user = await getCurrentUser()
  const ops = new FlashcardOperations(createECS(), user.id)
  
  for (const id of entityIds) {
    await ops.approve(id)
  }
  
  await rebuildFlashcardsCache() // Full rebuild
  return { success: true }
}

export async function getFlashcardsByDeck(
  deckId: string,
  status?: 'draft' | 'approved'
) {
  // Use cache for performance
  const supabase = getSupabaseClient()
  const user = await getCurrentUser()
  
  let query = supabase
    .from('flashcards_cache')
    .select('*')
    .eq('user_id', user.id)
    .eq('deck_id', deckId)
  
  if (status) {
    query = query.eq('status', status)
  }
  
  const { data, error } = await query
  if (error) throw error
  
  return data
}

export async function getDueFlashcards(deckId?: string) {
  const supabase = getSupabaseClient()
  const user = await getCurrentUser()
  
  let query = supabase
    .from('flashcards_cache')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .lte('next_review', new Date().toISOString())
  
  if (deckId) {
    query = query.eq('deck_id', deckId)
  }
  
  const { data, error } = await query
  if (error) throw error
  
  return data
}
```

**Study actions (`src/app/actions/study.ts`):**

```typescript
export async function startStudySession(
  deckId?: string,
  filters?: { tags?: string[]; dateRange?: DateRange }
) {
  const user = await getCurrentUser()
  const supabase = getSupabaseClient()
  
  // Create session record
  const { data: session, error } = await supabase
    .from('study_sessions')
    .insert({
      user_id: user.id,
      deck_id: deckId,
      started_at: new Date().toISOString(),
      filters_applied: filters
    })
    .select()
    .single()
  
  if (error) throw error
  
  // Get due cards
  const cards = await getDueFlashcards(deckId)
  
  return { sessionId: session.id, cards }
}

export async function reviewCard(
  sessionId: string,
  cardId: string,
  rating: 1 | 2 | 3 | 4,
  timeSpentMs: number
) {
  const user = await getCurrentUser()
  const ops = new FlashcardOperations(createECS(), user.id)
  
  // Update SRS schedule
  await ops.review(cardId, rating)
  
  // Update session stats
  const supabase = getSupabaseClient()
  await supabase.rpc('update_study_session', {
    p_session_id: sessionId,
    p_rating: rating,
    p_time_ms: timeSpentMs
  })
  
  await rebuildFlashcardCache(cardId)
  
  return { success: true }
}

export async function endStudySession(sessionId: string) {
  const supabase = getSupabaseClient()
  
  await supabase
    .from('study_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
  
  return { success: true }
}
```

**Deck actions (`src/app/actions/decks.ts`):**

```typescript
export async function createDeck(
  name: string,
  description?: string,
  parentId?: string
) {
  const user = await getCurrentUser()
  const supabase = getSupabaseClient()
  
  const { data, error } = await supabase
    .from('decks')
    .insert({
      user_id: user.id,
      name,
      description,
      parent_id: parentId
    })
    .select()
    .single()
  
  if (error) throw error
  return { success: true, deck: data }
}

export async function updateDeck(
  deckId: string,
  updates: { name?: string; description?: string; parentId?: string }
) {
  const supabase = getSupabaseClient()
  
  await supabase
    .from('decks')
    .update({
      name: updates.name,
      description: updates.description,
      parent_id: updates.parentId,
      updated_at: new Date().toISOString()
    })
    .eq('id', deckId)
  
  return { success: true }
}

export async function getDecksWithStats() {
  const user = await getCurrentUser()
  const supabase = getSupabaseClient()
  
  // Join with flashcards_cache for counts
  const { data, error } = await supabase
    .from('decks')
    .select(`
      *,
      total_cards:flashcards_cache(count),
      due_cards:flashcards_cache(count)
    `)
    .eq('user_id', user.id)
    .eq('flashcards_cache.status', 'approved')
    .lte('flashcards_cache.next_review', new Date().toISOString())
  
  if (error) throw error
  return data
}
```

**Generation actions (`src/app/actions/flashcards.ts`):**

```typescript
export async function generateFlashcards(input: {
  sourceType: 'document' | 'chunks' | 'selection' | 'annotation' | 'connection'
  sourceIds: string[]
  promptTemplateId: string
  cardCount: number
  customInstructions?: string
}) {
  const user = await getCurrentUser()
  
  // Create background job
  const jobId = await createBackgroundJob({
    user_id: user.id,
    job_type: 'generate_flashcards',
    payload: input
  })
  
  // Worker picks it up
  return { success: true, jobId }
}

export async function regenerateCard(cardId: string, newConfig?: object) {
  const user = await getCurrentUser()
  
  const jobId = await createBackgroundJob({
    user_id: user.id,
    job_type: 'regenerate_card',
    payload: { cardId, config: newConfig }
  })
  
  return { success: true, jobId }
}

export async function getGenerationJobStatus(jobId: string) {
  const supabase = getSupabaseClient()
  
  const { data, error } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('id', jobId)
    .single()
  
  if (error) throw error
  
  // If completed, fetch generated cards
  if (data.status === 'completed') {
    const cards = await getFlashcardsByGenerationJob(jobId)
    return { ...data, cards }
  }
  
  return data
}
```

### REST API Routes (for polling)

**`/api/flashcards/generate` (POST):**
- Triggers generation job
- Returns job ID for polling

**`/api/flashcards/jobs/[id]` (GET):**
- Returns job status + cards if completed
- Used by frontend polling (every 2s)

**`/api/flashcards/export` (POST):**
- Exports deck(s) to Anki .apkg or .txt
- Returns download URL

---

## Worker Jobs

### 1. GenerateFlashcardsJob

**Handler:** `worker/handlers/generate-flashcards.ts`

**Input:**
```typescript
{
  sourceType: 'document' | 'chunks' | 'selection' | 'annotation' | 'connection',
  sourceIds: string[],
  promptTemplateId: string,
  cardCount: number,
  customInstructions?: string,
  userId: string
}
```

**Steps:**
1. **Extract source content**
   - Document: Load full markdown + all chunks
   - Chunks: Load specific chunks + metadata
   - Selection: Load text + surrounding chunks
   - Annotation: Load annotation + linked chunks
   - Connection: Load both connected chunks + connection metadata

2. **Build AI prompt**
   - Load prompt template
   - Substitute variables: `{{count}}`, `{{content}}`, `{{chunks}}`, `{{custom}}`
   - Add structured output schema (PydanticAI)

3. **Call Gemini 2.0 Flash**
   ```typescript
   const response = await ai.generate({
     model: 'gemini-2.0-flash',
     prompt: renderedPrompt,
     response_model: FlashcardBatch,
     temperature: 0.7
   })
   ```

4. **Match cards to chunks**
   - Embed each card's question + answer
   - Find closest chunks via cosine similarity
   - Assign top 1-3 chunks per card

5. **Store cards as ECS entities**
   - Create entities with Card, DeckMembership, Content, Temporal, ChunkRef
   - All in draft status (no SRS component)
   - Link to generation job

6. **Update job status**
   - Mark completed
   - Store generated card IDs
   - Trigger notification → opens review panel

**Cost:** ~$0.01 per 3-5 cards  
**Time:** 10-30s depending on source size

### 2. RegenerateCardJob

**Handler:** `worker/handlers/regenerate-card.ts`

**Input:**
```typescript
{
  cardId: string,
  config?: { promptTemplateId?: string, customInstructions?: string },
  userId: string
}
```

**Steps:**
1. Load existing card entity
2. Load original source context from ChunkRef
3. Use same or new prompt template
4. Call AI (single card)
5. Update Card component (preserve ID, SRS, deck)
6. Rebuild cache

**Cost:** ~$0.003 per card  
**Time:** 5-10s

### 3. ObsidianSyncJob

**Handler:** `worker/handlers/obsidian-sync.ts`

**Input:**
```typescript
{
  direction: 'to_obsidian' | 'from_obsidian' | 'both',
  userId: string
}
```

**Steps:**
1. **To Obsidian:**
   - Query all flashcards from ECS
   - Render each card using Obsidian template
   - Write to `storage/obsidian-sync/flashcards/card_{id}.md`
   - Update sync state

2. **From Obsidian:**
   - Scan `obsidian-sync/flashcards/` for changes
   - Parse markdown → extract card data
   - Compare timestamps with ECS
   - Update Card components if newer
   - Flag conflicts (last-write-wins with warning)

3. **Conflict resolution:**
   - If both modified: Obsidian wins, flag entity for manual review
   - Store conflict metadata in separate table

**Cost:** $0  
**Time:** 1-5s for typical changes

### 4. ExportToAnkiJob

**Handler:** `worker/handlers/export-anki.ts`

**Input:**
```typescript
{
  deckIds?: string[],  // null = export all
  format: 'apkg' | 'txt',
  userId: string
}
```

**Steps:**
1. Load cards from specified decks
2. Format using Anki template
3. Generate .apkg (using genanki library) or .txt
4. Store in `storage/exports/{userId}/anki_{timestamp}.{ext}`
5. Return download URL

**Cost:** $0  
**Time:** 5-10s for 100s of cards

---

## UI Components

### 1. GenerationPanel (Sidebar Tab)

**Location:** `src/components/flashcards/GenerationPanel.tsx`

**Features:**
- Radio buttons: Current doc / Visible chunks / Multiple docs
- Multi-select for multiple docs (with "Select All")
- Prompt template dropdown
- Card count slider (1-10)
- Custom instructions textarea (optional)
- Cost estimate display
- "Generate Cards" button → creates job

**State management:**
```typescript
const [sourceType, setSourceType] = useState<'document' | 'chunks' | 'multi'>('document')
const [selectedDocs, setSelectedDocs] = useState<string[]>([currentDocId])
const [promptId, setPromptId] = useState<string>(defaultPromptId)
const [count, setCount] = useState(5)
const [custom, setCustom] = useState('')
```

**Job flow:**
```typescript
const handleGenerate = async () => {
  const { jobId } = await generateFlashcards({
    sourceType: sourceType === 'multi' ? 'document' : sourceType,
    sourceIds: sourceType === 'multi' ? selectedDocs : [currentDocId],
    promptTemplateId: promptId,
    cardCount: count,
    customInstructions: custom
  })
  
  // Start polling
  pollJobStatus(jobId)
}
```

### 2. ReviewPanel (Floating Bottom Panel)

**Location:** `src/components/flashcards/ReviewPanel.tsx`

**Slides up from bottom (60% height) when job completes**

**Layout:**
- Top toolbar: Select all, Add tags, Assign to deck, Approve selected
- Grid of cards (2-3 columns)
- Each card shows Q/A, metadata, actions
- Footer: Save Drafts / Discard All / Approve All & Add to Inbox

**Card component:**
```typescript
<CardEditor
  card={card}
  onUpdate={(updates) => updateFlashcard(card.id, updates)}
  onRegenerate={() => regenerateCard(card.id)}
  onViewSource={() => jumpToChunk(card.chunkIds[0])}
  onApprove={() => approveFlashcard(card.id)}
  onDelete={() => deleteFlashcard(card.id)}
/>
```

**Batch operations:**
```typescript
const handleBatchApprove = async () => {
  const selectedIds = cards.filter(c => c.selected).map(c => c.id)
  await batchApproveFlashcards(selectedIds)
  await addToDeck(selectedIds, 'inbox')
  closePanel()
}
```

### 3. DeckManager (Full Page View)

**Route:** `/flashcards/decks`

**Features:**
- List of all decks with stats (total cards, due count, retention %)
- Click deck → opens DeckView
- "New Deck" button
- Nested deck display with expand/collapse
- Drag-and-drop reordering (future)

**Data loading:**
```typescript
const { data: decks } = useQuery({
  queryKey: ['decks'],
  queryFn: getDecksWithStats
})
```

### 4. DeckView (Individual Deck)

**Route:** `/flashcards/decks/[deckId]`

**Tabs:**
- **Approved** tab: List of approved cards, sortable, searchable
- **Draft** tab: List of draft cards with batch approve
- **Stats** tab: Retention rate, avg ease factor, chart over time

**Actions:**
- Edit deck name/description
- Delete deck (move cards to parent or Inbox)
- Export deck to Anki
- Generate cards for this deck (pre-fills prompt assignment)

### 5. StudyInterface (Fullscreen)

**Route:** `/flashcards/study` or modal overlay

**Desktop layout:**
```
┌────────────────────────────────────────────┐
│ [Deck: Philosophy] [3 remaining] [Esc]    │
├────────────────────────────────────────────┤
│                                            │
│          ┌──────────────────┐             │
│          │                  │             │
│          │  Q: What is...   │             │
│          │                  │             │
│          │ [Show Answer]    │             │
│          │                  │             │
│          └──────────────────┘             │
│                                            │
│  ┌─ CONTEXT ────────────────────────────┐ │
│  │ 📚 Gravity's Rainbow                 │ │
│  │ 📎 Chunks: 42, 43                    │ │
│  │ "...preview of chunk content..."     │ │
│  │ [View full context →]                │ │
│  │                                      │ │
│  │ Connected to:                        │ │
│  │ • "1984" - Surveillance mechanisms   │ │
│  └──────────────────────────────────────┘ │
│                                            │
│      [Again] [Hard] [Good] [Easy]         │
│         1      2      3      4            │
└────────────────────────────────────────────┘
```

**Mobile layout:**
- Fullscreen card
- Swipe up: reveal answer
- Swipe left: Again (1)
- Swipe right: Easy (4)
- Tap left: Hard (2)
- Tap right: Good (3)
- Bottom sheet for context (swipe up to expand)

**Keyboard shortcuts:**
- Space: reveal answer
- 1-4: rate card
- V: view context (opens reader)
- Esc: exit study

**State management:**
```typescript
const [session, setSession] = useState(null)
const [currentIndex, setCurrentIndex] = useState(0)
const [revealed, setRevealed] = useState(false)

const handleRate = async (rating: 1 | 2 | 3 | 4) => {
  await reviewCard(session.id, currentCard.id, rating, timeSpent)
  setCurrentIndex(i => i + 1)
  setRevealed(false)
}
```

### 6. Command Panel Integration

**Trigger:** `Cmd+K` globally

**Flashcard commands:**
```typescript
const flashcardCommands = [
  {
    id: 'study',
    label: 'Study Due Cards',
    icon: '🎯',
    action: () => router.push('/flashcards/study')
  },
  {
    id: 'study-deck',
    label: 'Study Deck...',
    icon: '📚',
    action: () => showDeckPicker()
  },
  {
    id: 'gen-doc',
    label: 'Generate Cards from Current Document',
    icon: '⚡',
    action: () => openGenerationPanel()
  },
  {
    id: 'review-pending',
    label: 'Review Pending Cards',
    icon: '📝',
    action: () => openReviewPanel()
  },
  {
    id: 'search-cards',
    label: 'Search Cards...',
    icon: '🔍',
    action: (query) => searchFlashcards(query)
  }
]
```

**Filter syntax in study view:**
```
> tag:surveillance status:approved
  → Shows approved cards tagged "surveillance"
  → [Start Filtered Study Session]
```

---

## Implementation Phases

### Phase 1: Core Generation + Review (Week 1)

**Goal:** Ship basic Q&A generation and review flow

**Tasks:**
1. Database migrations (decks, flashcards_cache, prompt_templates, study_sessions)
2. ECS components (Card, SRS, DeckMembership)
3. FlashcardOperations wrapper class
4. Server actions (CRUD, generation)
5. Worker handler (GenerateFlashcardsJob - basic Q&A only)
6. GenerationPanel component (sidebar tab)
7. ReviewPanel component (floating panel)
8. Storage export helpers

**Testing:**
- Generate 5 cards from single document
- Edit cards in review panel
- Approve cards → moves to Inbox deck
- Verify storage files created

**Success criteria:**
- Generate 8 cards from 500-page book in <30s
- Cost ~$0.01 per generation
- All cards have correct chunk references

### Phase 2: Study Mode + SRS (Week 2)

**Goal:** Ship functional study interface with spaced repetition

**Tasks:**
1. SRS algorithm implementation (SM-2)
2. StudyInterface component (desktop + mobile)
3. Study server actions (start session, review card, end session)
4. Session tracking (study_sessions table)
5. Due cards calculation
6. Context sidebar in study mode

**Testing:**
- Start study session with 10 due cards
- Review all cards with different ratings
- Verify SRS intervals update correctly
- Check session stats recorded

**Success criteria:**
- Study 50 cards in <10min
- Context sidebar shows source chunks
- Mobile gestures work smoothly
- Retention rate calculates correctly

### Phase 3: Decks + Advanced Features (Week 3)

**Goal:** Ship deck management, filtering, batch operations

**Tasks:**
1. DeckManager view (full page)
2. DeckView with tabs (approved, draft, stats)
3. Deck CRUD operations
4. Nested deck support
5. Command panel integration
6. Tag filtering
7. Batch operations (approve all, add tags, move to deck)
8. Cloze card type support

**Testing:**
- Create nested deck (Philosophy → Deleuze)
- Move cards between decks
- Filter study session by tags
- Generate cloze cards

**Success criteria:**
- Nested decks display correctly
- Filtering works in study mode
- Batch operations complete in <2s for 50 cards

### Phase 4: Integrations + Advanced Generation (Week 4)

**Goal:** Ship Obsidian sync, custom prompts, multi-document generation

**Tasks:**
1. Custom prompt system (CRUD, template rendering)
2. PromptEditor component
3. Multi-document generation
4. Connection-based card generation
5. ObsidianSyncJob handler
6. Obsidian markdown templates
7. File watcher for bidirectional sync
8. Anki export handler

**Testing:**
- Create custom prompt template
- Generate 15 cards from 3 documents
- Edit card in Obsidian → syncs to Rhizome
- Export deck to Anki .apkg

**Success criteria:**
- Custom prompts render correctly with variables
- Multi-doc generation links cards to multiple sources
- Obsidian sync completes in <5s
- Anki export opens successfully in AnkiMobile

---

## Testing Strategy

### Unit Tests

**Key modules:**
- `src/lib/flashcards/srs.ts` - SRS algorithm (critical for correctness)
- `src/lib/flashcards/prompts.ts` - Template rendering
- `worker/lib/chunk-matching.ts` - Embedding-based matching

**Example:**
```typescript
describe('SRS algorithm', () => {
  it('should increase interval on Good rating', () => {
    const current = { interval: 5, easeFactor: 2.5 }
    const next = calculateSRS(current, 3)
    expect(next.interval).toBeGreaterThan(5)
  })
  
  it('should reset interval on Again rating', () => {
    const current = { interval: 21, easeFactor: 2.5 }
    const next = calculateSRS(current, 1)
    expect(next.interval).toBe(1)
  })
})
```

### Integration Tests

**Critical flows:**
1. Generate cards → review → approve → study
2. Edit card → preserves SRS schedule
3. Regenerate card → updates content, keeps ID
4. Obsidian edit → syncs back to Rhizome

### Manual Testing Checklist

**Generation:**
- [ ] Generate from full document (500 pages)
- [ ] Generate from visible chunks (3 chunks)
- [ ] Generate from selection (150 words)
- [ ] Generate from annotation
- [ ] Generate from connection (thematic bridge)
- [ ] Verify chunk references correct
- [ ] Verify cost ~$0.01 per 5 cards

**Review:**
- [ ] Edit question/answer inline
- [ ] Add tags to single card
- [ ] Add tags to multiple cards (batch)
- [ ] Regenerate card (preserves ID)
- [ ] Approve single card
- [ ] Approve all cards
- [ ] Discard all cards
- [ ] Assign to deck

**Study:**
- [ ] Start session (global due cards)
- [ ] Start session (filtered by deck)
- [ ] Start session (filtered by tags)
- [ ] Review 20 cards with all ratings
- [ ] View context sidebar
- [ ] Jump to source chunk
- [ ] Mobile gestures (swipe, tap)
- [ ] Keyboard shortcuts

**Decks:**
- [ ] Create root deck
- [ ] Create nested deck (child)
- [ ] Move cards between decks
- [ ] Delete deck (moves cards to parent)
- [ ] View deck stats

**Sync:**
- [ ] Export to Obsidian
- [ ] Edit card in Obsidian
- [ ] Sync back to Rhizome
- [ ] Verify conflict handling
- [ ] Export to Anki .apkg
- [ ] Open in AnkiMobile

---

## Cost Analysis

### Per-Operation Costs

**Generation:**
- Full document (500 pages, 8 cards): ~$0.01
- Visible chunks (3 chunks, 3 cards): ~$0.005
- Selection (200 words, 2 cards): ~$0.003
- Regenerate single card: ~$0.003

**Storage:**
- File storage: $0 (included in Supabase)
- Database cache: $0 (minimal storage)

**Sync:**
- Obsidian: $0 (local file operations)
- Anki export: $0 (local generation)

### Monthly Cost Estimates

**Light usage (10 docs/month):**
- 10 docs × 8 cards × $0.01 = $0.10
- 20 regenerations × $0.003 = $0.06
- **Total: ~$0.16/month**

**Medium usage (50 docs/month):**
- 50 docs × 8 cards × $0.01 = $0.50
- 100 regenerations × $0.003 = $0.30
- 5 multi-doc generations × $0.04 = $0.20
- **Total: ~$1.00/month**

**Heavy usage (100 docs/month):**
- 100 docs × 8 cards × $0.01 = $1.00
- 200 regenerations × $0.003 = $0.60
- 20 multi-doc generations × $0.04 = $0.80
- **Total: ~$2.40/month**

**Compared to alternatives:**
- Anki: Free (but no generation)
- RemNote: $6/month (includes generation)
- Readwise Reader: $8/month (limited flashcards)

**Rhizome advantage:** 5-10x cheaper with deeper knowledge graph integration

---

## Open Questions / Decisions Needed

### 1. Cloze Display Strategy

**Question:** When showing cloze card with multiple deletions, show all blanks at once or one per review?

**Option A:** One blank per review (standard Anki)
- Card with `{{c1::rhizome}}` and `{{c2::hierarchical}}` becomes 2 separate reviews
- More reviews, better retention
- SRS schedule per deletion

**Option B:** All blanks at once
- Single review shows all deletions
- Faster study sessions
- Single SRS schedule

**Recommendation:** Start with Option A (Anki-compatible), add Option B as setting later

### 2. Multi-Document Generation Cost Control

**Question:** Should there be a warning/confirmation for expensive operations?

**Example:** Generating from 10 documents = ~$0.10

**Option A:** Always warn when cost > $0.05
**Option B:** No warnings (personal tool, trust user)
**Option C:** Show running cost total in sidebar

**Recommendation:** Option C - passive display, no modal interruptions

### 3. Tag Management

**Question:** Where should global tag view live?

**Option A:** `/flashcards/tags` route with list of all tags
**Option B:** Command panel only (`> tag:philosophy`)
**Option C:** Filter in study mode

**Recommendation:** All three - tag route for browsing, command panel for quick access, filters for study

### 4. Connection-Based Generation

**Question:** Should cards generated from connections be linked to the original connection entity?

**If yes:** When connection is rejected/invalidated, flag the card
**If no:** Cards are independent once generated

**Recommendation:** Yes - add `connectionId` to ChunkRef, flag if invalidated, but keep card (user can review/delete manually)

### 5. Obsidian Conflict Resolution

**Question:** When card edited in both Rhizome and Obsidian, how to resolve?

**Option A:** Last-write-wins with notification
**Option B:** Manual conflict resolution UI
**Option C:** Obsidian always wins

**Recommendation:** Option A for Phase 1, add Option B if conflicts become frequent

### 6. Study Session Limits

**Question:** Should there be daily new card limits (like Anki)?

**Option A:** Hard limit (20 new cards/day)
**Option B:** Soft limit (warning when >20)
**Option C:** No limits (personal tool)

**Recommendation:** Option C - if user wants limits, they can filter manually

---

## Success Metrics

### Technical Metrics

- ✅ Generate 8 cards from 500-page book in <30s
- ✅ Cost <$0.02 per document generation
- ✅ 95%+ chunk reference accuracy
- ✅ Study 50 cards in <10min
- ✅ Obsidian sync <5s for typical changes
- ✅ Zero data loss (file-over-app guarantee)

### User Experience Metrics

- ✅ Review panel shows all cards simultaneously (grid view)
- ✅ Context sidebar always shows source chunks
- ✅ Mobile gestures feel natural (no lag)
- ✅ Deck navigation intuitive (nested structure clear)
- ✅ Command panel fuzzy search works instantly

### Quality Metrics

- ✅ Generated cards are accurate (manual review 20 cards)
- ✅ Chunk matching >90% correct
- ✅ SRS algorithm improves retention (measure after 30 days)
- ✅ No orphaned cards after document reprocessing

---

## Risks & Mitigations

### Risk 1: AI-Generated Cards Are Low Quality

**Likelihood:** Medium  
**Impact:** High (users won't trust system)

**Mitigation:**
- Start with 4 high-quality default prompts
- Allow prompt customization immediately
- Make regeneration frictionless (always available)
- Show AI confidence scores (future)
- User feedback loop (thumbs up/down on generations)

### Risk 2: Chunk Matching Fails for Multi-Chunk Cards

**Likelihood:** Medium  
**Impact:** Medium (loses context)

**Mitigation:**
- Use embedding similarity for matching (robust)
- Fall back to text search if embeddings fail
- Store original text in generation metadata
- Manual chunk assignment option in review panel

### Risk 3: SRS Algorithm Doesn't Match User Expectations

**Likelihood:** Low  
**Impact:** Medium (frustrating study experience)

**Mitigation:**
- Use proven SM-2 algorithm (Anki standard)
- Add "ease factor" manual adjustment
- Allow interval reset per card
- Export to Anki if Rhizome's SRS doesn't work

### Risk 4: Obsidian Sync Creates Conflicts

**Likelihood:** Medium  
**Impact:** Low (annoying but not breaking)

**Mitigation:**
- Last-write-wins with clear notification
- Store conflict metadata for manual review
- Obsidian → Rhizome sync more reliable than reverse
- Don't auto-sync, require manual trigger

### Risk 5: Performance Degrades with 1000+ Cards

**Likelihood:** High  
**Impact:** Medium (slow study sessions)

**Mitigation:**
- Use flashcards_cache for all queries (not ECS)
- Index all query columns (deck_id, status, next_review, tags)
- Paginate study sessions (50 cards max per session)
- Lazy load context sidebar

---

## Next Steps

### For You (Product Owner)

1. **Review this plan** - any missing features or wrong assumptions?
2. **Prioritize phases** - okay to ship Phase 1 first, iterate?
3. **Decide on open questions** - especially cloze display, tag management, conflict resolution
4. **Approve cost model** - $2-3/month for heavy usage acceptable?

### For Developer

1. **Phase 1 kickoff** - database migrations, ECS components, FlashcardOperations
2. **Test generation early** - verify chunk matching works on real books
3. **Ship review panel first** - can test without full study mode
4. **Iterate based on real usage** - generate 50 cards, see what breaks

### For Both

1. **Weekly sync** - review progress, adjust priorities
2. **Manual testing together** - critical flows need two sets of eyes
3. **Cost tracking** - log AI spend per operation, verify estimates
4. **User feedback loop** - test on 5 real books, gather issues

---

## Appendix: Default Prompt Templates

### 1. Comprehensive Concepts

```
Generate {{count}} flashcards covering the most important concepts in this text.

Focus on:
- Key definitions and terminology
- Core ideas and principles
- Relationships between concepts

For each card:
- Question should be clear and specific
- Answer should be concise but complete
- Link to the most relevant chunk(s)

Text: {{content}}

Chunk metadata: {{chunks}}

Custom instructions: {{custom}}
```

### 2. Deep Details

```
Generate {{count}} flashcards focusing on important details and specifics.

Focus on:
- Specific claims and arguments
- Supporting evidence and examples
- Precise terminology

For each card:
- Test recall of specific information
- Avoid overly broad questions
- Link to exact source chunks

Text: {{content}}
```

### 3. Connections & Synthesis

```
Generate {{count}} flashcards that synthesize concepts across this text.

Focus on:
- How ideas connect to each other
- Comparisons and contrasts
- Applications and implications

For each card:
- Test understanding, not just recall
- Encourage cross-referencing
- Link to multiple relevant chunks

Text: {{content}}
```

### 4. Contradiction Focus

```
Generate {{count}} flashcards highlighting conceptual tensions in this text.

Focus on:
- Opposing viewpoints
- Contradictions and paradoxes
- Debates and disagreements

For each card:
- Present both sides clearly
- Ask which perspective is supported
- Link to contrasting chunks

Text: {{content}}
```

---

**Total Plan Length:** ~7500 words  
**Estimated Read Time:** 30 minutes  
**Implementation Time:** 3-4 weeks (phased)

Ready to kick off Phase 1?