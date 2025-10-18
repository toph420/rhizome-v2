---
description: Create handoff document for transferring work to another session
---

# Create Handoff

Create a concise handoff document to transfer work to another session. This compacts context without losing key details.

## Process

### 1. Filepath & Metadata

Create handoff at: `thoughts/handoffs/YYYY-MM-DD_description.md`
- YYYY-MM-DD: Today's date (2025-10-17)
- description: Brief kebab-case description
- Example: `thoughts/handoffs/2025-10-17_cached-chunks-implementation.md`

Get git metadata:
```bash
git rev-parse HEAD  # Current commit
git branch --show-current  # Current branch
```

### 2. Write Handoff Document

```markdown
---
date: [ISO 8601 timestamp with timezone]
commit: [Git commit hash]
branch: [Current branch]
topic: "[Feature Name]"
tags: [worker, storage, pipeline]  # Rhizome modules affected
status: in_progress
---

# Handoff: {Concise Description}

## Task(s)
{What you were working on, status of each task. Reference plan documents if applicable.}

## Critical Rhizome References
- Architecture: `docs/ARCHITECTURE.md`
- Pipeline: `docs/PROCESSING_PIPELINE.md`
- Testing: `docs/testing/TESTING_RULES.md`
- {Other critical docs}

## Recent Changes
{File:line references for changes made}
- `worker/processors/pdf-processor.ts:45-67` - Added batch processing
- `src/app/read/[id]/page.tsx:123` - Updated reader layout

## Rhizome Architecture Decisions
- [ ] Module: Main App / Worker / Both
- [ ] Storage: Database / Storage / Both
- [ ] Migration: Current is 052, next would be 053
- [ ] Test Tier: Critical / Stable
- [ ] Pipeline Stage: [Which of 10 stages affected]
- [ ] Engines: Semantic / Contradiction / Thematic

## Learnings
{Important discoveries, patterns, root causes. Include file paths.}

## Artifacts
{List of files created/modified as paths or file:line references}

## Service Restart Requirements
- [ ] Supabase: `npx supabase db reset` (if schema changed)
- [ ] Worker: restart via `npm run dev`
- [ ] Next.js: auto-reload verified

## Context Usage
- Files read: [count]
- Tokens used: ~[estimate]
- Compaction needed: YES / NO

## Next Steps
{Action items for next session}

## Other Notes
{Additional information, codebase locations, etc.}
```

### 3. Save and Confirm

After creating the handoff:

```bash
git add thoughts/handoffs/
git commit -m "docs: session handoff for [feature-name]"
```

Respond to user:
```
Handoff created at thoughts/handoffs/YYYY-MM-DD_feature-name.md

Resume with: /rhizome:resume-handoff thoughts/handoffs/YYYY-MM-DD_feature-name.md
```

## Guidelines

- **Be thorough**: More information is better than less
- **Be precise**: Include top-level and low-level details
- **Avoid code dumps**: Use file:line references instead of large snippets
- **Focus on context**: What does the next session need to know?
- **Track architecture**: Document decisions about storage, modules, migrations
