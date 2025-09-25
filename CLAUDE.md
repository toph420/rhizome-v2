# CLAUDE.md

# Rhizome V2 - Document Reader & Knowledge Synthesis

## Project Overview

Rhizome V2 is a **document reader with integrated flashcard study system** and **AI-powered knowledge synthesis**. It processes PDFs and other documents to clean markdown, enables annotatiting and quick flashcard creation, and discovers connections between ideas across your reading.

## Core Architecture Principles

1. **ECS (Entity-Component-System)**: All data is entities with components for maximum flexibility
2. **Hybrid Storage**: Large files in Supabase Storage, queryable data in PostgreSQL  
3. **Few to No Modals**: Use docks, panels, and overlays that preserve reading flow
4. **Markdown-First**: All documents processed to portable markdown format
5. **Flow State Preservation**: Never interrupt reading with context switches

## Tech Stack

```json
{
  "next": "15.x",
  "react": "19.x",
  "@supabase/supabase-js": "^2.45.0",
  "tailwindcss": "^4.0.0",
  "@tanstack/react-query": "^5.0.0",
  "zustand": "^5.0.0",
  "framer-motion": "^11.0.0",
  "@radix-ui/react-*": "latest",
  "pdf-parse": "^1.1.1",
  "jszip": "^3.10.0"
}
```

## Core Database Schema

```sql
-- Entities (everything is an entity)
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Components (define entity behavior)
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities ON DELETE CASCADE,
  component_type TEXT NOT NULL, -- 'flashcard', 'annotation', 'spark'
  data JSONB NOT NULL,
  chunk_id UUID REFERENCES chunks,
  document_id UUID REFERENCES documents,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents (metadata only, content in Storage)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL, -- "userId/documentId/"
  processing_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks (for search and connections)
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  content TEXT, -- Chunk text in DB
  embedding vector(768), -- Must be in DB for pgvector
  start_offset INTEGER,
  end_offset INTEGER,
  chunk_index INTEGER,
  themes JSONB
);

-- Indexes
CREATE INDEX idx_components_entity ON components(entity_id);
CREATE INDEX idx_components_type ON components(component_type);
CREATE INDEX idx_components_document ON components(document_id);
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);
```

## Project Structure
```
src/
├── app/                    # Next.js 15 app router
│   ├── page.tsx           # Library view
│   ├── read/[id]/         # Document reader
│   ├── study/             # Study dashboard
│   └── api/               # API routes
│       └── process/route.ts    # Processing endpoint
├── components/
│   ├── reader/            # Document reading
│   │   ├── DocumentViewer.tsx  # Main reader
│   │   └── QuickCapture.tsx    # Selection → flashcard
│   ├── study/             # Flashcard/study
│   ├── synthesis/         # Connections
│   ├── layout/            # Docks, panels
│   │   ├── ProcessingDock.tsx  # Bottom dock
│   │   └── RightPanel.tsx      # Connections panel
│   └── ui/                # shadcn/ui
├── lib/
│   ├── ecs/              # simple-ecs.ts ONLY
│   ├── processing/        # Gemini integration
│   ├── study/            # FSRS algorithm
│   └── synthesis/        # Connection detection
├── stores/               # Zustand stores
└── types/               # TypeScript types

supabase/
├── functions/
│   └── process-document/  # Gemini processing
└── migrations/
    └── 001_initial.sql    # Complete schema
```


## ECS Implementation

Use the existing ECS class in `lib/ecs/index.ts`. DO NOT create new entity managers.

Common patterns:
```typescript
// Creating flashcard
await ecs.createEntity(userId, {
  flashcard: { question, answer },
  study: { due: new Date(), ease: 2.5 },
  source: { chunk_id, document_id }
})

// Query due cards
const dueCards = await ecs.query(
  ['flashcard', 'study'], 
  userId,
  { document_id }
)

## Storage Architecture - CRITICAL

### What Goes Where - MEMORIZE THIS
```typescript
// SUPABASE STORAGE (Files) - Immutable, Large, Owned by User
userId/
└── documentId/
    ├── source.pdf          // Original upload
    ├── content.md          // Full processed markdown
    └── export.bundle.zip   // User's portable backup

