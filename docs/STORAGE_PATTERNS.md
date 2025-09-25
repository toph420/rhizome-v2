# Storage Patterns Reference

## Quick Decision Matrix

| Data Type | Storage Location | Why | Access Pattern |
|-----------|-----------------|-----|----------------|
| Original PDF/EPUB | Supabase Storage | Large, immutable | Download on demand |
| Full Markdown | Supabase Storage | Large, immutable | Stream for reading |
| Chunks | PostgreSQL | Need SQL queries | Frequent queries |
| Embeddings | PostgreSQL | Need pgvector | Similarity search |
| Annotations | PostgreSQL (ECS) | Mutable, queryable | Real-time updates |
| Flashcards | PostgreSQL (ECS) | Mutable, FSRS | Study sessions |
| Sparks | PostgreSQL (ECS) | Mutable, connections | Synthesis queries |
| Export Bundles | Supabase Storage | Large, archival | Download link |

## Decision Tree

```
Is the data...
├── Over 100KB? → Storage
├── Needs vector similarity search? → Database (pgvector)
├── Needs SQL queries/joins? → Database
├── User-created and mutable? → Database (ECS)
├── Original source file? → Storage
├── Immutable after processing? → Storage
└── Everything else → Database
```

## Implementation Patterns

### 1. Document Upload Pattern

```typescript
// ❌ WRONG - Everything in database
async function uploadWrong(file: File) {
  const text = await extractText(file)
  await supabase.from('documents').insert({
    content: text, // NO! Too large for DB
    file_binary: file // NO! Store in Storage
  })
}

// ✅ CORRECT - Hybrid approach
async function uploadCorrect(file: File) {
  const userId = auth.user.id
  const docId = uuid()
  const path = `${userId}/${docId}`
  
  // 1. Original to Storage
  await supabase.storage
    .from('documents')
    .upload(`${path}/source.pdf`, file)
  
  // 2. Process to markdown
  const markdown = await processToMarkdown(file)
  
  // 3. Markdown to Storage
  await supabase.storage
    .from('documents')
    .upload(`${path}/content.md`, markdown)
  
  // 4. Metadata to Database
  await supabase.from('documents').insert({
    id: docId,
    title: file.name,
    storage_path: path,
    file_size: file.size,
    processing_status: 'pending'
  })
  
  // 5. Chunks to Database (for queries)
  const chunks = await chunkDocument(markdown)
  await supabase.from('chunks').insert(chunks)
}
```

### 2. Document Reading Pattern

```typescript
// ❌ WRONG - Loading everything from database
async function readDocumentWrong(docId: string) {
  const { data } = await supabase
    .from('documents')
    .select('markdown_content') // This field shouldn't exist!
    .eq('id', docId)
  return data.markdown_content
}

// ✅ CORRECT - Stream from storage, query from database
async function readDocumentCorrect(docId: string) {
  // 1. Get storage path
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', docId)
    .single()
  
  // 2. Get signed URL (expires in 1 hour)
  const { data: { signedUrl } } = await supabase.storage
    .from('documents')
    .createSignedUrl(`${doc.storage_path}/content.md`, 3600)
  
  // 3. Stream markdown from CDN
  const markdown = await fetch(signedUrl).then(r => r.text())
  
  // 4. Get chunks for positioning
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id, start_offset, end_offset')
    .eq('document_id', docId)
  
  return { markdown, chunks }
}
```

### 3. Similarity Search Pattern

```typescript
// ❌ WRONG - Embeddings in storage
async function findSimilarWrong(text: string) {
  // Can't do vector search on files!
  const embeddings = await loadFromStorage('embeddings.json')
  return embeddings.filter(...) // O(n) in JavaScript = slow
}

// ✅ CORRECT - Embeddings in database with pgvector
async function findSimilarCorrect(text: string) {
  const embedding = await generateEmbedding(text)
  
  // Use pgvector for fast similarity search
  const { data } = await supabase.rpc('match_chunks', {
    query_embedding: embedding,
    match_threshold: 0.8,
    match_count: 10
  })
  
  return data // Returns in ~50ms even with millions of chunks
}

// SQL function using pgvector
CREATE FUNCTION match_chunks(
  query_embedding vector(768),
  match_threshold float,
  match_count int
) RETURNS TABLE (
  chunk_id uuid,
  content text,
  similarity float
) AS $$
SELECT
  id as chunk_id,
  content,
  1 - (embedding <=> query_embedding) as similarity
FROM chunks
WHERE 1 - (embedding <=> query_embedding) > match_threshold
ORDER BY embedding <=> query_embedding
LIMIT match_count
$$ LANGUAGE SQL;
```

### 4. User Annotation Pattern

```typescript
// ❌ WRONG - Annotations in files
async function createAnnotationWrong(text: string) {
  // Don't create a file for each annotation!
  await supabase.storage
    .from('documents')
    .upload(`annotations/${uuid()}.json`, { text })
}

// ✅ CORRECT - Annotations in database via ECS
async function createAnnotationCorrect(text: string, chunkId: string) {
  // Real-time, queryable, mutable
  const entityId = await ecs.createEntity(userId, {
    annotation: { text, created_at: new Date() },
    source: { chunk_id: chunkId }
  })
  
  // Instant updates, no file I/O
  return entityId
}
```

### 5. Export Pattern

