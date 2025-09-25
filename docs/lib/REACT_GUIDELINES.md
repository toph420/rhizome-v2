# REACT_GUIDELINES for Rhizome Next.js App

## Core Principles

1. **Server Components by Default** - Every component is a Server Component unless it needs interactivity
2. **Server Actions for Mutations** - Use 'use server' for all data mutations
3. **No Modals Ever** - Use docks, panels, and overlays instead
4. **ECS for Everything** - All data operations go through the Entity Component System
5. **Ship Working Code** - Type safety is good, shipping is better

## Server Components (Default)

No directive needed. This is where most of your components live.

```typescript
// app/page.tsx - Library page
import { supabaseAdmin } from '@/lib/supabase/admin'

export default async function LibraryPage() {
  // Direct database access on server
  const { data: documents } = await supabaseAdmin
    .from('documents')
    .select('id, title, storage_path, processing_status')
    .eq('user_id', 'dev-user-123')
    .order('created_at', { ascending: false })
  
  return (
    <div className="container">
      <DocumentGrid documents={documents} />
      <UploadZone /> {/* Client component for drag-drop */}
    </div>
  )
}

// app/read/[id]/page.tsx - Reader page
export default async function ReaderPage({ params }) {
  // Get document metadata from DB
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('storage_path, title')
    .eq('id', params.id)
    .single()
  
  // Generate signed URL for markdown file
  const { data: { signedUrl } } = await supabaseAdmin.storage
    .from('documents')
    .createSignedUrl(`${doc.storage_path}/content.md`, 3600)
  
  // Get chunks from database (for performance)
  const { data: chunks } = await supabaseAdmin
    .from('chunks')
    .select('*')
    .eq('document_id', params.id)
    .order('chunk_index')
  
  return (
    <div className="grid grid-cols-[1fr,400px]">
      <DocumentReader markdownUrl={signedUrl} chunks={chunks} />
      <RightPanel documentId={params.id} />
    </div>
  )
}
```

## Client Components ('use client')

Add ONLY when you need:
- Event handlers (onClick, onChange, onDrop)
- React hooks (useState, useEffect)
- Browser APIs (window.getSelection, document)
- Real-time subscriptions

```typescript
// components/layout/processing-dock.tsx
'use client' // Needs useState for collapse

import { useState } from 'react'
import { motion } from 'framer-motion'

export function ProcessingDock({ jobs }) {
  const [collapsed, setCollapsed] = useState(false)
  
  return (
    <motion.div 
      className="fixed bottom-0 left-0 right-0"
      animate={{ height: collapsed ? 40 : 200 }}
    >
      <button onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <ChevronUp /> : <ChevronDown />}
      </button>
      {!collapsed && <JobsList jobs={jobs} />}
    </motion.div>
  )
}

// components/reader/document-reader.tsx
'use client' // Needs selection API and scroll handling

export function DocumentReader({ markdownUrl, chunks }) {
  const [selectedText, setSelectedText] = useState(null)
  const { data: markdown } = useQuery({
    queryKey: ['markdown', markdownUrl],
    queryFn: () => fetch(markdownUrl).then(r => r.text()),
    staleTime: Infinity // Markdown never changes
  })
  
  const handleTextSelect = () => {
    const selection = window.getSelection()
    if (selection?.toString()) {
      setSelectedText({
        text: selection.toString(),
        chunkId: findChunkForSelection(selection)
      })
    }
  }
  
  return (
    <article onMouseUp={handleTextSelect}>
      <MarkdownRenderer content={markdown} />
      {selectedText && <QuickCaptureBar {...selectedText} />}
    </article>
  )
}
```

## Server Actions ('use server')

All mutations go through Server Actions, using ECS pattern.

```typescript
// app/actions/documents.ts
'use server'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function uploadDocument(formData: FormData) {
  const file = formData.get('file') as File
  const userId = 'dev-user-123' // MVP hardcode
  const documentId = crypto.randomUUID()
  const storagePath = `${userId}/${documentId}`
  
  // 1. Upload original to storage
  await supabaseAdmin.storage
    .from('documents')
    .upload(`${storagePath}/source.pdf`, file)
  
  // 2. Create document record (metadata only)
  await supabaseAdmin
    .from('documents')
    .insert({
      id: documentId,
      user_id: userId,
      title: file.name,
      storage_path: storagePath,
      processing_status: 'pending'
    })
  
  // 3. Trigger processing (async)
  await processDocument(documentId) // Queues the job
  
  revalidatePath('/')
  return { success: true, id: documentId }
}

// app/actions/flashcards.ts
'use server'

import { ecs } from '@/lib/ecs/simple-ecs'

export async function createFlashcard(formData: FormData) {
  const data = {
    question: formData.get('question') as string,
    answer: formData.get('answer') as string,
    chunkId: formData.get('chunkId') as string
  }
  
  // Use ECS for entity creation
  const entityId = await ecs.createEntity('dev-user-123', {
    flashcard: { question: data.question, answer: data.answer },
    study: { due: new Date(), ease: 2.5 },
    source: { chunk_id: data.chunkId }
  })
  
  return { success: true, id: entityId }
}

export async function createAnnotation(data: {
  text: string
  chunkId: string
  range: any
}) {
  // ECS handles all entity types the same way
  const entityId = await ecs.createEntity('dev-user-123', {
    annotation: { text: data.text, range: data.range },
    source: { chunk_id: data.chunkId }
  })
  
  return { success: true, id: entityId }
}
```

## Storage Pattern Rules

