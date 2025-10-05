# Readwise Integration & Connection Remapping Strategy
**Date**: October 5, 2025
**Test Document**: The Three Stigmata of Palmer Eldritch
**Current Status**: 69.7% import success rate, connection remapping UNTESTED

---

## 🎯 Critical Priorities (This Week)

### Priority 1: Test Connection Remapping (CRITICAL GAP) ⚠️
**Status**: NOT TESTED - This is the biggest risk
**Effort**: 4 hours
**Impact**: HIGH - Proves annotation recovery system works

**Why Critical**:
- You've tested annotation recovery ✅
- You've tested Readwise import ✅
- You've NEVER tested connection remapping ❌
- If connections don't remap, the whole system breaks on edits

**Test Plan**:
1. Find Palmer Eldritch document (ID: `a44b039a-af64-49c1-b53a-8404405c6ad6`)
2. Create 3 verified connections manually from collision detection results
3. Edit markdown (add paragraph to middle)
4. Trigger reprocessing
5. Verify connections remapped with >0.95 similarity

**Expected Outcome**: 3/3 connections remapped successfully

**If Fails**: Debug `remap-connections.ts` - embedding similarity calculation may be broken

---

### Priority 2: Improve Import Accuracy to 85%+ (Quick Wins) ⚡
**Current**: 69.7% (122/175 highlights for J R)
**Target**: 85%+ success rate
**Effort**: 2-3 hours

#### Quick Win 1: Filter Image Highlights (3% improvement)
```typescript
// worker/handlers/readwise-import.ts - Line ~670
const textHighlights = readwiseBook.highlights.filter(h =>
  !h.text.startsWith('![](') &&
  !h.text.includes('readwise-assets') &&
  h.text.length > 10  // Skip very short highlights
)
```

**Impact**: Removes ~6 image highlights, gets to ~73%

#### Quick Win 2: Better Location Estimation (12%+ improvement)
```typescript
// Get actual pages from document metadata
const { data: doc } = await supabase
  .from('documents')
  .select('metadata')
  .eq('id', documentId)
  .single()

const totalPages = doc?.metadata?.total_pages || 500
const chunksPerPage = chunks.length / totalPages

function estimateChunkFromLocation(location, locationType, chunks) {
  switch (locationType) {
    case 'page':
      return Math.floor(location * chunksPerPage)  // Use actual ratio
    case 'location':
      return Math.floor((location / 5000) * chunks.length)
    case 'order':
      return Math.min(location, chunks.length - 1)
    default:
      return 0
  }
}
```

**Impact**: Fixes ~47 "no chunk found" failures, gets to 85%+

---

### Priority 3: Semantic Filenames (30 min) 📁
**Why**: Makes storage browsing actually useful

```typescript
// worker/handlers/pdf-handler.ts
function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

// In upload handler
const sanitized = sanitizeFilename(document.title)
const storagePath = `${userId}/${documentId}/${sanitized}.pdf`

// Update DB
await supabase.from('documents').update({
  source_filename: originalFilename,
  sanitized_name: sanitized
})
```

---

### Priority 4: File Cleanup (15 min) 🗑️

**Delete Immediately** (deprecated Reader API files):
```bash
rm worker/lib/readwise-reader-api.ts
rm worker/scripts/test-readwise-reader-import.ts
```

**Manual Removal** from `worker/handlers/readwise-import.ts`:
- Remove `importFromReadwiseReader()` function (lines 400-593)

**Reason**: Export API is the working solution, Reader API failed (404 errors, null metadata)

---

## 📅 Week 1 Execution Plan

### Day 1 (Monday): Connection Remapping Test
- [ ] Create `test-remap-connections.ts` script
- [ ] Run collision detection on Palmer Eldritch (get connection data)
- [ ] Create 3 verified test connections
- [ ] Edit Palmer Eldritch markdown
- [ ] Trigger reprocessing & verify remapping
- [ ] **Expected**: 3/3 connections remapped with >0.95 similarity

### Day 2 (Tuesday): Import Accuracy
- [ ] Implement image filtering
- [ ] Implement better location estimation
- [ ] Re-test with J R highlights
- [ ] **Target**: 85%+ success rate (149/175 highlights)