```typescript
// ✅ Complete export for user ownership
async function exportDocument(docId: string) {
  const userId = auth.user.id
  const path = `${userId}/${docId}`
  
  // 1. Gather all files
  const { data: files } = await supabase.storage
    .from('documents')
    .list(path)
  
  // 2. Get all database content
  const { data: chunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', docId)
  
  const { data: annotations } = await ecs.query(
    ['annotation'], userId, { document_id: docId }
  )
  
  // 3. Create portable bundle
  const zip = new JSZip()
  
  // Add files
  for (const file of files) {
    const { data } = await supabase.storage
      .from('documents')
      .download(`${path}/${file.name}`)
    zip.file(file.name, data)
  }
  
  // Add database exports as JSON
  zip.file('chunks.json', JSON.stringify(chunks, null, 2))
  zip.file('annotations.json', JSON.stringify(annotations, null, 2))
  
  // 4. Save bundle to storage
  const blob = await zip.generateAsync({ type: 'blob' })
  await supabase.storage
    .from('documents')
    .upload(`${path}/export-${Date.now()}.zip`, blob)
  
  // 5. Return download link
  return getSignedUrl(`${path}/export-${Date.now()}.zip`)
}
```

## Performance Considerations

### Storage (CDN)
```typescript
// Pros:
- Served from CDN edge locations (fast globally)
- No database load for large files
- Automatic caching
- Parallel downloads

// Cons:
- Can't query content with SQL
- No full-text search
- Signed URLs expire (need refresh)

// Best for:
- Original files (PDF, EPUB)
- Generated markdown (full documents)
- Export bundles
- Assets over 100KB
```

### Database
```typescript
// Pros:
- SQL queries and joins
- Full-text search with pg_fts
- Vector similarity with pgvector
- Real-time subscriptions
- ACID transactions

// Cons:
- Row size limits (practical ~1MB)
- More expensive for large data
- Single region (without read replicas)

// Best for:
- Chunks (need queries)
- Embeddings (need similarity)
- User content (need mutations)
- Metadata (need joins)
```

## Caching Strategy

```typescript
// Client-side caching
const markdownCache = new Map()

function getCachedMarkdown(url: string) {
  if (!markdownCache.has(url)) {
    markdownCache.set(url, fetch(url).then(r => r.text()))
  }
  return markdownCache.get(url)
}

// React Query configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Markdown never changes
      staleTime: Infinity,
      cacheTime: 1000 * 60 * 60, // 1 hour
    }
  }
})

// Chunks can change (user might re-process)
const { data: chunks } = useQuery({
  queryKey: ['chunks', docId],
  queryFn: fetchChunks,
  staleTime: 1000 * 60 * 5, // 5 minutes
})
```

## Cost Analysis

### Storage Costs (Supabase)
```
Per Document:
- PDF (5MB): $0.021/month
- Markdown (500KB): $0.002/month
- Chunks in DB (2MB): Free tier
- Total: ~$0.023/month per document

1000 documents = $23/month
```

### Database Costs (PostgreSQL)
```
Chunks + Embeddings:
- 1000 docs × 2MB = 2GB (free tier includes 8GB)
- pgvector indexes: ~500MB
- Total: FREE for ~4000 documents

After free tier:
- $0.125/GB/month
```

## Migration Patterns

### If You Started Wrong (Everything in DB)

```typescript
// Migration script to move to hybrid
async function migrateToHybrid() {
  const { data: documents } = await supabase
    .from('documents')
    .select('id, user_id, markdown_content')
  
  for (const doc of documents) {
    // 1. Upload markdown to storage
    const path = `${doc.user_id}/${doc.id}`
    await supabase.storage
      .from('documents')
      .upload(`${path}/content.md`, doc.markdown_content)
    
    // 2. Update document record
    await supabase
      .from('documents')
      .update({ 
        storage_path: path,
        markdown_content: null // Remove from DB
      })
      .eq('id', doc.id)
  }
  
  // 3. Drop the column
  await supabase.rpc('drop_markdown_column')
}
```

## Common Gotchas

### 1. Signed URLs Expire
```typescript
// Problem: URL expires during long reading session
// Solution: Refresh before expiry
useEffect(() => {
  const interval = setInterval(() => {
    refreshSignedUrl()
  }, 50 * 60 * 1000) // Refresh every 50 minutes
  return () => clearInterval(interval)
}, [])
```

### 2. CORS Issues
```typescript
// Problem: Can't fetch storage URLs from browser
// Solution: Use signed URLs, not public URLs
const { data: { signedUrl } } = await supabase.storage
  .from('documents')
  .createSignedUrl(path, 3600)
```

### 3. Large File Uploads
```typescript
// Problem: Browser timeout on large PDFs
// Solution: Resumable uploads
const { data, error } = await supabase.storage
  .from('documents')
  .upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    // Enable resumable uploads for files > 6MB
    duplex: 'half'
  })
```

### 4. Embedding Size
```typescript
// Problem: Embeddings are larger than expected
// Solution: Use halfvec extension for 50% size reduction
CREATE TABLE chunks (
  embedding halfvec(768) -- 50% smaller than vector(768)
)
```

## Quick Reference

```bash
# Storage URLs
https://{project}.supabase.co/storage/v1/object/sign/documents/{path}

# Database queries
SELECT * FROM chunks WHERE document_id = ?
SELECT * FROM match_chunks(embedding, 0.8, 10)

# File structure
userId/
└── documentId/
    ├── source.pdf       # Original
    ├── content.md       # Full text
    └── export.zip       # Backup
```

## Debug Checklist

- [ ] Markdown in Storage, not database?
- [ ] Embeddings in database, not files?
- [ ] Using signed URLs for private files?
- [ ] Chunks small enough for queries (<1MB)?
- [ ] Export function implemented?
- [ ] Caching configured correctly?
- [ ] Error handling for expired URLs?


This comprehensive guide should help Claude Code (or any developer) quickly understand:
1. Where each type of data belongs
2. Why it goes there
3. How to implement it correctly
4. Common mistakes to avoid
5. Performance implications
6. Cost considerations

The pattern is clear: **large/immutable → storage, small/queryable → database**.