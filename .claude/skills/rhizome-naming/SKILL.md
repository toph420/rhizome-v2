---
name: Rhizome Naming Conventions
description: Four-tier naming system - PostgreSQL columns use snake_case, JSONB contents use camelCase (to match frontend), TypeScript uses camelCase for variables and PascalCase for types, files use kebab-case. String literal values (job_type, status) use snake_case for code identifiers. ALL JSONB output_data must be validated with Zod schemas. Use when creating migrations, JSONB schemas, types, job types, or files. Trigger keywords: snake_case, camelCase, kebab-case, PascalCase, JSONB, output_data, job_type, naming convention, CREATE TABLE, Zod validation, worker/types/job-schemas.
---

# Rhizome Naming Conventions

Four-tier naming system for fullstack consistency.

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

### Tier 4: String Literal Values (Code Identifiers)

**Rule**: Use `snake_case` for enum-like string values that act as code identifiers

\`\`\`typescript
// ✅ Correct: job_type values use snake_case
job_type: 'detect_connections'
job_type: 'process_document'
job_type: 'obsidian_export'

// ❌ Wrong: kebab-case causes UI mismatch
job_type: 'detect-connections'
job_type: 'obsidian-export'
\`\`\`

**Why**: TypeScript interfaces and UI switch statements expect snake_case, so database values must match:

\`\`\`typescript
// TypeScript interface
type JobType = 'detect_connections' | 'process_document'

// UI component (must match exactly)
switch (job.type) {
  case 'detect_connections':  // Must match DB value!
    return <DetectIcon />
}
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

// Wrong: kebab-case for job_type values
await supabase.from('background_jobs').insert({
  job_type: 'detect-connections',  // Should be 'detect_connections'
  status: 'pending'
})

// Wrong: PascalCase for files
// AnnotationStore.ts  (Should be annotation-store.ts)

// Wrong: Missing Zod validation
await supabase.from('background_jobs').update({
  output_data: { downloadUrl: url }  // No validation!
})
\`\`\`

## Related Documentation

- `worker/types/job-schemas.ts` - Zod schemas
