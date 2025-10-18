---
name: Rhizome Testing Strategy
description: Test based on replaceability not coverage. Critical tests (hours of user work) MUST pass and block deploys. Use real fixtures from processed chunks, not Lorem Ipsum. Categorize into critical/stable/flexible/experimental directories. Use when writing tests or reviewing test organization.
---

# Rhizome Testing Strategy

Test based on replaceability, not coverage %.

## Instructions

### Test Categories

**Critical** (`tests/critical/`) - MUST pass, blocks deploys
- Annotation position recovery
- Chunk remapping
- ECS entity operations

**Stable** (`tests/stable/`) - Fix within 1 week
- Server Actions
- Complex business logic

**Flexible** (`tests/flexible/`) - Skip during rapid dev

**Experimental** (`tests/experimental/`) - Delete or promote in 2 weeks

### Real Fixtures Only

```typescript
// ✅ CORRECT
import { realChunks } from '@/tests/fixtures/chunks'
const chunk = realChunks.gravityRainbow_chunk0

// ❌ WRONG
const chunk = { content: "Lorem ipsum..." }
```

## Related Documentation

- `docs/testing/TESTING_RULES.md`
