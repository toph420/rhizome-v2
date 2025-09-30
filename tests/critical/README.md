# Critical Tests

**Priority**: Must always pass - blocks deployment
**Maintenance**: High priority fixes
**CI Behavior**: Failure blocks all releases

## What Belongs Here

### E2E User Journeys
- Core user workflows that define the product value
- Critical business logic that users depend on
- Integration flows that span multiple systems

### Smoke Tests
- Basic application startup and connectivity
- Database migration and schema validation
- External service connectivity (Supabase, Gemini)

### Core Business Logic
- Document processing pipeline integrity
- Collision detection engine functionality
- Data integrity and consistency checks

## Current Tests in This Category

### E2E Tests (from tests/e2e/)
- `journeys/critical-paths.spec.ts` - Core user workflows
- `journeys/upload-process-read.spec.ts` - Document processing flow
- `smoke.spec.ts` - Application startup validation

### Integration Tests (from tests/integration/)
- `database/migrations.test.ts` - Schema integrity
- Core database operations for documents, chunks, embeddings

### Worker Tests (from worker/tests/)
- `integration/full-system.test.ts` - End-to-end processing
- Engine orchestrator tests - Core collision detection

## Running Critical Tests

```bash
# Main app critical tests
npm run test:critical

# Worker critical tests
cd worker && npm run test:critical

# All critical tests
npm run test:critical:all
```

## Quality Gates

- ✅ Must pass before any deployment
- ✅ Blocks merge to main branch
- ✅ Required for release candidates
- ✅ High priority bug fixes when failing
