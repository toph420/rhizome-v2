---
description: Generate comprehensive PR descriptions
---

# Generate PR Description

Generate a comprehensive pull request description for your changes.

## Steps

### 1. Identify the PR

```bash
# Check if current branch has PR
gh pr view --json url,number,title,state

# If no PR, list open PRs
gh pr list --limit 10 --json number,title,headRefName,author
```

Ask user which PR to describe if multiple exist.

### 2. Gather PR Information

```bash
# Get full diff
gh pr diff {number}

# Get commit history
gh pr view {number} --json commits

# Get metadata
gh pr view {number} --json url,title,number,state,baseRefName
```

### 3. Analyze Changes Thoroughly

- Read through entire diff carefully
- Read referenced files for context
- Understand purpose and impact of each change
- Identify user-facing vs internal changes
- Look for breaking changes or migrations

### 4. Run Verification

Execute automated checks:
```bash
npm test
npm run type-check
npm run build
```

Document results:
- ✓ Tests pass
- ✓ Types check
- ✓ Build succeeds
- Or note any failures

### 5. Generate Description

**Template:**
```markdown
# [Feature/Fix Name]

## Summary
[1-2 sentence overview of what changed and why]

## Problem
[What problem does this solve? Why was this needed?]

## Solution
[How does this PR solve the problem? Key technical approach?]

## Rhizome Impact
- **Module**: Main App / Worker / Both
- **Storage**: Database / Storage / Both
- **Migration**: Yes (053_name.sql) / No
- **Test Tier**: Critical / Stable
- **Pipeline Stages**: [Which stages if applicable]
- **Engines**: [Which engines if applicable]

## Changes Made
- [Key change 1 with file:line]
- [Key change 2 with file:line]
- [Key change 3 with file:line]

## Testing
### Automated
- [x] Tests pass: `npm test`
- [x] Types check: `npm run type-check`
- [x] Build succeeds: `npm run build`

### Manual
- [ ] Tested with small PDF (<50 pages)
- [ ] Tested with large PDF (500+ pages)
- [ ] Verified in Admin Panel
- [ ] Checked ProcessingDock shows progress

## Breaking Changes
[Any breaking changes? Migration steps needed?]
[Or: None]

## Performance Impact
[Any performance considerations?]
[Or: No significant impact]

## References
- Plan: `thoughts/plans/YYYY-MM-DD_feature-name.md` (if applicable)
- Related: #[issue number] (if applicable)
```

### 6. Save Description

```bash
# Create PR descriptions directory if needed
mkdir -p thoughts/pr-descriptions

# Save description
# Format: thoughts/pr-descriptions/{number}_description.md
```

### 7. Update PR

```bash
# Update PR with description
gh pr edit {number} --body-file thoughts/pr-descriptions/{number}_description.md

# Confirm success
gh pr view {number}
```

### 8. Final Checklist

Remind user to:
- [ ] Complete manual testing steps
- [ ] Review description for accuracy
- [ ] Verify all checkboxes appropriately marked
- [ ] Request reviews if ready

## Guidelines

**Be thorough but concise:**
- Descriptions should be scannable
- Focus on "why" as much as "what"
- Include breaking changes prominently

**Rhizome-specific:**
- Always note module impact (Main/Worker/Both)
- Document storage changes
- List affected pipeline stages
- Note migration requirements

**Testing:**
- Run all automated checks you can
- Mark checkboxes appropriately (x = done, empty = needs doing)
- Clearly note manual steps for user

## Example

```
User: /rhizome:describe-pr

I'll generate a PR description. Let me check the current branch...

[Checks for PR, gathers info, analyzes diff]

Generated PR description at: thoughts/pr-descriptions/123_description.md

Updated PR #123 with comprehensive description.

Manual testing still needed:
- Test with large PDFs
- Verify Admin Panel display

Ready for review once manual testing complete.
```
