# Integration Testing & Reading Environment Plan

**Date**: 2025-10-05
**Focus**: Integration testing of recovery systems with reader, Readwise import, reading experience validation
**Context**: Reader UI exists, backend systems built, need end-to-end validation
**Budget**: $1.00 max for AI testing

---

## Executive Summary

### Key Insight from Developer
**"You're building a READING ENVIRONMENT, not just a sync tool."**

This reframes everything:
- ✅ **Core Priority**: Reader where you CREATE annotations, SEE connections, TUNE weights
- ✅ **Data Bootstrap**: Readwise import (one-time migration of historical highlights)
- ✅ **Testing Focus**: Does recovery/remapping work IN PRACTICE while reading?
- ⏭️ **Defer**: Obsidian sync (one-way export for backup, later)

### Current State Assessment

**✅ BUILT - Reader Infrastructure**:
- `ReaderLayout.tsx` - Main layout with state management for visible chunks
- `VirtualizedReader.tsx` - Performance-optimized document display
- `RightPanel.tsx` - 4 tabs (Connections, Annotations, Review, Weights)
- `ConnectionsList.tsx` - Connection surfacing for visible chunks
- `AnnotationReviewTab.tsx` - Recovery results UI
- `WeightTuning.tsx` - Engine weight adjustment interface

**✅ BUILT - Backend Systems**:
- `recover-annotations.ts` - Annotation recovery with fuzzy matching
- `remap-connections.ts` - Connection remapping after edits
- `fuzzy-matching.ts` - Multi-strategy position recovery
- `readwise-import.ts` - Readwise JSON import (has bugs)
- `obsidian-sync.ts` - Obsidian file export (deprioritized)

**❌ UNTESTED - Integration Points**:
- Does annotation recovery work when reading and editing documents?
- Does connection remapping preserve connections during reprocessing?
- Does Readwise import correctly position historical highlights?
- Do the 3 engines properly surface connections in the reader?

**🔍 GAPS IDENTIFIED**:
- Reader UI exists but integration testing missing
- Recovery systems built but not validated in real usage
- No metrics on success rates (recovery %, remapping accuracy)
- Unknown: Does the full flow work end-to-end?

---

## Today's Goals

### Primary Objectives
1. **Test Readwise Import** - Bootstrap historical highlights into the system
2. **Validate Recovery Pipeline** - Test annotation recovery through reader UI
3. **Test Connection Remapping** - Verify connections survive document edits
4. **Measure Success Rates** - Quantify recovery accuracy, remapping precision
5. **Identify Integration Gaps** - Document what doesn't work in practice

### Success Metrics
- [ ] Readwise import >60% exact match rate
- [ ] Annotation recovery >90% success on light edits
- [ ] Connection remapping >95% similarity on auto-remap
- [ ] Total cost <$1.00
- [ ] Zero data corruption
- [ ] All findings documented

---

## Phase 1: Reader State Assessment (30 min)
**Time**: 9:00-9:30
**Goal**: Understand what's actually working in the reader

### Task 1.1: Audit Reader Capabilities
**Action Items**:
1. Start dev environment: `npm run dev`
2. Upload test PDF, verify processing completes
3. Open reader at `/read/[id]`
4. Test each reader feature:
   - [ ] Markdown displays correctly
   - [ ] Can create new annotation (text selection → save)
   - [ ] Annotations persist and display
   - [ ] Connections tab shows related chunks
   - [ ] Weight tuning sliders work
   - [ ] Review tab appears when recovery results exist

**Documentation**: Screenshot any broken features, note what works

### Task 1.2: Identify Integration Gaps
Based on testing, create list of:
- ✅ **Working**: Features that function correctly
- ⚠️ **Partial**: Features that work but have issues
- ❌ **Broken**: Features that fail completely
- 🔍 **Untested**: Features we haven't validated yet

**Output**: `docs/todo/reader-state-assessment.md`

**Decision Point**:
- ✅ Core reading works → Continue to Phase 2
- ❌ Critical reader bugs → Fix before testing backend integration

---

## Phase 2: Fix Critical Bugs (45 min)
**Time**: 9:30-10:15
**Goal**: Fix blocking bugs identified in recovery pipeline testing plan

