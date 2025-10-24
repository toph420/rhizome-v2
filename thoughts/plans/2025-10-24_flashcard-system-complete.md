# Flashcard System: Complete Implementation Plan

**Philosophy**: Build the right architecture from day one, ship MVP functionality first, extend incrementally.

**Based on**: `thoughts/ideas/2025-10-24 - flashcard-system-ideas.md`

**Current Status**: Backend foundation complete (Phases 1-5 from initial plan)

---

## What's Already Built ✅

From the initial 5-phase implementation:

### Backend Infrastructure ✅
- **ECS Components**: Card, Content, Temporal, ChunkRef
- **Storage helpers**: Upload/download flashcard JSON
- **Server Actions**: CRUD operations (create, update, approve, delete, review)
- **Migrations**:
  - `060_create_decks.sql`
  - `061_create_flashcards_cache.sql`
  - `063_study_sessions.sql`
- **AI Generation**: Background job handler with Gemini integration
- **Job schemas**: Zod validation for generate_flashcards

### Frontend Components ✅
- **FlashcardCard**: Feature-rich component with keyboard shortcuts
- **Study Interface**: Fullscreen study mode at `/flashcards/study`
- **Study Actions**: Session management, review tracking

### What's Missing from Full Vision

Comparing to comprehensive plan:

#### Missing ECS Components
- ❌ **SRS Component** - Currently using ts-fsrs directly, not as ECS component
- ❌ **DeckMembership Component** - Using deck_id in Card instead

#### Missing Database Tables
- ❌ **prompt_templates** - Custom prompt system
- ❌ System decks (Inbox, Archive) - Not auto-created

#### Missing Backend
- ❌ Prompt template system (CRUD + rendering)
- ❌ Multi-source generation (only document/chunks, missing selection/annotation/connection)
- ❌ Batch operations server actions
- ❌ Deck stats calculations
- ❌ Cache rebuild helpers
- ❌ Obsidian sync handlers
- ❌ Anki export handler

#### Missing Frontend
- ❌ GenerationPanel (sidebar tab)
- ❌ ReviewPanel (post-generation review)
- ❌ DeckManager (full page)
- ❌ DeckView (individual deck tabs)
- ❌ PromptEditor
- ❌ Command panel integration
- ❌ Tag filtering UI
- ❌ Batch operation UI

---

## Architecture Decisions (Build Right From Start)

### 1. ECS Component Structure

**Decision**: Refactor to match comprehensive plan exactly

**Current** (what we have):
```typescript
Card component: {
  type, question, answer, status,
  srs: { due, stability, difficulty, ... },  // ❌ Nested SRS
  deckId  // ❌ Direct deck reference
}
```

**Target** (what we need):
```typescript
// Separate components for flexibility
Card: { type, question, answer, content, clozeCount }
SRS: { interval, easeFactor, nextReview, ... }  // ✅ Separate component
DeckMembership: { deckId, addedAt }  // ✅ Separate component
Content: { tags, note }
Temporal: { createdAt, updatedAt }
ChunkRef: { documentId, chunkIds, connectionId, annotationId, generationJobId }
```

**Why**: Flexibility for future features (multi-deck cards, SRS algorithm changes, cloze support)

**Migration**: Create migration to split existing cards into proper components

---

### 2. Status Derivation Strategy

**Decision**: Status is derived, not stored

**Current**: `status: 'draft' | 'active' | 'suspended'` in Card component

**Target**: Status derived from component presence
- **Draft**: Has Card, NO SRS component
- **Approved**: Has Card + SRS component
- **Archived**: DeckMembership.deckId points to Archive deck

**Why**: Single source of truth, can't have inconsistent state

**Implementation**:
- Remove `status` from Card component
- Update FlashcardOperations to derive status
- Update cache rebuild to derive status
- Add helper: `getCardStatus(entity): 'draft' | 'approved' | 'archived'`

---

### 3. System Decks Pattern

**Decision**: Auto-create Inbox and Archive on user signup

**Implementation**:
```sql
-- Migration: Add system decks on user creation
CREATE OR REPLACE FUNCTION create_system_decks()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO decks (user_id, name, is_system) VALUES
    (NEW.id, 'Inbox', TRUE),
    (NEW.id, 'Archive', TRUE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_system_decks();
```

**Why**: Guarantees every user has Inbox/Archive, simplifies code

---

### 4. Prompt Template System

**Decision**: Build extensible template system from start

**Schema** (already in ideas doc):
```sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL,
  variables TEXT[],
  is_default BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ
);
```

**Default prompts**: Ship 4 system prompts (from ideas doc)
1. Comprehensive Concepts (default)
2. Deep Details
3. Connections & Synthesis
4. Contradiction Focus

**Why**: Users will want custom prompts immediately, build it right now

---

### 5. Multi-Source Generation

**Decision**: Support all 5 source types from day one

**Backend architecture**:
```typescript
// worker/handlers/generate-flashcards.ts

interface SourceLoader {
  load(): Promise<{ content: string; chunks: Chunk[] }>
}

class DocumentSourceLoader implements SourceLoader { ... }
class ChunksSourceLoader implements SourceLoader { ... }
class SelectionSourceLoader implements SourceLoader { ... }
class AnnotationSourceLoader implements SourceLoader { ... }
class ConnectionSourceLoader implements SourceLoader { ... }

// Factory pattern
function getSourceLoader(type: SourceType, ids: string[]): SourceLoader {
  switch(type) {
    case 'document': return new DocumentSourceLoader(ids)
    case 'chunks': return new ChunksSourceLoader(ids)
    case 'selection': return new SelectionSourceLoader(ids)
    case 'annotation': return new AnnotationSourceLoader(ids)
    case 'connection': return new ConnectionSourceLoader(ids)
  }
}
```