```typescript
// STORAGE: Large, immutable files
// - Original PDFs
// - Generated markdown
// - Export bundles

// DATABASE: Queryable, mutable data
// - Chunks (for search)
// - Embeddings (for similarity)
// - All ECS entities/components

// Example: Loading a document
async function loadDocument(id: string) {
  // Metadata from DB
  const doc = await supabaseAdmin
    .from('documents')
    .select('storage_path')
  
  // Content from Storage
  const markdownUrl = await getSignedUrl(`${doc.storage_path}/content.md`)
  
  // Chunks from DB (for performance)
  const chunks = await supabaseAdmin
    .from('chunks')
    .select('*')
  
  return { markdownUrl, chunks }
}
```

## Component Decision Tree

```
Does it need user interaction? → 'use client'
Does it need browser APIs? → 'use client'
Does it need React hooks? → 'use client'
Does it just fetch and display? → Server Component
Does it only render props? → Server Component
```

## Data Operation Decision Tree

```
Reading documents? → Server Component + Storage
Reading chunks/entities? → Server Component + Database
Creating/updating anything? → Server Action + ECS
Need real-time updates? → Client Component + Supabase subscription
```

## No Modals Pattern

```typescript
// ❌ NEVER use modals
<Modal isOpen={isOpen}>
  <CreateFlashcard />
</Modal>

// ✅ Use persistent UI
<ProcessingDock />        // Bottom dock
<RightPanel />           // Side panel
<QuickCaptureBar />      // Floating bar
<CommandPalette />       // ⌘K overlay
```

## ECS Pattern for All Entities

```typescript
// ❌ DON'T create type-specific functions
async function createFlashcard(data) { /* specific logic */ }
async function createAnnotation(data) { /* different logic */ }

// ✅ DO use unified ECS
await ecs.createEntity(userId, {
  flashcard: data,       // Makes it a flashcard
  study: studyData,      // Makes it studyable
  source: sourceData     // Links to document
})

await ecs.createEntity(userId, {
  annotation: data,      // Makes it an annotation
  source: sourceData     // Same pattern, different components
})
```

## Forms with Server Actions

```typescript
// Simple form - no useState needed!
export function FlashcardForm({ chunkId }) {
  return (
    <form action={createFlashcard} className="space-y-4">
      <input name="question" placeholder="Question" required />
      <textarea name="answer" placeholder="Answer" required />
      <input type="hidden" name="chunkId" value={chunkId} />
      <button type="submit">Create Card</button>
    </form>
  )
}

// With pending state (React 19 feature)
import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button disabled={pending}>
      {pending ? 'Creating...' : 'Create Card'}
    </button>
  )
}
```

## Loading & Error Boundaries

```typescript
// app/read/[id]/page.tsx
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

export default function ReaderPage({ params }) {
  return (
    <ErrorBoundary fallback={<div>Failed to load document</div>}>
      <Suspense fallback={<ReaderSkeleton />}>
        <ReaderContent id={params.id} />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## TypeScript for MVP

Don't let types block you. Ship first, perfect types later.

```typescript
// Good enough for MVP
type Document = {
  id: string
  title: string
  storage_path: string
  processing_status: string
}

// Type assertion when needed
const doc = data as Document

// Use 'any' sparingly when truly blocked
function processComplexGeminiResponse(data: any) {
  // TODO: Add proper types after it works
  return data.chunks
}
```

## Testing Strategy for MVP

```typescript
// Focus on critical paths only
describe('Document Upload', () => {
  it('uploads PDF and creates record', async () => {
    // Test the happy path
  })
})

// Skip edge cases for MVP
// Skip component unit tests for MVP  
// Skip E2E for MVP
// Add comprehensive tests after core features work
```

## What NOT to Do

```typescript
// ❌ DON'T use API routes for internal operations
app/api/flashcards/route.ts

// ✅ DO use Server Actions
app/actions/flashcards.ts

// ❌ DON'T fetch in useEffect
useEffect(() => {
  fetch('/api/documents')
}, [])

// ✅ DO fetch in Server Components
const documents = await supabaseAdmin.from('documents').select()

// ❌ DON'T store markdown in database
markdown_content: TEXT // 500KB in database

// ✅ DO store markdown in Storage
${storagePath}/content.md // File storage

// ❌ DON'T create modals
<Dialog open={open} />

// ✅ DO use docks and panels
<ProcessingDock />
```

## Quick Reference

### Server Components (Most Components)
- Pages
- Layouts
- Document cards
- Static displays
- Data fetching components

### Client Components (Only When Needed)
- ProcessingDock (collapse state)
- DocumentReader (text selection)
- UploadZone (drag and drop)
- QuickCaptureBar (form input)
- StudyCard (reveal state)

### Server Actions (All Mutations)
- uploadDocument
- createFlashcard
- createAnnotation
- updateStudyProgress
- processDocument

### Storage vs Database
- **Storage**: PDFs, markdown, exports
- **Database**: Chunks, embeddings, entities, components

## MVP Checklist

- [ ] Use `supabaseAdmin` everywhere (skip auth)
- [ ] Disable RLS on all tables
- [ ] Hardcode userId as 'dev-user-123'
- [ ] Skip comprehensive error handling
- [ ] Use type assertions when blocked
- [ ] Focus on happy path only
- [ ] No modals anywhere
- [ ] Use ECS for all entities
- [ ] Server Components by default
- [ ] Server Actions for mutations

Remember: **Ship first, optimize later. Working code > perfect code.**