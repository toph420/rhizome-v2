# Storage-First Portability System - Complete Guide

**Last Updated**: 2025-10-13
**Status**: Production Ready ✅
**Version**: 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [Core Philosophy](#core-philosophy)
3. [Getting Started](#getting-started)
4. [Admin Panel Guide](#admin-panel-guide)
5. [Common Workflows](#common-workflows)
6. [Conflict Resolution](#conflict-resolution)
7. [Connection Reprocessing](#connection-reprocessing)
8. [Export & Portability](#export--portability)
9. [Troubleshooting](#troubleshooting)
10. [Developer Reference](#developer-reference)

---

## Overview

The **Storage-First Portability System** is a comprehensive data management solution for Rhizome V2 that treats **Supabase Storage as the source of truth** for expensive AI-enriched data, while treating the **PostgreSQL database as a queryable cache**.

### Key Concepts

**Problem Solved**:
- Reprocessing documents costs $0.20-0.60 per document and takes 5-25 minutes
- Database resets during development lose all processed data
- No easy way to backup or migrate processed documents
- Difficult to recover from database corruption

**Solution**:
- Automatic export of all processed data to Supabase Storage
- Import from Storage with intelligent conflict resolution
- ZIP bundle generation for complete portability
- Smart Mode connection reprocessing preserves user work

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Document Processing                      │
│  (PDF, EPUB, YouTube, Web, Markdown, Text, Paste)         │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │   Gemini / Ollama Processing  │
    │   (Extraction + Metadata)     │
    └───────────┬───────────────────┘
                │
                ├──────────────────────┐
                ▼                      ▼
    ┌─────────────────────┐  ┌──────────────────┐
    │  Supabase Storage   │  │  PostgreSQL DB   │
    │  (Source of Truth)  │  │  (Query Cache)   │
    ├─────────────────────┤  ├──────────────────┤
    │ • chunks.json       │  │ • chunks table   │
    │ • metadata.json     │  │ • embeddings     │
    │ • manifest.json     │  │ • connections    │
    │ • cached_chunks     │  │ • entities/comp  │
    └─────────────────────┘  └──────────────────┘
                │                      │
                │                      │
                ▼                      ▼
    ┌────────────────────────────────────────┐
    │         Admin Panel (Cmd+Shift+A)      │
    │  Scanner | Import | Export | Connections│
    └────────────────────────────────────────┘
```

### Benefits

1. **Cost Savings**: $0.20-0.60 saved per document by importing instead of reprocessing
2. **Time Savings**: DB reset + restore in 6 minutes vs 25 minutes reprocessing
3. **Data Safety**: Zero data loss, automatic backups to Storage
4. **Portability**: Complete ZIP bundles for backup or migration
5. **Development Velocity**: Quick database resets without losing work

---

## Core Philosophy

### Storage is the Source of Truth

**Traditional Approach** (Wrong):
```
Database stores everything → Processing results only in DB → Storage is secondary
```
❌ Problem: Database resets lose all processed data, reprocessing is expensive

**Storage-First Approach** (Right):
```
Processing → Save to Storage (source of truth) → Sync to DB (cache for queries)
```
✅ Benefit: Can always restore from Storage, database is disposable cache

### Automatic vs Manual Operations

**Automatic** (No user action required):
- Every document processing saves to Storage
- chunks.json, metadata.json, manifest.json created automatically
- cached_chunks.json saved in LOCAL mode

**Manual** (User-initiated via Admin Panel):
- Scanning Storage to find sync issues
- Importing from Storage when DB is out of sync
- Exporting to ZIP bundles
- Reprocessing connections

---

## Getting Started

### Prerequisites

- Rhizome V2 app running (`npm run dev`)
- Supabase local instance running (`npx supabase start`)
- At least one document processed

### Accessing the Admin Panel

**Three Ways to Open**:

1. **Mouse**: Click the **Database icon** in the TopNav header
2. **Keyboard**: Press `Cmd+Shift+A` (Mac) or `Ctrl+Shift+A` (Windows)
3. **Already Open**: Press the shortcut again to close

**Panel Features**:
- Slides down from top (85vh height)
- Backdrop dims the page
- Press `Esc` to close

### First-Time Setup

No setup required! The system works automatically once you process a document.

**Verify It's Working**:
1. Process any document (PDF, EPUB, etc.)
2. Open Supabase Storage UI: `http://localhost:54323` → Storage tab
3. Navigate to: `documents/{your_user_id}/{document_id}/`
4. You should see: `chunks.json`, `metadata.json`, `manifest.json`

✅ If these files exist, the system is working correctly!

---

## Admin Panel Guide

### Tab 1: Scanner

**Purpose**: Compare Storage vs Database state and identify sync issues

**What It Does**:
- Lists all documents in Storage
- Checks if they exist in Database
- Shows sync state for each document

**Sync States**:
- 🟢 **Healthy**: Storage and Database match
- 🟡 **Out of Sync**: Different chunk counts
- 🔴 **Missing from DB**: In Storage but not in Database
- ⚪ **Missing from Storage**: In Database but not in Storage (unusual)

**How to Use**:
1. Open Admin Panel → Scanner tab
2. Scanner automatically scans on load
3. Use filters to view specific states:
   - **All**: Show everything
   - **Missing from DB**: Show documents that need import
   - **Out of Sync**: Show discrepancies
   - **Healthy**: Show documents in sync
4. Click a row to expand and see file details
5. Use action buttons: Import, Sync, Export, Details

**Summary Statistics**:
- Total documents in Storage
- Total documents in Database
- Missing from Database count
- Out of Sync count
- Healthy count

---

### Tab 2: Import

**Purpose**: Restore chunks from Storage to Database

**When to Use**:
- After database reset (development)
- Database corruption recovery
- Moving chunks from Storage to a new database
- Syncing documents after manual Storage changes

**How to Use**:

**Basic Import (No Conflict)**:
1. Open Admin Panel → Import tab
2. Select documents to import (checkboxes)
3. Choose import options:
   - ☑ **Regenerate Embeddings**: Create new 768d vectors (slower)
   - ☐ **Reprocess Connections**: Run 3-engine connection detection (optional)
4. Click "Import Selected"
5. Monitor progress in the tab
6. Wait for completion

**Import with Conflict** (see [Conflict Resolution](#conflict-resolution) below):
1. Same steps as above
2. If chunks already exist, ConflictResolutionDialog opens
3. Choose strategy: Skip, Replace, or Merge Smart
4. Apply resolution
5. Import proceeds with chosen strategy

**Import Options Explained**:

**Regenerate Embeddings**:
- ✅ Use when: Switching embedding models, embedding corruption
- ❌ Skip when: Embeddings are fine (faster import)
- Time: Adds ~2-5 minutes for 300 chunks

**Reprocess Connections**:
- ✅ Use when: Want fresh connection detection
- ❌ Skip when: Connections are fine (faster import)
- Time: Adds ~10-15 minutes for 300 chunks

**Progress Tracking**:
- Import job shows stages: Reading → Processing → Inserting → Complete
- Percentage updates in real-time
- Details show current operation (e.g., "Inserting chunk 150/300")

---

### Tab 3: Export

**Purpose**: Generate ZIP bundles for complete document portability

**When to Use**:
- Creating backups for critical documents
- Migrating documents to another system
- Sharing complete document bundles
- Archiving finished projects

**How to Use**:

**Export Single Document**:
1. Open Admin Panel → Export tab
2. Check one document
3. Choose export options:
   - ☑ **Include Connections**: Add 3-engine collision detection results
   - ☑ **Include Annotations**: Add user highlights and notes
4. Click "Export Selected (1)"
5. Wait for ZIP generation (< 2 minutes)
6. "Download ZIP" button appears
7. Click to download

**Batch Export (Multiple Documents)**:
1. Select 5-10 documents with checkboxes
2. Choose export options
3. Click "Export Selected (5)"
4. Progress shows: "Processing document 1 of 5", "Processing document 2 of 5", etc.
5. Download button appears when complete

**ZIP Bundle Structure**:
```
export-2025-10-13.zip
├── manifest.json                       # Top-level: describes all documents
├── doc-id-1/
│   ├── source.pdf                      # Original file
│   ├── content.md                      # Cleaned markdown
│   ├── chunks.json                     # Enriched chunks
│   ├── metadata.json                   # Document metadata
│   ├── manifest.json                   # File inventory
│   ├── cached_chunks.json              # (if LOCAL mode)
│   ├── connections.json                # (if Include Connections)
│   └── annotations.json                # (if Include Annotations)
├── doc-id-2/
│   └── (same structure)
└── doc-id-3/
    └── (same structure)
```

**Download URL**:
- Expires after 24 hours
- Download immediately or save the URL
- Generate new export after expiry

---

### Tab 4: Connections

**Purpose**: Reprocess chunk connections with 3 engines

**When to Use**:
- New documents added (Add New mode)
- Engine improvements released (Reprocess All)
- User validated connections (Smart Mode to preserve)
- Connection quality issues

**Reprocessing Modes**:

**1. Reprocess All** (Fresh Start):
- **What**: Deletes ALL connections, regenerates from scratch
- **When**: Major engine updates, starting fresh
- **Warning**: ⚠️ Loses user-validated connections
- **Time**: ~15 minutes for 300 chunks

**2. Add New** (Incremental):
- **What**: Keeps existing, adds connections to newer documents
- **When**: New documents processed after this one
- **Benefit**: Preserves existing work
- **Time**: Depends on new document count

**3. Smart Mode** (Recommended):
- **What**: Preserves user-validated, updates the rest
- **When**: Most common use case
- **Options**:
  - ☑ **Preserve user-validated connections**: Keep manually reviewed connections
  - ☑ **Save backup before reprocessing**: Storage backup for safety
- **Time**: ~15 minutes for 300 chunks

**Engine Selection**:

Choose which engines to run (all recommended):

☑ **Semantic Similarity** (~200ms per chunk, free):
- Embedding-based, finds "these say the same thing"
- Fast, no AI calls

☑ **Contradiction Detection** (~50ms per chunk, free):
- Metadata-based, finds conceptual tensions
- "Same concept, opposite emotional polarity"

☑ **Thematic Bridge** (~500ms per chunk, $0.20):
- AI-powered cross-domain matching
- "Paranoia in Gravity's Rainbow ↔ surveillance capitalism"
- Aggressive filtering keeps cost down

**Estimate Display**:
- Shows estimated time: "~8 minutes"
- Shows estimated cost: "$0.20"
- Updates based on selections

**How to Use**:
1. Open Admin Panel → Connections tab
2. Select a document
3. View current stats: "85 connections (12 user-validated)"
4. Choose mode: **Smart Mode** (recommended)
5. Check Smart Mode options (both recommended)
6. Select engines (all 3 recommended)
7. Review estimate
8. Click "Start Reprocessing"
9. Monitor progress
10. Review results when complete

---

### Tab 5: Integrations

**Purpose**: Centralize Obsidian and Readwise operations

**Obsidian Section**:
- **Export to Obsidian**: Save markdown to your vault
- **Sync from Obsidian**: Import edited markdown with fuzzy annotation recovery
- **Vault Path**: Configure Obsidian vault location
- **Last Sync**: Timestamp of most recent operation

**Readwise Section**:
- **Import Highlights**: Import from Readwise export JSON
- **Last Import**: Timestamp and highlight count
- **API Key**: Configure Readwise API credentials (optional)

**Operation History**:
- Table shows recent integration operations
- Columns: Operation Type, Status, Timestamp
- Shows last 10 operations
- Click to see details

---

### Tab 6: Jobs

**Purpose**: Background job management

**Quick Actions**:
- **Clear Completed Jobs**: Remove successful jobs from queue
- **Clear Failed Jobs**: Remove failed jobs for cleanup

**Emergency Controls**:
- **Stop All Processing**: Force-cancel all running jobs (for stuck jobs)
- **Clear All Jobs**: Delete ALL jobs (completed, failed, pending)
- **Nuclear Reset**: ⚠️ DANGER - Deletes all jobs AND documents with status 'processing'

**Job List**:
- Shows all background jobs (import, export, reprocess, etc.)
- Columns: Job Type, Status, Progress, Created At, Actions
- Real-time updates

---

## Common Workflows

### Workflow 1: Database Reset During Development

**Scenario**: You're developing a feature and need to reset the database to test migrations.

**Problem**: Resetting wipes all processed documents (expensive to reprocess).

**Solution**: Import from Storage after reset.

**Steps**:
1. Before reset, verify Storage has your documents:
   ```bash
   # Check Supabase Storage UI
   http://localhost:54323 → Storage → documents
   ```
2. Reset database:
   ```bash
   npx supabase db reset
   ```
3. Open Admin Panel (`Cmd+Shift+A`) → Scanner tab
4. All documents show "Missing from DB"
5. Switch to Import tab
6. Click "Select All"
7. Leave "Regenerate Embeddings" unchecked (faster)
8. Click "Import Selected"
9. Wait ~3-6 minutes for import
10. ✅ All documents restored to database!

**Time Comparison**:
- Without Storage-First: 25+ minutes to reprocess all documents
- With Storage-First: 3-6 minutes to import from Storage
- **Time Saved**: ~20 minutes per reset

---

### Workflow 2: Conflict Resolution (Import)

**Scenario**: You're importing a document that already has chunks in the database, but the versions differ.

**Problem**: Import could overwrite, skip, or merge data. Need to choose wisely.

**Solution**: ConflictResolutionDialog provides 3 strategies.

**Steps**:
1. Select document in Import tab
2. Click "Import"
3. ConflictResolutionDialog opens (conflict detected)
4. Review side-by-side comparison:
   - **Existing (Database)**: 382 chunks, processed 2025-10-10
   - **Import (Storage)**: 382 chunks, processed 2025-10-12
5. Review sample chunks (first 3 shown with differences highlighted)
6. Choose strategy (see [Conflict Resolution](#conflict-resolution) below)
7. Click "Apply Resolution"
8. Import proceeds with chosen strategy

**Strategy Decision Tree**:
```
Has annotations? ──Yes──> Use Merge Smart (preserves annotations)
     │
     No
     │
     ▼
Database version is correct? ──Yes──> Use Skip (keep database)
     │
     No
     │
     ▼
Storage version is correct? ──Yes──> Use Replace (use storage)
```

---

### Workflow 3: Connection Reprocessing with Smart Mode

**Scenario**: You've manually validated 10 connections as important. Now you want to regenerate the rest to get fresh connections from improved engines.

**Problem**: Reprocess All would delete your validated connections.

**Solution**: Smart Mode preserves validated connections.

**Steps**:
1. Mark connections as validated (if not already):
   ```sql
   UPDATE chunk_connections
   SET user_validated = true
   WHERE id IN (SELECT id FROM chunk_connections WHERE /* your criteria */ LIMIT 10);
   ```
2. Open Admin Panel → Connections tab
3. Select the document
4. Verify current stats: "85 connections (10 user-validated)"
5. Select mode: **Smart Mode**
6. Check options:
   - ☑ Preserve user-validated connections
   - ☑ Save backup before reprocessing
7. Select all 3 engines
8. Review estimate: "~12 minutes, $0.20"
9. Click "Start Reprocessing"
10. Monitor progress: "Backing up validated connections..." → "Deleting non-validated..." → "Running engines..."
11. On completion, verify:
    - 10 validated connections still exist
    - New connections generated for the rest
    - Backup file in Storage: `validated-connections-{timestamp}.json`

**Verification**:
```sql
SELECT COUNT(*) FROM chunk_connections
WHERE user_validated = true
AND source_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>');
-- Should show 10
```

---

### Workflow 4: Export to ZIP for Backup

**Scenario**: You've processed 50 important books and want to create a complete backup.

**Problem**: Database backup is not portable, doesn't include Storage files.

**Solution**: Export to ZIP bundles.

**Steps**:
1. Open Admin Panel → Export tab
2. Click "Select All" (or select specific documents)
3. Check both export options:
   - ☑ Include Connections
   - ☑ Include Annotations
4. Verify estimated size (e.g., "~2.5GB estimated")
5. Click "Export Selected (50)"
6. Wait for ZIP generation (~10-20 minutes for 50 documents)
7. "Download ZIP" button appears
8. Click download
9. Save to safe location (external drive, cloud storage)

**ZIP Contents**:
- All 50 documents with complete file sets
- Top-level manifest.json listing all documents
- connections.json for each document (3-engine results)
- annotations.json for each document (your highlights and notes)

**Use Cases for ZIP**:
- ✅ Backup before major refactoring
- ✅ Migrate to another instance
- ✅ Share complete document bundles
- ✅ Archive completed projects

---

## Conflict Resolution

### Understanding Conflicts

**When Conflicts Occur**:
- Importing a document that already has chunks in database
- Chunk counts differ (Storage: 382, Database: 150)
- Metadata differences (processed at different times)

**Why Conflicts Matter**:
- Wrong choice can lose user work (annotations)
- Wrong choice can lose data integrity
- Understanding strategies is critical

---

### Strategy 1: Skip Import

**What It Does**: Keeps existing database data, ignores import data from Storage

**When to Use**:
- Database version is correct and up-to-date
- You made manual edits to database you want to keep
- Import data is outdated or wrong

**Impact**:
- ✅ No changes to database
- ✅ Annotations preserved (no change)
- ❌ Storage data ignored (not used)

**Warning**: None (safest option, no changes)

**Example Dialog**:
```
Resolution: Skip Import

⚠️ Warning: Import data will be ignored.
The database will remain unchanged.

[Cancel] [Apply Resolution]
```

---

### Strategy 2: Replace All

**What It Does**: Deletes ALL existing chunks, inserts chunks from Storage

**When to Use**:
- Storage version is definitely correct
- Database is corrupted or wrong
- Starting fresh after major changes

**Impact**:
- ✅ Database matches Storage exactly
- ❌ **All existing chunks deleted** (including IDs)
- ❌ **Annotations will break** (chunk IDs changed)
- ❌ **Connections reset** (references to old chunk IDs)

**Warning**: 🚨 **DESTRUCTIVE** - Will reset all annotation positions!

**Example Dialog**:
```
Resolution: Replace All

🚨 DANGER: This will delete all existing chunks and replace them with import data.

⚠️ Warnings:
- Will reset all annotation positions
- Connections will reference wrong chunks
- User work may be lost

Only use if you're certain the import data is correct.

[Cancel] [Apply Resolution]
```

---

### Strategy 3: Merge Smart (Recommended)

**What It Does**: Updates metadata fields while preserving chunk IDs and content

**When to Use**:
- **Most common use case** (default recommendation)
- You have annotations you want to keep
- Database and Storage both have valid data
- Want to update metadata without breaking annotations

**How It Works**:
1. Matches chunks by `chunk_index` (position in document)
2. Updates metadata fields only:
   - themes
   - importance_score
   - summary
   - emotional_metadata
   - conceptual_metadata
   - domain_metadata
   - metadata_extracted_at
3. Preserves:
   - chunk.id (UUID) - Annotations reference this!
   - chunk.content - Actual text unchanged
   - chunk.embedding - Vectors unchanged
   - chunk.document_id - References intact

**Impact**:
- ✅ Metadata updated to match Storage
- ✅ Annotations preserved (chunk IDs unchanged)
- ✅ Connections preserved (chunk references intact)
- ✅ Content and embeddings unchanged
- ✅ Data integrity maintained

**Warning**: Info message explaining preservation

**Example Dialog**:
```
Resolution: Merge Smart (Recommended)

ℹ️ This strategy preserves annotations by keeping chunk IDs.

What happens:
- Metadata updated from import data
- Chunk IDs stay the same
- Annotations continue to work
- Connections remain valid

This is the safest option when you have annotations.

[Cancel] [Apply Resolution]
```

---

### Conflict Resolution Decision Matrix

| Scenario | Has Annotations? | Database Correct? | Storage Correct? | **Strategy** |
|----------|------------------|-------------------|------------------|--------------|
| DB reset recovery | No | No | ✅ Yes | **Replace** |
| DB reset recovery | ✅ Yes | No | ✅ Yes | **Merge Smart** |
| Manual DB edits | N/A | ✅ Yes | No | **Skip** |
| Metadata refresh | ✅ Yes | Partial | ✅ Yes | **Merge Smart** |
| Corruption | ✅ Yes | No | ✅ Yes | **Merge Smart** |
| Fresh start | No | No | ✅ Yes | **Replace** |
| Testing | No | Either | Either | **Replace** or **Skip** |

**Rule of Thumb**: **If you have annotations, always use Merge Smart.**

---

## Connection Reprocessing

### Why Reprocess Connections?

**Reasons**:
1. **New Documents**: Added documents after this one (Add New mode)
2. **Engine Improvements**: Engines updated with better algorithms (Reprocess All)
3. **Quality Issues**: Connections seem wrong or incomplete (Reprocess All)
4. **Preservation**: Want fresh connections but keep validated (Smart Mode)

---

### Mode 1: Reprocess All

**What It Does**:
1. Deletes ALL connections for the document
2. Runs selected engines from scratch
3. Generates fresh connections

**SQL Equivalent**:
```sql
-- Delete all connections
DELETE FROM chunk_connections
WHERE source_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>')
OR target_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>');

-- Run orchestrator (3 engines)
-- Generates new connections
```

**Use Cases**:
- ✅ Major engine update released
- ✅ Starting completely fresh
- ✅ Previous connections are wrong
- ✅ Testing new engine parameters

**Warnings**:
- ❌ Loses ALL user-validated connections
- ❌ Cannot undo (unless backup exists)

**Time**: ~15 minutes for 300 chunks, all 3 engines

---

### Mode 2: Add New

**What It Does**:
1. Keeps ALL existing connections
2. Identifies documents processed after this one
3. Runs engines only for connections to those newer documents

**Logic**:
```sql
-- Find newer documents
SELECT id FROM documents
WHERE created_at > (
  SELECT created_at FROM documents WHERE id = '<current_doc_id>'
);

-- Only process connections between current doc and newer docs
-- Existing connections preserved
```

**Use Cases**:
- ✅ New documents added regularly
- ✅ Want incremental updates
- ✅ Preserve existing work

**Benefits**:
- ✅ Fast (only processes new connections)
- ✅ Preserves all existing connections
- ✅ Incremental approach

**Time**: Depends on number of newer documents

---

### Mode 3: Smart Mode (Recommended)

**What It Does**:
1. **Backup Phase**: Saves user-validated connections to Storage
2. **Delete Phase**: Deletes only non-validated connections
3. **Process Phase**: Runs selected engines
4. **Preserve Phase**: User-validated connections remain untouched

**SQL Equivalent**:
```sql
-- 1. Query validated connections
SELECT * FROM chunk_connections
WHERE user_validated = true
AND (source_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>')
     OR target_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>'));

-- 2. Save to Storage: validated-connections-{timestamp}.json

-- 3. Delete non-validated only
DELETE FROM chunk_connections
WHERE user_validated IS NULL
AND (source_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>')
     OR target_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>'));

-- 4. Run orchestrator (3 engines)
-- Generates new connections

-- 5. Validated connections remain (not deleted in step 3)
```

**Options**:

**Preserve user-validated connections**:
- ✅ Checked (default, recommended): Keeps validated connections
- ❌ Unchecked: Deletes all connections (acts like Reprocess All)

**Save backup before reprocessing**:
- ✅ Checked (default, recommended): Saves `validated-connections-{timestamp}.json` to Storage
- ❌ Unchecked: No backup (faster, but risky)

**Use Cases**:
- ✅ **Most common use case**
- ✅ You have manually validated connections
- ✅ Want fresh connections for the rest
- ✅ Balance between fresh data and preserving work

**Benefits**:
- ✅ Preserves user work (validated connections)
- ✅ Updates non-validated connections
- ✅ Storage backup for safety
- ✅ Best of both worlds

**Time**: ~15 minutes for 300 chunks, all 3 engines

---

### Engine Selection Guide

**All 3 Engines (Recommended)**:
- Best quality connections
- Cost: ~$0.20 per document
- Time: ~15 minutes for 300 chunks

**Semantic Similarity Only (Fast & Free)**:
- Finds "these say the same thing"
- Cost: $0 (no AI calls)
- Time: ~2 minutes for 300 chunks

**Semantic + Contradiction (Good Balance)**:
- Finds similarities and tensions
- Cost: $0 (no AI calls)
- Time: ~3 minutes for 300 chunks

**All Except Thematic Bridge (Free)**:
- Skips expensive AI-powered cross-domain matching
- Cost: $0
- Time: ~3 minutes for 300 chunks

**Thematic Bridge Only (Specific Use Case)**:
- Only cross-domain concept matching
- Cost: ~$0.20
- Time: ~12 minutes for 300 chunks

---

## Export & Portability

### ZIP Bundle Generation

**What's in a ZIP**:
```
export-2025-10-13.zip (2.5GB)
│
├── manifest.json                           # Top-level manifest
│   {
│     "version": "1.0",
│     "export_date": "2025-10-13T12:00:00Z",
│     "document_count": 3,
│     "total_size_bytes": 2684354560,
│     "documents": [
│       {
│         "document_id": "doc-abc",
│         "title": "Gravity's Rainbow",
│         "author": "Thomas Pynchon",
│         "chunk_count": 382,
│         "...": "..."
│       },
│       "..."
│     ]
│   }
│
├── doc-abc/
│   ├── source.pdf                          # Original PDF file
│   ├── content.md                          # Cleaned markdown
│   ├── chunks.json                         # Enriched chunks (final)
│   │   {
│   │     "version": "1.0",
│   │     "document_id": "doc-abc",
│   │     "processing_mode": "cloud",
│   │     "created_at": "2025-10-12T10:00:00Z",
│   │     "chunks": [
│   │       {
│   │         "chunk_index": 0,
│   │         "content": "Chapter 1. It begins...",
│   │         "summary": "Introduction to...",
│   │         "themes": ["paranoia", "war", "..."],
│   │         "importance_score": 0.85,
│   │         "emotional_metadata": { "polarity": 0.2, "..." },
│   │         "conceptual_metadata": { "concepts": ["..."], "..." },
│   │         "domain_metadata": { "primary_domain": "literary", "..." }
│   │       },
│   │       "..."
│   │     ]
│   │   }
│   ├── metadata.json                       # Document metadata
│   │   {
│   │     "document_id": "doc-abc",
│   │     "title": "Gravity's Rainbow",
│   │     "author": "Thomas Pynchon",
│   │     "word_count": 150000,
│   │     "page_count": 500,
│   │     "language": "en",
│   │     "genre": "literary fiction",
│   │     "publication_year": 1973,
│   │     "isbn": "...",
│   │     "..."
│   │   }
│   ├── manifest.json                       # File inventory
│   │   {
│   │     "version": "1.0",
│   │     "document_id": "doc-abc",
│   │     "files": {
│   │       "source": { "path": "source.pdf", "size": 8421600, "hash": "..." },
│   │       "content": { "path": "content.md", "size": 524288, "hash": "..." },
│   │       "chunks": { "path": "chunks.json", "size": 2097152, "count": 382, "hash": "..." },
│   │       "metadata": { "path": "metadata.json", "size": 4096, "hash": "..." }
│   │     },
│   │     "processing_cost": {
│   │       "extraction": 0.12,
│   │       "metadata": 0.20,
│   │       "embeddings": 0.02,
│   │       "connections": 0.20,
│   │       "total": 0.54
│   │     },
│   │     "processing_time": {
│   │       "extraction": 180,
│   │       "cleanup": 30,
│   │       "chunking": 60,
│   │       "metadata": 240,
│   │       "embeddings": 120,
│   │       "total": 630
│   │     }
│   │   }
│   ├── cached_chunks.json                  # (if LOCAL mode)
│   ├── connections.json                    # (if Include Connections)
│   │   {
│   │     "version": "1.0",
│   │     "document_id": "doc-abc",
│   │     "created_at": "2025-10-12T11:00:00Z",
│   │     "connections": [
│   │       {
│   │         "connection_type": "semantic_similarity",
│   │         "source_chunk_index": 5,
│   │         "target_chunk_index": 42,
│   │         "target_document_id": "doc-abc",
│   │         "strength": 0.92,
│   │         "reasoning": "Both discuss paranoia themes",
│   │         "user_validated": false
│   │       },
│   │       "..."
│   │     ]
│   │   }
│   └── annotations.json                    # (if Include Annotations)
│       {
│         "version": "1.0",
│         "document_id": "doc-abc",
│         "annotations": [
│           {
│             "chunk_index": 10,
│             "text": "Important passage about...",
│             "selection_range": { "start": 0, "end": 50 },
│             "note": "This connects to...",
│             "created_at": "2025-10-13T09:00:00Z",
│             "tags": ["key-concept", "thesis"]
│           },
│           "..."
│         ]
│       }
│
├── doc-def/
│   └── (same structure)
│
└── doc-ghi/
    └── (same structure)
```

---

### Import from ZIP (Future Feature)

**Planned Workflow**:
1. Extract ZIP bundle
2. Admin Panel → Import tab
3. "Import from ZIP" button
4. Select extracted folder
5. System reads all JSON files
6. Restores to database with conflict resolution
7. Rebuilds embeddings if needed

**Status**: Not yet implemented (future enhancement)

**Workaround**: Manually upload JSON files to Storage, then use Import tab

---

## Troubleshooting

### Problem: Scanner Shows "Missing from DB"

**Symptoms**:
- Document exists in Storage
- Not showing in Database
- Scanner shows red "Missing from DB" badge

**Diagnosis**:
```sql
-- Check if document exists
SELECT id, title, status FROM documents WHERE id = '<doc_id>';

-- Check if chunks exist
SELECT COUNT(*) FROM chunks WHERE document_id = '<doc_id>';
```

**Solutions**:
1. **Import from Storage**: Admin Panel → Import tab → Select document → Import
2. **If import fails**: Check Supabase Storage to verify files exist
3. **If files missing**: Reprocess the document

---

### Problem: Conflict Resolution Dialog Won't Close

**Symptoms**:
- Dialog stuck open
- Cannot click "Apply Resolution"
- Button disabled

**Diagnosis**:
- Check browser console for errors
- Verify strategy selected (radio button)

**Solutions**:
1. Select a strategy (radio button)
2. Refresh page if button still disabled
3. Check browser console for JavaScript errors

---

### Problem: Import Job Stuck at "Processing"

**Symptoms**:
- Import job shows "Processing" for >10 minutes
- Progress not updating
- No errors visible

**Diagnosis**:
```bash
# Check worker logs
cd worker && npm run dev
# Look for errors in output

# Check database
SELECT * FROM background_jobs WHERE job_type = 'import_document' ORDER BY created_at DESC LIMIT 5;
```

**Solutions**:
1. **Check Worker**: Ensure worker is running (`cd worker && npm run dev`)
2. **Check Job Status**: Admin Panel → Jobs tab → Look for errors
3. **Cancel Job**: Admin Panel → Jobs tab → Cancel stuck job
4. **Retry**: Try import again

---

### Problem: Export ZIP Download Fails

**Symptoms**:
- Download button appears
- Click doesn't download
- Browser shows error

**Diagnosis**:
- Check signed URL expiry (24 hours)
- Check browser network tab for 403 error
- Check Supabase Storage for ZIP file

**Solutions**:
1. **Expired URL**: Generate new export (ZIP creation is fast, <2 min)
2. **Storage Issue**: Check Supabase Storage UI to verify ZIP exists
3. **Browser Issue**: Try different browser or incognito mode

---

### Problem: Smart Mode Doesn't Preserve Validated Connections

**Symptoms**:
- User-validated connections deleted
- After reprocess, validated connections missing

**Diagnosis**:
```sql
-- Check validated connections before reprocess
SELECT COUNT(*) FROM chunk_connections
WHERE user_validated = true
AND source_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>');

-- Check after reprocess
-- Should be same count
```

**Solutions**:
1. **Verify Option Checked**: Connections tab → "Preserve user-validated connections" must be checked
2. **Check Backup**: Storage → `validated-connections-*.json` should exist
3. **Restore from Backup**: Manually restore from JSON file if available

---

### Problem: Annotations Break After Import

**Symptoms**:
- Annotations don't show up
- Annotations point to wrong text
- Annotation positions wrong

**Diagnosis**:
- Check which import strategy was used
- Check chunk IDs in database

**Root Cause**: Used "Replace" strategy instead of "Merge Smart"

**Solutions**:
1. **Prevention**: Always use "Merge Smart" when annotations exist
2. **Recovery**: If backup exists, import again with Merge Smart
3. **No Recovery**: Annotations cannot be recovered if chunk IDs changed and no backup

---

## Developer Reference

### File Locations

**Backend**:
```
worker/
├── lib/
│   └── storage-helpers.ts              # Storage operations (save, read, hash, list)
├── types/
│   └── storage.ts                      # Export schemas (TypeScript interfaces)
├── handlers/
│   ├── import-document.ts              # Import workflow handler
│   ├── export-document.ts              # Export workflow handler (ZIP generation)
│   └── reprocess-connections.ts        # Connection reprocessing handler
└── processors/
    ├── base.ts                         # BaseProcessor with saveStageResult()
    ├── pdf-processor.ts                # PDF processing with Storage saves
    └── epub-processor.ts               # EPUB processing with Storage saves
```

**Frontend**:
```
src/
├── app/
│   └── actions/
│       └── documents.ts                # Server Actions (scanStorage, importFromStorage, exportDocuments, reprocessConnections)
└── components/
    └── admin/
        ├── AdminPanel.tsx              # Sheet-based panel with tabs
        ├── ConflictResolutionDialog.tsx # Conflict resolution UI
        └── tabs/
            ├── ScannerTab.tsx          # Storage scanner UI
            ├── ImportTab.tsx           # Import workflow UI
            ├── ExportTab.tsx           # Export workflow UI
            ├── ConnectionsTab.tsx      # Connection reprocessing UI
            ├── IntegrationsTab.tsx     # Obsidian/Readwise UI
            └── JobsTab.tsx             # Background job management UI
```

**Scripts**:
```
scripts/
└── validate-complete-system.ts         # Automated validation (23 tests)
```

**Documentation**:
```
docs/
├── STORAGE_FIRST_PORTABILITY_GUIDE.md  # This file
├── tasks/
│   ├── storage-first-portability.md    # Task breakdown (T-001 to T-024)
│   ├── MANUAL_TESTING_CHECKLIST_T024.md # Manual testing guide (35+ scenarios)
│   └── T024_COMPLETION_SUMMARY.md      # Implementation summary
└── prps/
    └── storage-first-portability.md    # Original PRP (Product Requirements & Plans)
```

---

### Storage Paths

**Document Files**:
```
Storage: documents/{userId}/{documentId}/
├── source.pdf                          # Original uploaded file
├── content.md                          # Cleaned markdown
├── chunks.json                         # Enriched chunks (FINAL)
├── metadata.json                       # Document metadata (FINAL)
├── manifest.json                       # File inventory + costs (FINAL)
├── cached_chunks.json                  # Docling chunks (LOCAL mode FINAL)
└── stage-*.json                        # Intermediate stages (optional)
```

**Connection Backups**:
```
Storage: documents/{userId}/{documentId}/
└── validated-connections-{timestamp}.json  # Smart Mode backups
```

**Export Bundles**:
```
Storage: documents/{userId}/exports/
└── export-{timestamp}.zip                  # ZIP bundles (24-hour signed URL)
```

---

### Database Tables

**Documents**:
```sql
documents
├── id (UUID, primary key)
├── user_id (UUID, foreign key)
├── title (TEXT)
├── status (TEXT: processing, completed, failed)
├── source_type (TEXT: pdf, epub, youtube, web, etc.)
├── created_at (TIMESTAMP)
└── ...
```

**Chunks**:
```sql
chunks
├── id (UUID, primary key)
├── document_id (UUID, foreign key)
├── chunk_index (INTEGER)
├── content (TEXT)
├── summary (TEXT)
├── themes (TEXT[])
├── importance_score (REAL)
├── embedding (VECTOR(768))
├── emotional_metadata (JSONB)
├── conceptual_metadata (JSONB)
├── domain_metadata (JSONB)
├── heading_path (TEXT[])
├── heading_level (INTEGER)
├── section_marker (TEXT)
└── ...
```

**Cached Chunks** (LOCAL mode):
```sql
cached_chunks
├── id (UUID, primary key)
├── document_id (UUID, foreign key)
├── extraction_mode (TEXT: pdf, epub)
├── markdown_hash (TEXT)
├── chunk_data (JSONB)
├── structure_data (JSONB)
└── created_at (TIMESTAMP)
```

**Chunk Connections**:
```sql
chunk_connections
├── id (UUID, primary key)
├── source_chunk_id (UUID, foreign key)
├── target_chunk_id (UUID, foreign key)
├── connection_type (TEXT: semantic_similarity, contradiction_detection, thematic_bridge)
├── strength (REAL)
├── reasoning (TEXT)
├── user_validated (BOOLEAN)
└── created_at (TIMESTAMP)
```

**Background Jobs**:
```sql
background_jobs
├── id (UUID, primary key)
├── user_id (UUID, foreign key)
├── job_type (TEXT: import_document, export_document, reprocess_connections, etc.)
├── status (TEXT: pending, processing, completed, failed)
├── progress (REAL: 0.0 to 1.0)
├── input_data (JSONB)
├── output_data (JSONB)
├── error_message (TEXT)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

---

### JSON Schemas

**ChunksExport** (`chunks.json`):
```typescript
interface ChunksExport {
  version: string                        // "1.0"
  document_id: string
  processing_mode: 'local' | 'cloud'
  created_at: string                     // ISO 8601
  chunks: Array<{
    chunk_index: number
    content: string
    summary: string | null
    themes: string[]
    importance_score: number
    emotional_metadata: EmotionalMetadata | null
    conceptual_metadata: ConceptualMetadata | null
    domain_metadata: DomainMetadata | null
    metadata_extracted_at: string | null
    heading_path: string[] | null
    heading_level: number | null
    section_marker: string | null
    // NOTE: Excludes id, embedding, document_id (not portable)
  }>
}
```

**MetadataExport** (`metadata.json`):
```typescript
interface MetadataExport {
  version: string                        // "1.0"
  document_id: string
  title: string
  author: string | null
  word_count: number
  page_count: number
  language: string
  genre: string | null
  publication_year: number | null
  isbn: string | null
  source_type: 'pdf' | 'epub' | 'youtube' | 'web' | 'markdown' | 'text' | 'paste'
  original_filename: string | null
  created_at: string                     // ISO 8601
}
```

**ManifestExport** (`manifest.json`):
```typescript
interface ManifestExport {
  version: string                        // "1.0"
  document_id: string
  created_at: string                     // ISO 8601
  files: {
    source: FileInfo
    content: FileInfo
    chunks: FileInfo & { count: number }
    metadata: FileInfo
    cached_chunks?: FileInfo             // LOCAL mode only
  }
  processing_cost: {
    extraction: number
    metadata: number
    embeddings: number
    connections: number
    total: number
  }
  processing_time: {
    extraction: number                   // seconds
    cleanup: number
    chunking: number
    metadata: number
    embeddings: number
    total: number
  }
}

interface FileInfo {
  path: string
  size: number                           // bytes
  hash: string                           // SHA256
  created_at: string                     // ISO 8601
}
```

**CachedChunksExport** (`cached_chunks.json`, LOCAL mode only):
```typescript
interface CachedChunksExport {
  version: string                        // "1.0"
  document_id: string
  extraction_mode: 'pdf' | 'epub'
  markdown_hash: string                  // SHA256 of cleaned markdown
  created_at: string                     // ISO 8601
  chunks: Array<{
    chunk_index: number
    text: string
    provenance: {
      page_numbers: number[]
      bbox: BBox | null
    }
  }>
  structure: {
    headings: Array<{
      level: number
      text: string
      page_number: number | null
    }>
    total_pages: number
    has_toc: boolean
  }
}

interface BBox {
  l: number
  t: number
  r: number
  b: number
  page_number: number
}
```

---

### API Reference

**Server Actions** (in `src/app/actions/documents.ts`):

```typescript
// Scan Storage and compare to Database
export async function scanStorage(): Promise<{
  success: boolean
  documents: Array<{
    documentId: string
    title: string
    storageFiles: string[]
    inDatabase: boolean
    chunkCount: number | null
    syncState: 'healthy' | 'missing_from_db' | 'missing_from_storage' | 'out_of_sync'
    createdAt: string | null
  }>
  error?: string
}>

// Import from Storage with conflict resolution
export async function importFromStorage(
  documentId: string,
  options: {
    strategy?: 'skip' | 'replace' | 'merge_smart'
    regenerateEmbeddings?: boolean
    reprocessConnections?: boolean
  } = {}
): Promise<{
  success: boolean
  jobId?: string
  needsResolution?: boolean
  conflict?: ImportConflict
  error?: string
}>

// Export documents to ZIP bundle
export async function exportDocuments(
  documentIds: string[],
  options: {
    includeConnections?: boolean
    includeAnnotations?: boolean
    format?: 'storage' | 'zip'
  } = {}
): Promise<{
  success: boolean
  jobId?: string
  error?: string
}>

// Reprocess connections with mode selection
export async function reprocessConnections(
  documentId: string,
  options: {
    mode: 'all' | 'add_new' | 'smart'
    engines: Array<'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'>
    preserveValidated?: boolean
    backupFirst?: boolean
  }
): Promise<{
  success: boolean
  jobId?: string
  error?: string
}>
```

---

### Validation Commands

**Automated Validation**:
```bash
# Quick smoke tests (< 1 second)
npx tsx scripts/validate-complete-system.ts --quick

# Full validation with database checks
npx tsx scripts/validate-complete-system.ts --full

# Expected output:
# ✅ ALL VALIDATIONS PASSED
# Total Tests:  23
# ✓ Passed:     23
# ✗ Failed:     0
# Duration:     0.00s
```

**Manual Testing**:
```bash
# Follow comprehensive manual testing guide
open docs/tasks/MANUAL_TESTING_CHECKLIST_T024.md

# Estimated time: 3-4 hours for complete validation
```

**Storage Validation** (for specific document):
```bash
cd worker
npx tsx scripts/validate-storage-export.ts <document_id> <user_id> cloud

# For LOCAL mode:
npx tsx scripts/validate-storage-export.ts <document_id> <user_id> local
```

---

## Conclusion

The Storage-First Portability System provides a robust, production-ready solution for managing AI-enriched document data in Rhizome V2.

**Key Takeaways**:
1. **Storage is the source of truth** - Database is a queryable cache
2. **Automatic backups** - Every processing saves to Storage
3. **Intelligent import** - 3 conflict resolution strategies protect user work
4. **Smart Mode** - Preserves validated connections during reprocessing
5. **Complete portability** - ZIP bundles for backup and migration

**Next Steps**:
1. Process a document and verify Storage files exist
2. Open Admin Panel (`Cmd+Shift+A`) and explore tabs
3. Try a database reset + import workflow
4. Export a document to ZIP for backup
5. Read task breakdown for implementation details: `docs/tasks/storage-first-portability.md`

**Support & Documentation**:
- Task Breakdown: `docs/tasks/storage-first-portability.md`
- Manual Testing: `docs/tasks/MANUAL_TESTING_CHECKLIST_T024.md`
- Implementation Summary: `docs/tasks/T024_COMPLETION_SUMMARY.md`
- Validation Script: `scripts/validate-complete-system.ts`

---

**Last Updated**: 2025-10-13
**Version**: 1.0
**Status**: Production Ready ✅

🎉 **The Storage-First Portability System is complete and ready to use!**
