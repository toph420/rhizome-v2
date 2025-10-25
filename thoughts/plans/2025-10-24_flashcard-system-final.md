# Flashcard System: Final Implementation Plan

**Philosophy**: Build on existing architecture, add UI and advanced features incrementally.

**Based on**: Dev conversation decisions + current implementation (Phases 1-5)

---

## What You Already Have ✅

### ✅ Correct Architecture (No Refactoring Needed!)

**4-Component Structure** (matches dev recommendations):
```typescript
Card: {
  type, question, answer, content, clozeIndex, clozeCount,
  srs: { interval, easeFactor, nextReview, ... } | null,  // ✅ Embedded
  deckId, deckAddedAt  // ✅ Embedded
}
Content: { tags }
Temporal: { createdAt, updatedAt }
ChunkRef: { documentId, chunkIds, connectionId, annotationId, ... }
```

**Status Derivation**: `Card.srs === null` → draft, `!== null` → approved ✅

**Database Tables**:
- ✅ `decks` (060_create_decks.sql)
- ✅ `flashcards_cache` (061_create_flashcards_cache.sql) - Minimal cache, metadata only
- ✅ `study_sessions` (063_study_sessions.sql)

**Backend**:
- ✅ FlashcardOperations wrapper (4 components)
- ✅ Server actions (create, update, approve, review, delete)
- ✅ Study session actions
- ✅ AI generation handler with Gemini
- ✅ Job schemas with Zod validation

**Frontend**:
- ✅ FlashcardCard component (feature-rich)
- ✅ Study interface at `/flashcards/study`

---

## What's Missing (Build This)

### Missing Backend
1. ❌ **Storage helpers** - Individual file per card (`card_{id}.json`)
2. ❌ **Prompt templates** - Table + CRUD + 4 defaults
3. ❌ **Multi-source loaders** - Selection, annotation, connection
4. ❌ **Batch operations** - Approve all, delete all, add tags, move to deck
5. ❌ **Cloze support** - Generate multiple cards from `{{c1::}}` deletions
6. ❌ **System deck helpers** - Inbox/Archive

### Missing Frontend
1. ❌ **GenerationPanel** - Sidebar tab to trigger generation
2. ❌ **FlashcardsList** - Browse/filter cards for document
3. ❌ **Batch operations UI** - Select multiple, approve all
4. ❌ **DeckPicker** - Dropdown component
5. ❌ **PromptTemplateSelector** - Dropdown with defaults

---

## Implementation Philosophy

**Build the complete backend architecture NOW, add UI incrementally.**

Why this approach:
- ✅ **Backend architecture** affects everything → Build right from start
- ✅ **UI components** are additive → Can add anytime without refactoring
- ✅ **Future-proof** → Support all features without breaking changes

---

## Implementation Plan

### Phase 1: Complete Backend Architecture (Week 1-2)

Build ALL backend infrastructure now:
- ✅ Storage helpers (file-over-app foundation)
- ✅ Prompt templates (extensible system)
- ✅ **Multi-source generation** (all 5 types)
- ✅ **Cloze support** (parser + multiple card generation)
- ✅ **Batch operations** (approve/delete/tag/move)
- ✅ **System deck helpers** (Inbox/Archive)

Result: Complete, extensible backend that never needs refactoring

---

### Phase 1 Implementation

#### 1.1: Storage Helpers

**File**: `src/lib/flashcards/storage.ts` (NEW)

