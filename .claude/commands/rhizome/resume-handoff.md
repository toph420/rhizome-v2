---
description: Resume work from handoff document with context analysis
---

# Resume Handoff

Resume work from a handoff document. This loads context, validates current state, and continues work.

## Usage

When invoked with a handoff path, immediately:
1. Read the handoff document FULLY
2. Read any plan documents it references
3. Spawn agents to analyze current state
4. Propose next actions

If no path provided, list available handoffs and ask which to resume.

## Process

### Step 1: Read Handoff and Referenced Documents

**Read handoff completely:**
- Use Read tool WITHOUT limit/offset
- Extract all sections (tasks, changes, learnings, artifacts, next steps)
- Note git commit and branch
- Identify referenced files and plans

**Read all referenced plans and artifacts:**
- Read plan documents from `thoughts/plans/`
- Read any research documents mentioned
- Do NOT use sub-agents for these critical files
- Get full context before spawning research tasks

### Step 2: Spawn Research Tasks to Verify Current State

Based on handoff content, spawn parallel agent tasks:

**Task 1 - Verify Recent Changes (codebase-analyzer):**
```
Analyze the files mentioned in "Recent Changes" section:
- [file:line references from handoff]

Verify:
1. Do these changes still exist?
2. Have they been modified since the handoff?
3. Are there any conflicts or regressions?

Return: Status of each change (present/missing/modified) with details
```

**Task 2 - Locate Related Components (codebase-locator):**
```
Based on the handoff's task description, find all relevant files:
- Module: [Main App / Worker / Both from handoff]
- Feature area: [from handoff topic]

Search for:
1. Components mentioned in learnings
2. Files related to the feature being worked on
3. Test files for affected code

Return: List of relevant files with brief descriptions
```

**Task 3 - Find Similar Patterns (codebase-pattern-finder):**
```
Based on the patterns discovered in "Learnings" section:
- [Pattern 1 from handoff]
- [Pattern 2 from handoff]

Find:
1. Where these patterns are used in the codebase
2. Any new code that might have used these patterns
3. Changes to the pattern implementations

Return: Pattern usage locations and any changes
```

**Wait for ALL agent tasks to complete** before proceeding.

### Step 3: Read Critical Files Identified

After agents return:
- Read files from "Learnings" section completely
- Read files from "Recent changes" to verify modifications
- Read any new related files discovered by agents

### Step 4: Synthesize and Present Analysis

Present comprehensive analysis:

```
Handoff Analysis from [date]

Git Context:
- Handoff commit: [commit from handoff]
- Handoff branch: [branch from handoff]
- Current branch: [current branch]

Original Tasks:
- [Task 1]: [Status from handoff] → [Current verified state]
- [Task 2]: [Status from handoff] → [Current verified state]

Rhizome Architecture from Handoff:
- Module: [Main/Worker/Both]
- Storage: [Database/Storage/Both]
- Migration: [Latest migration number]
- Pipeline Stages: [Which stages affected]
- Engines: [Which engines modified]

Agent Findings:

Recent Changes Verification:
- [file:line] - Present / Missing / Modified

Related Components Found:
- [component files discovered]

Pattern Usage:
- [pattern locations and status]

Key Learnings Still Valid:
- [Learning 1 with file:line] - Verified / Changed
- [Pattern] - Still applicable / Modified

Recommended Next Actions:
1. [Most logical next step based on handoff + current state]
2. [Second priority]
3. [Additional tasks discovered]

Potential Issues:
- [Any conflicts, regressions, or blockers]

Proceed with [action 1]?
```

Get confirmation before proceeding.

### Step 5: Create Action Plan

Use TodoWrite to create task list:
- Convert action items from handoff
- Add new tasks discovered during analysis
- Include any fixes needed for conflicts/regressions
- Prioritize based on dependencies

Present:
```
Task list created based on handoff analysis:

[Show todo list]

Ready to begin with: [first task]?
```

### Step 6: Begin Implementation

- Start with first approved task
- Reference learnings from handoff
- Apply documented patterns
- Update progress as tasks complete

## Guidelines

**Use Agents Effectively:**
- Spawn multiple agents in parallel for efficiency
- Use codebase-analyzer for understanding code state
- Use codebase-locator for finding related files
- Use codebase-pattern-finder for pattern verification
- Wait for all agents before synthesizing findings

**Be Thorough:**
- Read entire handoff first
- Verify ALL changes via agents
- Check for regressions
- Read all referenced files directly (no agents for critical docs)

**Leverage Handoff Wisdom:**
- Pay attention to "Learnings" section
- Apply documented patterns
- Avoid repeating mistakes
- Build on discovered solutions

**Validate Before Acting:**
- Never assume handoff = current state
- Use agents to verify current state
- Check for breaking changes
- Confirm patterns still valid

## Common Scenarios

**Clean Continuation:**
- All changes present (verified by codebase-analyzer)
- No conflicts found
- Clear next steps
→ Proceed with actions

**Diverged Codebase:**
- codebase-analyzer finds changes missing/modified
- codebase-locator finds new related code
- Need to reconcile differences
→ Adapt plan based on findings

**Incomplete Work:**
- Tasks marked "in_progress"
- Partial implementations found
- Complete unfinished work first
→ Focus on completion

**Pattern Evolution:**
- codebase-pattern-finder shows pattern changed
- New pattern implementations found
- Need to update approach
→ Adapt to new patterns

## Example Flow

```
User: /rhizome:resume-handoff thoughts/handoffs/2025-10-17_cached-chunks.md