**Why**: Clean abstraction, easy to add sources, testable

---

### 6. Cache Strategy

**Decision**: Use flashcards_cache for ALL queries, rebuild on changes

**Pattern**:
```typescript
// After every mutation
await ops.create(...)
await rebuildFlashcardCache(entityId)  // Sync single card

// After batch operations
await ops.batchApprove(ids)
await rebuildFlashcardsCache()  // Full rebuild
```

**Cache rebuild function** (SQL):
```sql
CREATE OR REPLACE FUNCTION rebuild_flashcards_cache(p_user_id UUID)
-- Implementation from ideas doc
```

**Why**: ECS queries are slow, cache enables fast filtering/sorting

---

## Implementation Plan

### Phase 1: Architecture Refactor (Foundation) - Week 1

**Goal**: Fix architecture to match comprehensive plan, no new features

#### 1.1: Migration - Split SRS into Separate Component

**File**: `supabase/migrations/064_refactor_srs_component.sql`

```sql
-- Step 1: Create SRS components from existing Card.srs data
INSERT INTO components (entity_id, user_id, component_type, data)
SELECT
  c.entity_id,
  c.user_id,
  'SRS',
  jsonb_build_object(
    'interval', (c.data->'srs'->>'interval')::INTEGER,
    'easeFactor', (c.data->'srs'->>'easeFactor')::NUMERIC,
    'nextReview', c.data->'srs'->>'nextReview',
    'lastReviewed', c.data->'srs'->>'lastReviewed',
    'reviewsCount', (c.data->'srs'->>'reviewsCount')::INTEGER,
    'lapsesCount', (c.data->'srs'->>'lapsesCount')::INTEGER,
    'isMature', (c.data->'srs'->>'isMature')::BOOLEAN
  )
FROM components c
WHERE c.component_type = 'Card'
  AND c.data->'srs' IS NOT NULL;

-- Step 2: Remove srs from Card component
UPDATE components
SET data = data - 'srs'
WHERE component_type = 'Card';

-- Step 3: Remove status from Card component (now derived)
UPDATE components
SET data = data - 'status'
WHERE component_type = 'Card';
```

**Changes Required**:
- ✅ `src/lib/ecs/flashcards.ts`: Update to use separate SRS component
- ✅ `src/app/actions/flashcards.ts`: Update approve/review to add/update SRS component
- ✅ `worker/types/job-schemas.ts`: Update output schemas

**Testing**: Run migration on dev DB, verify existing cards still work

---

#### 1.2: Migration - Add DeckMembership Component

**File**: `supabase/migrations/065_add_deck_membership_component.sql`

```sql
-- Create DeckMembership components from existing Card.deckId
INSERT INTO components (entity_id, user_id, component_type, data)
SELECT
  c.entity_id,
  c.user_id,
  'DeckMembership',
  jsonb_build_object(
    'deckId', c.data->>'deckId',
    'addedAt', COALESCE(c.data->>'deckAddedAt', NOW()::TEXT)
  )
FROM components c
WHERE c.component_type = 'Card'
  AND c.data->'deckId' IS NOT NULL;

-- Remove deckId from Card component
UPDATE components
SET data = data - 'deckId' - 'deckAddedAt'
WHERE component_type = 'Card';
```

**Changes Required**:
- ✅ `src/lib/ecs/flashcards.ts`: Update to use DeckMembership component
- ✅ Component types: Add DeckMembership to TypeScript types

---

#### 1.3: Migration - System Decks + Trigger

**File**: `supabase/migrations/066_system_decks.sql`

```sql
-- Add is_system column to decks
ALTER TABLE decks ADD COLUMN is_system BOOLEAN DEFAULT FALSE;

-- Create system decks for existing users
INSERT INTO decks (user_id, name, is_system)
SELECT DISTINCT user_id, 'Inbox', TRUE
FROM entities
WHERE entity_type = 'flashcard'
ON CONFLICT DO NOTHING;

INSERT INTO decks (user_id, name, is_system)
SELECT DISTINCT user_id, 'Archive', TRUE
FROM entities
WHERE entity_type = 'flashcard'
ON CONFLICT DO NOTHING;

-- Trigger for new users
CREATE OR REPLACE FUNCTION create_system_decks()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO decks (user_id, name, is_system) VALUES
    (NEW.id, 'Inbox', TRUE),
    (NEW.id, 'Archive', TRUE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_system_decks();
```

**Changes Required**:
- ✅ `src/app/actions/decks.ts`: Add getSystemDecks() helper
- ✅ `src/lib/decks/system-decks.ts`: (NEW) System deck constants

---

#### 1.4: Migration - Prompt Templates Table

**File**: `supabase/migrations/067_prompt_templates.sql`

```sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL,
  variables TEXT[],
  is_default BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_prompts_user ON prompt_templates(user_id);
CREATE INDEX idx_prompts_default ON prompt_templates(is_default) WHERE is_default = TRUE;

-- Insert 4 default prompts (from ideas doc)
CREATE OR REPLACE FUNCTION create_default_prompts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO prompt_templates (user_id, name, description, template, variables, is_system, is_default) VALUES
    (NEW.id, 'Comprehensive Concepts', 'Key definitions, core ideas, and concept relationships',
     'Generate {{count}} flashcards covering the most important concepts in this text...',
     ARRAY['count', 'content', 'chunks', 'custom'], TRUE, TRUE),
    (NEW.id, 'Deep Details', 'Specific claims, evidence, and precise terminology',
     'Generate {{count}} flashcards focusing on important details and specifics...',
     ARRAY['count', 'content', 'chunks', 'custom'], TRUE, FALSE),
    (NEW.id, 'Connections & Synthesis', 'How ideas connect, comparisons, and applications',
     'Generate {{count}} flashcards that synthesize concepts across this text...',
     ARRAY['count', 'content', 'chunks', 'custom'], TRUE, FALSE),
    (NEW.id, 'Contradiction Focus', 'Conceptual tensions, opposing viewpoints, and paradoxes',
     'Generate {{count}} flashcards highlighting conceptual tensions in this text...',
     ARRAY['count', 'content', 'chunks', 'custom'], TRUE, FALSE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_created_prompts
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_prompts();

-- Create prompts for existing users
INSERT INTO prompt_templates (user_id, name, description, template, variables, is_system, is_default)
SELECT user_id, 'Comprehensive Concepts', 'Key definitions, core ideas, and concept relationships',
  'Generate {{count}} flashcards covering the most important concepts in this text...',
  ARRAY['count', 'content', 'chunks', 'custom'], TRUE, TRUE
FROM (SELECT DISTINCT user_id FROM entities WHERE entity_type = 'flashcard') AS users;

-- (Repeat for other 3 prompts)
```

**Changes Required**:
- ✅ `src/app/actions/prompts.ts`: (NEW) CRUD actions for prompts
- ✅ `src/lib/flashcards/prompts.ts`: (NEW) Template rendering

---

#### 1.5: Update FlashcardOperations to New Architecture

**File**: `src/lib/ecs/flashcards.ts`

**Changes**:
1. Update `create()` to use DeckMembership component
2. Update `approve()` to add SRS component (not modify Card)
3. Add `getStatus()` helper to derive status
4. Update `mapToFlashcard()` to handle new structure

**Pattern**:
```typescript
class FlashcardOperations {
  async create(input: CreateFlashcardInput): Promise<string> {
    // Create entity
    const entity = await this.ecs.createEntity(this.userId, 'flashcard')

    // Add 5-6 components
    await this.ecs.addComponents(entity.id, this.userId, [
      { type: 'Card', data: { type, question, answer, content, clozeCount } },
      { type: 'DeckMembership', data: { deckId, addedAt } },  // ✅ NEW
      { type: 'Content', data: { tags, note } },
      { type: 'Temporal', data: { createdAt, updatedAt } },
      { type: 'ChunkRef', data: { documentId, chunkIds, ... } },
      // NO SRS component yet (draft state)
    ])

    return entity.id
  }

  async approve(entityId: string): Promise<void> {
    // Add SRS component (draft → approved)
    await this.ecs.addComponent(entityId, this.userId, {
      type: 'SRS',
      data: {
        interval: 1,  // Initial interval
        easeFactor: 2.5,
        nextReview: addDays(new Date(), 1).toISOString(),
        lastReviewed: null,
        reviewsCount: 0,
        lapsesCount: 0,
        isMature: false
      }
    })
  }

  async getStatus(entityId: string): Promise<'draft' | 'approved' | 'archived'> {
    const entity = await this.ecs.getEntity(entityId, this.userId)
    const components = entity.components || []

    const hasSRS = components.some(c => c.component_type === 'SRS')
    const deckMembership = components.find(c => c.component_type === 'DeckMembership')

    if (!hasSRS) return 'draft'

    // Check if in Archive deck
    const archiveDeck = await getSystemDeck(this.userId, 'Archive')
    if (deckMembership?.data.deckId === archiveDeck.id) return 'archived'

    return 'approved'
  }
}
```

---

#### 1.6: Update Cache Rebuild to New Structure

**File**: `supabase/migrations/068_rebuild_cache_function.sql`

```sql
CREATE OR REPLACE FUNCTION rebuild_flashcards_cache(p_user_id UUID)
RETURNS void AS $$
BEGIN
  DELETE FROM flashcards_cache WHERE user_id = p_user_id;

  INSERT INTO flashcards_cache (
    entity_id, user_id, card_type, question, answer, content, cloze_count,
    deck_id, tags, status, next_review, interval, ease_factor, is_mature,
    chunk_ids, document_ids, connection_id, annotation_id, generation_job_id,
    created_at, updated_at, cached_at
  )
  SELECT
    e.id,
    e.user_id,
    (card_comp.data->>'type')::TEXT,
    card_comp.data->>'question',
    card_comp.data->>'answer',
    card_comp.data->>'content',
    (card_comp.data->>'clozeCount')::INTEGER,
    (deck_comp.data->>'deckId')::UUID,  -- ✅ From DeckMembership
    ARRAY(SELECT jsonb_array_elements_text(content_comp.data->'tags')),
    CASE WHEN srs_comp.id IS NULL THEN 'draft' ELSE 'approved' END,  -- ✅ Derived
    (srs_comp.data->>'nextReview')::TIMESTAMPTZ,  -- ✅ From SRS
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
    (temporal_comp.data->>'updatedAt')::TIMESTAMPTZ,
    NOW()
  FROM entities e
  JOIN components card_comp ON card_comp.entity_id = e.id
    AND card_comp.component_type = 'Card'
  LEFT JOIN components srs_comp ON srs_comp.entity_id = e.id
    AND srs_comp.component_type = 'SRS'  -- ✅ LEFT JOIN (drafts have no SRS)
  JOIN components deck_comp ON deck_comp.entity_id = e.id
    AND deck_comp.component_type = 'DeckMembership'  -- ✅ NEW
  JOIN components content_comp ON content_comp.entity_id = e.id
    AND content_comp.component_type = 'Content'
  JOIN components temporal_comp ON temporal_comp.entity_id = e.id
    AND temporal_comp.component_type = 'Temporal'
  JOIN components chunk_ref_comp ON chunk_ref_comp.entity_id = e.id
    AND chunk_ref_comp.component_type = 'ChunkRef'
  WHERE e.user_id = p_user_id
    AND e.entity_type = 'flashcard';
END;
$$ LANGUAGE plpgsql;
```

