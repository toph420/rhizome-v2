---
name: Rhizome Architecture
description: Enforces core architectural patterns for Rhizome V2 - Server Components by default, Server Actions for all mutations, and dual-module separation between Next.js app and Node.js worker. Use when creating pages, components, Server Actions, or reviewing architecture compliance.
---

# Rhizome Architecture

Core architectural patterns for the Rhizome V2 document processing system.

## Instructions

### 1. Server Components by Default

**Rule**: ALL components are Server Components UNLESS they require:
- Event handlers (`onClick`, `onChange`, `onSubmit`)
- React hooks (`useState`, `useEffect`, `useRef`)
- Browser APIs (`window`, `document`, `localStorage`)
- Zustand stores (`useAnnotationStore`, `useUIStore`)

**Pattern**:
```typescript
// ✅ Server Component (NO 'use client')
export default async function ReaderPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: doc } = await supabase.from('documents').select('*').eq('id', id).single()
  return <ReaderLayout document={doc} />
}

// ✅ Client Component (HAS 'use client', uses hooks)
'use client'
export function DocumentViewer() {
  const [mode, setMode] = useState('explore')
  return <VirtualizedReader mode={mode} />
}
```

### 2. Server Actions for ALL Mutations

**Rule**: ALL database mutations MUST use Server Actions in `src/app/actions/*.ts`, NEVER API routes.

**Pattern**:
```typescript
// src/app/actions/annotations.ts
'use server'

import { z } from 'zod'
import { createECS } from '@/lib/ecs'

const Schema = z.object({
  text: z.string().min(1),
  chunkIds: z.array(z.string().uuid()),
  documentId: z.string().uuid()
})

export async function createAnnotation(data: z.infer<typeof Schema>) {
  const validated = Schema.parse(data)
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ecs = createECS()
  const id = await ecs.createEntity(user.id, {
    annotation: { text: validated.text },
    position: { chunkIds: validated.chunkIds },
    source: { document_id: validated.documentId }
  })

  return { success: true, id }
}
```

### 3. Dual-Module Architecture

**Rule**: NEVER cross-import between main app (`src/`) and worker (`worker/`).

**Communication**: Only via `background_jobs` table.

```typescript
// ✅ Main app triggers worker
await supabase.from('background_jobs').insert({
  job_type: 'process_document',
  document_id: docId
})

// ❌ FORBIDDEN
import { PDFProcessor } from '@/worker/processors/pdf-processor'
```

## Examples

### ❌ Anti-Patterns

```typescript
// Client component without need
'use client'
export function StaticList({ docs }: Props) {
  return <ul>{docs.map(d => <li>{d.title}</li>)}</ul>
}

// API route for mutation
export async function POST(request: Request) {
  await supabase.from('annotations').insert(data)
}
```

### ✅ Correct Patterns

```typescript
// Server Component (default)
export default async function Page() {
  const data = await supabase.from('documents').select()
  return <List data={data} />
}

// Server Action
'use server'
export async function saveData(input: Input) {
  const validated = Schema.parse(input)
  await supabase.from('table').insert(validated)
}
```

## Related Documentation

- `docs/lib/REACT_GUIDELINES.md` - Full React 19 patterns
- `docs/ARCHITECTURE.md` - Complete system architecture