### Task 2.1: Fix Readwise Import Type Mismatch
**File**: `worker/handlers/readwise-import.ts`
**Issue**: `findAnnotationMatch` expects full `Annotation` type, getting partial object

**Current Code** (line ~142):
```typescript
const fuzzyMatch = findAnnotationMatch(
  { text, originalChunkIndex: estimatedChunkIndex },  // ❌ Missing fields
  markdown,
  chunks
)
```

**Fix**:
```typescript
const fuzzyMatch = findAnnotationMatch(
  {
    text,
    originalChunkIndex: estimatedChunkIndex,
    startOffset: 0,  // Placeholder - fuzzy match will set correct value
    endOffset: text.length,
    id: `readwise-temp-${highlight.id || Date.now()}`
  },
  markdown,
  chunks
)
```

**Validation**: `cd worker && npx tsc --noEmit`

### Task 2.2: Fix Obsidian Export Missing Parameter
**File**: `worker/handlers/obsidian-sync.ts`
**Issue**: `exportAnnotations` function missing `supabase` parameter

**Current Code** (line ~223):
```typescript
async function exportAnnotations(documentId: string, vaultFilePath: string) {
  const { data: components } = await supabase  // ❌ supabase undefined
```

**Fix**: Add parameter and update caller
```typescript
async function exportAnnotations(
  documentId: string,
  vaultFilePath: string,
  supabase: SupabaseClient
): Promise<void> {
  // ... implementation
}

// Update caller (line ~84):
if (obsidianSettings.syncAnnotations) {
  await exportAnnotations(documentId, vaultFilePath, supabase)
}
```

**Validation**: `cd worker && npx tsc --noEmit`

### Task 2.3: Verify Component Query Syntax
**File**: `worker/handlers/recover-annotations.ts` (line 23)
**Issue**: JSONB query syntax needs verification

**Investigation**:
```bash
# Check actual component structure
npx supabase db query "
  SELECT component_type, data
  FROM components
  WHERE component_type = 'source'
  LIMIT 3;
"
```

**Options**:
- If `document_id` is top-level: `.eq('document_id', documentId)`
- If in JSONB data: `.eq('data->>document_id', documentId)`

**Fix**: Update query based on actual schema

**Validation**: Test query returns expected results

**Phase 2 Output**: All TypeScript errors resolved, handlers ready for testing

---

## Phase 3: Readwise Import Testing (1 hour)
**Time**: 10:15-11:15
**Goal**: Test Readwise import with real data, measure match rates

### Prerequisites
- [ ] Bugs from Phase 2 fixed
- [ ] Have Readwise export JSON ready
- [ ] Have corresponding PDF uploaded to Rhizome

### Task 3.1: Prepare Test Data (15 min)
**Action Items**:
1. Export highlights from Readwise:
   - Go to Readwise.io → Export → JSON
   - Select one book for testing
   - Download `readwise-export.json`

2. Upload corresponding PDF:
   - Upload same book to Rhizome
   - Wait for processing to complete
   - Note document ID

3. Verify book match:
   - Compare Readwise book title vs Rhizome document title
   - Confirm they're the same book/edition

### Task 3.2: Run Readwise Import (30 min)
**Execute**:
```bash
cd worker
npx tsx scripts/test-readwise-import.ts <document-id> <readwise-export.json>
```

**Monitor**:
- Number of highlights in JSON
- Number successfully matched
- Match method distribution (exact, fuzzy, context, chunk-bounded)
- Failed imports (log text for debugging)

**Expected Results**:
- Clean PDF: 70-85% exact matches
- OCR PDF: 50-70% fuzzy matches
- Cost: <$0.15

### Task 3.3: Validate Import in Reader (15 min)
**Manual Verification**:
1. Open document in reader: `/read/<document-id>`
2. Check Annotations tab
3. Verify 5 random annotations:
   - [ ] Text matches Readwise highlight
   - [ ] Position is correct in document
   - [ ] Color/tag preserved
   - [ ] No duplicates

**Document Findings**:
- Match rate: X/Y highlights (Z%)
- Position accuracy: Correct/Total verified
- Issues found: [list specific problems]