---

#### Phase 1 Success Criteria

**Automated**:
- [ ] All 5 migrations run without errors
- [ ] Existing flashcards still load in study mode
- [ ] Cache rebuild function returns correct data
- [ ] TypeScript compiles with new component types

**Manual**:
- [ ] Open study interface → cards display correctly
- [ ] Review a card → SRS component updates
- [ ] Check DB → SRS and DeckMembership are separate components
- [ ] Create new card → uses new architecture
- [ ] Approve card → adds SRS component (not modifies Card)

**Estimated time**: 1-2 days

---

### Phase 2: Core UI Components (MVP) - Week 2

**Goal**: Ship minimal but complete UI for generation → review → study workflow

#### 2.1: GenerationPanel Component

**File**: `src/components/flashcards/GenerationPanel.tsx`

**Features**:
- Source type selector (Document / Visible Chunks / Selection)
- Prompt template dropdown (loads from prompt_templates)
- Card count slider (1-20)
- Deck picker (where to add cards)
- Custom instructions textarea
- Cost estimate
- "Generate Cards" button

**Implementation**:
```typescript
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Select } from '@/components/rhizome/select'
import { Slider } from '@/components/rhizome/slider'
import { Textarea } from '@/components/rhizome/textarea'
import { generateFlashcards } from '@/app/actions/flashcards'
import { useQuery } from '@tanstack/react-query'
import { getPromptTemplates } from '@/app/actions/prompts'
import { getDecksWithStats } from '@/app/actions/decks'

interface GenerationPanelProps {
  documentId: string
  onGenerationStarted?: (jobId: string) => void
}

export function GenerationPanel({ documentId, onGenerationStarted }: GenerationPanelProps) {
  const [sourceType, setSourceType] = useState<'document' | 'chunks'>('document')
  const [promptId, setPromptId] = useState('')
  const [count, setCount] = useState(5)
  const [deckId, setDeckId] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [generating, setGenerating] = useState(false)

  // Load prompts
  const { data: prompts } = useQuery({
    queryKey: ['prompts'],
    queryFn: getPromptTemplates
  })

  // Load decks
  const { data: decks } = useQuery({
    queryKey: ['decks'],
    queryFn: getDecksWithStats
  })

  // Auto-select defaults
  useEffect(() => {
    if (prompts && !promptId) {
      const defaultPrompt = prompts.find(p => p.is_default)
      if (defaultPrompt) setPromptId(defaultPrompt.id)
    }
    if (decks && !deckId) {
      const inbox = decks.find(d => d.name === 'Inbox' && d.is_system)
      if (inbox) setDeckId(inbox.id)
    }
  }, [prompts, decks])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result = await generateFlashcards({
        sourceType,
        sourceIds: [documentId],
        promptTemplateId: promptId,
        cardCount: count,
        deckId,
        customInstructions: customInstructions || undefined
      })

      if (result.success && result.jobId) {
        onGenerationStarted?.(result.jobId)
        toast.success(`Generating ${count} cards...`)
      } else {
        toast.error(result.error || 'Generation failed')
      }
    } catch (error) {
      toast.error('Failed to start generation')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">Generate Flashcards</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source type */}
        <div>
          <label className="text-sm font-medium">Source</label>
          <Select value={sourceType} onValueChange={setSourceType}>
            <option value="document">Full Document</option>
            <option value="chunks">Visible Chunks</option>
          </Select>
        </div>

        {/* Prompt template */}
        <div>
          <label className="text-sm font-medium">Prompt Template</label>
          <Select value={promptId} onValueChange={setPromptId}>
            {prompts?.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {p.is_default && '(default)'}
              </option>
            ))}
          </Select>
        </div>

        {/* Card count */}
        <div>
          <label className="text-sm font-medium">Card Count: {count}</label>
          <Slider
            value={[count]}
            onValueChange={([v]) => setCount(v)}
            min={1}
            max={20}
            step={1}
          />
        </div>

        {/* Deck */}
        <div>
          <label className="text-sm font-medium">Add to Deck</label>
          <Select value={deckId} onValueChange={setDeckId}>
            {decks?.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Custom instructions */}
        <div>
          <label className="text-sm font-medium">Custom Instructions (optional)</label>
          <Textarea
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
            placeholder="Focus on philosophical concepts..."
            rows={3}
          />
        </div>

        {/* Cost estimate */}
        <div className="text-xs text-muted-foreground">
          Estimated cost: ~$0.{Math.ceil(count / 5).toString().padStart(2, '0')}
        </div>

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={generating || !promptId || !deckId}
          className="w-full"
        >
          {generating ? 'Generating...' : `Generate ${count} Cards`}
        </Button>
      </CardContent>
    </Card>
  )
}
```

