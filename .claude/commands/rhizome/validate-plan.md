---
description: Validate implementation against plan, verify success criteria
---

# Validate Plan

Validate that an implementation plan was correctly executed, verify all success criteria, and identify any deviations or issues.

## Initial Setup

When invoked:

1. **Determine context** - In session or fresh start?
   - If existing: Review what was implemented
   - If fresh: Discover via git and codebase analysis

2. **Locate the plan**:
   - Use provided path if given
   - Otherwise search recent commits or ask

3. **Gather evidence**:
```bash
# Check recent commits
git log --oneline -n 20
git diff HEAD~N..HEAD

# Run Rhizome checks
npm test
npm run type-check
npm run build
```

## Validation Process

### Step 1: Context Discovery

If starting fresh:

**Read the plan completely**

**Identify expected changes:**
- List files that should be modified
- Note all success criteria (automated + manual)
- Identify key functionality

**Spawn parallel agents to discover implementation:**

**Agent 1 - codebase-analyzer:**
```
Verify implementation of: [feature from plan]

Check:
1. Were the specified files modified correctly?
2. Do changes match plan specifications?
3. Are patterns consistent with plan?

Files mentioned in plan: [list]

Return: File-by-file comparison of planned vs actual
```

**Agent 2 - codebase-locator:**
```
Find all files related to: [feature]

This helps discover:
1. Files modified but not in plan
2. Related files that might need updates
3. Test files that should exist

Return: Complete list of affected files
```

**Agent 3 - codebase-pattern-finder:**
```
Find test patterns for: [feature type]

Check if:
1. Tests follow existing patterns
2. Coverage matches similar features
3. Test files in correct locations

Return: Test coverage assessment
```

### Step 2: Systematic Validation

For each phase in the plan:

**Check completion status:**
- Look for checkmarks (- [x])
- Verify code matches claimed completion

**Run automated verification:**
- Execute each command from plan's "Automated Verification"
- Document pass/fail
- If failures, investigate root cause

**Assess manual criteria:**
- List what needs manual testing
- Provide clear steps for user

**Think about edge cases:**
- Error conditions handled?
- Missing validations?
- Could break existing functionality?

### Step 3: Rhizome-Specific Checks

**Architecture validation:**
- **Module**: Was correct module(s) modified?
- **Storage**: Database/Storage changes match plan?
- **Migration**: If plan said migration needed, does 053_*.sql exist?
- **Test Tier**: Tests in correct category (critical/stable)?
- **Pipeline**: If pipeline affected, all stages updated?
- **Engines**: If engines affected, orchestrator updated?

**Service restart validation:**
```bash
# If Supabase modified
npx supabase status  # Should show healthy

# If worker modified
# Check worker is running
lsof -i :3001  # Or whatever worker port

# If migrations added
npx supabase migration list  # Shows 053_* applied
```

### Step 4: Generate Validation Report

```markdown
## Validation Report: [Plan Name]

### Implementation Status
✓ Phase 1: [Name] - Fully implemented
✓ Phase 2: [Name] - Fully implemented
⚠️ Phase 3: [Name] - Partially implemented (see issues)

### Rhizome Architecture Validation
- Module: ✓ Worker modified as planned
- Storage: ✓ Database changes match (migration 053)
- Migration: ✓ Applied successfully
- Test Tier: ✓ Tests in correct category
- Pipeline: ✓ Stage 3 updated correctly
- Engines: N/A (not affected)

### Automated Verification Results
✓ Build: `npm run build`
✓ Tests: `npm test`
✓ Types: `npm run type-check`
⚠️ Linting: 3 warnings (non-blocking)

### Agent Findings

codebase-analyzer:
- [Findings about code quality]

codebase-locator:
- [Discovered files]

codebase-pattern-finder:
- [Test coverage assessment]

### Code Review

#### Matches Plan:
- Database migration adds chunks table correctly
- Processor implements batching as specified
- Error handling follows plan

#### Deviations from Plan:
- Used different approach in worker/lib/chunking.ts:45 (improvement)
- Added extra validation (beneficial)

#### Potential Issues:
- Missing index could impact performance
- No rollback handling in migration

### Manual Testing Required:
1. Upload document and verify chunking
2. Check Admin Panel shows correct data
3. Test with large PDF (500+ pages)
4. Verify Storage has all expected files

### Recommendations:
- Address linting warnings
- Add integration test for batch processing
- Document new chunking strategy
```

## Working with Existing Context

If you were part of the implementation:
- Review conversation history
- Check todo list for what was completed
- Focus on work done this session
- Be honest about shortcuts or incomplete items

## Guidelines

**Be thorough:**
- Run ALL automated checks
- Don't skip verification commands
- Document successes AND issues

**Be critical:**
- Question if implementation truly solves problem
- Consider maintenance burden
- Think about edge cases

**Use agents:**
- codebase-analyzer to verify implementation quality
- codebase-locator to find all affected files
- codebase-pattern-finder to check test coverage

## Validation Checklist

- [ ] All phases marked complete are actually done
- [ ] Automated tests pass
- [ ] Type checking passes
- [ ] Build succeeds
- [ ] Code follows existing Rhizome patterns
- [ ] No regressions introduced
- [ ] Error handling robust
- [ ] Migration applied (if needed)
- [ ] Services restart correctly
- [ ] Manual test steps clear

## Workflow

Recommended sequence:
1. `/rhizome:implement-plan` - Execute implementation
2. `/rhizome:validate-plan` - Verify correctness
3. `/rhizome:commit` - Create commits
4. `/rhizome:describe-pr` - Generate PR description

Validation catches issues before they reach production. Be constructive but thorough.
