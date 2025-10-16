# Phase 1 & 2 Testing Guide

**Date**: 2025-10-15
**Purpose**: Verify visual improvements and progress tracking enhancements

---

## Prerequisites

- [ ] Supabase running: `npx supabase start`
- [ ] Worker running: `cd worker && npm run dev`
- [ ] Next.js running: `npm run dev:next`
- [ ] Browser DevTools open (Console + Network tabs)

---

## Test 1: TypeScript Compilation ✅

**Status**: PASSED
**Command**: `npx tsc --noEmit`

All Phase 1+2 TypeScript errors resolved:
- ✅ `detect_connections` added to JobStatus type
- ✅ `input_data` property added
- ✅ `updatedAt` property added

---

## Test 2: Job Name Display (Phase 1)

### 2A: ProcessingDock - Upload New Document

**Steps:**
1. Navigate to home page
2. Upload a test PDF (50-200 pages recommended)
3. Watch **ProcessingDock** (bottom-right widget)

**Expected Results:**
- [ ] Job name shows: **⚡ "Processing: [Document Title].pdf"**
- [ ] Icon is a zap/lightning bolt (⚡) with primary color
- [ ] **Green pulsing dot** appears next to job name (heartbeat indicator)
- [ ] Progress bar updates smoothly
- [ ] Details text shows stage info (not just "Processing...")

**Before Phase 1:**
```
Processing...
Progress: 65% [████████░░░░]
```

**After Phase 1:**
```
⚡ Processing: The Man Who Sold the World.pdf  ● (green pulse)
Progress: 70% [█████████░░░]
Generating embeddings for 234 chunks...
```

---

### 2B: JobList - Admin Panel Jobs Tab

**Steps:**
1. Press `Cmd+Shift+A` to open Admin Panel
2. Navigate to **Jobs** tab (tab 6)
3. Look at the job list

**Expected Results:**
- [ ] All 7 job types have proper icons and labels:
  - ⚡ Processing (primary)
  - 📊 Import (blue)
  - 📄 Export (purple)
  - 🌐 Connections (orange)
  - 🔀 Detecting (pink)
  - 🔄 Obsidian Export/Sync (indigo)
  - 📖 Readwise Import (green)
- [ ] Job names include document titles
- [ ] Job names include modes (e.g., "Smart Mode", "with embeddings")

---

### 2C: Import Job Naming

**Steps:**
1. Admin Panel → **Scanner** tab
2. Delete chunks for one document:
   ```sql
   DELETE FROM chunks WHERE document_id = '[your-doc-id]';
   ```
3. Admin Panel → **Import** tab
4. Select document
5. Check "Regenerate Embeddings"
6. Click "Import"

**Expected Results:**
- [ ] Job name shows: **📊 "Import: [Document Title] (with embeddings)"**
- [ ] Icon is a database (📊) with blue color
- [ ] Green pulsing dot appears
- [ ] Progress details show: "Updated X of Y chunk embeddings"

---

### 2D: Connections Job Naming

**Steps:**
1. Admin Panel → **Connections** tab
2. Select a document
3. Select mode: "Smart Mode"
4. Enable "Preserve user-validated connections"
5. Click "Start Reprocessing"

**Expected Results:**
- [ ] Job name shows: **🌐 "Connections: [Document Title] (Smart Mode)"**
- [ ] Icon is a network (🌐) with orange color
- [ ] Green pulsing dot appears
- [ ] Progress updates show stage transitions

---

## Test 3: Visual Heartbeat Indicator (Phase 1)

### 3A: Active Job - Pulse Visible

**Steps:**
1. Start processing a document
2. Watch ProcessingDock continuously for 30 seconds

**Expected Results:**
- [ ] **Green dot pulses** next to job name
- [ ] Pulse is smooth and visible (animate-pulse CSS class)
- [ ] Pulse indicates job updated within last 10 seconds

**Implementation Check:**
```tsx
// In ProcessingDock.tsx
const isAlive = Date.now() - (job.updatedAt || job.createdAt) < 10000
{isAlive && <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
```

