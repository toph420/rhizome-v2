---
name: Rhizome Testing Strategy
description: Test based on replaceability not coverage. Critical tests (hours of user work) MUST pass and block deploys. Use real fixtures from processed chunks, not Lorem Ipsum. Categorize into critical/stable/flexible/experimental directories. Use when writing tests or reviewing test organization. Trigger keywords: test, testing, jest, vitest, fixtures, test:critical, annotation recovery, chunk remapping, real fixtures, Lorem Ipsum, tests/critical, test organization.
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

## When NOT to Use This Skill

- **Unit tests for pure functions**: Standard testing practices apply
- **External API integration tests**: Mock at boundaries, test contracts
- **Performance benchmarks**: Separate benchmark suite
- **Visual regression tests**: Use specialized visual testing tools

### ❌ Common Mistakes

```typescript
// Wrong: Generic test names
test('it works', () => { ... })
// Should: 'recovers annotation position after chunk reprocessing'

// Wrong: Lorem Ipsum fixtures
const chunk = { content: "Lorem ipsum dolor sit amet..." }
// Should: import { realChunks } from '@/tests/fixtures/chunks'

// Wrong: Skipping critical tests
npm test -- --skip critical  // NEVER!
// Critical tests MUST always run

// Wrong: Testing implementation details
expect(component.state.internalCounter).toBe(5)
// Should test user-visible behavior instead

// Wrong: One giant test
test('entire workflow', () => {
  // 200 lines testing everything
})
// Should split into focused tests per concern
```

## Related Documentation

- `docs/testing/TESTING_RULES.md`