// POSTGRESQL DATABASE - Mutable, Queryable, Performance-Critical
- chunks table: Text content + embeddings (for search)
- components table: All user annotations/cards (ECS)
- documents table: Metadata + storage paths only (NO CONTENT)
```

### NEVER Store in Database
- Full document markdown (>100KB)
- Original PDFs
- Any large immutable content
- Files user should own

### NEVER Store in Files
- Embeddings (need pgvector for similarity)
- Chunks (need SQL queries)
- User annotations/cards (need frequent updates)
- Anything that needs queries

## Document Processing - AI ONLY

### FORBIDDEN Libraries - DO NOT USE
```
❌ pdf-parse
❌ pdfjs  
❌ pdf-lib
❌ mammoth
❌ epub.js
❌ Any PDF extraction library
```

### ALWAYS Use Gemini for Everything
```typescript
// supabase/functions/process-document/index.ts

async function processDocument(documentId: string, pdfUrl: string) {
  // 1. Convert PDF to base64
  const pdfResponse = await fetch(pdfUrl)
  const pdfBuffer = await pdfResponse.arrayBuffer()
  const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')
  
  // 2. Send to Gemini - IT HANDLES EVERYTHING
  const result = await gemini.generateContent({
    model: 'gemini-1.5-pro',
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        },
        {
          text: EXTRACTION_AND_CHUNKING_PROMPT // See below
        }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DOCUMENT_SCHEMA
    }
  })
  
  // 3. Save markdown to STORAGE (not database!)
  const { markdown, chunks } = result
  const storagePath = `${userId}/${documentId}`
  
  await supabase.storage
    .from('documents')
    .upload(`${storagePath}/content.md`, markdown)
  
  // 4. Save chunks to DATABASE (for queries)
  for (const chunk of chunks) {
    const embedding = await gemini.embedContent(chunk.content)
    await supabase.from('chunks').insert({
      document_id: documentId,
      content: chunk.content,
      embedding: embedding,
      themes: chunk.themes
    })
  }
}

const EXTRACTION_AND_CHUNKING_PROMPT = `
Extract this PDF to perfect markdown preserving all formatting.
Then break into semantic chunks (complete thoughts).
Return JSON with full markdown and chunk array.
`
```

## Document Reader Pattern

```typescript
// app/read/[id]/page.tsx

