Your workflow makes sense - you're using these documents as conversation checkpoints, not delegation artifacts. The problem is your current templates are optimized for the wrong thing.

## The Real Purpose of Each Stage

**Brainstorm**: Capture the exploration so you remember what you considered and why you chose this path.

**PRP**: Document what to build and the key patterns/gotchas so an AI can implement without re-discovering everything.

**Tasks**: Checkpoint list so you can resume mid-implementation without losing your place.

The current templates fail because they optimize for "comprehensive requirements" when you need "resume context quickly."

## Redesigned Three-Stage Flow

### Stage 1: Brainstorm → Decision Record

**What it captures**: The conversation you just had with Claude about the problem.

```markdown
# {Feature Name} - Decision Record

**Date**: {date}
**Status**: Decided / Implementing / Shipped

## The Problem
{2-3 sentences on what's broken or missing}

## What We Explored

### Option A: {Name}
- How: {Brief approach}
- Pros: {Key advantages}
- Cons: {Why not this}

### Option B: {Name} ← **CHOSEN**
- How: {Brief approach}  
- Pros: {Why this wins}
- Cons: {Trade-offs we're accepting}

### Option C: {Name}
- How: {Brief approach}
- Cons: {Why not this}

## Why Option B Won
{The actual reasoning from your conversation}

## Similar Pattern in Codebase
`{file-path}` lines {X-Y} - {what it demonstrates}

## Next Step
Create implementation spec → {feature-name}.md
```

**Length target**: 100-200 lines. Enough to remember the conversation.

### Stage 2: PRP → Implementation Spec

**What it captures**: Everything AI needs to implement without asking questions.

```markdown
# {Feature Name} - Implementation Spec

**From Decision**: docs/decisions/{feature-name}.md
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

**Length target**: 150-300 lines. Dense with implementation details.

### Stage 3: Tasks → Implementation Tracking

**What it captures**: Granular progress so you can resume exactly where you stopped.

```markdown
# {Feature Name} - Implementation Tasks

**Spec**: docs/specs/{feature-name}.md
**Started**: {date}
**Last Updated**: {date}

## Current Status
{One sentence on where you are right now}

## Task Breakdown