### Day 3 (Wednesday): Quick Wins
- [ ] Implement semantic filenames
- [ ] Clean up deprecated files
- [ ] Test Readwise import on Palmer Eldritch (if has highlights)

### Day 4-5 (Thu-Fri): Minimal Reader UI
- [ ] Display full markdown
- [ ] Show existing annotations (from Readwise)
- [ ] Highlight on hover
- [ ] Click to view note

---

## 🧪 Test Script: Connection Remapping

**File**: `worker/scripts/test-remap-connections.ts`

**Test Flow**:
1. Find Palmer Eldritch document
2. Run collision detection (get connection candidates)
3. Create 3 verified connections (semantic, contradiction, thematic_bridge)
4. Edit markdown (add test paragraph)
5. Trigger reprocessing
6. Query remapped connections
7. Verify similarity scores >0.95

**Success Criteria**:
- ✅ 3/3 connections found after reprocessing
- ✅ All have `metadata.remapped: true`
- ✅ All have similarity >0.95
- ✅ None flagged for review

**Failure Scenarios to Debug**:
- ❌ Connections lost → Check embedding persistence
- ❌ Low similarity (<0.95) → Check cosine distance calculation
- ❌ Wrong chunks matched → Check embedding search logic

---

## 📊 Success Metrics

### Current State
- ✅ Readwise import: 69.7% baseline
- ✅ Annotation recovery: Tested & working
- ❌ Connection remapping: UNTESTED (critical gap)

### Week 1 Target
- 🎯 Connection remapping: Proven to work (3/3 test connections)
- 🎯 Import accuracy: 85%+ (filter images + better location)
- 🎯 Semantic filenames: Implemented
- 🎯 Deprecated files: Cleaned up

### Week 2 Target
- 🎯 Minimal reader UI: Display markdown + annotations
- 🎯 Annotation hover/click: View imported highlights
- 🎯 Connection sidebar: Show detected connections

---

## 🚫 What NOT to Build (Yet)

**Skip for Now**:
- ❌ Readwise import UI (CLI script works fine)
- ❌ Bulk import (single document workflow first)
- ❌ Obsidian sync (not blocking usage)
- ❌ Review workflow for fuzzy matches (focus on exact matches)
- ❌ Weight tuning UI (can adjust in DB directly)

**Why**: Reader UI is the real goal. Everything else is setup.

---

## 🔍 Developer Notes Integration

### From Developer Feedback:
1. **69.7% is workable baseline** ✅
2. **Haven't tested connection remapping** ⚠️ (CRITICAL)
3. **Quick wins: filter images + location estimation** → 85%+
4. **Semantic filenames: Easy 30-minute win**
5. **Reader UI is real goal** - get setup done first

### Key Insight:
> "The reader UI is your real goal. Everything else is setup. Get import to 85%, **prove remapping works**, then build the reader you'll actually use."

---

## 📋 Pre-Flight Checklist

Before starting Week 1:
- [ ] Verify Palmer Eldritch is fully processed (chunks + embeddings)
- [ ] Verify collision detection ran on Palmer Eldritch
- [ ] Check document metadata has `total_pages` field
- [ ] Ensure Readwise token in environment
- [ ] Create `test-remap-connections.ts` script

---

## 🎯 Critical Path Forward

```
Week 1:
✓ Readwise import working (69.7%)
→ PROVE connection remapping works (test Palmer Eldritch)
→ Improve to 85%+ (filter images, fix location)
→ Ship semantic filenames
→ Clean up deprecated files

Week 2:
→ Build minimal reader (display + existing annotations)
→ Test reading Palmer Eldritch with imported highlights
→ Add annotation creation (click-drag)

Week 3:
→ Connection surfacing in sidebar
→ Cross-document navigation
→ Weight tuning UI
```

---

## 📝 Next Session Start

**First Command**:
```bash
# Check Palmer Eldritch processing status
npx tsx worker/scripts/check-document-status.ts a44b039a-af64-49c1-b53a-8404405c6ad6
```

**Then**:
1. Run collision detection if not done
2. Create test-remap-connections.ts
3. Execute remapping test
4. Debug or celebrate based on results

---

**Strategy Complete** ✅
Focus: Test connection remapping (critical gap) → Improve import (quick wins) → Ship reader UI
