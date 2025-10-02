# Development-Friendly Testing Strategy

**Version**: 2.0  
**Status**: Active  
**Last Updated**: January 30, 2025

## Overview

This testing strategy supports rapid iteration while maintaining quality protection through a flexible, categorized approach that adapts to development phases.

## Test Categories

### 🔴 Critical Tests
**Purpose**: Must always pass - blocks deployment  
**Location**: `tests/critical/`  
**CI Behavior**: Failure blocks all releases

- E2E user journeys (core workflows)
- Integration smoke tests (system connectivity)
- Core business logic (document processing, collision detection)

### 🟡 Stable Tests
**Purpose**: Fix when broken - important for quality  
**Location**: `tests/stable/`  
**CI Behavior**: Failures tracked but may not block deployment

- API contract tests (Server Actions, database queries)
- Core system integration (auth, file uploads, background jobs)
- Data layer tests (CRUD operations, ECS functionality)

### 🟢 Flexible Tests
**Purpose**: Skip during rapid development  
**Location**: `tests/flexible/`  
**CI Behavior**: Can fail without blocking development

- Component implementation tests (React components)
- Utility function tests (helpers, formatters)
- Internal method tests (implementation details)

### 🔵 Experimental Tests
**Purpose**: New feature prototyping  
**Location**: `tests/experimental/`  
**CI Behavior**: Excluded from main CI runs

- Feature spike validation
- Proof of concept tests
- Research and development experiments

## Development Workflows

### New Feature Development Pattern

```typescript
// 1. Start with E2E test for user journey (critical/)
test('User can upload and process document', async () => {
  // Test complete user workflow
});

// 2. Create integration smoke test (stable/)
test('Document processing pipeline works', async () => {
  // Test core system integration
});

// 3. Skip detailed unit tests during prototyping
// Focus on making the feature work

// 4. Add unit tests when feature stabilizes
// Move from experimental/ to stable/ or flexible/

// 5. Clean up test debt in stabilization sprints
// Review and organize test placement
```

### Rapid Development Phase

**Focus**: Speed and user value delivery

```bash
# Daily development workflow
npm run test:critical        # Must pass
npm run test:e2e            # Must pass
npm run test:stable || true # Track but don't block

# Skip during rapid iteration
# npm run test:flexible     # Fix during stabilization
```