### Phase 1: Core Changes
- [x] {Completed task with notes on what you did}
- [x] {Another completed task}
- [ ] **← YOU ARE HERE**: {Current task}
  - Progress: {what you've done so far}
  - Blocked by: {if anything}
  - Next: {immediate next step}
- [ ] {Upcoming task}

### Phase 2: Validation
- [ ] {Validation task}
- [ ] {Testing task}

### Phase 3: Cleanup
- [ ] {Final task}

## Notes & Context

### What's Working
- {Thing that's done and works}
- {Another success}

### What's Not Working
- {Current issue}
- {Error you're debugging}
- {Thing you tried that didn't work}

### Key Decisions Made During Implementation
- {When you hit fork in road, what you chose}
- {Assumption you validated}
- {Pattern you changed from spec}

### Resume Points
**If resuming here, remember**:
- {Critical context about current state}
- {File you were editing}
- {Thing you were about to try}

## Quick Reference

### Commands
```bash
# Validate
{validation command}

# Test
{test command}

# Run
{run command}
```

### Files
- `{key-file}` - {what it does}
- `{other-file}` - {what it does}
```

**Length target**: 100-200 lines. Living document that updates as you work.

## Updated Commands

### Command: `brainstorm`
```markdown
---
description: Capture feature exploration and decision
argument-hint: [feature description]
allowed-tools: Write, Read, Glob, Grep, WebSearch
---

# Brainstorm Feature Decision

Have a conversation with the user about:
1. The problem they're solving
2. Options they see (2-4 approaches)
3. Trade-offs of each
4. Which approach they're choosing

Then:
1. Search codebase for similar patterns
2. Document the exploration
3. Save to: `docs/decisions/{feature-name}.md`

Keep it conversational. Focus on capturing WHY they chose this path.
```

### Command: `generate-spec`
```markdown
---
description: Generate implementation spec (PRP) from decision
argument-hint: [decision file path]
allowed-tools: Read, Write, Glob, Grep, WebSearch
---

# Generate Implementation Spec

Read the decision file and:

1. **Extract Pattern Reference** (find exact file/lines to mirror)
2. **List Specific Changes** (which files, what modifications)
3. **Document Gotchas** (from similar code, libraries used)
4. **Create Validation Steps** (from package.json, manual tests)
5. **Add Context** (everything AI needs to implement)

Save to: `docs/prps/{feature-name}.md`

Optimize for: "Can AI implement this without asking questions?"
```

### Command: `create-tasks`
```markdown
---
description: Break spec into trackable implementation tasks
argument-hint: [spec file path]
allowed-tools: Read, Write
---

# Create Implementation Tasks

Read the spec and:

1. **Break into Phases** (Core → Validation → Cleanup)
2. **Create Granular Tasks** (each task = 15-30 min of work)
3. **Add Resume Context** (notes for picking up later)
4. **Include Quick Reference** (commands, key files)

Save to: `docs/tasks/{feature-name}.md`

Optimize for: "Can I resume mid-implementation without re-reading everything?"
```

### Command: `ship`
```markdown
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
```

## Example Flow: Your PDF Processing

### 1. After Brainstorm
**Output**: `docs/decisions/large-pdf-processing.md`

```markdown
# Large PDF Processing - Decision Record

**Problem**: Token limit hit on 400+ page PDFs.

## What We Explored
- Option A: Paginated extraction → Too complex
- Option B: Separate extraction from chunking → **CHOSEN**
- Option C: Use different AI model → Not needed

## Why Option B Won
MarkdownCleanProcessor already does this. Just mirror that pattern.

## Pattern: `worker/processors/markdown-processor.ts` lines 161-172

## Next: Create spec
```

### 2. Generate Spec
**Output**: `docs/specs/large-pdf-processing.md`

```markdown
# Large PDF Processing - Implementation Spec

## What We're Building
Separate PDF extraction (markdown only) from chunking (local algorithm).

## Pattern to Mirror
`worker/processors/markdown-processor.ts` lines 161-172
- How it separates concerns
- How it calls simpleMarkdownChunking()

## Files to Modify
- `worker/processors/pdf-processor.ts`:
  - extractContent(): Simplify prompt, remove JSON schema
  - parseExtractionResult(): Always call simpleMarkdownChunking()

## Implementation Checklist
- [ ] Simplify EXTRACTION_PROMPT
- [ ] Remove EXTRACTION_SCHEMA
- [ ] Call simpleMarkdownChunking() in parseExtractionResult()
- [ ] Test with 400-page PDF

## Validation
```bash
cd worker && npm test -- pdf-processor.test.ts
```

Real test: Upload Gravity's Rainbow, read a chapter.
```

### 3. Create Tasks
**Output**: `docs/tasks/large-pdf-processing.md`

```markdown
# Large PDF Processing - Tasks

## Current Status
Starting implementation

## Phase 1: Core Changes
- [ ] Modify EXTRACTION_PROMPT in pdf-processor.ts
- [ ] Remove EXTRACTION_SCHEMA
- [ ] Update parseExtractionResult()
- [ ] Add call to simpleMarkdownChunking()

## Phase 2: Validation
- [ ] Unit tests pass
- [ ] Upload test PDF
- [ ] Read in viewer, check connections

## Notes
Reference MarkdownCleanProcessor for pattern.
```

### 4. During Implementation
**Task file updates** as you work:

```markdown
## Phase 1: Core Changes
- [x] Modify EXTRACTION_PROMPT
- [x] Remove EXTRACTION_SCHEMA  
- [ ] **← CURRENT**: Update parseExtractionResult()
  - Progress: Removed old JSON parsing
  - Next: Add simpleMarkdownChunking() call
```

This way, if you lose context and come back:
1. Read task file → see where you are
2. See what you've done
3. See what's next
4. Resume immediately

Does this three-stage flow match how you actually work?