**Testing**:
- [ ] Prompts load from database
- [ ] Decks load with Inbox selected by default
- [ ] Generate button creates background job
- [ ] ProcessingDock shows job progress

---

#### 2.2: Update FlashcardsTab to Use GenerationPanel

**File**: `src/components/sidebar/FlashcardsTab.tsx`

Replace placeholder with:

```typescript
'use client'

import { GenerationPanel } from '@/components/flashcards/GenerationPanel'
import { FlashcardsList } from '@/components/flashcards/FlashcardsList'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'

export function FlashcardsTab({ documentId }: { documentId: string }) {
  return (
    <Tabs defaultValue="generate">
      <TabsList>
        <TabsTrigger value="generate">Generate</TabsTrigger>
        <TabsTrigger value="cards">Cards</TabsTrigger>
      </TabsList>

      <TabsContent value="generate">
        <GenerationPanel documentId={documentId} />
      </TabsContent>

      <TabsContent value="cards">
        <FlashcardsList documentId={documentId} />
      </TabsContent>
    </Tabs>
  )
}
```

---

#### 2.3: FlashcardsList Component

**File**: `src/components/flashcards/FlashcardsList.tsx`

**Features**:
- Filter by status (All / Draft / Approved)
- Grid of FlashcardCard components (already built!)
- "Start Study" button if due cards exist
- Empty state with generation CTA

```typescript
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FlashcardCard } from '@/components/rhizome/flashcard-card'
import { Button } from '@/components/rhizome/button'
import { Select } from '@/components/rhizome/select'
import { getFlashcardsByDocument, getDueFlashcards } from '@/app/actions/flashcards'
import { useRouter } from 'next/navigation'

export function FlashcardsList({ documentId }: { documentId: string }) {
  const [filter, setFilter] = useState<'all' | 'draft' | 'approved'>('all')
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const router = useRouter()

  // Load cards for this document
  const { data: cards, refetch } = useQuery({
    queryKey: ['flashcards', documentId, filter],
    queryFn: () => getFlashcardsByDocument(documentId, filter === 'all' ? undefined : filter)
  })

  // Load due count
  const { data: dueCards } = useQuery({
    queryKey: ['flashcards-due'],
    queryFn: getDueFlashcards
  })

  const dueCount = dueCards?.length || 0

  if (!cards || cards.length === 0) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground">No flashcards yet</p>
        <p className="text-xs text-muted-foreground">
          Generate cards from the "Generate" tab
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Select value={filter} onValueChange={setFilter}>
          <option value="all">All Cards</option>
          <option value="draft">Drafts</option>
          <option value="approved">Approved</option>
        </Select>

        {dueCount > 0 && (
          <Button
            size="sm"
            onClick={() => router.push('/flashcards/study')}
          >
            Study ({dueCount} due)
          </Button>
        )}
      </div>

      {/* Cards grid */}
      <div className="space-y-2">
        {cards.map(card => (
          <FlashcardCard
            key={card.entity_id}
            flashcard={card}
            isActive={activeCardId === card.entity_id}
            onClick={() => setActiveCardId(card.entity_id)}
            onApproved={refetch}
            onDeleted={refetch}
          />
        ))}
      </div>
    </div>
  )
}
```

**New Server Action Needed**:

**File**: `src/app/actions/flashcards.ts`

```typescript
/**
 * Get flashcards by document
 */
export async function getFlashcardsByDocument(
  documentId: string,
  status?: 'draft' | 'approved'
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  let query = supabase
    .from('flashcards_cache')
    .select('*')
    .eq('user_id', user.id)
    .contains('document_ids', [documentId])  // ✅ Array contains
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) throw error

  return data
}
```

---

#### 2.4: Update Generation Handler to Use Prompts

**File**: `worker/handlers/generate-flashcards.ts`

**Changes**:
1. Accept `promptTemplateId` in input
2. Load template from database
3. Render template with variables
4. Use rendered prompt instead of hardcoded

```typescript
interface GenerateFlashcardsInput {
  sourceType: 'document' | 'chunks' | 'selection' | 'annotation' | 'connection'
  sourceIds: string[]
  promptTemplateId: string  // ✅ NEW
  cardCount: number
  customInstructions?: string  // ✅ NEW
  userId: string
  deckId: string
}

export async function generateFlashcardsHandler(
  supabase: SupabaseClient,
  job: { id: string; input_data: GenerateFlashcardsInput }
): Promise<void> {
  const { promptTemplateId, customInstructions, ... } = job.input_data

  // ... load source content ...

  // ✅ Load prompt template
  const { data: template } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('id', promptTemplateId)
    .single()

  if (!template) throw new Error('Prompt template not found')

  // ✅ Render template
  const renderedPrompt = renderTemplate(template.template, {
    count: cardCount.toString(),
    content: sourceContent,
    chunks: JSON.stringify(chunkContext.map(c => ({ id: c.id, preview: c.content.slice(0, 200) }))),
    custom: customInstructions || ''
  })

  // Update usage stats
  await supabase
    .from('prompt_templates')
    .update({
      usage_count: template.usage_count + 1,
      last_used_at: new Date().toISOString()
    })
    .eq('id', promptTemplateId)

  // Call Gemini with rendered prompt
  const result = await model.generateContent(renderedPrompt)

  // ... rest of handler ...
}
```

