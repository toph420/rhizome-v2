---
name: Rhizome Naming Conventions
description: Three-tier naming system - PostgreSQL columns use snake_case, JSONB contents use camelCase (to match frontend), TypeScript uses camelCase for variables and PascalCase for types, files use kebab-case. ALL JSONB output_data must be validated with Zod schemas. Use when creating migrations, JSONB schemas, types, or files.
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

## Related Documentation

- `worker/types/job-schemas.ts` - Zod schemas
