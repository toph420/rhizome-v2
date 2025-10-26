# Migration Workflow - Complete Example

**Scenario**: Adding a "last_viewed" timestamp to documents table
**Purpose**: Educational walkthrough of the complete dual-worktree migration workflow

---

## Current State

**Worktree**: `/Users/topher/Code/rhizome-v2-dev-1` (development)
**Branch**: `homepage-and-search` (feature branch with uncommitted changes)
**Database**: Local (localhost:54322) and Cloud (pqkdcfxkitovcgvjoyuu) are in sync

**Latest Migration**: `070_chunk_connection_detection.sql`

---

## Phase 1: Prepare for New Feature

### Step 1.1: Commit Current Changes

```bash
# We have documentation updates to commit first
git status

# Changes:
# - .gitignore (added .supabase/)
# - CLAUDE.md (added migration workflow rules)
# - docs/DEPLOY.md (updated worktree paths)
# - docs/MIGRATION_WORKFLOW.md (new file)

# Commit these changes to current branch
git add .gitignore CLAUDE.md docs/
git commit -m "docs: add dual-worktree migration workflow documentation"
```

**What happened:**
- Documentation changes committed to `homepage-and-search` branch
- These will be merged to main when we merge the feature
- Local commit only (not pushed yet)

### Step 1.2: Create New Feature Branch

```bash
# Create new branch for our example feature
git checkout -b feature/document-last-viewed

# Now we're on a clean branch, ready to develop
```

**What happened:**
- Created new branch from `homepage-and-search`
- Starts with all current changes (including docs)
- Migrations folder is the same (migrations are tracked by git)

---

## Phase 2: Develop Feature (Database Changes)

### Step 2.1: Check Current Schema

```bash
# ALWAYS check schema before making changes
psql postgresql://postgres:postgres@localhost:54322/postgres -c "\d documents"
```

**Expected output:**
```
Table "public.documents"
Column             | Type                        | Collation | Nullable | Default
-------------------+-----------------------------+-----------+----------+--------
id                 | uuid                        |           | not null | gen_random_uuid()
user_id            | uuid                        |           | not null |
title              | text                        |           |          |
file_name          | text                        |           |          |
file_type          | text                        |           | not null |
uploaded_at        | timestamp with time zone    |           |          | now()
processing_status  | text                        |           |          | 'pending'
processing_completed_at | timestamp with time zone |      |          |
...
```

