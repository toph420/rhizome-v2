---
description: Resume work from handoff document with context analysis
---

# Resume Handoff

Resume work from the provided handoff document. **Action-first approach**: Read context, extract next steps, START DOING THEM.

## Core Philosophy

**DO, don't just analyze.** The handoff already contains the analysis - your job is to **pick up where it left off** and make progress.

## Usage

```bash
/rhizome:resume-handoff thoughts/handoffs/2025-10-21_feature-name.md
```

If no path provided, list available handoffs and ask which to resume.

---

## Process (Action-First)

### Step 1: Load Context Quickly

**Read the handoff completely** (no limit/offset):
- Extract **Next Steps** section (this is your TODO)
- Extract **Learnings** section (reference during implementation)
- Extract **Recent Changes** section (file:line references)
- Note git commit/branch from frontmatter
- Identify referenced plan documents

**Read referenced plans** (if any):
- Check handoff for `thoughts/plans/` references
- Read those plans directly (no agents)
- Get full context before acting

**Verify git state**:
```bash
git status && git branch
```
- Compare current branch to handoff branch
- Note any uncommitted changes

### Step 2: Create Action Plan from Next Steps

**Extract actionable items** from "Next Steps" section:
- Immediate priority tasks
- Medium priority tasks
- Low priority / future items

**Use TodoWrite** to create task list:
```typescript
TodoWrite({
  todos: [
    { content: "First immediate task from handoff", status: "pending", activeForm: "Working on first task" },
    { content: "Second immediate task", status: "pending", activeForm: "Working on second task" },
    // ... medium and low priority
  ]
})
```

**Present brief summary**:
```
Resuming from [date] handoff: [topic]

Git: [current branch] (handoff was on [handoff branch])

Created [N] tasks from Next Steps. Starting with:
1. [First task]

Referenced learnings loaded. Ready to proceed.
```

### Step 3: START IMPLEMENTATION

**Mark first task as in_progress and BEGIN**:
- Reference "Learnings" section when encountering similar patterns
- Reference "Recent Changes" to see what files were modified
- Apply documented patterns from handoff
- Update TodoWrite as you complete tasks

**Only verify current state if needed**:
- If you encounter unexpected errors → check if files changed
- If patterns don't match → verify with quick Grep
- If stuck → spawn codebase-analyzer for specific issue
- **Don't do upfront verification "just in case"**

**Keep momentum**:
- Don't stop to ask permission for obvious next steps
- Don't present analysis unless something is unclear
- Don't spawn agents unless you need specific info
- **Focus on making progress, not documenting progress**

---

## When to Pause and Ask

**DO pause and ask if**:
- Next step is ambiguous (multiple valid approaches)
- You encounter breaking changes (handoff assumptions invalid)
- Learnings contradict current code state
- Major architectural decision needed

**DON'T pause and ask if**:
- Next step is clear and documented
- You're following established patterns
- You're completing partially-finished work
- You're fixing bugs mentioned in handoff

---

## Using Handoff Sections

### Next Steps (Your TODO)
This is your task list. Extract and execute.

```markdown
## Next Steps

### Immediate
1. Fix webhook validation bug in auth.ts:45
2. Add tests for edge case
3. Update documentation

### Medium Priority
4. Refactor error handling
...
```

**Action**: Create TodoWrite from this, start with #1.

### Learnings (Reference Guide)
These are insights discovered during implementation. Reference when you encounter similar situations.

```markdown
## Learnings

### 1. Storage Upload RLS Issue
**Problem**: Storage uploads failed with RLS error
**Solution**: Use admin client for server-side operations
**File**: src/app/actions/sparks.ts:117-129
```

**Action**: When working with Storage uploads, reference this learning.

### Recent Changes (What Was Done)
Files modified with line numbers. Shows what already exists.

```markdown
## Recent Changes

1. **src/app/actions/sparks.ts:116-135**
   - Added admin client for Storage uploads
   - Added upsert: true to prevent duplicates
```

**Action**: Read these files if you need to understand what was implemented.

### Artifacts (Created/Modified Files)
List of files that were created or modified.

**Action**: These are the files you'll likely continue working with.

---

## Common Scenarios

### Scenario 1: Clean Continuation
**Handoff**: "Next step: Add validation tests"
**Your action**:
```
TodoWrite: Add validation tests
Start writing tests immediately
```

### Scenario 2: Incomplete Work
**Handoff**: "Task in_progress: Webhook validation partially implemented"
**Your action**:
```
Read the incomplete implementation
TodoWrite: Complete webhook validation
Finish the implementation
```

### Scenario 3: Ambiguous Next Steps
**Handoff**: "Consider refactoring auth system OR adding OAuth"
**Your action**:
```
Present options to user:
"The handoff suggests two approaches:
1. Refactor existing auth system
2. Add OAuth integration

Which would you prefer?"
```

### Scenario 4: Breaking Changes Detected
**Your action during implementation**:
```
"I'm trying to implement [task] but the auth pattern from the handoff has changed.

Handoff expected: AnnotationOperations pattern
Current code: Using SparkOperations pattern

Should I:
1. Adapt to new pattern
2. Verify this is intentional
3. Rollback to handoff state"
```

---

## Anti-Patterns (Don't Do These)

❌ **Reading the handoff back to the user**
```
"The handoff from 2025-10-21 was about fixing Admin Panel issues.
It completed 6 tasks including Storage upload fixes and vault structure updates.
The next steps are to test the import tab and upload documents.
Should I proceed?"
```

✅ **Acting on the handoff**
```
"Resuming Admin Panel fixes. Created 3 tasks from Next Steps.

Starting with: Test Admin Panel Import Tab

[Immediately begins testing]"
```

---

❌ **Spawning agents to verify everything**
```
[Spawns 3 agents to analyze files]
[Waits for all to complete]
[Presents 50-line analysis]
"Everything looks good, shall I proceed?"
```

✅ **Verifying only when needed**
```
[Starts implementation]
[Encounters error: pattern mismatch]
[Spawns codebase-analyzer for specific issue]
[Gets answer, continues]
```

---

❌ **Asking permission for obvious next steps**
```
"The handoff says to add tests. Should I add tests?"
```

✅ **Just doing obvious next steps**
```
"Adding validation tests as documented in Next Steps..."
[Writes tests]
```

---

## Quick Reference

**Read**:
- Handoff completely
- Referenced plans
- Git status

**Extract**:
- Next Steps → TodoWrite
- Learnings → Keep in mind
- Recent Changes → Know what exists

**Do**:
- Start first task immediately
- Reference learnings when relevant
- Update todos as you progress

**Ask only if**:
- Ambiguous next steps
- Breaking changes found
- Major decisions needed

---

## Listing Available Handoffs

If no path provided:

```bash
# List handoffs
ls -lt thoughts/handoffs/*.md | head -10

# Show with descriptions
grep -h "^topic:" thoughts/handoffs/*.md | head -10
```

Present to user:
```
Available recent handoffs:

1. 2025-10-21: Admin Panel Fixes & Spark Portability
2. 2025-10-20: UUID Preservation Fix
3. 2025-10-18: Spark System ECS Migration

Which would you like to resume? (or provide path)
```