---

### 3B: Stuck Job - No Pulse

**Test Scenario**: Simulate stuck job (worker stopped)

**Steps:**
1. Start processing a document
2. Stop the worker: `Ctrl+C` in worker terminal
3. Wait 10 seconds
4. Check ProcessingDock

**Expected Results:**
- [ ] Green pulse **disappears** after 10 seconds (job not updating)
- [ ] Progress bar remains at last value (e.g., 65%)
- [ ] Job still shows but with no heartbeat indicator
- [ ] User can identify job is stuck

---

## Test 4: Progress Updates (Phase 2)

### 4A: Heartbeat Mechanism

**Steps:**
1. Start worker in one terminal
2. Tail worker logs in another:
   ```bash
   tail -f /tmp/worker.log | grep -E "(Heartbeat|Stage)"
   ```
3. Upload a document

**Expected Results:**
- [ ] Worker logs show: `[Heartbeat] Started`
- [ ] Heartbeat updates appear every 5 seconds
- [ ] Worker logs show: `[Heartbeat] Stopped` when done
- [ ] Database `background_jobs.updated_at` changes every 5 seconds

**Verification Query:**
```sql
SELECT id, status, updated_at, created_at,
       EXTRACT(EPOCH FROM (NOW() - updated_at)) as seconds_since_update
FROM background_jobs
WHERE status = 'processing'
ORDER BY created_at DESC
LIMIT 1;
```

Expected: `seconds_since_update` < 10 seconds while processing

---

### 4B: Micro-Progress During Chunking

**Steps:**
1. Process a document with 200+ pages (will generate 300+ chunks)
2. Watch ProcessingDock during the **65-85% range** (chunking/embedding stage)

**Expected Results - Before Phase 2:**
```
Progress stuck at 65% for 5-15 minutes
Details: "Generating embeddings for 0 chunks"
User uncertain if job is frozen
```

**Expected Results - After Phase 2:**
```
70%: "Generating embeddings for 234 chunks..."
75%: "Generated 117 embeddings (50%)"
80%: "Generated 234 embeddings"
82%: "Preparing 234 chunks for database"
85%: "Inserting 234 chunks into database"
90%: "Saved 234 chunks successfully"
```

- [ ] Progress updates every 5-10 seconds during chunking
- [ ] Details text changes to show current operation
- [ ] Green pulse confirms job is alive
- [ ] User confident processing is happening

---

### 4C: Micro-Progress During Import

**Steps:**
1. Import a document with 300+ chunks
2. Enable "Regenerate Embeddings"
3. Watch progress during 65-90% range

**Expected Results:**
- [ ] Progress updates every ~10 chunks
- [ ] Details show: "Updated 130 of 500 chunk embeddings"
- [ ] Progress bar increments smoothly (not stuck)
- [ ] Heartbeat pulse visible throughout

**Worker Logs Check:**
```bash
tail -f /tmp/worker.log | grep "Embedding batch"
```

Should see:
```
Embedding batch 1/10: 50 chunks processed
Embedding batch 2/10: 100 chunks processed
...
```

---

### 4D: Merge Smart Micro-Progress

**Steps:**
1. Create annotations on 3 chunks
2. Modify chunk metadata to create conflict
3. Import with "Merge Smart" strategy

**Expected Results:**
- [ ] Progress shows: "Updated 50 of 300 chunk metadata"
- [ ] Updates appear every 10 chunks
- [ ] Annotations remain intact after import

---

## Test 5: All Job Types Display

### 5A: detect_connections Job

**Steps:**
1. Process a document (will queue detect_connections job automatically)
2. Check ProcessingDock and Jobs tab

**Expected Results:**
- [ ] Job type shows: **🔀 "Detecting: [Document Title]"**
- [ ] Icon is git-branch (🔀) with pink color
- [ ] Job appears in both ProcessingDock and Jobs tab
- [ ] No "unmapped" or undefined labels

---

### 5B: Export Job

**Steps:**
1. Admin Panel → **Export** tab
2. Select 3 documents
3. Check "Include Connections" + "Include Annotations"
4. Click "Export Selected (3)"

