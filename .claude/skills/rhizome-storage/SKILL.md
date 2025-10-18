---
name: Rhizome Storage Patterns
description: Hybrid storage strategy where Storage is source of truth and Database is queryable cache. Supabase Storage for large files (PDFs, markdown, exports), PostgreSQL for queryable data (chunks with embeddings, connections). Use when implementing uploads, exports, or deciding where to store data.
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

## Related Documentation

- `docs/STORAGE_PATTERNS.md`
