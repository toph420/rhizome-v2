# Experimental Tests

**Priority**: New feature prototyping
**Maintenance**: Temporary - clean up when feature stabilizes
**CI Behavior**: Excluded from main CI runs

## What Belongs Here

### Feature Spike Tests
- Proof of concept validation
- Experimental feature testing
- Architecture exploration

### Prototype Integration Tests
- Temporary integration validation
- New feature smoke tests
- API design validation

### Research and Development
- Performance experiment validation
- New technology integration tests
- Feature flag testing

## Current Tests in This Category

### New Feature Development
- Placeholder for features in development
- Temporary validation tests
- Architecture proof-of-concept tests

### Performance Experiments
- Load testing prototypes
- New algorithm validation
- Optimization experiments

## Running Experimental Tests

```bash
# Experimental tests (manual only)
npm run test:experimental

# Specific experiment
npm run test:experimental -- --testNamePattern="experiment-name"
```

## Quality Gates

- ❌ Not included in CI pipeline
- ❌ No blocking behavior
- ✅ Manual execution only
- ✅ Clean up when feature stabilizes

## Lifecycle Management

### When Feature Stabilizes
1. Move critical tests to `tests/critical/`
2. Move stable functionality to `tests/stable/`
3. Delete or archive experimental tests
4. Update documentation

### Cleanup Schedule
- **Weekly**: Review experimental test relevance
- **Sprint End**: Clean up obsolete experiments
- **Release**: Ensure no experimental tests in CI