**Pattern**: Exactly like `src/lib/sparks/storage.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

/**
 * Storage JSON schema (matches 4-component structure)
 */
export const FlashcardStorageSchema = z.object({
  entityId: z.string().uuid(),
  userId: z.string().uuid(),
  card: z.object({
    type: z.enum(['basic', 'cloze']),
    question: z.string(),
    answer: z.string(),
    content: z.string().optional(),
    clozeIndex: z.number().optional(),
    clozeCount: z.number().optional(),
    srs: z.object({
      interval: z.number(),
      easeFactor: z.number(),
      nextReview: z.string(),
      lastReviewed: z.string().nullable(),
      reviewsCount: z.number(),
      lapsesCount: z.number(),
      isMature: z.boolean(),
    }).nullable(),
    deckId: z.string().uuid(),
    deckAddedAt: z.string(),
  }),
  content: z.object({
    tags: z.array(z.string()),
  }),
  temporal: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  chunkRef: z.object({
    documentId: z.string().uuid(),
    document_id: z.string().uuid(),
    chunkId: z.string().uuid().nullable(),
    chunk_id: z.string().uuid().nullable(),
    chunkIds: z.array(z.string().uuid()),
    connectionId: z.string().uuid().optional(),
    annotationId: z.string().uuid().optional(),
    generationJobId: z.string().uuid().optional(),
  }),
})

export type FlashcardStorage = z.infer<typeof FlashcardStorageSchema>

/**
 * Upload flashcard to Storage
 * Path: {userId}/flashcards/card_{entityId}.json
 */
export async function uploadFlashcardToStorage(
  userId: string,
  entityId: string,
  data: FlashcardStorage
): Promise<string> {
  const supabase = createAdminClient()
  const path = `${userId}/flashcards/card_${entityId}.json`

  const jsonBlob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  })

  const { error } = await supabase.storage
    .from('documents')
    .upload(path, jsonBlob, {
      contentType: 'application/json',
      upsert: true
    })

  if (error) {
    throw new Error(`Failed to upload flashcard to Storage: ${error.message}`)
  }

  console.log(`[Flashcards] ✓ Uploaded to Storage: ${path}`)
  return path
}

/**
 * Download flashcard from Storage
 */
export async function downloadFlashcardFromStorage(
  userId: string,
  entityId: string
): Promise<FlashcardStorage> {
  const supabase = createAdminClient()
  const path = `${userId}/flashcards/card_${entityId}.json`

  const { data: signedUrl } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 3600)

  if (!signedUrl?.signedUrl) {
    throw new Error(`Failed to create signed URL for ${path}`)
  }

  const response = await fetch(signedUrl.signedUrl)
  if (!response.ok) {
    throw new Error(`Storage read failed for ${path}: ${response.statusText}`)
  }

  const json = await response.json()
  console.log(`[Flashcards] ✓ Read from Storage: ${path}`)

  return FlashcardStorageSchema.parse(json)
}

/**
 * List all flashcard files for user
 */
export async function listUserFlashcards(userId: string): Promise<string[]> {
  const supabase = createAdminClient()

  const { data: files, error } = await supabase.storage
    .from('documents')
    .list(`${userId}/flashcards`, {
      limit: 10000,
      offset: 0
    })

  if (error) {
    throw new Error(`Failed to list flashcards: ${error.message}`)
  }

  return files
    .filter(f => f.name.startsWith('card_') && f.name.endsWith('.json'))
    .map(f => f.name.replace('card_', '').replace('.json', ''))
}

/**
 * Delete flashcard from Storage
 */
export async function deleteFlashcardFromStorage(
  userId: string,
  entityId: string
): Promise<void> {
  const supabase = createAdminClient()
  const path = `${userId}/flashcards/card_${entityId}.json`

  const { error } = await supabase.storage
    .from('documents')
    .remove([path])

  if (error) {
    throw new Error(`Failed to delete from Storage: ${error.message}`)
  }

  console.log(`[Flashcards] ✓ Deleted from Storage: ${path}`)
}

/**
 * Verify storage integrity
 */
export async function verifyFlashcardsIntegrity(
  userId: string
): Promise<{ total: number; valid: number; invalid: string[] }> {
  const entityIds = await listUserFlashcards(userId)
  let valid = 0
  const invalid: string[] = []

  for (const id of entityIds) {
    try {
      await downloadFlashcardFromStorage(userId, id)
      valid++
    } catch (error) {
      invalid.push(id)
    }
  }

  return { total: entityIds.length, valid, invalid }
}
```

**Changes to Existing Actions**:

Update `src/app/actions/flashcards.ts` to use storage helpers:

```typescript
// After creating entity
const flashcardData: FlashcardStorage = {
  entityId,
  userId: user.id,
  card: { /* Card component data */ },
  content: { tags: validated.tags || [] },
  temporal: { createdAt: ..., updatedAt: ... },
  chunkRef: { /* ChunkRef data */ }
}

// Async upload (fire-and-forget)
uploadFlashcardToStorage(user.id, entityId, flashcardData).catch(error => {
  console.error(`[Flashcards] Storage upload failed:`, error)
  // Continue - Storage can be rebuilt from ECS if needed
})
```

---

#### 1.2: Prompt Templates Migration

**File**: `supabase/migrations/069_prompt_templates.sql` (NEW)

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

