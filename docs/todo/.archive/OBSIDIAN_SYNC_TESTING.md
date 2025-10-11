# Obsidian Sync - Testing Guide

## Overview

This guide will help you test the complete Obsidian bidirectional sync workflow with annotation recovery.

## Prerequisites

1. **Obsidian installed** with a vault created
2. **Advanced URI plugin** installed in Obsidian (for reliable protocol handling)
3. **Rhizome running** (all services: Supabase + Worker + Next.js)

## Test Workflow

### 1. Configure Settings

1. Navigate to http://localhost:3000/settings
2. Fill in the configuration:
   - **Vault Name**: Exact name of your Obsidian vault (e.g., "Personal Vault")
   - **Vault Path**: Absolute path (e.g., `/Users/topher/Documents/ObsidianVault`)
   - **Export Path**: Subfolder within vault (e.g., `Rhizome/`)
   - **Sync Annotations**: ✅ Checked (exports .annotations.json alongside markdown)
   - **Auto-sync**: ⬜ Unchecked (manual sync for now)
3. Click **Save Settings**
4. Verify toast shows "Settings saved successfully"

### 2. Prepare Test Document

1. Upload a test document (PDF, markdown, or text)
2. Wait for processing to complete
3. Open the document in reader view
4. **Create some annotations**:
   - Highlight 3-5 passages with different colors
   - Add notes to at least 2 annotations
   - Mix exact quotes and paraphrased selections

### 3. Export to Obsidian

1. In document reader, click **"Edit in Obsidian"** button
2. Watch for:
   - Loading spinner on button
   - Background job created (check worker logs)
   - Toast: "Exported to Obsidian" with path shown
3. **Verify in Obsidian**:
   - Document appears in `Rhizome/` folder (or your configured path)
   - Markdown is clean and readable
   - `.annotations.json` file exists alongside (if sync annotations enabled)
   - Document opens automatically in Obsidian (via protocol handler)

### 4. Edit in Obsidian

Make intentional edits to test annotation recovery:

**Minor edits** (should auto-recover):
- Fix typos in existing paragraphs
- Add/remove a few words
- Reformat headings

**Moderate edits** (should trigger review):
- Rephrase entire sentences
- Move paragraphs around
- Delete small sections

**Major edits** (may lose some annotations):
- Delete entire paragraphs containing annotations
- Completely rewrite sections
- Add large new sections

### 5. Sync Back to Rhizome

1. In Rhizome reader, click **"Sync from Obsidian"** button
2. Watch for:
   - Loading spinner (may take 1-5 minutes for reprocessing)
   - Background job processing (check worker logs)
   - Toast with recovery stats:
     ```
     Recovered: X | Review: Y | Lost: Z
     ```
3. Page auto-reloads to show updated content

### 6. Verify Annotation Recovery

Check the recovery results in the toast:

- **Success** (≥0.85 confidence): Annotations auto-recovered and positioned correctly
- **Review** (0.75-0.85 confidence): Annotations recovered but flagged for review
- **Lost** (<0.75 confidence): Annotations could not be recovered

**Expected Recovery Rates:**
- Minor edits: 90-100% success
- Moderate edits: 70-90% success + some review
- Major edits: 50-70% success + many review/lost

### 7. Visual Verification

1. Scroll through the document
2. Verify annotations appear in correct locations
3. Check that annotation text matches the highlighted text
4. For "needs review" annotations, verify they're in roughly the right area

## Common Issues & Solutions

### Export fails with "Obsidian settings not configured"
- Go to `/settings` and configure vault path/name
- Make sure vault path is absolute and vault name is exact

### Document doesn't open in Obsidian
- Install Advanced URI plugin in Obsidian
- Check that vault name in settings matches exactly (case-sensitive)
- Try manually opening the exported file in Obsidian

### Sync button shows "No changes detected"
- File hasn't been modified in Obsidian
- Check that you saved the file in Obsidian
- Verify vault path is correct

### Recovery rate is very low (<50%)
- Edits were too extensive (entire paragraphs deleted)
- Try smaller, incremental edits
- Use "Review" panel (when implemented) to manually verify

### Worker timeout
- Large documents may take longer to reprocess
- Check worker logs for progress
- Consider increasing timeout in sync route (currently 5 minutes)

## Advanced Testing

### Test Concurrent Edits
1. Export document A
2. Export document B
3. Edit both in Obsidian
4. Sync A, then B
5. Verify both recover correctly

### Test Large Documents
1. Export 500+ page book
2. Make edits throughout
3. Sync back
4. Verify recovery rate across entire document

### Test Edge Cases
1. **Empty annotations** (just highlights, no notes)
2. **Overlapping annotations** (one inside another)
3. **Annotations at document start/end**
4. **Special characters** in annotation text

## Monitoring & Debugging

### Check Worker Logs
```bash
# In terminal where worker is running
# Look for:
[Obsidian Export] Starting export for document...
[Obsidian Sync] Starting sync for document...
[ReprocessDocument] Starting for document...
[Annotation Recovery] Recovered X annotations...
```

### Check Database
```sql
-- Check background jobs
SELECT * FROM background_jobs
WHERE job_type IN ('obsidian-export', 'obsidian-sync')
ORDER BY created_at DESC
LIMIT 10;

-- Check recovery stats
SELECT recovery_method, recovery_confidence, needs_review
FROM components
WHERE component_type = 'position'
AND recovery_method IS NOT NULL;
```

### Check Storage
```bash
# Obsidian vault (manual check)
ls -la /path/to/vault/Rhizome/

# Supabase storage (via Studio)
http://localhost:54323 → Storage → documents → check for .annotations.json
```

## Success Criteria

✅ Export completes in <10 seconds
✅ Document opens automatically in Obsidian
✅ Annotations exported to .annotations.json
✅ Sync completes in <5 minutes
✅ Recovery rate >80% for moderate edits
✅ Toast shows accurate recovery stats
✅ Page reloads with updated content
✅ Annotations appear in correct positions

## Next Steps

Once basic testing is complete:
1. Test with real documents (books, papers)
2. Test with many annotations (50+)
3. Implement review panel for low-confidence recoveries
4. Add auto-sync with file watcher
5. Add conflict resolution for concurrent edits
