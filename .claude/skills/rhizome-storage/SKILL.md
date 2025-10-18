---
name: Rhizome Storage Patterns
description: Hybrid storage strategy where Storage is source of truth and Database is queryable cache. Supabase Storage for large files (PDFs, markdown, exports), PostgreSQL for queryable data (chunks with embeddings, connections). Use when implementing uploads, exports, file storage decisions, or when you see storage.from() or large file handling. Trigger keywords: Supabase Storage, upload, download, storage.from, export bundle, file storage, pgvector, embeddings, chunks, portability, ZIP export.
---

# Rhizome Storage Patterns

Storage for files, Database for queryable data.

## Instructions

**Core Principle**: Storage is source of truth, Database is queryable cache.

### Use Supabase Storage For

- Original files (PDF, EPUB)
- Full markdown content
- Export bundles (ZIP)

### Use PostgreSQL For

- Chunks (queryable segments)
- Embeddings (pgvector search)
- Connections (derived data)
- Annotations (ECS mutable data)

## Examples

```typescript
// ✅ Hybrid approach
await supabase.storage.from('documents').upload(`${path}/content.md`, markdown)
await supabase.from('chunks').insert(chunks)
```

## When NOT to Use This Skill

- **Small metadata (<1KB)**: Store in database for quick access
- **Real-time collaboration data**: Database for immediate sync
- **Session state**: Use client-side storage or database
- **Temporary processing data**: Use memory or temp files

### ❌ Common Mistakes

```typescript
// Wrong: Large markdown in database
await supabase.from('documents').insert({
  markdown_content: largeMarkdown  // 10MB+ TEXT column!
})

// Wrong: Queryable data in Storage
await supabase.storage.from('documents').upload('chunks.json', chunks)
// Can't query chunks without downloading entire file

// Wrong: No portability backup
await supabase.from('documents').insert({
  content: markdown  // Lost if DB corrupted, no export possible
})
```

## Related Documentation

- `docs/STORAGE_PATTERNS.md`