-- Trigger to create default prompts for new users
CREATE OR REPLACE FUNCTION create_default_prompts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO prompt_templates (user_id, name, description, template, variables, is_system, is_default) VALUES
    (NEW.id, 'Comprehensive Concepts', 'Key definitions, core ideas, and concept relationships',
     E'Generate {{count}} flashcards covering the most important concepts in this text.\n\nFocus on:\n- Key definitions and terminology\n- Core ideas and principles\n- Relationships between concepts\n\nFor each card:\n- Question should be clear and specific\n- Answer should be concise but complete (1-3 sentences)\n- Include keywords from the source text for chunk matching\n\nText: {{content}}\n\nChunk metadata: {{chunks}}\n\nCustom instructions: {{custom}}\n\nReturn ONLY a JSON array of flashcards.',
     ARRAY['count', 'content', 'chunks', 'custom'], TRUE, TRUE),

    (NEW.id, 'Deep Details', 'Specific claims, evidence, and precise terminology',
     E'Generate {{count}} flashcards focusing on important details and specifics.\n\nFocus on:\n- Specific claims and arguments\n- Supporting evidence and examples\n- Precise terminology\n\nFor each card:\n- Test recall of specific information\n- Avoid overly broad questions\n- Link to exact source chunks\n\nText: {{content}}\n\nReturn ONLY a JSON array of flashcards.',
     ARRAY['count', 'content', 'chunks', 'custom'], TRUE, FALSE),

    (NEW.id, 'Connections & Synthesis', 'How ideas connect, comparisons, and applications',
     E'Generate {{count}} flashcards that synthesize concepts across this text.\n\nFocus on:\n- How ideas connect to each other\n- Comparisons and contrasts\n- Applications and implications\n\nFor each card:\n- Test understanding, not just recall\n- Encourage cross-referencing\n- Link to multiple relevant chunks when possible\n\nText: {{content}}\n\nReturn ONLY a JSON array of flashcards.',
     ARRAY['count', 'content', 'chunks', 'custom'], TRUE, FALSE),

    (NEW.id, 'Contradiction Focus', 'Conceptual tensions, opposing viewpoints, and paradoxes',
     E'Generate {{count}} flashcards highlighting conceptual tensions in this text.\n\nFocus on:\n- Opposing viewpoints\n- Contradictions and paradoxes\n- Debates and disagreements\n\nFor each card:\n- Present both sides clearly\n- Ask which perspective is supported\n- Link to contrasting chunks\n\nText: {{content}}\n\nReturn ONLY a JSON array of flashcards.',
     ARRAY['count', 'content', 'chunks', 'custom'], TRUE, FALSE);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_created_prompts
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_prompts();

-- Create prompts for existing users
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id FROM auth.users LOOP
    INSERT INTO prompt_templates (user_id, name, description, template, variables, is_system, is_default)
    VALUES
      (user_record.id, 'Comprehensive Concepts', 'Key definitions, core ideas, and concept relationships',
       E'Generate {{count}} flashcards covering the most important concepts in this text.\n\nFocus on:\n- Key definitions and terminology\n- Core ideas and principles\n- Relationships between concepts\n\nFor each card:\n- Question should be clear and specific\n- Answer should be concise but complete (1-3 sentences)\n- Include keywords from the source text for chunk matching\n\nText: {{content}}\n\nChunk metadata: {{chunks}}\n\nCustom instructions: {{custom}}\n\nReturn ONLY a JSON array of flashcards.',
       ARRAY['count', 'content', 'chunks', 'custom'], TRUE, TRUE)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
```

---

#### 1.3: Prompt CRUD Actions

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
    .order('is_default', { ascending: false })
    .order('usage_count', { ascending: false })

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
        ...validated,
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
 * Delete prompt template (custom only)
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
      .eq('is_system', false)

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
```

---

#### 1.4: Template Rendering

**File**: `worker/lib/template-renderer.ts` (NEW)

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

#### 1.5: Update Generation Handler to Use Prompts

**File**: `worker/handlers/generate-flashcards.ts`

