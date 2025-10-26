# Supabase Migration Workflow

**Last Updated**: 2025-10-26
**Worktree Setup**: Dual-worktree development with cloud deployment
**Philosophy**: Storage-first = aggressive schema changes are safe

---

## Table of Contents
- [Overview](#overview)
- [Initial Setup](#initial-setup)
- [Development Cycle](#development-cycle)
- [Data Safety Strategies](#data-safety-strategies)
- [Testing Before Pushing](#testing-before-pushing)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

---

## Overview

### Worktree Structure

```
/Users/topher/Code/
├── rhizome-v2/               # Production (main branch)
│   ├── worker/.env           # → Cloud DB
│   └── NO .supabase/         # Worker-only, doesn't push migrations
│
└── rhizome-v2-dev-1/         # Development (feature branches)
    ├── .supabase/            # → Linked to cloud
    ├── worker/.env           # → Local DB (localhost:54322)
    └── supabase/migrations/  # Source of truth
```

### Philosophy

**Storage-First Architecture** means you can afford aggressive schema changes:

✅ **Safe to lose/recreate**:
- `chunks` table (regenerate from markdown)
- `embeddings` (regenerate via Gemini)
- `connections` (reprocess documents)

✅ **Always safe** (in Supabase Storage):
- Document markdown files
- Export bundles
- User uploads

⚠️ **Careful with**:
- `annotations` (manual user work)
- `sparks` (user insights)
- `flashcards` (user study data)
- `documents` metadata (creation dates, settings)

**Cost**: $0 for reprocessing with local Ollama

---

## Initial Setup

### 1. Link Development Worktree to Cloud

**Run once in development worktree:**

```bash
cd /Users/topher/Code/rhizome-v2-dev-1

# Link to cloud project
npx supabase link --project-ref pqkdcfxkitovcgvjoyuu

# You'll be prompted for:
# - Database password (from 1Password)
# - Confirmation

# Verify link
npx supabase migration list --linked
```

**Expected output**:
```
Local      Remote    Name
✅ Applied  ✅ Applied  001_initial_schema.sql
✅ Applied  ✅ Applied  002_add_embeddings.sql
...
✅ Applied  ✅ Applied  070_chunk_connection_detection.sql
```

### 2. Verify Cloud State

```bash
# Check which migrations are applied to cloud
npx supabase migration list --linked

# If cloud is missing migrations, push them:
npx supabase db push

# If cloud has extra migrations, pull them:
npx supabase db pull
```

---

## Development Cycle

### Standard Workflow (Additive Changes)

**Additive changes** = New tables, new columns (nullable), new indexes
**Safe** = No data loss, backward compatible

```bash
# 1. Make changes locally (Supabase Studio or SQL)
# Option A: Use Supabase Studio (http://localhost:54323)
# Option B: Write SQL directly in migration file

# 2. Generate migration file
npx supabase db diff -f add_spark_threads

# This creates:
# supabase/migrations/20250126120000_add_spark_threads.sql

# 3. Test locally
npx supabase db reset  # Applies all migrations fresh
# Or: npx supabase migration up  # Applies only new migrations

# 4. Verify in app
npm run dev
# Test the new feature, ensure it works

# 5. Push to cloud
npx supabase db push

# 6. Merge to main when ready
git add supabase/migrations/20250126120000_add_spark_threads.sql
git commit -m "feat: add spark threads support"
git push origin feature/spark-threads

# Create PR, merge to main
# Vercel auto-deploys from main
```

### Breaking Changes Workflow (Personal Tool = YOLO)

**Breaking changes** = Drop tables, drop columns, restructure schema
**Safe for you** = Storage-first + local reprocessing = zero cost recovery

```bash
# 1. Create migration with breaking change
npx supabase db diff -f rebuild_connections_v2

# Example breaking change:
# supabase/migrations/20250126130000_rebuild_connections_v2.sql
DROP TABLE connections CASCADE;
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_chunk_id UUID REFERENCES chunks(id) NOT NULL,
  target_chunk_id UUID REFERENCES chunks(id) NOT NULL,
  connection_type TEXT NOT NULL,
  strength FLOAT NOT NULL,
  engines JSONB NOT NULL,  -- NEW: track which engines found it
  evidence TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_chunk_id, target_chunk_id, connection_type)
);

# 2. Test locally first
npx supabase db reset
npm run dev

# Upload test document, verify new structure works

# 3. Push to cloud
npx supabase db push

# 4. Reprocess documents to rebuild data
# Go to Admin Panel (Cmd+Shift+A) → Connections tab
# Click "Reprocess All Documents (Smart Mode)"

# Let it run overnight with local worker
# Zero cost, just time (2-4 hours for 50 documents)
```

---

## Data Safety Strategies

### Strategy 1: Additive Migrations (Recommended)

**Always safe, no data loss**

```sql
-- Example: Adding new features to chunks
ALTER TABLE chunks ADD COLUMN concepts_v2 JSONB;
ALTER TABLE chunks ADD COLUMN themes_v2 TEXT[];
ALTER TABLE chunks ADD COLUMN summary_v2 TEXT;

-- Backfill happens during next reprocessing
-- Old data preserved, new data added when available
```

**Benefits**:
- Zero downtime
- Gradual migration
- Can test new structure before removing old

### Strategy 2: Destructive + Reprocess (Fast)

**Safe for personal tool with storage-first architecture**

```sql
-- Example: Complete connection schema rebuild
DROP TABLE connections CASCADE;
CREATE TABLE connections (
  -- New structure with better design
);

-- Then: Reprocess all documents via Admin Panel
-- Takes 2-4 hours, zero cost
```

**Benefits**:
- Clean slate, no backward compatibility baggage
- Simpler code (no dual-column support)
- Fast to implement

**When to use**:
- Chunks, embeddings, connections (all regeneratable)
- Not for annotations, sparks, flashcards (user data)

### Strategy 3: Data Transformation (Careful)

**For user-generated data that can't be regenerated**

```sql
-- Example: Renaming column with data preservation
ALTER TABLE annotations RENAME COLUMN old_color TO highlight_color;

-- Example: Transforming existing data
UPDATE sparks
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{version}',
  '2'::jsonb
)
WHERE metadata->>'version' IS NULL;
```

**When to use**:
- Annotations (manual work)
- Sparks (user insights)
- Flashcards (user study progress)

---

## Testing Before Pushing

### Local Testing Checklist

```bash
# 1. Reset local DB to cloud state
cd /Users/topher/Code/rhizome-v2-dev-1
npx supabase db pull  # Gets latest cloud migrations

# 2. Apply your new migration
npx supabase migration up

# 3. Test thoroughly
npm run dev

# Test checklist:
# □ Upload new document → Processes correctly
# □ View existing documents → No errors
# □ Create annotations → Saves correctly
# □ Connections display → Works as expected
# □ Admin Panel → All features functional

# 4. Check for errors in console
# Browser console: Check for JS errors
# Terminal: Check for server errors
# Worker logs: Check for processing errors

# 5. If everything works, push to cloud
npx supabase db push
```

### Rollback Plan

```bash
# If migration breaks something:

# Option 1: Revert locally and fix
npx supabase db reset  # Starts over
# Delete the bad migration file
# Create corrected migration
# Test again

# Option 2: If already pushed to cloud
# Create new migration to fix the issue
npx supabase db diff -f fix_previous_migration
# Don't edit old migration files after pushing!
```

---

## Common Patterns

### Pattern 1: Adding New ECS Component

```bash
# Example: Adding "Priority" component to sparks

# 1. Create migration
npx supabase db diff -f add_spark_priority_component

# 2. SQL content:
CREATE TABLE ecs_components_priority (
  entity_id UUID REFERENCES ecs_entities(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  due_date TIMESTAMPTZ,
  PRIMARY KEY (entity_id)
);

CREATE INDEX idx_priority_due_date ON ecs_components_priority(due_date);

# 3. Test locally
npx supabase db reset
# Create spark with priority, verify it works

# 4. Push
npx supabase db push

# 5. Update code to use new component
# src/lib/ecs/sparks.ts
# Add Priority to SparkOperations
```

### Pattern 2: Changing Chunk Structure

```bash
# Example: Adding new chunking metadata

# 1. Additive migration first
npx supabase db diff -f add_chunk_metadata_v2

ALTER TABLE chunks ADD COLUMN chonkie_metadata JSONB;
ALTER TABLE chunks ADD COLUMN overlap_info JSONB;

# 2. Push to cloud
npx supabase db push

# 3. Update worker to populate new fields
# worker/processors/router.ts
# Add chonkie_metadata extraction

# 4. Reprocess documents gradually
# Admin Panel → Reprocess individual documents
# Or: Reprocess all overnight

# 5. Optional: Remove old columns later
# Once confident new structure works:
npx supabase db diff -f remove_old_chunk_fields

ALTER TABLE chunks DROP COLUMN old_metadata IF EXISTS;
```

### Pattern 3: Breaking Change with Export/Import

```bash
# For critical data you want to preserve:

# 1. Export data before migration
# Admin Panel → Export tab → "Export All Documents"
# Downloads ZIP with all markdown + metadata

# 2. Create breaking migration
npx supabase db diff -f rebuild_schema_v2

DROP TABLE chunks CASCADE;
DROP TABLE connections CASCADE;
-- Recreate with new structure

# 3. Push to cloud
npx supabase db push

# 4. Import documents back
# Admin Panel → Import tab → Upload ZIP
# Documents get reprocessed with new schema
```

### Pattern 4: RLS Policy Updates

```sql
-- Always include RLS policy changes in migrations

-- supabase/migrations/20250126140000_update_chunk_policies.sql

-- Drop old policy
DROP POLICY IF EXISTS "Users see chunks from their documents" ON chunks;

-- Create new policy
CREATE POLICY "Users see chunks from their documents" ON chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );
```

### Pattern 5: Function/Trigger Changes

```sql
-- Always drop and recreate functions in migrations

-- supabase/migrations/20250126150000_update_embedding_trigger.sql

-- Drop old function and trigger
DROP TRIGGER IF EXISTS update_chunk_embeddings_trigger ON chunks;
DROP FUNCTION IF EXISTS update_chunk_embeddings();

-- Create new function
CREATE OR REPLACE FUNCTION update_chunk_embeddings()
RETURNS TRIGGER AS $$
BEGIN
  -- New implementation with better logic
  NEW.embeddings_available := (NEW.embedding IS NOT NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger
CREATE TRIGGER update_chunk_embeddings_trigger
  BEFORE INSERT OR UPDATE ON chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_chunk_embeddings();
```

---

## Troubleshooting

### Issue: Migration fails on cloud

**Error**: `relation "table_name" does not exist`

**Cause**: Migration order issue or missing dependency

**Fix**:
```bash
# Check migration order
npx supabase migration list --linked

# Ensure migrations are numbered correctly
# They run alphabetically by timestamp prefix

# If dependency missing, create earlier migration
# Or add dependency to existing migration
```

### Issue: Cloud has extra migrations

**Error**: `Local is missing migrations that are applied remotely`

**Fix**:
```bash
# Pull missing migrations from cloud
npx supabase db pull

# This creates new migration files locally
# Review them, then commit to git
```

### Issue: Local and cloud out of sync

**Error**: `Migration state mismatch`

**Fix**:
```bash
# Option 1: Force local to match cloud (safe)
npx supabase db reset

# Option 2: Force cloud to match local (DANGEROUS)
# Only do this if you're sure local is correct
npx supabase db push --force

# Option 3: Start fresh (nuclear option)
# 1. Export all data (Admin Panel)
# 2. Reset cloud DB
# 3. Push all migrations
# 4. Import data back
```

### Issue: Migration applied but not showing in list

**Cause**: `.supabase/` directory state corruption

**Fix**:
```bash
# Re-link to cloud
rm -rf .supabase
npx supabase link --project-ref pqkdcfxkitovcgvjoyuu

# Verify state
npx supabase migration list --linked
```

---

## Quick Reference Commands

```bash
# Link to cloud (one-time setup)
npx supabase link --project-ref pqkdcfxkitovcgvjoyuu

# Check migration status
npx supabase migration list --linked

# Create new migration
npx supabase db diff -f feature_name

# Test locally (fresh start)
npx supabase db reset

# Test locally (apply only new migrations)
npx supabase migration up

# Push to cloud
npx supabase db push

# Pull from cloud
npx supabase db pull

# Run SQL query on cloud
npx supabase db remote --linked sql "SELECT COUNT(*) FROM documents;"
```

---

## Best Practices Summary

✅ **DO**:
- Link development worktree to cloud
- Test migrations locally before pushing
- Use additive migrations when possible
- Commit migration files to git
- Document breaking changes in migration comments
- Use Admin Panel for reprocessing after schema changes

❌ **DON'T**:
- Edit migration files after pushing to cloud
- Push untested migrations to production
- Assume migrations are backward compatible
- Skip testing with real data
- Delete old migrations (breaks audit trail)

🎯 **Remember**:
- Storage-first = You can afford to break the database
- Local processing = Zero cost reprocessing
- One user = Can iterate aggressively
- Markdown is safe = Everything else is regeneratable

---

**Version**: 1.0
**Last Updated**: 2025-10-26
**Maintained By**: Topher
**Related Docs**: `DEPLOY.md`, `STORAGE_FIRST_PORTABILITY_GUIDE.md`