**Note**: No `last_viewed` column yet (we're about to add it)

### Step 2.2: Generate Migration

```bash
# Create migration for new column
npx supabase db diff -f add_document_last_viewed

# This creates:
# supabase/migrations/20250126153000_add_document_last_viewed.sql
```

**What happened:**
- Supabase CLI compared local DB schema to migration history
- Created new migration file with timestamp prefix
- File is empty (we haven't made schema changes yet)

### Step 2.3: Write Migration SQL

Edit the new migration file:

```sql
-- supabase/migrations/20250126153000_add_document_last_viewed.sql

-- Add last_viewed timestamp column
ALTER TABLE documents ADD COLUMN last_viewed TIMESTAMPTZ;

-- Create index for efficient queries (most recently viewed)
CREATE INDEX idx_documents_last_viewed ON documents(user_id, last_viewed DESC NULLS LAST);

-- Add comment for documentation
COMMENT ON COLUMN documents.last_viewed IS 'Timestamp when user last opened this document in the reader';
```

**Why this migration is safe:**
- ✅ Adding nullable column (no data loss)
- ✅ Index helps performance (doesn't block table)
- ✅ Backward compatible (existing queries still work)

### Step 2.4: Apply Migration Locally

```bash
# Apply the new migration to local DB
npx supabase migration up

# Check it worked
psql postgresql://postgres:postgres@localhost:54322/postgres -c "\d documents"
```

**Expected output:**
```
Column             | Type                        | Collation | Nullable | Default
-------------------+-----------------------------+-----------+----------+--------
...
last_viewed        | timestamp with time zone    |           |          |
```

**What happened:**
- Migration applied to local database (localhost:54322)
- `documents` table now has `last_viewed` column
- Cloud database still doesn't have it (we haven't pushed yet)

---

## Phase 3: Develop Feature (Code Changes)

### Step 3.1: Update Server Action

Create or update the Server Action that runs when viewing documents:

```typescript
// src/app/actions/documents.ts
'use server'

import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateLastViewed(documentId: string) {
  const supabase = getServerSupabaseClient()

  // Update last_viewed timestamp
  const { error } = await supabase
    .from('documents')
    .update({ last_viewed: new Date().toISOString() })
    .eq('id', documentId)

  if (error) {
    console.error('Failed to update last_viewed:', error)
    return { success: false }
  }

  revalidatePath(`/read/${documentId}`)
  return { success: true }
}
```

### Step 3.2: Call from Document Reader

Update the document reader page to call this action:

```typescript
// src/app/read/[id]/page.tsx
import { updateLastViewed } from '@/app/actions/documents'

export default async function DocumentReaderPage({ params }: { params: { id: string } }) {
  // Update last_viewed when page loads
  await updateLastViewed(params.id)

  // Rest of page rendering...
  return <DocumentReader documentId={params.id} />
}
```

### Step 3.3: Test Locally

```bash
# Start local development server
npm run dev

# Open browser: http://localhost:3000
# Navigate to a document
# Check database to verify last_viewed was updated:

psql postgresql://postgres:postgres@localhost:54322/postgres -c "
  SELECT title, last_viewed
  FROM documents
  WHERE last_viewed IS NOT NULL
  ORDER BY last_viewed DESC
  LIMIT 5;
"
```

**Expected output:**
```
       title        |          last_viewed
--------------------+--------------------------------
 My Test Document   | 2025-10-26 15:35:42.123456+00
```

**What happened:**
- Code calls Server Action when viewing document
- Server Action updates `last_viewed` timestamp
- Local database reflects the change
- Cloud database still doesn't have the column (not deployed yet)

---

## Phase 4: Commit Changes

### Step 4.1: Review Changes

```bash
# See what files changed
git status

# Review migration file
git diff supabase/migrations/

# Review code changes
git diff src/
```

### Step 4.2: Commit Everything Together

```bash
# Add migration AND code together
git add supabase/migrations/20250126153000_add_document_last_viewed.sql
git add src/app/actions/documents.ts
git add src/app/read/[id]/page.tsx

# Commit with descriptive message
git commit -m "feat: track document last viewed timestamp

- Add last_viewed column to documents table
- Update last_viewed when opening document in reader
- Add index for efficient recent documents queries"

# Push to GitHub (feature branch)
git push origin feature/document-last-viewed
```

**What happened:**
- Migration file committed to git (it's just a file)
- Code changes committed to git
- Pushed to GitHub on feature branch
- Vercel does NOT deploy (we didn't push to main)
- Cloud database does NOT get migration (we didn't run db push)

---

## Phase 5: Merge to Main (The Critical Part!)

### Step 5.1: Switch to Main

```bash
# Make sure we're in dev worktree
cd /Users/topher/Code/rhizome-v2-dev-1

# Switch to main branch
git checkout main

# Get latest from remote
git pull origin main
```

**What happened:**
- Switched from feature branch to main
- Pulled any new changes from GitHub
- Local DB still has the migration applied (migrations persist across branches)

### Step 5.2: Merge Feature Branch

```bash
# Merge our feature branch
git merge feature/document-last-viewed --no-edit

# What's in the merge:
# 1. Migration file: supabase/migrations/20250126153000_add_document_last_viewed.sql
# 2. Code changes: src/app/actions/documents.ts
# 3. Code changes: src/app/read/[id]/page.tsx
```

**What happened:**
- Feature branch merged into main
- Migration file is now in main branch (tracked by git)
- Code changes are now in main branch
- Still only local - not pushed to GitHub yet

### Step 5.3: Push to GitHub (Triggers Vercel)

```bash
# Push main to GitHub
git push origin main

# This triggers:
# ✅ GitHub receives new code
# ✅ Vercel detects push to main
# ✅ Vercel starts building and deploying
# ❌ Cloud database does NOT have new column yet!
```

**Timeline:**
```
00:00 - Push to GitHub
00:05 - Vercel starts build
00:30 - Vercel build completes
00:35 - Vercel deployment live

At this point:
- ✅ New code is deployed (updateLastViewed function exists)
- ❌ Database schema is old (no last_viewed column)
- 🚨 Users accessing the site will see errors! (trying to update non-existent column)
```

**This is why timing matters!**

### Step 5.4: Push Migration IMMEDIATELY

```bash
# Apply migration to cloud database
npx supabase db push

# This:
# 1. Compares supabase/migrations/ (main branch) to cloud state
# 2. Finds new migration: 20250126153000_add_document_last_viewed.sql
# 3. Applies it to production database
```

**Timeline continues:**
```
00:35 - Vercel deployment live (but broken!)
00:36 - Run: npx supabase db push
00:38 - Migration applied to cloud
00:38 - ✅ Everything working! Code + Schema aligned
```

**Ideal timing:**
```bash
# Do this immediately, don't wait
git push origin main && npx supabase db push

# Or even better (one command):
git push origin main ; npx supabase db push
```

**What happened:**
- Cloud database now has `last_viewed` column
- Deployed code can now successfully update it
- Users can view documents without errors
- Feature is fully deployed!

---

## Phase 6: Update Production Worker (Optional)

If worker code changed, update the production worktree:

```bash
# Switch to production worktree
cd /Users/topher/Code/rhizome-v2

# Pull latest main
git pull origin main

# Worker now has latest code
# Restart worker if needed:
cd worker
# Ctrl+C to stop
npm start
```

**In our case:**
- Worker code didn't change
- No need to restart
- Worker keeps running

---

## Phase 7: Verify Everything Works

### Step 7.1: Check Cloud Database

```bash
# Verify migration applied to cloud
npx supabase migration list --linked

# Should show:
# 070 | 070 | 070
# 20250126153000 | 20250126153000 | 20250126153000  ← New migration!
```

### Step 7.2: Check Production Deployment

```bash
# Visit production URL
# Navigate to a document
# Check cloud database:

npx supabase db remote --linked sql "
  SELECT title, last_viewed
  FROM documents
  WHERE last_viewed IS NOT NULL
  ORDER BY last_viewed DESC
  LIMIT 5;
"
```

**Expected output:**
```
       title        |          last_viewed
--------------------+--------------------------------
 My Test Document   | 2025-10-26 15:45:22.654321+00
```

**Success!** Feature is fully deployed and working!

---

## Complete Timeline Summary

```
Development (Local)
─────────────────────────────────────────────────
Branch: feature/document-last-viewed
├─ Create migration file (20250126153000_add_document_last_viewed.sql)
├─ Write SQL (ALTER TABLE documents ADD COLUMN...)
├─ Apply locally (npx supabase migration up)
├─ Write code (updateLastViewed Server Action)
├─ Test locally (npm run dev, verify in local DB)
└─ Commit (migration + code together)

Deployment (Production)
─────────────────────────────────────────────────
Branch: main (in dev worktree!)
├─ Merge feature branch (git merge feature/document-last-viewed)
├─ Push to GitHub (git push origin main) → Triggers Vercel
│  ├─ Vercel builds new code
│  └─ Vercel deploys (but schema is old - BROKEN!)
├─ Push migration (npx supabase db push) → Updates cloud DB
│  ├─ Supabase applies migration
│  └─ Cloud DB has new column - FIXED!
└─ Everything aligned! Code + Schema working together

Verification
─────────────────────────────────────────────────
├─ Check migration status (npx supabase migration list --linked)
├─ Test production URL (verify feature works)
└─ Check cloud database (verify data is updating)
```

---

## Key Insights

### 1. Migrations Are Just Files

```
supabase/migrations/20250126153000_add_document_last_viewed.sql

This is tracked by git, like any other file:
- It moves between branches when you merge
- It's in version history
- It's pushed to GitHub with your code
```

### 2. Two Separate Systems

```
Git (GitHub)                 Supabase (Cloud)
────────────                 ────────────────
Tracks code                  Tracks which migrations ran
Tracks migration files       Applies migrations to DB
Triggers Vercel              Updates schema

git push origin main     →   Vercel deploys code
npx supabase db push     →   Cloud DB gets schema
```

### 3. Timing Control

```
You control when migrations apply:

Option 1 (Recommended): Immediate
git push origin main && npx supabase db push
↑ Code deploys        ↑ Schema updates
  (0-30 seconds)        (immediate)

Option 2 (Dangerous): Delayed
git push origin main
... wait 5 minutes ...
npx supabase db push
↑ Code deploys        ↑ Schema updates (finally!)
  (users see errors!)    (errors stop)
```

### 4. Development Workflow

```
ALL work happens in dev worktree:
─────────────────────────────────
/Users/topher/Code/rhizome-v2-dev-1
├─ Create feature branches here
├─ Develop and test here
├─ Merge to main here
└─ Push migrations from here

Production worktree ONLY runs worker:
──────────────────────────────────────
/Users/topher/Code/rhizome-v2
├─ Always on main branch
├─ Pulls updates from GitHub
├─ Runs worker process
└─ Never creates migrations
```

---

## Common Questions

### Q: What if I need to make more changes after merging?

**A**: Create a new feature branch from main:

```bash
git checkout main
git checkout -b feature/fix-last-viewed
# Make changes
git commit -m "fix: handle null last_viewed"
git push origin feature/fix-last-viewed

# Then merge again:
git checkout main
git merge feature/fix-last-viewed
git push origin main
npx supabase db push  # If migration changed
```

### Q: What if I need to rollback a migration?

**A**: Create a new migration to undo it:

```bash
npx supabase db diff -f rollback_last_viewed

# In the migration file:
ALTER TABLE documents DROP COLUMN last_viewed;
DROP INDEX idx_documents_last_viewed;

# Apply locally and test
npx supabase migration up

# Then deploy as normal
git add supabase/migrations/
git commit -m "rollback: remove last_viewed feature"
git push origin main
npx supabase db push
```

**Never edit or delete old migration files after pushing!**

### Q: Can I develop in the production worktree?

**A**: No! ALWAYS use the dev worktree:

```bash
# ❌ Wrong
cd /Users/topher/Code/rhizome-v2
git checkout -b feature/something

# ✅ Correct
cd /Users/topher/Code/rhizome-v2-dev-1
git checkout -b feature/something
```

### Q: What if local and cloud migrations get out of sync?

**A**: Check and fix:

```bash
# Check status
npx supabase migration list --linked

# If cloud is behind:
npx supabase db push

# If cloud is ahead (rare):
npx supabase db pull  # Downloads new migration files
```

---

## Next Steps

Now that you understand the complete workflow:

1. **Practice**: Create a small feature following these steps
2. **Document**: Add notes to this file about edge cases you encounter
3. **Automate**: Consider creating bash functions for common operations
4. **Share**: Use this as reference for future features

**Remember**: Storage-first architecture means you can afford to be aggressive with schema changes. If something breaks, you can always reprocess from markdown!

---

**Last Updated**: 2025-10-26
**Status**: Educational example (not a real feature)
**Related Docs**: `MIGRATION_WORKFLOW.md`, `DEPLOY.md`, `CLAUDE.md`
