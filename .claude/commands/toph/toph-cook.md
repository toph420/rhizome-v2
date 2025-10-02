---
description: Execute implementation from spec or tasks
argument-hint: [spec or task file path]
allowed-tools: Read, Write, Edit, MultiEdit, Bash
---

# Ship Feature

1. **Load Context** (read spec/tasks to understand current state)
2. **Execute** (make changes following patterns)
3. **Update Tasks** (mark complete, add notes)
4. **Validate** (run checks from spec)
5. **Report** (working/broken/blocked)

If mid-implementation: Update task file with progress notes.
If complete: Mark all tasks done, run final validation.
If blocked: Document issue, suggest next step.