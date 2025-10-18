---
name: Rhizome Zod Validation
description: ALL worker job outputs in output_data JSONB MUST be validated with Zod schemas before saving to database. Schemas defined in worker/types/job-schemas.ts with camelCase matching JSONB contents. Prevents typos and ensures type safety. Use when creating worker handlers or updating job outputs. Trigger keywords: Zod, z.object, validateJobOutput, output_data, worker handler, job schema, JSONB validation, worker/types/job-schemas, background_jobs.
---

# Rhizome Zod Validation

Validate ALL worker outputs before database save.

## Instructions

**Rule**: ALL `output_data` JSONB MUST be validated with Zod

**File**: `worker/types/job-schemas.ts`

## Examples

```typescript
// Define schema
const Schema = z.object({
  success: z.boolean(),
  documentCount: z.number(),
  downloadUrl: z.string().url()
})

// Validate before save
validateJobOutput('export', outputData)
await supabase.from('background_jobs').update({ output_data: outputData })
```

## When NOT to Use This Skill

- **Input validation**: Use Zod for inputs too, but in Server Actions
- **Client-side forms**: Use react-hook-form with Zod resolvers
- **Database schema validation**: PostgreSQL handles schema, Zod for JSONB only
- **Non-worker outputs**: Regular tables don't need Zod (use TypeScript types)

### ❌ Common Mistakes

```typescript
// Wrong: No validation
await supabase.from('background_jobs').update({
  output_data: {
    succes: true,         // Typo! Should be 'success'
    dowloadUrl: signedUrl // Typo! Should be 'downloadUrl'
  }
})

// Wrong: Schema not registered
const CustomSchema = z.object({ ... })
validateJobOutput('custom_job', data)  // Error! Schema not in registry

// Wrong: Runtime-only validation (no TypeScript types)
const data = { success: true, downloadUrl: url }
Schema.parse(data)  // Works at runtime but no type safety
// Should: const data: z.infer<typeof Schema> = { ... }
```

## Related Documentation

- `worker/types/job-schemas.ts`
