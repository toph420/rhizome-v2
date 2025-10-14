# Admin Panel Zustand Manual Testing Checklist

**Time**: ~5 minutes per test run
**Frequency**: After each major change
**Tools**: Chrome DevTools (Network tab, Redux DevTools)

---

## Setup (One-Time)

1. **Install Redux DevTools**:
   - Chrome: https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd
   - Firefox: https://addons.mozilla.org/en-US/firefox/addon/reduxdevtools/

2. **Open DevTools**:
   - Press `Cmd+Option+I` (Mac) or `F12` (Windows/Linux)
   - Open "Redux" tab (should see StorageScan and BackgroundJobs stores)

---

## Test 1: Cache Behavior (Primary Goal)

**Goal**: Verify no duplicate API calls

### Steps:
1. Open Admin Panel → Click Scanner tab
2. Open Chrome DevTools → Network tab
3. Filter by "scan" or look for API requests
4. **Verify**: 1 `scanStorage` API call made
5. Switch to Import tab
6. **Verify**: 0 new API calls (using cache)
7. Switch back to Scanner tab
8. **Verify**: Still 0 new API calls

### Success Criteria:
- ✅ Only 1 API call total (not 2)
- ✅ Redux DevTools shows: `StorageScan → scan` action logged once
- ✅ Console shows: `[StorageScan] Cache hit (age: Xs)`

### If Failed:
- Check Network tab → see 2 calls? → Cache not working
- Check Redux DevTools → no actions? → Store not integrated
- Check Console → no logs? → Store not being used

---

## Test 2: Cache Expiration (5-Minute TTL)

**Goal**: Verify cache expires after 5 minutes

### Steps:
1. Open Admin Panel → Scanner tab (triggers scan)
2. Note the time in console: `[StorageScan] Cache miss (no cache), fetching...`
3. Close Admin Panel
4. Wait 6 minutes ⏱️
5. Reopen Admin Panel → Scanner tab
6. **Verify**: Console shows `[StorageScan] Cache miss (cache expired), fetching...`
7. Check Network tab → Should see new API call

### Success Criteria:
- ✅ New API call after 6 minutes
- ✅ Console shows cache expired reason

### If Failed:
- Cache not expiring? → Check `CACHE_DURATION` constant
- Still using old data? → Check `getCachedResults()` logic

---

## Test 3: Cache Invalidation

**Goal**: Verify manual invalidation works

### Steps:
1. Open Admin Panel → Scanner tab (scan completes)
2. In Redux DevTools, manually dispatch action:
   ```javascript
   // Redux DevTools console
   useStorageScanStore.getState().invalidate()
   ```
3. Switch to Import tab, then back to Scanner
4. **Verify**: Network tab shows new API call
5. Console shows: `[StorageScan] Cache invalidated`

### Success Criteria:
- ✅ Cache cleared after invalidation
- ✅ Next scan triggers fresh API call

---

## Test 4: Background Jobs Polling (Future Phase 2)

**Goal**: Verify polling starts/stops automatically

### Steps:
1. Open Admin Panel → Import tab
2. Select a document and click Import
3. **Verify**: Console shows `[BackgroundJobs] Registering job: {jobId}`
4. **Verify**: Console shows `[BackgroundJobs] Auto-starting polling`
5. Watch job progress update in UI
6. When job completes:
   - **Verify**: Console shows `[BackgroundJobs] Job completed: {jobId}`
   - **Verify**: Console shows `[BackgroundJobs] Auto-stopping polling (no active jobs)`
7. Close Admin Panel
8. Open Chrome Task Manager (`Shift+Esc`)
9. **Verify**: Memory usage stable (not climbing)

### Success Criteria:
- ✅ Polling starts when job registered
- ✅ Polling stops when no active jobs
- ✅ No memory leaks (polling cleaned up)

### If Failed:
- Polling continues? → Check `stopPolling()` cleanup
- Memory climbing? → Check `useEffect` cleanup in components

---

## Test 5: Redux DevTools Inspection

**Goal**: Verify state changes visible in DevTools

### Steps:
1. Open Admin Panel → Scanner tab
2. Open Redux DevTools → select "StorageScan" instance
3. **Verify**: State shows:
   ```json
   {
     "scanResults": [...],
     "lastScanTime": 1697123456789,
     "scanning": false,
     "error": null
   }
   ```
