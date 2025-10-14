# Phase 2 Manual Testing Guide

## What We're Testing

**Goal**: Verify that the Zustand cache prevents duplicate `scanStorage()` API calls when switching between Scanner and Import tabs.

## Expected Behavior

### Before Phase 2 (Broken)
1. Open Scanner Tab → API call #1
2. Switch to Import Tab → API call #2 (duplicate!)
3. **Total**: 2 API calls (wasteful)

### After Phase 2 (Fixed)
1. Open Scanner Tab → API call #1 (stores in cache)
2. Switch to Import Tab → NO API call (uses cache)
3. **Total**: 1 API call ✅

---

## Step-by-Step Test

### Prerequisites
```bash
npm run dev
# Visit http://localhost:3000
```

### Test 1: Verify Cache Hit

#### 1. Open DevTools
- **Mac**: Cmd+Option+I
- **Windows**: F12
- Click **Network** tab
- ✅ Check "Preserve log" checkbox (important!)
- Type `scan` in the filter box to show only scan requests

#### 2. Clear Network Log
- Click the 🚫 icon (Clear) in Network tab
- Start with a clean slate

#### 3. Open Admin Panel
- Press **Cmd+Shift+A** (or click database icon)
- This opens on **Scanner Tab**

#### 4. Check Network Tab - First Call
You should see **1 request**:
```
Name: scanStorage
Status: 200
Type: fetch
```

#### 5. Check Console
Switch to Console tab, you should see:
```
[StorageScan] Cache miss (no cache), fetching...
[StorageScan] Scan complete: X documents
```

#### 6. Switch to Import Tab
- Click **"Import"** tab (tab #2)
- **Wait 1 second**

#### 7. Check Network Tab - Cache Hit! ✅
**Expected**: NO new requests (still only 1 total)
**If you see 2 requests**: Cache is NOT working ❌

#### 8. Check Console - Cache Hit Message
You should see:
```
[StorageScan] Cache hit (age: 2s, expires in: 298s)
```

### Test 2: Verify Cache Expiration

#### 1. Wait 5+ Minutes
- Leave the Admin Panel open
- Wait at least 5 minutes (cache expires after 5 min)

#### 2. Switch Between Tabs
- Click Scanner tab
- Click Import tab

#### 3. Check Console
You should see:
```
[StorageScan] Cache miss (cache expired), fetching...
[StorageScan] Scan complete: X documents
```

#### 4. Check Network Tab
Should see a **new request** (cache expired, refetch is expected)

### Test 3: Verify Cache Invalidation

#### 1. Import a Document
- Go to Import tab
- Select a document
- Click "Import Selected"

#### 2. Check Console - Cache Invalidated
After import completes:
```
[StorageScan] Cache invalidated
[StorageScan] Cache miss (no cache), fetching...
[StorageScan] Scan complete: X documents
```

#### 3. Expected Behavior
- Cache is cleared after import (data changed)
- Next scan fetches fresh data

---

## Troubleshooting

### Problem: I see 2 requests in Network tab
**Cause**: Cache is not working
**Fix**:
1. Check you're filtering by `scan` in Network tab
2. Make sure you're switching tabs AFTER Scanner loads
3. Verify Console shows cache logs

### Problem: No logs in Console
**Cause**: DevTools not showing logs
**Fix**:
1. Console filter might be hiding them
2. Try refreshing the page
3. Make sure `NODE_ENV=development` (stores only log in dev)

### Problem: Can't find the request
**Cause**: Might be named differently
**Fix**:
1. In Network tab, remove the `scan` filter
2. Look for POST/GET requests to `/api/` routes
3. Look for requests with "document" or "storage" in the name

---

## Success Criteria

✅ **PASS**: Scanner + Import tabs = 1 API call total
✅ **PASS**: Console shows "[StorageScan] Cache hit" on second tab
✅ **PASS**: Cache expires after 5 minutes (new fetch)
✅ **PASS**: Cache invalidates after import (fresh fetch)

❌ **FAIL**: Scanner + Import tabs = 2 API calls
❌ **FAIL**: No cache logs in Console
❌ **FAIL**: Cache never expires

---

## Redux DevTools (Optional Advanced Test)

### Setup
1. Install [Redux DevTools Chrome Extension](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd)
2. Open extension in Chrome DevTools

### Test
1. Open Admin Panel
2. In Redux DevTools, select **StorageScan** store
3. You should see state updates:
   - `scanResults`: null → [...documents]
   - `lastScanTime`: null → timestamp
   - `scanning`: false → true → false

### Expected State (After First Scan)
```json
{
  "scanResults": [/* array of documents */],
  "lastScanTime": 1704067200000,
  "scanning": false,
  "error": null
}
```

---

## Background Jobs Test (ImportTab)

### Test Job Polling

#### 1. Start an Import
- Go to Import tab
- Select a document with "Missing from DB" status
- Click "Import Selected"

#### 2. Watch Redux DevTools
In **BackgroundJobs** store:
```json
{
  "jobs": Map {
    "import-abc123" → {
      "status": "pending",
      "progress": 10,
      "type": "import_document"
    }
  },
  "polling": true
}
```

#### 3. Watch Status Updates
Job status should change:
```
pending (0%) → processing (30%) → processing (50%) → completed (100%)
```

#### 4. Verify Auto-Stop
After job completes:
```json
{
  "polling": false  // ✅ Auto-stopped when no active jobs
}
```

---

## Quick Smoke Test (30 seconds)

If you're short on time, just do this:

1. **Clear Network log** (🚫 icon)
2. **Open Admin Panel** (Cmd+Shift+A)
3. **Count requests** - Should be 1
4. **Switch to Import tab**
5. **Count requests again** - Should STILL be 1 ✅
6. **Check Console** - Should see "Cache hit" message

If all 3 checks pass, you're good! ✅

---

## Recording a Test Run

To share results:
1. Clear Network log
2. Start screen recording (Cmd+Shift+5 on Mac)
3. Run Test 1 (steps 1-8)
4. Stop recording
5. Share the video showing:
   - Network tab with 1 request
   - Console with cache logs
   - Tab switching with no new requests
