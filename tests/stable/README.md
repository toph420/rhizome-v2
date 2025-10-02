# Stable Tests

**Priority**: Fix when broken - important for quality
**Maintenance**: Regular fixes during development cycles
**CI Behavior**: Failures are tracked but may not block deployment

## What Belongs Here

### API Contract Tests
- Server Actions input/output validation
- Database query interfaces
- External API integration contracts

### Core System Integration
- Authentication and authorization flows
- File upload and storage operations
- Background job processing

### Data Layer Tests
- Database CRUD operations
- Entity-Component-System (ECS) functionality
- Query performance and correctness

## Current Tests in This Category

### Integration Tests (from tests/integration/)
- `database/documents.test.ts` - Document CRUD operations
- `database/chunks.test.ts` - Chunk management
- `database/embeddings.test.ts` - Vector operations
- `database/background-jobs.test.ts` - Job processing
- `annotation-flow.test.ts` - Annotation system

### Worker Tests (from worker/tests/)
- Individual engine tests (semantic-similarity, etc.)
- Processor integration tests for specific formats
- Cache and performance tests

### ECS Tests (from src/lib/ecs/)
- Entity creation and management
- Component operations
- Query system functionality

## Running Stable Tests

```bash
# Main app stable tests
npm run test:stable

# Worker stable tests
cd worker && npm run test:stable

# All stable tests
npm run test:stable:all
```

## Quality Gates

- ⚠️ Important for quality but may not block deployment
- ✅ Should be fixed within 1-2 development cycles
- ✅ Tracked in team metrics and dashboards
- ✅ Required for major version releases