4. Click through Actions tab
5. **Verify**: Actions logged: `scan`, `getCachedResults`
6. Click "Diff" tab → See state changes highlighted

### Success Criteria:
- ✅ All stores visible in Redux DevTools
- ✅ State changes tracked in real-time
- ✅ Actions logged with timestamps

---

## Test 6: Error Handling

**Goal**: Verify errors don't break the app

### Steps:
1. **Simulate API failure**:
   - Open DevTools → Network tab → Right-click → "Block request URL"
   - Block pattern: `*scan*`
2. Open Admin Panel → Scanner tab
3. **Verify**:
   - Console shows: `[StorageScan] Scan failed: {error}`
   - UI shows error message (not crash)
   - Redux DevTools shows `error` field populated
4. Remove network block
5. Click "Refresh" in Scanner tab
6. **Verify**: Recovers and loads data

### Success Criteria:
- ✅ Errors logged but don't crash
- ✅ UI shows error state
- ✅ Can recover from errors

---

## Performance Check (Optional)

**Goal**: Ensure no performance regressions

### Steps:
1. Open React DevTools → Profiler tab
2. Click "Record" button
3. Open Admin Panel → Switch between tabs rapidly (10 times)
4. Stop recording
5. **Verify**:
   - Total render time <500ms
   - No components rendering unnecessarily
   - Tab switches feel instant

### Success Criteria:
- ✅ Tab switches <100ms each
- ✅ No lag or stuttering
- ✅ Minimal re-renders

---

## Quick Smoke Test (30 seconds)

**Use this for rapid validation during development**

1. Open Admin Panel → Scanner tab
2. Check Network tab → 1 call ✅
3. Switch to Import tab
4. Check Network tab → Still 1 call ✅
5. Check Redux DevTools → State populated ✅
6. Done! 🎉

---

## Troubleshooting

### Issue: "Each child in a list should have a unique key"

**Cause**: Using `<>` fragment in `.map()` without a key

**Solution**: Use `React.Fragment` with key prop:
```typescript
// ❌ WRONG - Short syntax can't have key
{items.map(item => (
  <>
    <div>{item.name}</div>
  </>
))}

// ✅ RIGHT - React.Fragment with key
{items.map(item => (
  <React.Fragment key={item.id}>
    <div>{item.name}</div>
  </React.Fragment>
))}
```

### Issue: "Hydration error - <tr> cannot be child of <div>"

**Cause**: Using `Collapsible` component (which renders `<div>`) inside `<tbody>`

**Solution**: Don't use Collapsible wrapper for table rows. Use conditional rendering instead:
```typescript
// ❌ WRONG - Collapsible renders <div>
<Collapsible>
  <TableRow>...</TableRow>
</Collapsible>

// ✅ RIGHT - Conditional rendering with React.Fragment
<React.Fragment key={id}>
  <TableRow onClick={() => toggle(id)}>...</TableRow>
  {expanded && <TableRow>...expanded content...</TableRow>}
</React.Fragment>
```

### Issue: "Redux DevTools not showing stores"

**Solution**:
- Check `process.env.NODE_ENV === 'development'`
- Restart dev server: `npm run dev`
- Refresh browser with cache clear: `Cmd+Shift+R`

### Issue: "Still seeing 2 API calls"

**Solution**:
- Verify stores imported: `import { useStorageScanStore } from '@/stores/admin'`
- Check components using `scan()` not `scanStorage()` directly
- Look for duplicate `useEffect` calls

### Issue: "Console logs not showing"

**Solution**:
- Check Console filter (clear any filters)
- Search for `[StorageScan]` prefix
- Verify store actions being called

---

## Test Results Template

Copy this for each test run:

```markdown
## Test Run: YYYY-MM-DD

**Phase**: Phase 1 - Storage Scan Store

### Test 1: Cache Behavior
- [ ] Only 1 API call
- [ ] Cache hit on second tab
- Notes: ___

### Test 2: Cache Expiration
- [ ] Expires after 6 minutes
- [ ] New API call triggered
- Notes: ___

### Test 3: Redux DevTools
- [ ] Stores visible
- [ ] Actions logged
- [ ] State updates
- Notes: ___

### Issues Found:
- None / [Describe issues]

### Time Spent: ___ minutes
```

---

**Next Steps After Phase 1**:
- Phase 2: Integrate stores into ScannerTab and ImportTab components
- Phase 3: Add remaining stores (selections, preferences)
