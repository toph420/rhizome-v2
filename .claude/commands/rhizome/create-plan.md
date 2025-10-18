---
description: Create implementation plans through interactive research and iteration
model: opus
---

# Create Plan

Create detailed implementation plans through interactive research. Be skeptical, thorough, and work collaboratively with the user.

## Initial Response

When invoked:

**If parameters provided** (file path or description):
- Skip default message
- Read any provided files FULLY
- Begin research process immediately

**If no parameters**:
```
I'll help create an implementation plan.

Provide:
1. Task/feature description
2. Context, constraints, requirements
3. Related documents or previous work

I'll analyze and create a comprehensive plan.

Tip: /rhizome:create-plan <description> or /rhizome:create-plan <file-path>
```

Wait for user input.

## Process Steps

### Step 1: Context Gathering & Research

**Read all mentioned files IMMEDIATELY and FULLY:**
- Use Read tool WITHOUT limit/offset
- Read requirement docs, research documents, related plans
- **CRITICAL**: Read in main context, NOT via sub-agents
- **NEVER** read files partially

**Spawn parallel research agents:**

Use codebase agents to gather context BEFORE asking questions:

**Agent 1 - codebase-locator:**
```
Find all files related to: [feature/task description]

Module context: [Main App / Worker / Both - infer from task]
Feature area: [relevant subsystem - pipeline, storage, reader, etc.]

Search for:
1. Related components and processors
2. Existing implementations of similar features
3. Test files for affected areas
4. Configuration files

Return: List of relevant files with descriptions
```

**Agent 2 - codebase-analyzer:**
```
Analyze current implementation of: [related system]

Focus on:
1. How does [system] currently work?
2. Data flow and key functions
3. Integration points and dependencies
4. Patterns and conventions used

Files to analyze: [files from locator]

Return: Detailed explanation with file:line references
```

**Agent 3 - codebase-pattern-finder:**
```
Find similar features we can model after: [feature type]

Look for:
1. Similar implementations in codebase
2. Patterns for [specific need]
3. Test patterns we should follow

Return: Examples with file:line references
```

**If external research needed - web-search-researcher:**
```
Research: [library/technology/pattern needed]

Find:
1. Official documentation and best practices
2. Implementation examples
3. Known issues or gotchas

Return: Key findings with sources
```

**Wait for ALL agents to complete** before proceeding.

**Read files identified by agents:**
- After agents return, read ALL files they identified
- Read them FULLY into main context
- Ensures complete understanding

**Analyze and verify:**
- Cross-reference requirements with actual code
- Identify discrepancies or misunderstandings
- Note assumptions needing verification
- Determine true scope

**Present informed understanding:**
```
Based on research, I understand we need to [accurate summary].

Agent Findings:

codebase-locator found:
- [relevant files and components]

codebase-analyzer discovered:
- [current implementation details with file:line]
- [patterns and conventions to follow]

codebase-pattern-finder identified:
- [similar implementations to model after]

Questions my research couldn't answer:
- [Technical question requiring human judgment]
- [Business logic clarification]
- [Design preference affecting implementation]
```

Only ask questions genuinely unanswerable through code investigation.

### Step 2: Rhizome Architecture Planning

Before detailed planning, determine architecture decisions:

**Present architecture questions:**
```
Rhizome Architecture Decisions:

Module Impact:
- [ ] Main App only (Next.js)
- [ ] Worker only (processing)
- [ ] Both modules

Storage Strategy:
- [ ] Database only (queryable data)
- [ ] Storage only (files, exports)
- [ ] Both (hybrid approach)
- Source of truth: Database / Storage

Migration Required:
- [ ] Yes - Next number is 053
- [ ] No database changes

Test Classification:
- [ ] Critical (blocks deployment)
- [ ] Stable (fix when broken)

Pipeline Impact:
- [ ] Which stages affected: [1-10]
- Processing mode: LOCAL / CLOUD / BOTH

Connection Engines:
- [ ] Semantic (25%)
- [ ] Contradiction (40%)
- [ ] Thematic (35%)

Which decisions apply to this feature?
```

Get confirmation on architecture before detailed planning.

### Step 3: Additional Research (if needed)

If user corrects misunderstanding or requests deeper research:

**Create research todo list** using TodoWrite

**Spawn additional parallel agents:**
- codebase-locator for more specific files
- codebase-analyzer for deeper implementation understanding
- codebase-pattern-finder for additional examples
- web-search-researcher for external docs

**Wait for all agents**, then present findings and design options:
```
Based on additional research:

Current State:
- [Key discovery with file:line]
- [Pattern to follow]

Design Options:
1. [Option A] - [pros/cons]
2. [Option B] - [pros/cons]

Which approach aligns with your vision?
```

### Step 4: Plan Structure Development

**Create initial outline:**
```
Proposed Plan Structure:

## Overview
[1-2 sentence summary]

## Rhizome Context
- Module: [Main/Worker/Both]
- Storage: [Database/Storage/Both]
- Migration: [Yes/No - 053 if needed]
- Pipeline: [stages affected]

## Implementation Phases:
1. [Phase name] - [what it accomplishes]
2. [Phase name] - [what it accomplishes]
3. [Phase name] - [what it accomplishes]

Does this structure work?
```

Get feedback on structure before writing details.

### Step 5: Detailed Plan Writing

**Write plan to** `thoughts/plans/YYYY-MM-DD_description.md`:
- Format: `YYYY-MM-DD_description.md`
- Example: `2025-10-17_cached-chunks-storage.md`

**Template structure:**