```typescript
interface GenerateFlashcardsInput {
  sourceType: 'document' | 'chunks'
  sourceIds: string[]
  promptTemplateId: string  // ✅ NEW
  cardCount: number
  customInstructions?: string  // ✅ NEW
  userId: string
  deckId: string
}

// In handler...
const { promptTemplateId, customInstructions, ... } = job.input_data

// Load prompt template
const { data: template } = await supabase
  .from('prompt_templates')
  .select('*')
  .eq('id', promptTemplateId)
  .single()

if (!template) throw new Error('Prompt template not found')

// Render template with variables
const renderedPrompt = renderTemplate(template.template, {
  count: cardCount.toString(),
  content: sourceContent.slice(0, 50000),
  chunks: JSON.stringify(chunkContext.map(c => ({
    id: c.id,
    preview: c.content.slice(0, 200)
  }))),
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

// Use rendered prompt
const result = await model.generateContent(renderedPrompt)
```

---

#### Phase 1 Success Criteria

**Automated**:
- [ ] Migration runs without errors
- [ ] 4 default prompts created for user
- [ ] Storage helpers have proper types
- [ ] Template renderer works

**Manual**:
- [ ] Check DB → prompt_templates has 4 rows
- [ ] Call getPromptTemplates() → returns 4 defaults
- [ ] Upload flashcard to storage → file appears in Storage
- [ ] Download flashcard → validates with schema
- [ ] Render template → variables substituted correctly

**Estimated time**: 1 day

---

#### 1.6: Multi-Source Generation (Architecture)

**File**: `worker/lib/source-loaders.ts` (NEW)

Build source loader abstraction for all 5 types now:

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
 * Document source loader (CURRENT)
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
 * Chunks source loader (CURRENT)
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
 * Selection source loader (NEW - BUILD NOW)
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

    return { content: this.selection.text, chunks: chunks || [] }
  }
}

/**
 * Annotation source loader (NEW - BUILD NOW)
 */
export class AnnotationSourceLoader implements SourceLoader {
  constructor(private annotationIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    const { data: entities } = await supabase
      .from('entities')
      .select(`id, components!inner(component_type, data)`)
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

    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, embedding')
      .in('id', chunkIds)
      .order('chunk_index')

    return { content, chunks: chunks || [] }
  }
}

/**
 * Connection source loader (NEW - BUILD NOW)
 */
export class ConnectionSourceLoader implements SourceLoader {
  constructor(private connectionIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    const { data: connections } = await supabase
      .from('connections')
      .select(`id, source_chunk_id, target_chunk_id, connection_type, explanation`)
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

    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, embedding')
      .in('id', Array.from(chunkIds))
      .order('chunk_index')

    for (const chunk of chunks || []) {
      content += chunk.content + '\n\n'
    }

    return { content, chunks: chunks || [] }
  }
}

/**
 * Factory function (BUILD NOW)
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

**Update Generation Handler**:

```typescript
// worker/handlers/generate-flashcards.ts

import { createSourceLoader } from '../lib/source-loaders.js'

interface GenerateFlashcardsInput {
  sourceType: 'document' | 'chunks' | 'selection' | 'annotation' | 'connection'  // ✅ ALL 5
  sourceIds: string[]
  selectionData?: any  // ✅ For selection type
  // ... rest
}

// In handler...
const loader = createSourceLoader(sourceType, sourceIds, selectionData)
const { content: sourceContent, chunks: chunkContext } = await loader.load(supabase, userId)
```

**Why Build This Now**:
- ✅ Clean abstraction, easy to test
- ✅ UI can add selection/annotation/connection sources without backend changes
- ✅ Each loader is independent, no coupling

---

#### 1.7: Cloze Support (Architecture)

**File**: `worker/lib/cloze-parser.ts` (NEW)

```typescript
/**
 * Extract cloze deletions from content
 * Example: "The {{c1::rhizome}} opposes {{c2::hierarchy}}"
 * Returns: [
 *   { index: 1, text: 'rhizome', hint: null },
 *   { index: 2, text: 'hierarchy', hint: null }
 * ]
 */
export function extractClozeDeletions(content: string): Array<{
  index: number
  text: string
  hint: string | null
}> {
  const pattern = /\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g
  const deletions: Map<number, { text: string; hint: string | null }> = new Map()

  let match
  while ((match = pattern.exec(content)) !== null) {
    const index = parseInt(match[1], 10)
    const text = match[2]
    const hint = match[3] || null

    deletions.set(index, { text, hint })
  }

  return Array.from(deletions.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, data]) => ({ index, ...data }))
}

/**
 * Render cloze question for specific deletion
 * Example: renderClozeQuestion("The {{c1::rhizome}} opposes {{c2::hierarchy}}", 1)
 * Returns: "The [...] opposes hierarchy"
 */