**Expected Results:**
- [ ] Job name: **📄 "Export: 3 documents (with connections)"**
- [ ] Icon is file-text (📄) with purple color
- [ ] Progress shows per-document status
- [ ] Details show: "Processing document 2 of 3"

---

## Test 6: Console Error Check

**Steps:**
1. Open browser DevTools → Console tab
2. Perform all above tests
3. Check for errors

**Expected Results:**
- [ ] **No React errors** related to JobList or ProcessingDock
- [ ] **No TypeScript errors** in console
- [ ] **No 404 errors** in Network tab
- [ ] Console shows job updates:
  ```
  [BackgroundJobs] Registering job: abc123 (process_document)
  [BackgroundJobs] Auto-starting polling
  [BackgroundJobs] Job completed: abc123
  ```

---

## Test 7: Edge Cases

### 7A: Multiple Active Jobs

**Steps:**
1. Start 3 jobs simultaneously:
   - Process document A
   - Import document B (with embeddings)
   - Reprocess connections for document C

**Expected Results:**
- [ ] All 3 jobs appear in ProcessingDock
- [ ] Each has unique icon and color
- [ ] All show green pulse (alive)
- [ ] Progress updates independently
- [ ] No UI slowdown or flickering

---

### 7B: Failed Job (No Pulse)

**Steps:**
1. Cause a job to fail (e.g., invalid PDF)
2. Check ProcessingDock after failure

**Expected Results:**
- [ ] Job status changes to "failed"
- [ ] Green pulse **disappears** (no updates)
- [ ] Red error icon appears
- [ ] Error message visible in details

---

## Test 8: Performance Check

**Steps:**
1. Process a large document (500 pages, 700+ chunks)
2. Monitor browser performance (DevTools → Performance tab)

**Expected Results:**
- [ ] UI remains responsive during processing
- [ ] Progress updates don't cause lag
- [ ] Polling every 2 seconds doesn't spike CPU
- [ ] Memory usage stable (no leaks)

**Browser Performance Metrics:**
- CPU usage: < 10% while idle (polling active)
- Memory: < 50MB increase during processing
- Frame rate: 60 FPS maintained

---

## Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| TypeScript Compilation | ✅ PASSED | All Phase 1+2 errors fixed |
| Job Names (Processing) | ⏳ Pending | Test with document upload |
| Job Names (Import) | ⏳ Pending | Test with import workflow |
| Job Names (Connections) | ⏳ Pending | Test with reprocess |
| Heartbeat Pulse | ⏳ Pending | Verify green dot animation |
| Stuck Job Detection | ⏳ Pending | Test worker stop scenario |
| Heartbeat Mechanism | ⏳ Pending | Check worker logs |
| Chunking Micro-Progress | ⏳ Pending | Monitor 65-85% range |
| Import Micro-Progress | ⏳ Pending | Test with embeddings |
| Merge Smart Progress | ⏳ Pending | Test with annotations |
| All 7 Job Types | ⏳ Pending | Verify icons and labels |
| Console Errors | ⏳ Pending | Check DevTools |
| Multiple Jobs | ⏳ Pending | Test concurrency |
| Performance | ⏳ Pending | Monitor browser metrics |

---

## Issues Found

**Issue**: [None yet - fill in during testing]
**Severity**: [Critical / High / Medium / Low]
**Description**: [What went wrong]
**Fix**: [How to resolve]

---

## Next Steps After Testing

If all tests pass:
1. ✅ Mark Phase 1 + 2 as **complete**
2. ✅ Update `job-system-enhancement-plan.md`
3. ✅ Commit changes with message: "feat: improve job display and progress tracking"
4. Move to **Phase 3**: Database schema for pause/resume

If issues found:
1. Document each issue above
2. Prioritize fixes (critical → low)
3. Fix issues before proceeding
4. Re-test

---

**Testing Start Time**: __________
**Testing End Time**: __________
**Tester**: __________
**Overall Status**: ⏳ In Progress
