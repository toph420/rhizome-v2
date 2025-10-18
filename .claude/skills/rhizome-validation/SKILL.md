---
name: Rhizome Zod Validation
description: ALL worker job outputs in output_data JSONB MUST be validated with Zod schemas before saving to database. Schemas defined in worker/types/job-schemas.ts with camelCase matching JSONB contents. Prevents typos and ensures type safety. Use when creating worker handlers or updating job outputs.
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

## Related Documentation

- `worker/types/job-schemas.ts`