````markdown
# [Feature Name] Implementation Plan

## Overview
[Brief description and why]

## Current State Analysis
[What exists, what's missing, constraints discovered]

### Key Discoveries:
- [Finding with file:line]
- [Pattern to follow]
- [Constraint]

## Desired End State
[Specification of desired end state and how to verify]

## Rhizome Architecture
- **Module**: Main App / Worker / Both
- **Storage**: Database / Storage / Both (Source of truth: X)
- **Migration**: Yes (053_description.sql) / No
- **Test Tier**: Critical / Stable
- **Pipeline Stages**: [Which stages]
- **Engines**: [Which engines if applicable]

## What We're NOT Doing
[Out-of-scope items to prevent scope creep]

## Implementation Approach
[High-level strategy and reasoning]

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Changes Required:

#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary]

```[language]
// Specific code to add/modify
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Tests pass: `npm test`
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Feature works in UI
- [ ] Performance acceptable
- [ ] Edge cases handled

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to next phase.

### Service Restarts:
- [ ] Supabase: `npx supabase db reset` (if schema changed)
- [ ] Worker: restart via `npm run dev`
- [ ] Next.js: verify auto-reload

---

## Phase 2: [Descriptive Name]
[Similar structure...]

---

## Testing Strategy

### Unit Tests:
- [What to test]
- [Key edge cases]

### Integration Tests:
- [End-to-end scenarios]

### Manual Testing:
1. [Specific verification step]
2. [Another step]

## Performance Considerations
[Performance implications or optimizations]

## Migration Notes
[If applicable, data migration strategy]

## References
- Architecture: `docs/ARCHITECTURE.md`
- Pipeline: `docs/PROCESSING_PIPELINE.md`
- Testing: `docs/testing/TESTING_RULES.md`
- Similar implementation: `[file:line]`
````

### Step 6: Save and Review

**Save the plan:**
```bash
git add thoughts/plans/
git commit -m "docs: implementation plan for [feature-name]"
```

**Present for review:**
```
Plan created at: thoughts/plans/YYYY-MM-DD_feature-name.md

Review:
- Are phases properly scoped?
- Are success criteria specific enough?
- Any missing technical details?
- Edge cases covered?
```

**Iterate based on feedback:**
- Add missing phases
- Adjust technical approach
- Clarify success criteria (automated vs manual)
- Add/remove scope items

Continue refining until user satisfied.

## Important Guidelines

**Be Skeptical:**
- Question vague requirements
- Identify potential issues early
- Don't assume - verify with code via agents

**Be Interactive:**
- Don't write full plan in one shot
- Get buy-in at each step
- Allow course corrections

**Be Thorough:**
- Read context files COMPLETELY
- Use agents to research code patterns in parallel
- Include file:line references
- Write measurable success criteria (automated vs manual)
- Use `npm`/`npx` commands for verification

**Be Practical:**
- Incremental, testable changes
- Consider migration and rollback
- Think about edge cases
- Include "what we're NOT doing"

**Use Agents Effectively:**
- Spawn multiple agents in parallel
- Use codebase-locator to find files
- Use codebase-analyzer to understand implementations
- Use codebase-pattern-finder for examples
- Use web-search-researcher for external docs
- Wait for all agents before synthesizing

**No Open Questions in Final Plan:**
- If questions arise, STOP
- Research or ask immediately
- Do NOT write plan with unresolved questions
- Every decision must be made before finalizing

## Success Criteria Guidelines

**Always separate into two categories:**

**Automated Verification** (can be run by execution agents):
- Commands: `npm test`, `npm run lint`
- File existence checks
- Code compilation/type checking
- Automated test suites

**Manual Verification** (requires human testing):
- UI/UX functionality
- Performance under real conditions
- Hard-to-automate edge cases
- User acceptance criteria

**Format example:**
```markdown
### Success Criteria:

#### Automated Verification:
- [ ] Migration: `npx supabase db reset`
- [ ] Tests: `npm test`
- [ ] Linting: `npm run lint`
- [ ] Type check: `npm run type-check`

#### Manual Verification:
- [ ] Feature works in UI
- [ ] Performance acceptable with 1000+ items
- [ ] Error messages user-friendly
```

## Rhizome Common Patterns

**For Processing Features:**
- Determine pipeline stage first
- Check if Docling/Ollama/Gemini needed
- Consider batching for large documents
- Add to orchestrator if multi-stage

**For Storage Operations:**
- Determine source of truth (Storage vs Database)
- Plan portability impact
- Scanner validation if needed
- Export/import considerations

**For Connection Engine Changes:**
- Identify which engines affected
- Update orchestrator if weights change
- Consider filtering strategy
- Test with real documents

**For Database Changes:**
- Start with migration (053_...)
- Update types in `worker/types/database.ts`
- Add queries/mutations
- Update affected processors
- Add to portability system if needed

## Agent Spawning Best Practices

**When spawning research agents:**

1. **Spawn multiple in parallel** for efficiency
2. **Each focused** on specific area
3. **Provide detailed instructions:**
   - What to search for
   - Which directories
   - What information to extract
   - Expected output format

4. **Be specific about modules:**
   - "Main App" means `src/`
   - "Worker" means `worker/`
   - "Pipeline" means `worker/processors/` and `worker/handlers/`

5. **Request file:line references** in responses
6. **Wait for all** before synthesizing
7. **Verify results:**
   - Spawn follow-ups if unexpected
   - Cross-check against codebase
   - Don't accept incorrect results

## Example Interaction

```
User: /rhizome:create-plan Add support for DOCX files