**Quality Gates**:
- ✅ E2E tests must pass (blocks deploy)
- ✅ Integration smoke tests must pass (blocks deploy)
- ⚠️ Unit test coverage advisory only (doesn't block)
- ✅ Documentation updated for new features

### Stabilization Phase

**Focus**: Technical debt cleanup and test maintenance

```bash
# Stabilization workflow
npm run test:critical       # Must pass
npm run test:stable         # Fix all failures
npm run test:flexible       # Clean up test debt
npm run test:experimental   # Archive or promote
```

**Activities**:
1. Fix all failing stable tests
2. Add missing utility test coverage
3. Clean up experimental tests
4. Review test categorization
5. Update documentation

### Production Phase (Future)

**Focus**: Comprehensive quality assurance

```bash
# Production workflow
npm run test              # All tests must pass
npm run test:coverage     # Coverage thresholds enforced
npm run test:performance  # Performance benchmarks required
```

## Test Writing Guidelines

### When to Write Which Tests

| Development Stage | Critical | Stable | Flexible | Experimental |
|------------------|----------|---------|----------|--------------|
| **Feature Spike** | ❌ | ❌ | ❌ | ✅ |
| **MVP Development** | ✅ | ✅ | ❌ | ❌ |
| **Feature Completion** | ✅ | ✅ | ✅ | ❌ |
| **Maintenance** | ✅ | ✅ | ✅ | ❌ |

### Test Placement Decision Tree

```
New test needed?
├─ User workflow? → Critical
├─ System integration? → Stable  
├─ Component behavior? → Flexible
├─ Experimental feature? → Experimental
└─ Utility function? → Flexible
```

### Code Examples

#### Critical Test Example
```typescript
// tests/critical/upload-process-flow.test.ts
test('Complete document upload and processing workflow', async () => {
  // Test entire user journey from upload to reading
  await uploadDocument('test.pdf');
  await waitForProcessing();
  const processed = await getProcessedDocument();
  expect(processed.status).toBe('completed');
  expect(processed.chunks.length).toBeGreaterThan(0);
});
```

#### Stable Test Example
```typescript
// tests/stable/document-crud.test.ts
test('Document CRUD operations work correctly', async () => {
  // Test database operations and API contracts
  const doc = await createDocument(testData);
  const retrieved = await getDocument(doc.id);
  expect(retrieved).toMatchObject(testData);
});
```

#### Flexible Test Example
```typescript
// tests/flexible/upload-zone-component.test.ts
test('UploadZone shows drag state correctly', () => {
  // Test component implementation details
  render(<UploadZone />);
  fireEvent.dragEnter(screen.getByRole('button'));
  expect(screen.getByText('Drop files here')).toBeVisible();
});
```

## CI/CD Configuration

### Job Structure

```yaml
jobs:
  critical-tests:
    name: "Critical Path Protection"
    # E2E + integration smoke - MUST pass
    run: npm run test:critical
    
  development-tests:
    name: "Development Support Tests"  
    # Unit tests - can fail without blocking
    run: npm run test:stable || echo "Tracked but not blocking"
    continue-on-error: true

  quality-gates:
    needs: [critical-tests, development-tests]
    # Only critical tests block deployment
```

### Branch-Specific Behavior

- **Feature branches**: Critical tests only
- **Develop branch**: Critical + stable tests
- **Main branch**: All test categories
- **Release branches**: Full test suite + performance

## Maintenance Guidelines

### Weekly Review

```bash
# Test health check
npm run test:critical       # Should always pass
npm run test:stable         # Track failure trends
npm run test:flexible       # Note failing tests for cleanup

# Clean up experimental tests
rm -rf tests/experimental/obsolete-*
```

### Monthly Assessment

1. **Coverage Trend Analysis**
   - Review coverage direction (more important than absolute %)
   - Identify uncovered critical paths
   - Plan coverage improvements

2. **Test Categorization Review**
   - Move stable experimental tests to appropriate categories
   - Archive obsolete tests
   - Update test documentation

3. **Performance Review**
   - Test execution time analysis
   - CI/CD pipeline optimization
   - Flaky test identification and fixes

### Quarterly Strategy Review

1. **Phase Assessment**
   - Are we still in rapid development phase?
   - Should we move to stabilization phase?
   - What's the next phase transition plan?

2. **Quality Metrics Review**
   - Developer confidence in deployments
   - User-facing regression incidents
   - Test maintenance overhead

3. **Strategy Optimization**
   - Adjust coverage targets for current phase
   - Update quality gates based on learnings
   - Refine test categorization criteria

## Quality Metrics

### Technical Metrics
- **Test Reliability**: <5 failing test suites
- **CI/CD Stability**: >95% pipeline success rate
- **Coverage Accuracy**: Valid measurement baseline
- **Development Velocity**: Tests don't block feature work

### Team Metrics
- **Developer Confidence**: High confidence in deployments
- **Onboarding Speed**: New developers can write tests immediately
- **Maintenance Overhead**: <2 hours/week test maintenance
- **Quality Protection**: Zero user-facing regressions

### Coverage Targets by Phase

```bash
# Current Phase (Rapid Development)
E2E Coverage: 100% critical user journeys
Integration: 60% core paths  
Unit Tests: 30% stable APIs
Overall: 40% weighted average

# Stabilization Phase (Later)
E2E Coverage: 100% all user journeys
Integration: 80% system interactions
Unit Tests: 70% business logic
Overall: 70% weighted average

# Production Phase (Future)
E2E Coverage: 100% comprehensive
Integration: 90% all integrations
Unit Tests: 80% implementation
Overall: 85% comprehensive
```

## Command Reference

### Daily Development
```bash
# Critical path protection
npm run test:critical
npm run test:e2e

# Development support (can fail)
npm run test:stable || echo "Tracked but not blocking"
npm run test:flexible:all
```

### Stabilization Sprints
```bash
# Full test suite
npm test
cd worker && npm test

# Coverage analysis
npm test -- --coverage
cd worker && npm test -- --coverage

# Test health dashboard
npm run test:gates
```

### Release Preparation
```bash
# Quality gates validation
npm run test:critical:all
npm run test:e2e
npm run build

# Full validation
npm run test:all
cd worker && npm run test:full-validation
```

---

**Next Steps**: Implement this strategy gradually, starting with critical test identification and moving stable tests as development pace allows.
