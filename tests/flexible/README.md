# Flexible Tests

**Priority**: Skip during rapid development
**Maintenance**: Fix during stabilization sprints
**CI Behavior**: Can fail without blocking development

## What Belongs Here

### Component Implementation Tests
- React component unit tests
- UI component behavior and state
- Internal component logic

### Utility Function Tests
- Helper function validation
- Data transformation utilities
- Non-critical business logic

### Internal Class Method Tests
- Private method testing
- Implementation detail validation
- Code coverage for completeness

## Current Tests in This Category

### Unit Tests (from src/components/)
- Individual React component tests
- Form validation logic
- UI state management

### Utility Tests (from src/lib/)
- Helper function tests
- Data formatting utilities
- Type validation functions

### Worker Unit Tests (from worker/__tests__/)
- Individual utility functions
- Data transformation logic
- Configuration and setup helpers

## Running Flexible Tests

```bash
# Main app flexible tests
npm run test:flexible

# Worker flexible tests
cd worker && npm run test:flexible

# All flexible tests (may fail)
npm run test:flexible:all || echo "Flexible tests failing - OK during development"
```

## Quality Gates

- ✅ Can fail during rapid development phases
- ✅ Clean up during stabilization sprints
- ✅ Not required for deployment
- ✅ Useful for refactoring confidence

## Development Workflow

### During Feature Development
1. Skip writing these tests initially
2. Focus on critical path coverage
3. Add tests when feature stabilizes

### During Stabilization
1. Run and fix failing flexible tests
2. Add missing utility test coverage
3. Clean up test debt
