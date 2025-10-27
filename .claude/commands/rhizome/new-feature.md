---
description: Create a new feature branch with smart workflow handling
---

# New Feature Branch

Create a new feature branch with intelligent handling of uncommitted changes and branch relationships.

## Instructions

You are helping the user create a new feature branch. Follow these steps:

### 1. Check Current State

```bash
git status
git branch --show-current
```

**Determine:**
- Current branch name
- Whether there are uncommitted changes
- Whether current branch is pushed to remote

### 2. Ask Clarifying Questions

If there are **uncommitted changes**, ask:
```
You have uncommitted changes. Would you like to:
1. Commit them to the current branch first
2. Stash them and move to new branch
3. Bring them to the new branch (don't commit to current)
4. Discard them (careful!)
```

Then ask about the **base branch**:
```
What should be the base for your new feature branch?
1. Current branch (includes all current work) - DEFAULT
2. main branch (fresh start, separate feature)
3. Another branch (specify which)
```

Then ask for the **feature name**:
```
What should we name the new feature branch?
(I'll add 'feature/' prefix automatically)

Examples: pdf-viewer, flashcard-review, export-improvements
```

### 3. Execute Workflow

Based on user's answers, execute the appropriate workflow:

#### Workflow A: Commit Current → Branch From Current
```bash
# Stage and commit current changes
git add [files...]
git commit -m "[user-provided message]"
git push origin [current-branch]

# Create new branch from current HEAD
git checkout -b feature/[name]
git push -u origin feature/[name]
```

#### Workflow B: Stash → Branch From Current
```bash
# Stash changes
git stash save "WIP: [description]"

# Create new branch
git checkout -b feature/[name]
git push -u origin feature/[name]

# User can later: git stash pop
```

#### Workflow C: Branch From Different Base
```bash
# Commit or stash current changes first (if any)
git add [files...] && git commit -m "[message]"
# OR
git stash save "WIP: [description]"

# Fetch latest
git fetch origin

# Create branch from specified base
git checkout -b feature/[name] origin/[base-branch]
git push -u origin feature/[name]
```

#### Workflow D: Bring Changes to New Branch
```bash
# Don't commit - just switch branches
git checkout -b feature/[name]
# Changes come along (if no conflicts)
git push -u origin feature/[name]

# Note: Only works if changes don't conflict with base
```

### 4. Verify and Report

```bash
# Show current state
git branch --show-current
git status
git log --oneline -3
```

**Report to user:**
```
✅ New Feature Branch Created!

Branch: feature/[name]
Base: [base-branch]
Status: Clean working directory
Remote: Pushed to origin

Recent commits:
[show last 3 commits]

Ready to start work on [feature name]!
```

## Important Rules

### Safety Checks
- ✅ Never lose uncommitted work - always commit or stash first
- ✅ Verify we're NOT on main branch before committing
- ✅ Always push branches to remote for backup
- ✅ Use specific file names with `git add`, not `-A` or `.`

### Commit Standards (when committing)
- **NO Claude attribution** - follow `/rhizome:commit` standards
- Use imperative mood: "feat: add feature" not "added feature"
- Group related files together
- Clear, descriptive messages

### Branch Naming
- Always use `feature/` prefix
- Use kebab-case: `feature/pdf-viewer` not `feature/pdfViewer`
- Be descriptive but concise
- Examples:
  - ✅ `feature/pdf-viewer`
  - ✅ `feature/flashcard-improvements`
  - ✅ `feature/export-markdown`
  - ❌ `feature/stuff`
  - ❌ `feature/fix` (use `fix/` prefix instead)

### Understanding Branch Relationships

**Branching from current branch:**
- New branch includes ALL commits from current branch
- When you merge new branch, it brings ALL those commits
- Use when: Features are related or dependent

**Branching from main/other:**
- New branch starts fresh from that point
- Keeps features completely separate
- Use when: Unrelated features, want clean separation

## Error Handling

**If git checkout fails:**
- Show error message
- Usually means: uncommitted changes conflict with target branch
- Solution: Commit or stash changes first

**If push fails:**
- Show error message
- Usually means: remote branch exists or connection issue
- Solutions:
  - Branch exists: `git pull origin feature/[name]` then retry push
  - Connection: Check internet, verify GitHub access

**If user is on main branch:**
- Warn: "You're on main branch. Are you sure you want to branch from here?"
- Suggest: "Usually you want to branch from an integration branch or existing feature"
- Require explicit confirmation

## Examples

### Example 1: Clean Slate, Branch From Current
```
User: /rhizome:new-feature
Assistant: "No uncommitted changes. Create new branch from feature/chunk-enrichment?
           What should we name it?"
User: "pdf-viewer"
Assistant: [Creates feature/pdf-viewer including chunk-enrichment work]
```

### Example 2: Uncommitted Work, Commit First
```
User: /rhizome:new-feature
Assistant: "You have 5 modified files. Commit to current branch first?"
User: "Yes, commit them"
Assistant: "What's the commit message?"
User: "feat: add enrichment skip checkbox"
Assistant: [Commits → Creates feature/pdf-viewer]
```

### Example 3: Branch From Main (Separate Feature)
```
User: /rhizome:new-feature
Assistant: "Base branch? [1] Current, [2] main, [3] Other"
User: "main"
Assistant: "Stash current changes?"
User: "Yes"
Assistant: [Stash → Branch from main → Report]
```

## Post-Creation Checklist

After creating branch, remind user:
- ✅ Branch created and pushed to GitHub
- ✅ No Vercel deployment triggered (only main triggers that)
- ✅ Can work freely without affecting production
- ✅ Use `/rhizome:deploy` when ready to merge to production

## Related Commands

- `/rhizome:commit` - Commit current work without branching
- `/rhizome:deploy` - Deploy feature branch to production
- `/rhizome:describe-pr` - Generate PR description for feature
