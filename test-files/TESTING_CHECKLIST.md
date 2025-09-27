# Manual Testing Checklist - Background Processing System

## ✅ Pre-Test Setup (COMPLETED)

- [x] Worker dependencies installed
- [x] Environment variables configured (.env.local)
- [x] Database migrations applied (008, 009)
- [x] Test-files directory created
- [x] All database tables verified (background_jobs, documents, chunks, entities, components)
- [x] Realtime publication enabled for background_jobs

## 📦 Before You Start Testing

### 1. Add Test PDF Files
Place test PDFs in the `test-files/` directory:
- `small.pdf` (5-10 pages) - For happy path testing
- `medium.pdf` (50+ pages) - For progressive availability
- `large.pdf` (100+ pages) - For checkpoint resume

You can download test PDFs from:
- arXiv.org (academic papers)
- Project Gutenberg (public domain books)
- Or use any PDFs you have available

### 2. Start Services
Open two terminal windows:

**Terminal 1: Next.js + Supabase**
```bash
npm run dev
# This starts Supabase and Next.js on http://localhost:3000
```

**Terminal 2: Background Worker**
```bash
npm run dev:worker
# This starts the worker with hot reload
# You should see: "🚀 Background worker started"
```

### 3. Open Browser
Navigate to: http://localhost:3000

## 🧪 Test Scenarios (In Order)

### Test 1: Happy Path ⏱️ 2-3 minutes
**File**: `small.pdf` (5-10 pages)

1. [ ] Drag and drop PDF to upload zone
2. [ ] ProcessingDock appears at bottom of screen
3. [ ] Progress updates through stages:
   - [ ] 📥 Downloading (10%)
   - [ ] 🤖 Extracting with AI (30%)
   - [ ] 💾 Saving markdown (50%)
   - [ ] 🧮 Generating embeddings (50-99%)
   - [ ] ✅ Complete (100%)
4. [ ] Document appears in library with extracted title
5. [ ] Worker logs show successful processing

**Database Verification**:
```sql
-- Run in Terminal 3:
psql postgresql://postgres:postgres@localhost:54322/postgres

-- Check document status:
SELECT title, processing_status, markdown_available, embeddings_available 
FROM documents 
ORDER BY created_at DESC LIMIT 1;

-- Expected: processing_status='completed', both availability flags=true
```

**✅ PASS Criteria**: Document processes in <3 minutes, all stages complete, no errors

---

### Test 2: Progressive Availability ⏱️ 3-4 minutes
**File**: `medium.pdf` (50+ pages)

1. [ ] Upload medium PDF
2. [ ] Wait for "save_markdown" stage (50%)
3. [ ] Click on document in library while still processing
4. [ ] Reader page loads with markdown content visible
5. [ ] Banner at top shows: "Processing connections: XX%"
6. [ ] Banner disappears when processing completes
7. [ ] Scroll through document - all content is readable

**✅ PASS Criteria**: Can read document before embeddings complete, banner updates correctly

---

### Test 3: Checkpoint Resume ⏱️ 5-10 minutes
**File**: `large.pdf` (100+ pages)

1. [ ] Upload large PDF
2. [ ] Wait for "save_markdown" stage (50%)
3. [ ] In Terminal 2, press Ctrl+C to kill worker
4. [ ] Check job status in database:
```sql
SELECT status, progress FROM background_jobs 
WHERE status = 'processing' 
ORDER BY created_at DESC LIMIT 1;
```
5. [ ] Verify markdown file exists in Supabase Studio:
   - Go to http://localhost:54323
   - Storage → documents bucket
   - Navigate to `<user_id>/<document_id>/content.md`
6. [ ] Restart worker: `npm run dev:worker` in Terminal 2
7. [ ] Worker logs show: "Resuming from checkpoint: markdown already saved"
8. [ ] Processing continues from embedding stage
9. [ ] Job completes successfully

**✅ PASS Criteria**: Worker resumes from checkpoint, no re-downloading/re-extraction

---

### Test 4: Realtime Updates ⏱️ 2-3 minutes
**File**: `small.pdf`

1. [ ] Open two browser tabs to http://localhost:3000
2. [ ] In Tab 1, upload PDF
3. [ ] In Tab 2, observe without refreshing
4. [ ] Both tabs show synchronized progress updates
5. [ ] Both tabs show completion at same time
6. [ ] No manual refresh needed

