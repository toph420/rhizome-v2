---
description: Implement technical plans from thoughts/plans with verification
---

# Implement Plan

Implement an approved technical plan from `thoughts/plans/`. Plans contain phases with specific changes and success criteria.

## Getting Started

**If plan path provided:**
- Read plan completely
- Read all mentioned files fully (no limit/offset)
- Create TodoWrite for tracking
- Start implementing

**If no plan path:**
Ask: "Which plan should I implement? (path from thoughts/plans/)"

## Implementation Philosophy

Plans are carefully designed, but reality can be messy:
- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to next
- Verify work makes sense in broader codebase context
- Update checkboxes in the plan as you complete sections

When things don't match the plan exactly, think about why and communicate clearly. The plan is your guide, but your judgment matters too.

## When to Use Agents

**Use codebase agents when:**
- Encountering unfamiliar code not explained in plan
- Need to find similar patterns for reference
- Debugging unexpected behavior
- Plan references code that has moved/changed

**Agent examples:**
```
Issue: Plan references auth.ts but file doesn't exist
→ Use codebase-locator to find where auth code moved

Issue: Need to implement pattern similar to existing feature
→ Use codebase-pattern-finder to find examples

Issue: Unexpected error from unfamiliar module
→ Use codebase-analyzer to understand the module
```

**Don't use agents for:**
- Code explicitly explained in the plan
- Simple file reads
- Tasks you already understand
- Routine implementation work

## Mismatch Handling

If you encounter a mismatch:
- STOP and think deeply about why plan can't be followed
- Present the issue clearly:
  ```
  Issue in Phase [N]:
  Expected: [what the plan says]
  Found: [actual situation]
  Why this matters: [explanation]

  Options:
  1. [Adapt approach A]
  2. [Adapt approach B]

  How should I proceed?
  ```

## Verification Approach

After implementing a phase:
- Run the success criteria checks
- Fix any issues before proceeding
- Update progress in plan and todos
- Check off completed items in plan file using Edit

**After phase completion:**
```
Phase [N] automated checks: ✅

Manual verification needed:
- [list items]

Continue to Phase [N+1]? (type 'yes' or provide feedback)
```

If instructed to execute multiple phases, skip pause until last phase.

Do NOT check off manual items until user confirms.

## Service Restarts

After code changes, check if services need restart:
- **Supabase**: `npx supabase db reset` (if migrations changed)
- **Worker**: Restart via `npm run dev` (if worker code changed)
- **Next.js**: Auto-reloads, but verify (if frontend changed)

## Resuming Work

If plan has existing checkmarks:
- Trust that completed work is done
- Pick up from first unchecked item
- Verify previous work only if something seems off

## Guidelines

**Focus on implementation:**
- You're implementing a solution, not just checking boxes
- Keep end goal in mind
- Maintain forward momentum
- Adapt when needed while staying true to plan intent

**Use TodoWrite:**
- Track implementation progress
- Mark phases as in_progress/completed
- Add discovered sub-tasks

**Communication:**
- Report issues immediately
- Explain deviations from plan
- Ask when uncertain
- Confirm before major changes

**Quality:**
- Run automated checks before marking phase complete
- Test edge cases
- Verify integrations
- Follow Rhizome patterns

## Example

```
User: /rhizome:implement-plan thoughts/plans/2025-10-17_add-docx-support.md
```