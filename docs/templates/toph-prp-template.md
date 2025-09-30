# {Feature Name} - Implementation Spec (PRP)

**From Decision**: docs/brainstorming/{feature-name}.md
**Status**: Ready / In Progress / Complete

## What We're Building
{2-3 sentences describing the change}

## Critical Context

### Pattern to Mirror
**Reference File**: `{exact-file-path}`
**Lines**: {X-Y}
**What to Copy**: {specific pattern/structure}

### Files to Modify
- `{file1}`:
  - Find: {specific code to locate}
  - Change: {what to do}
  - Why: {key reason}

- `{file2}`:
  - Create: {new function/component}
  - Mirror: {similar code location}
  - Why: {key reason}

### Key Gotchas
- {Library/framework quirk that will bite you}
- {Performance/behavior constraint}
- {Integration point that matters}

## Implementation Checklist
- [ ] {Specific change 1}
- [ ] {Specific change 2}
- [ ] {Specific change 3}
- [ ] Run validation: `{command}`
- [ ] Manual test: {simple verification}

## Validation

### Quick Check
```bash
{commands that prove basic functionality}
```

### Real Test
{The actual way you'll know it works}
1. {Do this}
2. {Expect this}
3. ✓ if: {specific outcome}

## If It Breaks
- Most likely: {common failure mode}
- Check: {where to look}
- Rollback: `git revert {commit}`

## Open Questions
- [ ] {Thing you're not sure about yet}
- [ ] {Assumption that needs validating}
```