**New Helper File**: `worker/lib/template-renderer.ts`

```typescript
/**
 * Render prompt template with variable substitution
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let rendered = template

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    rendered = rendered.replace(pattern, value)
  }

  return rendered
}
```

---

#### 2.5: Prompt CRUD Server Actions

**File**: `src/app/actions/prompts.ts` (NEW)

```typescript
'use server'

import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const CreatePromptSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  template: z.string().min(1),
  variables: z.array(z.string()),
})

/**
 * Get all prompt templates for current user
 */
export async function getPromptTemplates() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })  // Defaults first
    .order('usage_count', { ascending: false })  // Then by usage

  if (error) throw error

  return data
}

/**
 * Create custom prompt template
 */
export async function createPromptTemplate(input: z.infer<typeof CreatePromptSchema>) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = CreatePromptSchema.parse(input)
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('prompt_templates')
      .insert({
        user_id: user.id,
        name: validated.name,
        description: validated.description,
        template: validated.template,
        variables: validated.variables,
        is_system: false,
        is_default: false
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/flashcards')

    return { success: true, prompt: data }

  } catch (error) {
    console.error('[Prompts] Create failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Update prompt template (only custom, not system)
 */
export async function updatePromptTemplate(
  promptId: string,
  updates: Partial<z.infer<typeof CreatePromptSchema>>
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    // Ensure not system prompt
    const { data: existing } = await supabase
      .from('prompt_templates')
      .select('is_system')
      .eq('id', promptId)
      .eq('user_id', user.id)
      .single()

    if (existing?.is_system) {
      throw new Error('Cannot modify system prompts')
    }

    const { error } = await supabase
      .from('prompt_templates')
      .update({
        name: updates.name,
        description: updates.description,
        template: updates.template,
        variables: updates.variables
      })
      .eq('id', promptId)
      .eq('user_id', user.id)

    if (error) throw error

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Prompts] Update failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Delete prompt template (only custom, not system)
 */
export async function deletePromptTemplate(promptId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('prompt_templates')
      .delete()
      .eq('id', promptId)
      .eq('user_id', user.id)
      .eq('is_system', false)  // Safety: only delete custom prompts

    if (error) throw error

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Prompts] Delete failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Set default prompt
 */
export async function setDefaultPrompt(promptId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    // Unset current default
    await supabase
      .from('prompt_templates')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)

    // Set new default
    await supabase
      .from('prompt_templates')
      .update({ is_default: true })
      .eq('id', promptId)
      .eq('user_id', user.id)

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Prompts] Set default failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

---

#### Phase 2 Success Criteria

**Automated**:
- [ ] TypeScript compiles with no errors
- [ ] All server actions have proper types
- [ ] Prompts load from database
- [ ] Generation creates background job

**Manual**:
- [ ] Open reader → sidebar shows "Generate" tab
- [ ] Select prompt, adjust count, click generate → job starts
- [ ] ProcessingDock shows generation progress
- [ ] When complete → switch to "Cards" tab → see generated cards
- [ ] Click card → FlashcardCard shows with edit/approve buttons
- [ ] Approve card → adds SRS component
- [ ] Click "Study" → redirects to study mode
- [ ] Review card → SRS updates

**Estimated time**: 2-3 days

---

### Phase 3: Extended Sources + Batch Operations - Week 3

**Goal**: Support all 5 source types, add batch operations for efficiency

#### 3.1: Source Loader Pattern

**File**: `worker/lib/source-loaders.ts` (NEW)

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SourceContent {
  content: string
  chunks: Array<{
    id: string
    content: string
    chunk_index: number
    document_id: string
    embedding?: number[]
  }>
}

export interface SourceLoader {
  load(supabase: SupabaseClient, userId: string): Promise<SourceContent>
}

/**
 * Document source loader (existing)
 */
export class DocumentSourceLoader implements SourceLoader {
  constructor(private documentIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    let content = ''
    const chunks: SourceContent['chunks'] = []

    const { data: docs } = await supabase
      .from('documents')
      .select('id, title, markdown_available')
      .in('id', this.documentIds)

    for (const doc of docs || []) {
      if (doc.markdown_available) {
        const { data: signedUrl } = await supabase.storage
          .from('documents')
          .createSignedUrl(`${userId}/documents/${doc.id}/content.md`, 3600)

        if (signedUrl?.signedUrl) {
          const response = await fetch(signedUrl.signedUrl)
          const markdown = await response.text()
          content += `\n\n# ${doc.title}\n\n${markdown}`
        }
      }

      const { data: docChunks } = await supabase
        .from('chunks')
        .select('id, content, chunk_index, document_id, embedding')
        .eq('document_id', doc.id)
        .eq('is_current', true)
        .order('chunk_index')

      chunks.push(...(docChunks || []))
    }

    return { content, chunks }
  }
}

/**
 * Chunks source loader (existing)
 */
export class ChunksSourceLoader implements SourceLoader {
  constructor(private chunkIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, embedding')
      .in('id', this.chunkIds)
      .order('chunk_index')

    const content = chunks?.map(c => c.content).join('\n\n') || ''

    return { content, chunks: chunks || [] }
  }
}