export function renderClozeQuestion(content: string, targetIndex: number): string {
  let rendered = content

  // Replace all cloze markers
  const pattern = /\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g
  rendered = rendered.replace(pattern, (match, index, text, hint) => {
    const idx = parseInt(index, 10)
    if (idx === targetIndex) {
      return hint ? `[...${hint}]` : '[...]'
    } else {
      return text  // Show other deletions as plain text
    }
  })

  return rendered
}

/**
 * Check if content contains cloze deletions
 */
export function isClozeContent(content: string): boolean {
  return /\{\{c\d+::[^}]+\}\}/.test(content)
}
```

**Update Generation Handler to Support Cloze**:

```typescript
// worker/handlers/generate-flashcards.ts

import { extractClozeDeletions, renderClozeQuestion, isClozeContent } from '../lib/cloze-parser.js'

// After AI generates cards...
for (let i = 0; i < generatedCards.length; i++) {
  const card = generatedCards[i]

  // Check if card is cloze type
  if (card.type === 'cloze' && card.content && isClozeContent(card.content)) {
    // Extract deletions
    const deletions = extractClozeDeletions(card.content)

    // Generate one card per deletion (Anki-compatible)
    for (const deletion of deletions) {
      const question = renderClozeQuestion(card.content, deletion.index)

      // Create ECS entity
      const { data: entity } = await supabase
        .from('entities')
        .insert({ user_id: userId, entity_type: 'flashcard' })
        .select()
        .single()

      if (!entity) continue

      // Add Card component with cloze data
      await supabase.from('components').insert({
        entity_id: entity.id,
        user_id: userId,
        component_type: 'Card',
        data: {
          type: 'cloze',
          question: question,
          answer: deletion.text,
          content: card.content,  // Original with all {{c1::}} markers
          clozeIndex: deletion.index,
          clozeCount: deletions.length,
          srs: null,  // Draft
          deckId: deckId,
          deckAddedAt: new Date().toISOString(),
        }
      })

      // ... add other components (Content, Temporal, ChunkRef)

      flashcardIds.push(entity.id)
    }
  } else {
    // Regular basic card (existing logic)
    // ...
  }
}
```

**Why Build This Now**:
- ✅ Card component already supports clozeIndex/clozeCount
- ✅ Parser is pure function, easy to test
- ✅ UI doesn't need to change, just works when AI generates cloze cards

---

#### 1.8: Batch Operations (Server Actions)

**File**: `src/app/actions/flashcards.ts`

Add batch operations now (they're just server actions):

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

    // Rebuild cache
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
 * Batch add tags
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

      const cardComp = entity.components?.find(c => c.component_type === 'Card')
      if (!cardComp) continue

      await ecs.updateComponent(
        cardComp.id,
        { ...cardComp.data, deckId, deckAddedAt: new Date().toISOString() },
        user.id
      )
    }

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

**Why Build This Now**:
- ✅ Simple server actions, no architectural impact
- ✅ UI can use them when ready (batch operations toolbar)
- ✅ No refactoring needed later

---

#### 1.9: System Deck Helpers

**File**: `src/lib/decks/system-decks.ts` (NEW)

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export const SYSTEM_DECKS = {
  INBOX: 'Inbox',
  ARCHIVE: 'Archive',
} as const

/**
 * Get system deck by name
 */
export async function getSystemDeck(
  userId: string,
  deckName: typeof SYSTEM_DECKS[keyof typeof SYSTEM_DECKS]
) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', userId)
    .eq('name', deckName)
    .eq('is_system', true)
    .single()

  if (error) throw error

  return data
}

/**
 * Get Inbox deck
 */
export async function getInboxDeck(userId: string) {
  return getSystemDeck(userId, SYSTEM_DECKS.INBOX)
}

/**
 * Get Archive deck
 */
export async function getArchiveDeck(userId: string) {
  return getSystemDeck(userId, SYSTEM_DECKS.ARCHIVE)
}

/**
 * Archive flashcard (move to Archive deck)
 */
export async function archiveFlashcard(entityId: string, userId: string) {
  const archiveDeck = await getArchiveDeck(userId)
  // Update Card component's deckId to Archive
  // (Implementation in FlashcardOperations.archive() method)
}
```

**Add to FlashcardOperations**:

```typescript
// src/lib/ecs/flashcards.ts

async archive(entityId: string): Promise<void> {
  const archiveDeck = await getArchiveDeck(this.userId)

  const entity = await this.ecs.getEntity(entityId, this.userId)
  if (!entity) throw new Error('Card not found')

  const cardComp = entity.components?.find(c => c.component_type === 'Card')
  if (!cardComp) throw new Error('Invalid card entity')

  await this.ecs.updateComponent(
    cardComp.id,
    { ...cardComp.data, deckId: archiveDeck.id },
    this.userId
  )
}
```

**Why Build This Now**:
- ✅ Simple helpers, no architectural complexity
- ✅ Archive functionality available when needed
- ✅ Clean abstraction for system decks

---

#### Phase 1 Success Criteria

**Automated**:
- [ ] All TypeScript compiles
- [ ] Storage helpers validate with Zod
- [ ] Cloze parser tests pass
- [ ] Source loaders return correct structure
- [ ] Batch operations have proper types

**Manual**:
- [ ] Prompt templates migration creates 4 defaults
- [ ] Upload flashcard → file in Storage
- [ ] Cloze parser extracts deletions correctly
- [ ] Source loaders work (test each type)
- [ ] Batch approve 3 cards → all get SRS
- [ ] Archive card → moves to Archive deck

**Estimated time**: 2-3 days

---

### Phase 2: Core UI (MVP) - Week 2-3

#### 2.1: GenerationPanel Component

**File**: `src/components/flashcards/GenerationPanel.tsx` (NEW)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Label } from '@/components/rhizome/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/rhizome/select'
import { Slider } from '@/components/rhizome/slider'
import { Textarea } from '@/components/rhizome/textarea'
import { generateFlashcards } from '@/app/actions/flashcards'
import { getPromptTemplates } from '@/app/actions/prompts'
import { getDecksWithStats } from '@/app/actions/decks'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

interface GenerationPanelProps {
  documentId: string
}

