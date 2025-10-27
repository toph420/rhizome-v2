# Rhizome Deploy Command

Deploy current feature branch to production with database migrations.

## Instructions

You are executing the Rhizome dual-worktree deployment workflow. Follow these steps EXACTLY:

### Pre-Deployment Checks

1. **Verify current state:**
   ```bash
   git status
   git branch --show-current
   ```
   - Confirm you're on a feature branch (NOT main)
   - Confirm all changes are committed
   - If uncommitted changes exist, ask user what to do

2. **Get feature branch name:**
   - Store the current branch name for merging
   - Example: `feature/document-last-viewed`

### Deployment Steps

Execute these commands in sequence:

**Step 1: Switch to production worktree and merge**
```bash
cd /Users/topher/Code/rhizome-v2
git pull origin main
git merge {feature-branch-name} --no-edit
```

**Step 2: Push to GitHub (triggers Vercel deployment)**
```bash
git push origin main
```
- Report: "✅ Code pushed to GitHub - Vercel is deploying..."

**Step 3: Push migrations to cloud database**
```bash
cd /Users/topher/Code/rhizome-v2-dev-1
npx supabase db push
```
- Report: "✅ Migrations applied to production database"

**Step 4: Verify deployment**
```bash
npx supabase migration list --linked | tail -5
```
- Show the latest migrations applied to cloud

**Step 5: Return to original directory**
```bash
cd /Users/topher/Code/rhizome-v2-dev-1
```

### Post-Deployment Report

Provide a summary:
```
🎉 Deployment Complete!

Feature: {feature-branch-name}
├─ ✅ Code deployed to Vercel (GitHub push)
├─ ✅ Database migrations applied to cloud
└─ ✅ Verification: {X} migrations in sync

Next steps:
- Check Vercel dashboard: https://vercel.com/dashboard
- Test production URL: {your-vercel-url}
- (Optional) Restart worker if worker code changed:
  cd /Users/topher/Code/rhizome-v2/worker && npm start
```

## Error Handling

**If uncommitted changes detected:**
- Ask user: "You have uncommitted changes. Would you like to:
  1. Commit them now
  2. Stash them
  3. Cancel deployment"

**If not on feature branch:**
- Error: "You're on {branch-name}. This command must be run from a feature branch."
- Abort deployment

**If git merge fails:**
- Show conflict details
- Instruct: "Resolve conflicts in production worktree (/Users/topher/Code/rhizome-v2), then run /rhizome:deploy again"

**If migration push fails:**
- Show error details
- Ask: "Migration push failed. Would you like to:
  1. Retry push
  2. Check migration status
  3. Rollback code deployment (requires manual intervention)"

## Safety Checks

Before executing:
- ✅ Verify dev worktree has .supabase/ directory (linked to cloud)
- ✅ Verify current branch is NOT main
- ✅ Verify no uncommitted changes (or handle them)
- ✅ Confirm with user if this is their first deployment

## Critical Rules

- ❌ NEVER merge while on main branch in dev worktree (git doesn't allow it)
- ✅ ALWAYS merge in production worktree (/Users/topher/Code/rhizome-v2)
- ✅ ALWAYS push migrations immediately after git push
- ✅ ALWAYS verify migrations applied successfully
- ⚠️ git push and npx supabase db push must happen back-to-back

## Example Output

```
🚀 Starting Rhizome Deployment
──────────────────────────────

Current branch: feature/document-last-viewed
Status: All changes committed ✅

Step 1/5: Merging to main in production worktree...
✅ Merged successfully

Step 2/5: Pushing to GitHub...
✅ Pushed to origin/main - Vercel deploying

Step 3/5: Applying migrations to cloud database...
✅ Migration 071_add_document_last_viewed.sql applied

Step 4/5: Verifying migration sync...
✅ Local and cloud in sync (71 migrations)

Step 5/5: Returning to dev worktree...
✅ Complete

🎉 Deployment Complete!
```