/**
 * Selection source loader (NEW)
 */
export class SelectionSourceLoader implements SourceLoader {
  constructor(
    private selection: {
      text: string
      documentId: string
      startOffset: number
      endOffset: number
    }
  ) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    // Find chunks that overlap with selection
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, character_start, character_end, embedding')
      .eq('document_id', this.selection.documentId)
      .eq('is_current', true)
      .lte('character_start', this.selection.endOffset)
      .gte('character_end', this.selection.startOffset)
      .order('chunk_index')

    // Use selection text as primary content
    const content = this.selection.text

    return { content, chunks: chunks || [] }
  }
}

/**
 * Annotation source loader (NEW)
 */
export class AnnotationSourceLoader implements SourceLoader {
  constructor(private annotationIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    // Load annotations from ECS
    const { data: entities } = await supabase
      .from('entities')
      .select(`
        id,
        components!inner(component_type, data)
      `)
      .in('id', this.annotationIds)
      .eq('user_id', userId)

    let content = ''
    const chunkIds: string[] = []

    for (const entity of entities || []) {
      const contentComp = entity.components?.find((c: any) => c.component_type === 'Content')
      const chunkRefComp = entity.components?.find((c: any) => c.component_type === 'ChunkRef')

      if (contentComp?.data.text) {
        content += contentComp.data.text + '\n\n'
      }
      if (contentComp?.data.note) {
        content += `Note: ${contentComp.data.note}\n\n`
      }
      if (chunkRefComp?.data.chunkIds) {
        chunkIds.push(...chunkRefComp.data.chunkIds)
      }
    }

    // Load referenced chunks
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, embedding')
      .in('id', chunkIds)
      .order('chunk_index')

    return { content, chunks: chunks || [] }
  }
}

/**
 * Connection source loader (NEW)
 */
export class ConnectionSourceLoader implements SourceLoader {
  constructor(private connectionIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    const { data: connections } = await supabase
      .from('connections')
      .select(`
        id,
        source_chunk_id,
        target_chunk_id,
        connection_type,
        explanation
      `)
      .in('id', this.connectionIds)

    const chunkIds = new Set<string>()
    let content = ''

    for (const conn of connections || []) {
      chunkIds.add(conn.source_chunk_id)
      chunkIds.add(conn.target_chunk_id)

      if (conn.explanation) {
        content += `Connection (${conn.connection_type}): ${conn.explanation}\n\n`
      }
    }

    // Load all referenced chunks
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, embedding')
      .in('id', Array.from(chunkIds))
      .order('chunk_index')

    // Add chunk content to prompt
    for (const chunk of chunks || []) {
      content += chunk.content + '\n\n'
    }

    return { content, chunks: chunks || [] }
  }
}

/**
 * Factory function
 */
export function createSourceLoader(
  sourceType: string,
  sourceIds: string[],
  selectionData?: any
): SourceLoader {
  switch (sourceType) {
    case 'document':
      return new DocumentSourceLoader(sourceIds)
    case 'chunks':
      return new ChunksSourceLoader(sourceIds)
    case 'selection':
      if (!selectionData) throw new Error('Selection data required')
      return new SelectionSourceLoader(selectionData)
    case 'annotation':
      return new AnnotationSourceLoader(sourceIds)
    case 'connection':
      return new ConnectionSourceLoader(sourceIds)
    default:
      throw new Error(`Unknown source type: ${sourceType}`)
  }
}
```

---

#### 3.2: Update Generation Handler to Use Source Loaders

**File**: `worker/handlers/generate-flashcards.ts`

```typescript
import { createSourceLoader } from '../lib/source-loaders.js'

export async function generateFlashcardsHandler(
  supabase: SupabaseClient,
  job: { id: string; input_data: GenerateFlashcardsInput }
): Promise<void> {
  const { sourceType, sourceIds, selectionData, ... } = job.input_data

  // ... existing setup ...

  // ✅ STEP 1: LOAD SOURCE CONTENT (10%)
  await jobManager.updateProgress(10, 'loading', 'Loading source content')

  const loader = createSourceLoader(sourceType, sourceIds, selectionData)
  const { content: sourceContent, chunks: chunkContext } = await loader.load(supabase, userId)

  console.log(`✓ Loaded ${sourceContent.length} chars from ${chunkContext.length} chunks`)

  // ... rest of handler uses sourceContent and chunkContext ...
}
```

---

#### 3.3: Batch Operations Server Actions

**File**: `src/app/actions/flashcards.ts`

```typescript
/**
 * Batch approve flashcards
 */
