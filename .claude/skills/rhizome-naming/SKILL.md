---
name: Rhizome Naming Conventions
description: Three-tier naming system - PostgreSQL columns use snake_case, JSONB contents use camelCase (to match frontend), TypeScript uses camelCase for variables and PascalCase for types, files use kebab-case. ALL JSONB output_data must be validated with Zod schemas. Use when creating migrations, JSONB schemas, types, or files. Trigger keywords: snake_case, camelCase, kebab-case, PascalCase, JSONB, output_data, naming convention, CREATE TABLE, Zod validation, worker/types/job-schemas.
---

# Rhizome Naming Conventions

Three-tier naming system for fullstack consistency.

## Instructions

### Tier 1: Database Columns

**Rule**: `snake_case` for tables and columns

\`\`\`sql
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY,
  job_type TEXT,
  output_data JSONB
);
\`\`\`

### Tier 2: JSONB Content

**Rule**: `camelCase` inside JSONB fields

\`\`\`typescript
const outputData = {
  documentCount: 5,
  downloadUrl: 'https://...'
}
\`\`\`

### Tier 3: TypeScript

\`\`\`typescript
// Variables: camelCase
const downloadUrl = job.output_data.downloadUrl

// Types: PascalCase
interface BackgroundJob { }

// Files: kebab-case
// annotation-store.ts
\`\`\`

### Zod Validation

\`\`\`typescript
const Schema = z.object({
  documentCount: z.number(),
  downloadUrl: z.string().url()
})

validateJobOutput('export', outputData)
\`\`\`

## When NOT to Use This Skill

- **External API responses**: Keep third-party naming conventions as-is
- **Environment variables**: Follow `.env` conventions (SCREAMING_SNAKE_CASE)
- **Constants**: Use SCREAMING_SNAKE_CASE for true constants
- **CSS classes**: Use BEM or Tailwind conventions

### ❌ Common Mistakes

\`\`\`typescript
// Wrong: snake_case in JSONB
const outputData = {
  download_url: url,  // Should be downloadUrl
  chunk_count: 100    // Should be chunkCount
}

// Wrong: camelCase in database columns
CREATE TABLE documents (
  documentId UUID,    // Should be document_id
  createdAt TIMESTAMP // Should be created_at
);

// Wrong: PascalCase for files
// AnnotationStore.ts  (Should be annotation-store.ts)

// Wrong: Missing Zod validation
await supabase.from('background_jobs').update({
  output_data: { downloadUrl: url }  // No validation!
})
\`\`\`

## Related Documentation

- `worker/types/job-schemas.ts` - Zod schemas