export default async function ReaderPage({ params }) {
  const { id: documentId } = params
  
  // 1. Get storage path (NOT content)
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path, title')
    .eq('id', documentId)
    .single()
  
  // 2. Get signed URL for markdown
  const { data: { signedUrl } } = await supabase.storage
    .from('documents')
    .createSignedUrl(`${doc.storage_path}/content.md`, 3600)
  
  // 3. Get chunks from DATABASE
  const { data: chunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', documentId)
    .order('chunk_index')
  
  return (
    <div className="grid grid-cols-[1fr,400px]">
      <DocumentReader 
        markdownUrl={signedUrl}  // Stream from storage
        chunks={chunks}           // From database
      />
      <RightPanel documentId={documentId} />
    </div>
  )
}
```


## UI Components Pattern

```typescript
// NO MODALS - Use these patterns instead:

// Bottom Dock (Processing, Tasks)
<div className="fixed bottom-0 left-0 right-0 border-t bg-background">
  <ProcessingDock />
</div>

// Right Panel (Connections, Notes)
<div className="fixed right-0 top-0 bottom-0 w-96 border-l">
  <RightPanel />
</div>

// Quick Capture (Appears on text selection)
<div className="fixed bottom-20 left-1/2 -translate-x-1/2">
  <QuickCapture />
</div>

// Split Screen (Study mode)
<div className="grid grid-cols-2 h-screen">
  <DocumentReader />
  <StudyPanel />
</div>
```


## UI Patterns - NO EXCEPTIONS

### Layout Structure
```tsx
<div className="h-screen flex flex-col">
  <MainContent />        {/* Never blocked by UI */}
  <RightPanel />        {/* Connections, notes */}
  <ProcessingDock />    {/* Bottom, collapsible */}
  <QuickCaptureBar />   {/* Appears on selection */}
  <CommandPalette />    {/* ⌘K activated */}
</div>
```

### Component Naming Convention
- `*Dock` - Bottom panels (ProcessingDock)
- `*Panel` - Side panels (RightPanel, StudyPanel)
- `*Bar` - Horizontal bars (QuickCaptureBar)
- `*Overlay` - Floating overlays (StudyOverlay)
- `*Canvas` - Spatial views (DeckCanvas)

### NEVER Use Modals
```typescript
// ❌ WRONG - NEVER DO THIS
<Modal>
  <CreateFlashcard />
</Modal>

// ✅ RIGHT - Use these patterns
<QuickCaptureBar />     // Inline creation
<ProcessingDock />      // Status updates
<Sheet />               // Side drawer if needed
<CommandPalette />      // Quick actions
```


## Common Operations

```typescript
// Upload Document
const file = event.dataTransfer.files[0]
const path = `${userId}/${docId}/source.pdf`
await supabase.storage.from('documents').upload(path, file)

// Create Flashcard from Selection
const cardId = await ecs.createEntity(userId, {
  flashcard: { question, answer },
  source: { chunk_id, document_id }
})

// Find Similar Chunks
const { data } = await supabase.rpc('match_chunks', {
  query_embedding: embedding,
  match_threshold: 0.8
})

// Process PDF to Markdown
import pdfParse from 'pdf-parse'
const dataBuffer = await file.arrayBuffer()
const data = await pdfParse(Buffer.from(dataBuffer))
const markdown = data.text // Clean this up with your logic
```

## Common Development Tasks

### Initialize Project (If not exists)
```bash
# Create Next.js app with TypeScript and Tailwind
npx create-next-app@latest . --typescript --tailwind --app

# Install dependencies
npm install @supabase/supabase-js @tanstack/react-query zustand framer-motion
npm install @radix-ui/react-* pdf-parse jszip

# Initialize Supabase and shadcn
npx supabase init
npx shadcn@latest init
```

### Run Development Environment
```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start local Supabase
npx supabase start

# Terminal 3: Apply database schema
npx supabase db push
```

### Build & Test
```bash
# Build for production
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
```

## Code Architecture

### High-Level Structure
- **`/app`**: Next.js 15 App Router pages and API routes
- **`/components`**: React components organized by feature (reader, study, annotations)
- **`/lib`**: Core business logic (ECS, processing, storage)
- **`/stores`**: Zustand client state management
- **`/supabase`**: Database migrations and edge functions


### Key Architectural Patterns

**ECS (Entity-Component-System)**: Everything is an entity with flexible components
- Entities are just UUIDs
- Components define behavior (flashcard, annotation, study data)
- Maximum flexibility for future features without migrations

**Hybrid Storage Strategy**:
- **Supabase Storage**: Large immutable files (PDFs, full markdown)
- **PostgreSQL**: Queryable chunks, embeddings, user-generated content
- Files are never stored in the database, only references

**UI Without Modals**:
- Bottom docks for processing status
- Right panels for connections/notes
- Inline overlays for quick actions
- Split screen for study mode

## Current Implementation Status

### ✅ Completed
- Architecture design and documentation
- Database schema (ready to create)
- ECS pattern defined (100 lines, ready to implement)
- File storage strategy decided (hybrid approach)
- UI patterns documented (no modals)
- Development workflow established

### 🚀 Ready to Build (Start Today)
```bash
# Run these commands now:
npx create-next-app@latest rhizome-v2 --typescript --tailwind --app
cd rhizome-v2
npx shadcn@latest init
npx supabase init
```

## Revised 4-Week MVP Timeline

### 📋 Week 1: Foundation & Upload
- [x] Project setup with Next.js 15
- [x] Supabase schema creation
- [x] ECS implementation
- [ ] Document upload to Storage
- [ ] Processing dock UI (bottom panel)
- [ ] Basic library page with drag-drop
- [ ] Gemini API setup and testing

### 📋 Week 2: AI Processing Pipeline
- [ ] Gemini extraction (PDF → Markdown)
- [ ] Semantic chunking with Gemini
- [ ] Embedding generation (Gemini text-embedding-004)
- [ ] Store markdown in Storage, chunks in DB
- [ ] Processing status updates in dock
- [ ] Document metadata extraction

### 📋 Week 3: Reading & Annotation
- [ ] Markdown renderer with MDX
- [ ] Virtual scrolling for chunks
- [ ] Text selection system
- [ ] Annotation toolbar (highlight/note)
- [ ] Right panel (connections/notes tabs)
- [ ] Annotation persistence with ECS

### 📋 Week 4: Study & Connections
- [ ] Create flashcards from annotations
- [ ] Basic FSRS implementation
- [ ] Split-screen study mode
- [ ] pgvector similarity search
- [ ] Display connections in right panel
- [ ] Export system (ZIP bundle)

This timeline better reflects your AI-first architecture and focuses on getting the core flow working: Upload → Process → Read → Annotate → Study. The synthesis features (sparks, threads) can come in phase 2 after the MVP is solid.

### 🔮 Future Enhancements
- FSRS algorithm implementation
- Advanced synthesis studio
- Export system
- Real authentication (currently dev mode)
- Mobile experience
- Collaboration features

### Next Action
1. Create the Next.js app
2. Copy database schema from documentation
3. Build `UploadZone` component
4. Get PDF → Storage → Markdown working
5. Ship first working version today

## Important Implementation Notes

1. **Always use ECS for data**: Never create direct database queries for user content
2. **Stream large files**: Use signed URLs and streaming for markdown content
3. **Optimistic updates**: Update UI immediately, sync with server in background
4. **Virtual scrolling**: Required for long documents (>100 pages)
5. **Batch operations**: Group database operations for performance

## Error Prevention Checklist

- [ ] Never use modal dialogs - use panels/docks/overlays
- [ ] Never store large text in database - use Storage
- [ ] Never bypass ECS for user content
- [ ] Never load entire documents in memory
- [ ] Never block UI during processing

## Code Quality Guidelines

### TypeScript
- Use `ReactElement` from 'react' (not JSX.Element)
- Never use `any` type
- Explicit return types for functions

### Documentation - REQUIRED
- **All functions, methods, and classes MUST have JSDoc comments**
- Include description, parameters (@param), and return value (@returns)
- TypeScript interfaces, type aliases, and enums require documentation
- Descriptions must be complete sentences ending with periods
- Example:
## Documentation Requirements

ALL exported functions, classes, and interfaces MUST have JSDoc:
```typescript
/**
 * Creates an entity with components in the ECS system.
 * Handles atomic creation with rollback on failure.
 * 
 * @param userId - The ID of the user creating the entity
 * @param components - Map of component types to their data
 * @returns The created entity's ID
 * @throws {Error} If entity or component creation fails
 * 
 * @example
 * const id = await ecs.createEntity(userId, {
 *   flashcard: { question: 'Q1', answer: 'A1' },
 *   study: { due: new Date() }
 * })
 */
```

### File Organization  
- Soft limit: 500 lines per file
- Components: ~200 lines
- Functions: ~50 lines

### Development
- Use `rg` for searching (not grep/find)
- Co-locate tests in __tests__ folders
- Validate external data with Zod
- Run `npm run lint` before committing to check JSDoc compliance

### What to Avoid
- Over-engineering for future needs (YAGNI)
- Creating duplicate functionality
- Files over 500 lines
- Prop drilling beyond 2 levels
- Undocumented functions or classes (enforced by ESLint)


## Documentation Structure

### Primary Documents

For detailed information, see:
- `/docs/ARCHITECTURE.MD` - Read for understanding overall system design
- `/docs/SUPABASE_AUTH_RULES.md` - Reference when dealing with auth/database
- `/docs/UI_PATTERNS.md` - Look at for component layout decisions
- `/docs/STORAGE_PATTERNS.md` - Hybrid storage details
- `/docs/ECS_IMPLEMENTATION.md` - Entity-Component-System guide, Check when creating/querying entities
- `/docs/lib/REACT_GUIDELINES.md` - Consult for ALL React/Next.js decisions


### When to Check REACT_GUIDELINES.md

**ALWAYS consult `/docs/lib/REACT_GUIDELINES.md` when:**
- Creating new components (Server vs Client decision)
- Adding interactivity (needs 'use client'?)
- Fetching data (Server Component vs Server Action)
- Handling forms (Server Actions pattern)
- Managing state (where does it belong?)
- Implementing mutations (always use Server Actions)
- Deciding on file location (which folder?)

**Quick Decision References:**
```
Need onClick/onChange? → Check `/docs/lib/REACT_GUIDELINES.md` Client Components section
Need to fetch data? → Check `/docs/lib/REACT_GUIDELINES.md` Server Components section  
Need to save data? → Check `/docs/lib/REACT_GUIDELINES.md` Server Actions section
Need a modal? → NO! Check `/docs/UI_PATTERNS.md` for alternatives
```

### Document Priority Order

1. **For React/Component questions**: `/docs/lib/REACT_GUIDELINES.md` → `/docs/UI_PATTERNS.md`
2. **For data operations**: `/docs/ECS_IMPLEMENTATION.md` → `/docs/lib/REACT_GUIDELINES.md` (Server Actions)
3. **For auth issues**: `/docs/SUPABASE_AUTH_RULES.md`
4. **For architecture questions**: `/docs/ARCHITECTURE.md` → `/CLAUDE.md`

## Critical Rule
If there's ANY doubt about Server vs Client Components, Server Actions, or React patterns:
**STOP and read `/docs/lib/REACT_GUIDELINES.md` first**



## Export System - REQUIRED

```typescript
// Users MUST be able to export their data

async function exportDocument(documentId: string) {
  // 1. Get files from storage
  const markdown = await downloadFromStorage(`${userId}/${documentId}/content.md`)
  
  // 2. Get user data from database
  const annotations = await ecs.query(['annotation'], userId, { document_id })
  const flashcards = await ecs.query(['flashcard'], userId, { document_id })
  
  // 3. Create ZIP bundle
  const zip = new JSZip()
  zip.file('content.md', markdown)
  zip.file('annotations.json', JSON.stringify(annotations))
  zip.file('flashcards.json', JSON.stringify(flashcards))
  
  // 4. Save to storage for download
  const blob = await zip.generateAsync({ type: 'blob' })
  return uploadToStorage(`${userId}/${documentId}/export.zip`, blob)
}
```

## State Management Rules

```typescript
// Client state - Use Zustand
const useReaderStore = create((set) => ({
  selectedText: null,
  setSelectedText: (text) => set({ selectedText: text })
}))

// Server state - Use React Query
const { data } = useQuery({
  queryKey: ['chunks', documentId],
  queryFn: () => getChunks(documentId),
  staleTime: Infinity // Chunks never change
})

// NEVER use useState for server data
❌ const [chunks, setChunks] = useState()
✅ const { data: chunks } = useQuery()
```

## Performance Patterns

```typescript
// ✅ GOOD - Stream from storage
const url = await getSignedUrl(path)
const response = await fetch(url)
const reader = response.body.getReader()

// ❌ BAD - Store in database
const { markdown_content } = await supabase
  .from('documents')
  .select('markdown_content') // NO!

// ✅ GOOD - Query with pgvector
const similar = await supabase.rpc('match_chunks', {
  query_embedding: embedding
})

// ❌ BAD - Filter in memory
const all = await getAllChunks()
const similar = all.filter(...) // NO!
```

## Current Phase: Foundation (Weeks 1-2)

### BUILD THESE FIRST
1. ✅ Database schema (migrations)
2. ✅ Supabase storage bucket setup
3. ✅ Document upload to storage
4. ✅ Gemini processing pipeline
5. ✅ Basic markdown reader
6. ✅ Simple ECS implementation

### DO NOT BUILD YET
- ❌ Complex UI components
- ❌ Study system (can wait)
- ❌ Synthesis features
- ❌ Mobile responsive
- ❌ Settings pages
- ❌ User profiles

## Common Mistakes to Avoid

1. **Adding "just one modal"** - NO. Check UI patterns
2. **Storing markdown in database** - NO. Use storage
3. **Using PDF libraries** - NO. Use Gemini
4. **Creating type services** - NO. Use ECS
5. **Complex state management** - Keep it simple
6. **Premature optimization** - Build first, optimize later

## Testing During Development

```typescript
// Start with small files
- 5-10 page PDFs
- Simple markdown documents
- Academic papers (good for testing)

// Use console.log liberally
console.log('Processing stage:', stage)
console.log('Chunks created:', chunks.length)

// Don't write tests yet
- No unit tests until core works
- No e2e tests until UI stable
- Focus on user flow
```

## Questions to Ask Before Building

1. Is this a modal? → Find another pattern if possible
2. Am I storing content in DB? → Should it be in storage?
3. Am I parsing PDFs? → Use Gemini instead
4. Am I creating a service? → Use ECS instead
5. Is this in the current phase? → Don't build it yet

## Success Criteria

- User can upload PDF and see it as markdown
- Text selection creates flashcards inline
- No modals anywhere in the app
- Documents stored in storage, not database
- ECS handles all entities uniformly
- Processing happens in background (dock visible)
```

This is your complete rulebook. Follow it exactly and the architecture will remain clean and maintainable.