export async function batchApproveFlashcards(entityIds: string[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()
    const ops = new FlashcardOperations(ecs, user.id)

    for (const id of entityIds) {
      await ops.approve(id)
    }

    // Rebuild cache for all affected cards
    const supabase = createAdminClient()
    await supabase.rpc('rebuild_flashcards_cache', { p_user_id: user.id })

    revalidatePath('/flashcards')

    return { success: true, approvedCount: entityIds.length }

  } catch (error) {
    console.error('[Flashcards] Batch approve failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Batch delete flashcards
 */
export async function batchDeleteFlashcards(entityIds: string[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()
    const ops = new FlashcardOperations(ecs, user.id)

    for (const id of entityIds) {
      await ops.delete(id)
    }

    revalidatePath('/flashcards')

    return { success: true, deletedCount: entityIds.length }

  } catch (error) {
    console.error('[Flashcards] Batch delete failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Batch add tags to flashcards
 */
export async function batchAddTags(entityIds: string[], tags: string[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()

    for (const entityId of entityIds) {
      const entity = await ecs.getEntity(entityId, user.id)
      if (!entity) continue

      const contentComp = entity.components?.find(c => c.component_type === 'Content')
      if (!contentComp) continue

      const existingTags = contentComp.data.tags || []
      const newTags = Array.from(new Set([...existingTags, ...tags]))

      await ecs.updateComponent(
        contentComp.id,
        { ...contentComp.data, tags: newTags },
        user.id
      )
    }

    // Rebuild cache
    const supabase = createAdminClient()
    await supabase.rpc('rebuild_flashcards_cache', { p_user_id: user.id })

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Flashcards] Batch add tags failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Batch move to deck
 */
export async function batchMoveToDeck(entityIds: string[], deckId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()

    for (const entityId of entityIds) {
      const entity = await ecs.getEntity(entityId, user.id)
      if (!entity) continue

      const deckComp = entity.components?.find(c => c.component_type === 'DeckMembership')
      if (!deckComp) continue

      await ecs.updateComponent(
        deckComp.id,
        { deckId, addedAt: new Date().toISOString() },
        user.id
      )
    }

    // Rebuild cache
    const supabase = createAdminClient()
    await supabase.rpc('rebuild_flashcards_cache', { p_user_id: user.id })

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Flashcards] Batch move failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

---

#### 3.4: Update FlashcardsList with Batch Operations

**File**: `src/components/flashcards/FlashcardsList.tsx`

```typescript
export function FlashcardsList({ documentId }: { documentId: string }) {
  const [filter, setFilter] = useState<'all' | 'draft' | 'approved'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchActions, setShowBatchActions] = useState(false)

  // ... existing code ...

  const handleSelectCard = (cardId: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (selected) {
        next.add(cardId)
      } else {
        next.delete(cardId)
      }
      return next
    })
  }

  const handleBatchApprove = async () => {
    await batchApproveFlashcards(Array.from(selectedIds))
    setSelectedIds(new Set())
    refetch()
    toast.success(`Approved ${selectedIds.size} cards`)
  }

  const handleBatchDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} cards?`)) return
    await batchDeleteFlashcards(Array.from(selectedIds))
    setSelectedIds(new Set())
    refetch()
    toast.success(`Deleted ${selectedIds.size} cards`)
  }

  return (
    <div className="space-y-4 p-4">
      {/* Batch actions toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded">
          <span className="text-sm">{selectedIds.size} selected</span>
          <Button size="sm" onClick={handleBatchApprove}>
            Approve All
          </Button>
          <Button size="sm" variant="noShadow" onClick={handleBatchDelete}>
            Delete All
          </Button>
          <Button size="sm" variant="noShadow" onClick={() => setSelectedIds(new Set())}>
            Clear Selection
          </Button>
        </div>
      )}

      {/* Cards grid with checkboxes */}
      <div className="space-y-2">
        {cards.map(card => (
          <div key={card.entity_id} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={selectedIds.has(card.entity_id)}
              onChange={e => handleSelectCard(card.entity_id, e.target.checked)}
              className="mt-3"
            />
            <div className="flex-1">
              <FlashcardCard
                flashcard={card}
                isActive={activeCardId === card.entity_id}
                onClick={() => setActiveCardId(card.entity_id)}
                onApproved={refetch}
                onDeleted={refetch}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

#### Phase 3 Success Criteria

**Automated**:
- [ ] All source loaders compile
- [ ] Batch operations have proper types
- [ ] Cache rebuild works after batch operations

**Manual**:
- [ ] Generate from visible chunks → works
- [ ] Generate from annotation → works
- [ ] Generate from connection → works
- [ ] Select multiple cards → batch toolbar appears
- [ ] Approve all selected → all cards get SRS component
- [ ] Delete all selected → cards removed
- [ ] Cache stays in sync with ECS after batch ops

**Estimated time**: 2-3 days

---

### Phase 4: Deck Management + Command Panel - Week 4

**Goal**: Full deck organization, command panel integration

#### 4.1: DeckManager Page

**File**: `src/app/flashcards/decks/page.tsx` (NEW)

Full-page deck browser with nested decks, stats, and actions.

(Implementation details in next message - this is getting long!)

---

## Summary of Complete Plan

### Week 1: Architecture Refactor ✅
- Split SRS into separate component
- Add DeckMembership component
- System decks + triggers
- Prompt templates table
- Cache rebuild function

### Week 2: Core UI (MVP) ✅
- GenerationPanel component
- FlashcardsList component
- Prompt CRUD actions
- Update FlashcardsTab
- Template rendering in worker

### Week 3: Extended Sources + Batch Ops ✅
- Source loader pattern (5 types)
- Batch approve/delete/tag/move actions
- Update FlashcardsList with selection
- Test all source types

### Week 4: Deck Management + Polish
- DeckManager page
- DeckView with tabs
- Command panel integration
- Tag filtering UI
- Keyboard shortcuts

### Week 5: Advanced Features (Optional)
- Obsidian sync
- Anki export
- Custom prompt editor
- Stats dashboard
- Mobile optimizations

---

**Ready to start with Phase 1 (Architecture Refactor)?**

This builds the right foundation so you won't need to refactor later. Each phase is tested and working before moving to the next.