**✅ PASS Criteria**: Realtime updates work across multiple tabs

---

### Test 5: Manual Retry ⏱️ 2-3 minutes
**Setup**: Create corrupted PDF first
```bash
echo "Not a PDF file" > test-files/corrupted.pdf
```

1. [ ] Upload `corrupted.pdf`
2. [ ] Job fails with error message in ProcessingDock
3. [ ] Red X icon appears
4. [ ] Error message is user-friendly (not technical)
5. [ ] "Retry" button is visible
6. [ ] Click "Retry" button
7. [ ] Job resets to "pending" status
8. [ ] Worker picks up job again
9. [ ] Job fails again (permanent error)

**✅ PASS Criteria**: Retry button works, user-friendly error messages

---

### Test 6: Multiple Concurrent Jobs ⏱️ 5-10 minutes
**Files**: 3 different small PDFs

1. [ ] Upload 3 PDFs quickly (within 10 seconds)
2. [ ] All 3 appear in ProcessingDock
3. [ ] Jobs process one at a time (sequential, not parallel)
4. [ ] Each job shows independent progress
5. [ ] All 3 complete successfully
6. [ ] "Clear Completed" button works

**✅ PASS Criteria**: Queue works correctly, no job starvation

---

### Test 7: Worker Graceful Shutdown ⏱️ 1 minute

1. [ ] Start processing a document
2. [ ] In Terminal 2, press Ctrl+C
3. [ ] Worker logs show: "🛑 Graceful shutdown initiated..."
4. [ ] Worker logs show: "✅ Worker shut down cleanly"
5. [ ] No error messages about orphaned connections
6. [ ] Job status in database is "processing" (ready to resume)

**✅ PASS Criteria**: Clean shutdown, no orphaned resources

---

## 🐛 Common Issues & Debugging

### Issue: Worker Not Picking Up Jobs
**Symptoms**: Jobs stay in "pending" forever

**Check**:
```bash
# Is worker running?
ps aux | grep tsx

# Check worker logs in Terminal 2
# Should see: "🚀 Background worker started"

# Check database:
psql postgresql://postgres:postgres@localhost:54322/postgres -c \
  "SELECT id, status, created_at FROM background_jobs ORDER BY created_at DESC LIMIT 3;"
```

**Fix**: Restart worker with `npm run dev:worker`

---

### Issue: Realtime Updates Not Working
**Symptoms**: Have to refresh page to see progress

**Check**:
```sql
-- Verify Realtime publication
SELECT tablename FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND tablename = 'background_jobs';
```

**Fix**: 
```bash
npx supabase db reset
```

---

### Issue: Gemini API Errors
**Symptoms**: All jobs fail with API errors

**Check**:
```bash
# Verify API key in .env.local
grep GOOGLE_AI_API_KEY .env.local

# Test API key manually:
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://generativelanguage.googleapis.com/v1beta/models
```

**Fix**: Get new API key from https://aistudio.google.com/

---

### Issue: Storage Upload Failures
**Symptoms**: Jobs fail at "save_markdown" stage

**Check Supabase Studio**:
1. Go to http://localhost:54323
2. Storage → documents bucket
3. Check if files are being created

**Fix**: Check storage bucket policies in migration 002

---

## 📊 Success Metrics

After running all tests, verify:

- [ ] **Processing Success Rate**: >95% of valid PDFs complete successfully
- [ ] **Resume Success**: Checkpoint resume works after worker restart
- [ ] **Realtime Latency**: Progress updates appear within 2 seconds
- [ ] **Progressive Availability**: Can read markdown within 50% of total processing time
- [ ] **Error Handling**: User-friendly messages for all error types
- [ ] **Worker Stability**: No crashes or orphaned connections

---

## 🎯 Next Steps After Testing

1. **If All Tests Pass**: System is ready for production use!
   - Document any edge cases found
   - Add automated tests for critical paths
   - Monitor Gemini API quota usage

2. **If Tests Fail**: Use debugging section above
   - Check worker logs first
   - Verify database state
   - Check Supabase Studio for storage issues

3. **Performance Tuning** (Optional):
   - Adjust polling interval in worker/index.ts (currently 5 seconds)
   - Tune chunk size in process-document handler
   - Add connection pooling if needed

---

**Last Updated**: 2025-09-26
**Status**: Ready for Testing
**Estimated Total Testing Time**: 30-45 minutes