**Decision Point**:
- ✅ Match rate >60% → Readwise import proven, can use for bootstrap
- ⚠️ Match rate 40-60% → Document issues, but usable with manual review
- ❌ Match rate <40% → Import unreliable, investigate formatting mismatch

---

## Phase 4: Annotation Recovery Testing (1.5 hours)
**Time**: 11:15-12:45
**Goal**: Test recovery pipeline through reader UI (real usage scenario)

### Task 4.1: Setup Recovery Test Document (15 min)
**Action Items**:
1. Upload small PDF (50 pages)
2. Wait for processing to complete
3. Open in reader, create 10 annotations:
   - 3 in beginning (chunks 0-5)
   - 4 in middle (chunks 10-15)
   - 3 near end (chunks 20-25)
4. Note annotation IDs and text for verification

### Task 4.2: Light Edit Recovery Test (30 min)
**Edit Scenario**: Add 1 paragraph mid-document (doesn't touch annotations)

**Steps**:
1. Export markdown from Supabase Storage
2. Edit file: Add paragraph at ~page 25
3. Upload edited version
4. Trigger reprocessing:
   ```bash
   npx tsx scripts/reprocess-document.ts <document-id>
   ```
5. Monitor recovery process in worker logs

**Expected Recovery Flow**:
1. Worker detects existing annotations
2. Calls `recoverAnnotations()` with old/new chunks
3. Fuzzy matching finds positions
4. Updates annotations with new offsets
5. Stores recovery results

**Validation in Reader**:
1. Refresh reader page
2. Check Review tab (should show recovery results)
3. Verify annotations:
   - [ ] 9-10/10 recovered (>90% success rate)
   - [ ] Exact matches: ~7-8
   - [ ] Fuzzy matches: ~2-3
   - [ ] Lost: 0-1

**Metrics to Record**:
- Total annotations: 10
- Exact matches: X
- Fuzzy matches: Y
- Lost: Z
- Success rate: (X+Y)/10
- Average confidence: N

### Task 4.3: Heavy Edit Recovery Test (30 min)
**Edit Scenario**: Rewrite 2 paragraphs containing annotations

**Steps**:
1. Same document, create 5 new annotations
2. Export markdown
3. Significantly rewrite 2 paragraphs with annotations
4. Reprocess document
5. Check recovery results

**Expected Results**:
- Success rate: 60-80% (lower due to content changes)
- Some annotations marked "needs review"
- Graceful failure (not corrupted)

**Validation**:
- Check Review tab shows "Needs Review" section
- Verify suggested matches are reasonable
- Test accepting/rejecting suggestions

### Task 4.4: Document Recovery Patterns (15 min)
**Analysis**:
- Which recovery methods work best? (exact, context, trigram)
- What types of edits cause failures?
- Are confidence scores accurate?
- Any edge cases found?

**Output**: Update `docs/testing/annotation-recovery-findings.md`

---

## Phase 5: Connection Remapping Testing (1.5 hours)
**Time**: 13:00-14:30
**Goal**: Validate connection remapping preserves relationships

### Task 5.1: Setup Connection Test (15 min)
**Action Items**:
1. Use same test document
2. Let 3-engine system run (creates connections)
3. Query connections:
   ```sql
   SELECT id, connection_type, strength,
          source_chunk_id, target_chunk_id
   FROM connections
   WHERE source_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc-id>')
   LIMIT 10;
   ```
4. Note 3-5 strong connections for tracking

### Task 5.2: Test Remapping After Edit (45 min)
**Edit Scenario**: Add 2 paragraphs to middle of document

**Steps**:
1. Export markdown
2. Add paragraphs around chunk 12 (shifts subsequent chunks)
3. Reprocess with remapping:
   ```bash
   DEBUG=true npx tsx scripts/reprocess-document.ts <document-id> --remap-connections
   ```
4. Monitor remapping in logs:
   - Old chunk content → New chunk content matching
   - Similarity scores
   - Auto-remap vs needs-review decisions

**Expected Results**:
- Connections remapped automatically (similarity >0.95)
- No broken connections (pointing to wrong chunks)
- Metadata updated with remapping info

**Validation in Reader**:
1. Open Connections tab
2. Verify connections still make sense
3. Click connection → navigates to correct chunk
4. Check connection strength preserved

### Task 5.3: Cross-Document Connection Test (30 min)
**Setup**:
1. Two documents (A and B)
2. Create connection between them (via shared concepts)
3. Edit document A only

**Test Flow**:
1. Note connection: A.chunk_X → B.chunk_Y
2. Edit document A (add text before chunk_X)
3. Reprocess A
4. Verify connection remapped on A side
5. Verify B side unchanged (no duplicate remapping)

**Validation**: Connection points to correct content in both docs

### Task 5.4: Measure Remapping Accuracy (20 min)
**Metrics**:
- Total connections before edit: N
- Connections remapped: M
- Auto-remapped (>0.95 similarity): X
- Needs review (0.85-0.95): Y
- Lost (<0.85): Z
- Average similarity: S

**Decision Point**:
- ✅ Accuracy >95% → Remapping proven reliable
- ⚠️ Accuracy 85-95% → Works but needs threshold tuning
- ❌ Accuracy <85% → Investigate embedding similarity logic

---

## Phase 6: Reader Experience Validation (1 hour)
**Time**: 14:30-15:30
**Goal**: Test the reading environment as a whole

### Task 6.1: Full Reading Session Simulation (30 min)
**Scenario**: Read document, create annotations, explore connections

**Steps**:
1. Open document in reader
2. Read first few chunks
3. Create 3 annotations on interesting passages
4. Switch to Connections tab
5. Explore connections for visible chunks
6. Click connection → navigate to related chunk
7. Adjust weight sliders in Weights tab
8. Observe connection list changes
9. Create annotation on connected chunk

**Observations**:
- Does connection surfacing feel useful?
- Are weight adjustments intuitive?
- Does navigation work smoothly?
- Any UX friction points?

### Task 6.2: Test Recovery UI Flow (30 min)
**Scenario**: Edit document, review recovered annotations

**Steps**:
1. Document with annotations + connections
2. Make light edit (add paragraph)
3. Reprocess
4. Open reader → Review tab appears
5. Review each recovered annotation:
   - Accept correct recoveries
   - Reject incorrect recoveries
   - Edit positions if needed
6. Mark review complete

**Test**:
- [ ] Review tab auto-appears when results exist
- [ ] Badge shows count needing review
- [ ] Accept/reject actions work
- [ ] Accepted annotations update correctly
- [ ] Rejected annotations handled gracefully

**Findings**: Document UX issues, workflow improvements

---

## Phase 7: Cost & Performance Analysis (30 min)
**Time**: 15:30-16:00
**Goal**: Measure costs, identify optimization opportunities

### Task 7.1: Cost Breakdown Analysis
**Calculate**:
- Readwise import cost: $X
- Recovery test costs: $Y (per scenario)
- Remapping costs: $Z
- Total spent: $T

**Compare to Budget**:
- Budget: $1.00
- Spent: $T
- Remaining: $1.00 - $T

**Analysis**:
- Cost per annotation recovered: $Y / N
- Cost per connection remapped: $Z / M
- Are costs sustainable for regular use?

### Task 7.2: Performance Observations
**Metrics**:
- Reprocessing time: X minutes
- Recovery time: Y seconds
- Remapping time: Z seconds
- Reader load time: N seconds

**Identify Bottlenecks**:
- What's slow? (AI calls, DB queries, embeddings)
- What could be optimized?
- Are there cost reduction opportunities?

**Output**: `docs/testing/cost-performance-analysis.md`

---

## Phase 8: Documentation & Next Steps (1 hour)
**Time**: 16:00-17:00
**Goal**: Document findings, plan improvements

### Task 8.1: Write Integration Test Report (30 min)
**File**: `docs/testing/integration-test-results-2025-10-05.md`

**Structure**:
```markdown
# Integration Testing Results - Oct 5, 2025

## Summary
- Tests Completed: [list]
- Success Rate: X%
- Total Cost: $Y
- Critical Issues: N

## Readwise Import
- Match Rate: X%
- Position Accuracy: Y%
- Issues: [list]
- Recommendation: [use/fix/skip]

## Annotation Recovery
- Light Edit Success: X%
- Heavy Edit Success: Y%
- Best Recovery Method: [method]
- Issues: [list]

## Connection Remapping
- Auto-Remap Rate: X%
- Average Similarity: Y
- Cross-Doc Handling: [works/issues]
- Issues: [list]

## Reader Experience
- Working Features: [list]
- UX Issues: [list]
- Missing Features: [list]

## Cost Analysis
- Per Operation Costs: [breakdown]
- Optimization Opportunities: [list]

## Critical Bugs Found
1. [Bug with severity and impact]
2. [Bug with severity and impact]

## Recommendations
### Immediate (This Week)
1. [Fix critical bug X]
2. [Improve Y based on findings]

### Near-Term (Next Week)
1. [Build missing feature Z]
2. [Optimize performance of W]

### Long-Term (Later)
1. [Consider alternative approach to X]
2. [Explore enhancement Y]
```

### Task 8.2: Update Implementation Status (15 min)
**File**: `docs/IMPLEMENTATION_STATUS.md`

**Updates**:
- Mark tested features as validated ✅
- Add metrics to completed features
- Update known issues section
- Add "Tested & Proven" section

### Task 8.3: Create Tomorrow's Plan (15 min)
**Based on Findings**:

**If Readwise import works well**:
→ Tomorrow: Import all your Readwise highlights, build library

**If recovery/remapping work well**:
→ Tomorrow: Build reprocessing UI in reader

**If critical bugs found**:
→ Tomorrow: Fix bugs, re-test

**If everything works**:
→ Tomorrow: Build missing reader features (cross-doc navigation, flashcards)

**Output**: `docs/todo/tomorrow-priorities.md`

---

## Contingency Plans

### If Budget Runs Out
**At $0.80 spent**:
- Stop AI-based tests
- Continue manual testing
- Document what couldn't be tested
- Estimate costs for future testing

### If Critical Bugs Block Testing
**Severity 1 (Data Corruption)**:
- Stop all testing immediately
- Fix bug first
- Re-test from clean state

**Severity 2 (Features Broken)**:
- Document bug thoroughly
- Test what works
- Fix after testing complete

**Severity 3 (Minor Issues)**:
- Note in findings
- Continue testing
- Fix later

### If Time Runs Out
**Priority Order**:
1. Readwise import (data bootstrap is critical)
2. Annotation recovery (prevents data loss)
3. Connection remapping (nice to have)
4. Reader UX validation (can test anytime)
5. Documentation (can finish tomorrow)

---

## Decision Matrix

### When to Fix vs Document
| Issue Type | Fix Now | Document for Later |
|------------|---------|-------------------|
| Data corruption | ✅ Always | ❌ Never |
| Import failing | ✅ Blocks testing | ✅ Low priority |
| Recovery failing | ✅ Critical feature | ✅ Edge cases only |
| UX issues | ❌ Note only | ✅ Always |
| Performance | ❌ Unless terrible | ✅ Always |

### When to Continue vs Stop
| Condition | Continue | Stop & Reassess |
|-----------|----------|----------------|
| Cost >$0.80 | ❌ | ✅ |
| Data corruption found | ❌ | ✅ |
| Success rate <50% | ❌ | ✅ |
| Time remaining <1 hour | ✅ Document only | ✅ |

---

## Success Checklist

### Minimum Viable Testing
- [ ] Readwise import tested with real data
- [ ] Annotation recovery success rate measured
- [ ] Connection remapping validated
- [ ] All findings documented
- [ ] Tomorrow's plan created

### Stretch Goals (if time/budget permits)
- [ ] Cross-document connections tested
- [ ] Weight tuning impact measured
- [ ] Full reading session simulated
- [ ] Performance optimizations identified
- [ ] Cost reduction strategies documented

---

## Key Insights for Implementation

### Architecture Strengths Found
- [What works well in current design]
- [Patterns to continue using]

### Architecture Weaknesses Found
- [What doesn't work in current design]
- [Patterns to avoid/refactor]

### User Experience Learnings
- [What feels good while reading]
- [What causes friction]
- [What's missing that would help]

---

**Plan Status**: 📋 Ready for Execution
**Estimated Duration**: 7-8 hours
**Risk Level**: Medium (testing unknown integration points)
**Focus**: Real-world validation over theoretical testing