export function GenerationPanel({ documentId }: GenerationPanelProps) {
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
  }, [prompts, promptId])

  useEffect(() => {
    if (decks && !deckId) {
      const inbox = decks.find(d => d.name === 'Inbox' && d.is_system)
      if (inbox) setDeckId(inbox.id)
    }
  }, [decks, deckId])

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
        toast.success(`Generating ${count} cards...`)
        // Job appears in ProcessingDock automatically
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
          <Label>Source</Label>
          <Select value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="document">Full Document</SelectItem>
              <SelectItem value="chunks">Visible Chunks</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Prompt template */}
        <div>
          <Label>Prompt Template</Label>
          <Select value={promptId} onValueChange={setPromptId}>
            <SelectTrigger>
              <SelectValue placeholder="Select prompt..." />
            </SelectTrigger>
            <SelectContent>
              {prompts?.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} {p.is_default && '(default)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Card count */}
        <div>
          <Label>Card Count: {count}</Label>
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
          <Label>Add to Deck</Label>
          <Select value={deckId} onValueChange={setDeckId}>
            <SelectTrigger>
              <SelectValue placeholder="Select deck..." />
            </SelectTrigger>
            <SelectContent>
              {decks?.map(d => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom instructions */}
        <div>
          <Label>Custom Instructions (optional)</Label>
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

---

#### 2.2: Update FlashcardsTab

**File**: `src/components/sidebar/FlashcardsTab.tsx`

```typescript
'use client'

import { GenerationPanel } from '@/components/flashcards/GenerationPanel'
import { FlashcardsList } from '@/components/flashcards/FlashcardsList'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'

export function FlashcardsTab({ documentId }: { documentId: string }) {
  return (
    <Tabs defaultValue="generate" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="generate" className="flex-1">Generate</TabsTrigger>
        <TabsTrigger value="cards" className="flex-1">Cards</TabsTrigger>
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

**File**: `src/components/flashcards/FlashcardsList.tsx` (NEW)

```typescript
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { FlashcardCard } from '@/components/rhizome/flashcard-card'
import { Button } from '@/components/rhizome/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/rhizome/select'
import { getFlashcardsByDocument, getDueFlashcards } from '@/app/actions/flashcards'

export function FlashcardsList({ documentId }: { documentId: string }) {
  const [filter, setFilter] = useState<'all' | 'draft' | 'approved'>('all')
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const router = useRouter()

  // Load cards for this document
  const { data: cards, refetch } = useQuery({
    queryKey: ['flashcards', documentId, filter],
    queryFn: async () => {
      const result = await getFlashcardsByDocument(documentId, filter === 'all' ? undefined : filter)
      return result
    }
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
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cards</SelectItem>
            <SelectItem value="draft">Drafts</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
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

      {/* Cards list */}
      <div className="space-y-2">
        {cards.map(card => (
          <FlashcardCard
            key={card.entity_id}
            flashcard={card}
            isActive={activeCardId === card.entity_id}
            onClick={() => setActiveCardId(card.entity_id)}
            onApproved={() => refetch()}
            onDeleted={() => refetch()}
          />
        ))}
      </div>
    </div>
  )
}
```

**New Server Action**:

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
    .contains('document_ids', [documentId])
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

#### Phase 2 Success Criteria

**Manual Testing**:
- [ ] Open reader → FlashcardsTab shows "Generate" and "Cards" tabs
- [ ] "Generate" tab → Shows form with prompts, deck selector, count slider
- [ ] Select "Comprehensive Concepts" prompt, count=5, click Generate
- [ ] ProcessingDock shows job progress
- [ ] Switch to "Cards" tab → See generated cards (draft status)
- [ ] Click card → FlashcardCard shows with edit/approve buttons
- [ ] Edit question → Updates successfully
- [ ] Click "Approve" → Adds SRS data, status changes to approved
- [ ] Click "Study" button → Redirects to study mode
- [ ] Study interface → Review card → FSRS schedule updates

**Estimated time**: 2-3 days

---

### Phase 3: Extended UI (Optional - As Needed)

These are **purely additive** UI components with no architectural impact:

#### 3.1: Deck Management Page
- Full-page deck browser
- Nested deck display
- Deck stats (due count, retention rate)
- Create/edit/delete decks

#### 3.2: Command Panel Integration
- Cmd+K integration
- "Study Due Cards" command
- "Generate from Document" command
- "Search Cards..." command

#### 3.3: Advanced UI Features
- Tag filtering in study mode
- Batch operations toolbar (select multiple cards)
- Prompt template editor
- Stats dashboard

**Why These Are Optional**:
- ✅ Backend supports them already (Phase 1)
- ✅ Can build anytime without architectural changes
- ✅ Current UI (GenerationPanel + FlashcardsList + Study) is fully functional

---

### Summary: What We're Building

**Week 1-2** (Phase 1 - Complete Backend):
- ✅ Storage helpers (individual JSON files)
- ✅ Prompt templates (table + migration + 4 defaults)
- ✅ **Multi-source generation** (all 5 types: document, chunks, selection, annotation, connection)
- ✅ **Cloze support** (parser + multiple card generation)
- ✅ **Batch operations** (approve all, delete all, add tags, move to deck)
- ✅ System deck helpers (Inbox, Archive)
- ✅ Template rendering in worker

**Week 2-3** (Phase 2 - Core UI):
- ✅ GenerationPanel UI
- ✅ FlashcardsList UI
- ✅ Update FlashcardsTab
- ✅ getFlashcardsByDocument action
- ✅ Test full workflow: generate → review → approve → study

**Result**: Complete, extensible system!

**What You Can Add Later** (No Refactoring):
- ✅ Deck management page (UI only)
- ✅ Command panel integration (UI only)
- ✅ Obsidian sync (new job handler)
- ✅ Anki export (new job handler)
- ✅ Advanced stats dashboard (UI only)

**Everything else is built in Phase 1-2!**

---

## Why This Approach Works

### Built in Phase 1 (Backend Foundation):
- **Multi-source generation** - Clean abstraction, all 5 types supported
- **Cloze support** - Parser + generation logic complete
- **Batch operations** - Server actions ready for UI
- **Storage helpers** - File-over-app foundation
- **Prompt system** - Extensible, 4 defaults

### Built in Phase 2 (Core UI):
- **GenerationPanel** - Trigger generation with all options
- **FlashcardsList** - Browse, filter, approve
- **Study interface** - Already complete!

### Can Add Anytime (No Architecture Impact):
- Deck management page
- Command panel shortcuts
- Obsidian sync job handler
- Anki export job handler
- Stats dashboard

**The architecture is complete after Phase 1-2. Everything else is just "more UI" or "more job handlers".**

---

**Ready to start Phase 1 (Complete Backend)?**
