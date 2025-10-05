# Daily Plan: Recovery Pipeline Testing & Validation

**Date**: 2025-10-05
**Focus**: Validate recovery systems, fix critical bugs, measure success rates
**Budget**: $1.00 max (abort if exceeded)
**Status**: 🔄 Planning → Execution

---

## Executive Summary

### Current State
✅ **Working**:
- Annotation recovery system (fuzzy matching confirmed functional)
- 3-engine collision detection (semantic, contradiction, thematic bridge)
- Transaction-safe reprocessing pipeline
- Batch processing for large documents (500+ pages)

❌ **Broken**:
- Readwise import: Type mismatch at line 142 (`findAnnotationMatch` expects `Annotation` type)
- Obsidian sync: Missing `supabase` parameter at line 223 (`exportAnnotations`)
- Source component query: JSONB syntax needs verification (line 23 in `recover-annotations.ts`)

🔍 **Untested**:
- Connection remapping accuracy across edit scenarios
- Annotation recovery success rates (quantitative metrics)
- Readwise import match rates with real data
- Batch stitching with 500-page PDFs
- Cost tracking per processing stage

### Primary Goals
1. **Fix critical bugs** blocking testing (readwise, obsidian, component query)
2. **Validate connection remapping** with measurable success rates (>95% similarity target)
3. **Measure annotation recovery** rates (>90% on light edits, >70% on heavy edits)
4. **Test readwise import** with real export data (>60% match rate target)
5. **Document findings** with actionable next steps

### Success Metrics
- [ ] Connection remapping: >95% similarity on auto-remap scenarios
- [ ] Annotation recovery: >90% success rate on light edits
- [ ] Readwise import: >60% exact match rate
- [ ] Cost per test: <$0.20 per document
- [ ] Total daily cost: <$1.00
- [ ] Zero data corruption in batch stitching

### Budget Constraints
- **Total Budget**: $1.00
- **Per Test**: $0.20 max
- **Abort Criteria**: If single test >$0.50, investigate filtering logic before continuing
- **Cost Tracking**: Log all AI calls with token counts

---

## Morning Session (9:00-12:00): Bug Fixes & Test Infrastructure

### Phase 1: Critical Bug Fixes (9:00-9:45)
**Time**: 45 minutes
**Goal**: Fix all blocking bugs preventing testing

#### Task 1.1: Fix Readwise Import Type Mismatch (15 min)
**File**: `worker/handlers/readwise-import.ts:142`

**Current Problem**:
```typescript
const fuzzyMatch = findAnnotationMatch(
  { text, originalChunkIndex: estimatedChunkIndex },  // ❌ Missing required fields
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
    startOffset: 0,  // Placeholder - will be set by fuzzy match
    endOffset: text.length,
    id: `readwise-${highlight.id || Date.now()}`
  },
  markdown,
  chunks
)
```

**Validation**: Run TypeScript check `npx tsc --noEmit worker/handlers/readwise-import.ts`

---

#### Task 1.2: Fix Obsidian Export Missing Parameter (10 min)
**File**: `worker/handlers/obsidian-sync.ts:223`

**Current Problem**:
```typescript
async function exportAnnotations(documentId: string, vaultFilePath: string) {
  const { data: components } = await supabase  // ❌ supabase undefined
    .from('components')
```

**Fix**:
```typescript
async function exportAnnotations(
  documentId: string,
  vaultFilePath: string,
  supabase: ReturnType<typeof createClient>  // Add parameter
): Promise<void> {
  // ... rest of function
}

// Update caller at line 84:
if (obsidianSettings.syncAnnotations) {
  await exportAnnotations(documentId, vaultFilePath, supabase)
}
```

**Validation**: Run TypeScript check `npx tsc --noEmit worker/handlers/obsidian-sync.ts`

---

#### Task 1.3: Verify Source Component Query (20 min)
**File**: `worker/handlers/recover-annotations.ts:23`

**Current Code**:
```typescript
const { data: sourceComponents } = await supabase
  .from('components')
  .select('entity_id')
  .eq('component_type', 'source')
  .eq('data->>document_id', documentId)  // ❓ JSONB syntax - needs verification
```

**Investigation Steps**:
1. Check actual component structure:
```bash
psql $DATABASE_URL -c "
  SELECT component_type, data, document_id
  FROM components
  WHERE component_type = 'Position'
  LIMIT 1;
"
```

2. Determine correct query based on structure:
   - If `document_id` is top-level column: `.eq('document_id', documentId)`
   - If nested in JSONB: `.eq('data->>document_id', documentId)`
   - If deeply nested: `.eq('data->source->>document_id', documentId)`

3. Update query with correct syntax

**Validation**: Test query returns expected components

---

**Phase 1 Decision Point**: ✅ All bugs fixed → Continue to Phase 2 | ❌ Bugs remain → Document blockers, pivot to testing what works

---

### Phase 2: Testing Infrastructure (9:45-12:00)
**Time**: 2 hours 15 minutes
**Goal**: Build reusable test scripts with metrics tracking

#### Task 2.1: Create Connection Remapping Test Script (45 min)
**File**: `scripts/test-connection-remapping.ts`

**Script Requirements**:
```typescript
interface RemappingTestResult {
  scenario: 'light' | 'heavy' | 'cross-document'
  connectionsTotal: number
  connectionsRemapped: number
  avgSimilarity: number
  autoRemapped: number  // >0.95
  needsReview: number   // 0.85-0.95
  lost: number          // <0.85
  costUSD: number
}

async function testConnectionRemapping(
  documentId: string,
  editType: 'light' | 'heavy'
): Promise<RemappingTestResult>
```

**Test Scenarios**:
1. **Light Edit**: Add 1 paragraph to middle of document
2. **Heavy Edit**: Delete 2 pages + rewrite 3 paragraphs
3. **Cross-Document**: Edit doc A with connection to doc B

**Debug Mode**:
```bash
DEBUG_REMAPPING=true npx tsx scripts/test-connection-remapping.ts <doc-id>
```

Should log:
- Connection ID
- Source chunk old vs new content (first 100 chars)
- Similarity score
- Classification (auto/review/lost)

**Validation**: Script runs without errors, produces structured JSON output

---

#### Task 2.2: Create Annotation Recovery Metrics Script (45 min)
**File**: `scripts/test-annotation-recovery.ts`

**Script Requirements**:
```typescript
interface AnnotationRecoveryResult {
  totalAnnotations: number
  exactMatches: number
  fuzzyMatches: number
  approximateMatches: number
  failed: number
  avgConfidence: number
  successRate: number  // (exact + fuzzy) / total
  costUSD: number
}

async function testAnnotationRecovery(
  documentId: string,
  annotations: Annotation[],
  editType: 'light' | 'heavy'
): Promise<AnnotationRecoveryResult>
```

**Test Flow**:
1. Upload document
2. Create 10 annotations across different chunks
3. Export markdown, apply edit
4. Trigger reprocessing
5. Measure recovery rates

**Validation**: Script produces detailed metrics, identifies failure patterns

---

#### Task 2.3: Create Cost Tracking Utility (30 min)
**File**: `scripts/utils/cost-tracker.ts`

**Utility Requirements**:
```typescript
class CostTracker {
  private costs: Map<string, number> = new Map()

  track(operation: string, tokens: number, model: string): void
  getTotal(): number
  getBreakdown(): Record<string, number>
  abort(): boolean  // true if >$0.50 single operation
  report(): string  // formatted cost summary
}
```

**Integration**: Add to all test scripts

**Validation**: Accurately tracks costs, aborts on budget exceed

---

#### Task 2.4: Setup Test Documents (15 min)

**Test Document Requirements**:
1. **Small PDF** (50 pages) - for quick iteration
2. **Large PDF** (500 pages) - for batch stitching validation
3. **Readwise Export** (JSON) - real highlight data

**Setup**:
```bash
# Create test data directory
mkdir -p test-data/{pdfs,readwise,edits}

# Document test document IDs in .env.test
echo "TEST_DOC_SMALL=<doc-id>" >> .env.test
echo "TEST_DOC_LARGE=<doc-id>" >> .env.test
```

**Validation**: Test documents uploaded and processed successfully

---

**Phase 2 Decision Point**: ✅ All scripts ready → Continue to Phase 3 | ⚠️ Scripts incomplete → Test manually, document gaps

---

## Afternoon Session (13:00-17:00): Validation & Testing

### Phase 3: Connection Remapping Tests (13:00-15:00)
**Time**: 2 hours
**Goal**: Validate connection remapping across 3 scenarios

#### Test 3.1: Light Edit Scenario (40 min)
**Setup**:
1. Use TEST_DOC_SMALL (50 pages)
2. Create 3 verified connections between chunks
3. Document connection IDs and content

**Edit**: Add 1 paragraph to middle of document (around page 25)

**Execute**:
```bash
DEBUG_REMAPPING=true npx tsx scripts/test-connection-remapping.ts $TEST_DOC_SMALL light
```

**Expected Results**:
- 3/3 connections remapped
- Avg similarity: >0.95
- Auto-remapped: 3
- Needs review: 0
- Lost: 0
- Cost: <$0.10

**Validation**:
```sql
-- Verify connections updated
SELECT id, connection_type,
       metadata->>'remapped' as remapped,
       metadata->>'similarity' as similarity
FROM connections
WHERE id IN (<connection-ids>);
```

**Decision Point**:
- ✅ Success rate >95% → Continue
- ⚠️ Success rate 80-95% → Investigate threshold tuning
- ❌ Success rate <80% → Stop, debug embedding similarity logic

---

#### Test 3.2: Heavy Edit Scenario (40 min)
**Setup**: Same document, new connections

**Edit**:
- Delete 2 pages from middle (pages 24-25)
- Rewrite 3 paragraphs significantly

**Execute**:
```bash
DEBUG_REMAPPING=true npx tsx scripts/test-connection-remapping.ts $TEST_DOC_SMALL heavy
```

**Expected Results**:
- Some connections remapped with lower confidence
- Avg similarity: 0.85-0.95
- Auto-remapped: 1-2
- Needs review: 1-2
- Lost: 0-1 (acceptable if content deleted)
- Cost: <$0.15

**Validation**: Check that connections in deleted sections are marked as lost (not pointing to random chunks)

---

#### Test 3.3: Cross-Document Scenario (40 min)
**Setup**:
1. Two documents (A and B)
2. Create connection: A.chunk_10 → B.chunk_25

**Edit**: Edit document A only (add paragraph before chunk_10)

**Execute**:
```bash
npx tsx scripts/test-connection-remapping.ts $TEST_DOC_A cross-document
```

**Expected Results**:
- Connection remapped on source side (A)
- Target side (B) unchanged
- No duplicate remapping if B is also processed

**Validation**: Connection points to correct content in both documents after edit

---

**Phase 3 Decision Point**: ✅ All scenarios pass → Connection remapping proven | ⚠️ Edge cases found → Document for future fix | ❌ Critical failures → Rollback feature

---

### Phase 4: Annotation Recovery Validation (15:00-16:00)
**Time**: 1 hour
**Goal**: Measure annotation recovery success rates

#### Test 4.1: Light Edit Recovery (30 min)
**Setup**:
1. Upload TEST_DOC_SMALL
2. Create 10 annotations across different chunks
3. Export markdown

**Edit**: Add 2 paragraphs at different locations (not touching annotated text)

**Execute**:
```bash
npx tsx scripts/test-annotation-recovery.ts $TEST_DOC_SMALL light
```

**Expected Results**:
- Success rate: >90%
- Exact matches: 8-10
- Fuzzy matches: 0-2
- Failed: 0
- Avg confidence: >0.95

**Validation**: Manually verify 3 random annotations recovered correctly

---

#### Test 4.2: Heavy Edit Recovery (30 min)
**Setup**: Same document, new annotations

**Edit**: Rewrite 3 paragraphs containing annotations

**Execute**:
```bash
npx tsx scripts/test-annotation-recovery.ts $TEST_DOC_SMALL heavy
```

**Expected Results**:
- Success rate: >70%
- Exact matches: 3-5
- Fuzzy matches: 2-4
- Failed: 1-3
- Avg confidence: 0.75-0.85

**Validation**: Check that failed annotations are gracefully marked (not corrupted)

---

**Phase 4 Decision Point**: ✅ Recovery rates meet targets → Continue | ⚠️ Rates below target → Document failure patterns | ❌ Data corruption found → Critical bug, stop testing

---

### Phase 5: Feature Testing (16:00-17:00)
**Time**: 1 hour
**Goal**: Test Readwise import if time/budget permits

#### Test 5.1: Readwise Import (60 min)
**Prerequisites**: Bugs from Phase 1 fixed

**Setup**:
1. Get Readwise export JSON (your real data)
2. Upload corresponding PDF to Rhizome
3. Verify book title matches

**Execute**:
```bash
npx tsx scripts/test-readwise-import.ts $TEST_DOC_ID readwise-export.json
```

**Expected Results**:
- Import rate: >60%
- Exact matches: 60-80% (clean PDF)
- Fuzzy matches: 10-20%
- Failed: 10-20%
- Duplicates: 0 (if importing twice)

**Validation**: Manually verify 5 random highlights positioned correctly

**Failure Analysis**:
- If match rate <60%: Compare Readwise text vs extracted markdown (formatting differences?)
- If duplicates found: Check readwise_id tracking logic
- If positioning wrong: Debug fuzzy matching thresholds

---

**Phase 5 Decision Point**: ✅ Import works → Ship feature | ⚠️ Low match rate → Document formatting issues | ⏭️ Time/budget exceeded → Defer to tomorrow

---

## Evening Session (17:00-18:00): Documentation & Handoff

### Phase 6: Issue Resolution & Documentation (17:00-18:00)
**Time**: 1 hour
**Goal**: Document findings, fix critical issues, prepare tomorrow's work

#### Task 6.1: Document Test Results (20 min)
**File**: `docs/testing/validation-results-2025-10-05.md`

**Structure**:
```markdown
# Validation Results - Oct 5, 2025

## Summary
- Tests run: X
- Tests passed: Y
- Total cost: $Z

## Connection Remapping
- Light edit: X% success
- Heavy edit: Y% success
- Issues found: [list]

## Annotation Recovery
- Light edit: X% success
- Heavy edit: Y% success
- Issues found: [list]

## Readwise Import
- Match rate: X%
- Issues found: [list]

## Critical Bugs Found
[List with severity]

## Deferred Items
[What we didn't get to]

## Tomorrow's Priorities
[Ordered by importance]
```

---

#### Task 6.2: Fix Critical Issues (30 min)
**Criteria for "critical"**: Data corruption, cost explosion, blocking bugs

**If found**:
1. Create fix immediately (timeboxed to 30 min)
2. If >30 min to fix, document thoroughly and defer
3. Don't add features, only fix breaking issues

**If no critical issues**:
- Review code quality
- Add inline documentation
- Clean up debug logs

---

#### Task 6.3: Update Implementation Status (10 min)
**File**: `docs/IMPLEMENTATION_STATUS.md`

**Update**:
- Move tested features from "In Progress" to "Completed"
- Add measured metrics (recovery rates, costs)
- Update known issues section

---

**Phase 6 Deliverable**: Complete test report with actionable next steps

---

## Appendices

### A. Test Scenarios Detailed

#### Connection Remapping Test Matrix
| Scenario | Edit Type | Expected Similarity | Expected Classification | Cost Budget |
|----------|-----------|-------------------|------------------------|-------------|
| Light Edit | Add 1 paragraph | >0.95 | Auto-remap | $0.05 |
| Heavy Edit | Delete 2 pages + rewrite | 0.85-0.95 | Needs review | $0.10 |
| Cross-Doc | Edit source doc only | >0.95 | Auto-remap | $0.08 |
| Edge: Both Docs | Edit both A and B | >0.90 | Auto-remap | $0.15 |

#### Annotation Recovery Test Matrix
| Scenario | Edit Impact | Expected Success Rate | Expected Confidence | Cost Budget |
|----------|-------------|---------------------|-------------------|-------------|
| Exact Match | No change to annotation | 100% | 1.0 | $0.02 |
| Context Change | Edit nearby text | >90% | 0.90-0.95 | $0.05 |
| Heavy Rewrite | Rewrite annotated section | >70% | 0.75-0.85 | $0.10 |
| Deletion | Remove annotated text | 0% (graceful fail) | N/A | $0.03 |

#### Readwise Import Test Matrix
| PDF Quality | Expected Match Rate | Fuzzy Matches | Failed | Cost Budget |
|-------------|-------------------|---------------|--------|-------------|
| Clean (Born-digital) | 75-85% | 10-15% | 5-10% | $0.10 |
| OCR (Scanned) | 50-70% | 20-30% | 10-20% | $0.15 |
| Poor OCR | 30-50% | 30-40% | 20-40% | $0.20 |

---

### B. Cost Tracking Sheet

**Budget Allocation**:
```
Phase 1 (Bug Fixes):        $0.00 (no AI calls)
Phase 2 (Infrastructure):   $0.00 (no AI calls)
Phase 3 (Connection Tests): $0.30 (3 scenarios × $0.10)
Phase 4 (Recovery Tests):   $0.15 (2 scenarios)
Phase 5 (Readwise):         $0.20 (1 import test)
Buffer:                     $0.35 (debugging/rerunning)
---
Total:                      $1.00
```

**Tracking Template**:
```typescript
{
  "timestamp": "2025-10-05T14:30:00Z",
  "operation": "connection_remapping_light",
  "tokens_in": 1500,
  "tokens_out": 300,
  "model": "gemini-2.5-flash",
  "cost_usd": 0.05,
  "cumulative_cost": 0.35
}
```

**Abort Criteria**:
- Single operation >$0.50 → Investigate filtering logic before continuing
- Cumulative >$0.80 before Phase 5 → Skip Readwise testing
- Cumulative >$1.00 → Stop immediately, document state

---

### C. Decision Matrix

#### When to Fix vs Defer
```
┌─────────────────┬──────────────┬────────────────┐
│ Issue Type      │ Fix Now If   │ Defer If       │
├─────────────────┼──────────────┼────────────────┤
│ Data Corruption │ ALWAYS       │ NEVER          │
│ Cost Explosion  │ ALWAYS       │ NEVER          │
│ Type Errors     │ Blocks tests │ Doesn't block  │
│ Low Match Rate  │ <30%         │ 30-60%         │
│ Edge Cases      │ Common       │ Rare           │
│ Features        │ NEVER        │ ALWAYS         │
└─────────────────┴──────────────┴────────────────┘
```

#### When to Skip vs Continue
```
┌──────────────────┬─────────────────┬──────────────────┐
│ Condition        │ Continue If     │ Skip If          │
├──────────────────┼─────────────────┼──────────────────┤
│ Budget Remaining │ >$0.30          │ <$0.20           │
│ Time Remaining   │ >90 min         │ <45 min          │
│ Success Rate     │ >60%            │ <40%             │
│ Critical Bug     │ Fixed           │ Blocking         │
└──────────────────┴─────────────────┴──────────────────┘
```

---

### D. Tomorrow's Handoff Template

**What Worked**:
- [Feature]: [Metrics] - [Notes]

**What Failed**:
- [Issue]: [Root Cause] - [Recommended Fix]

**What's Deferred**:
- [Feature]: [Reason] - [Priority]

**Tomorrow's Priorities** (Ordered):
1. [Highest priority based on findings]
2. [Second priority]
3. [Third priority]

**Recommendations**:
- Build: [If validation proved concept]
- Fix: [If critical issues found]
- Skip: [If not worth the effort]

---

## Final Checklist

### Before Starting
- [ ] All bugs from Phase 1 identified and understood
- [ ] Test documents uploaded and processed
- [ ] Cost tracking scripts ready
- [ ] Budget confirmed ($1.00 max)

### During Testing
- [ ] Track costs after each test
- [ ] Document failures immediately
- [ ] Take screenshots of critical issues
- [ ] Abort if budget >$0.80 before Phase 5

### Before Ending
- [ ] All test results documented
- [ ] Critical bugs fixed or documented
- [ ] Tomorrow's priorities identified
- [ ] Cost breakdown recorded

---

## Success Definition

**Minimum Viable Validation**:
- [x] Connection remapping >90% success on light edits
- [x] Annotation recovery >80% success on light edits
- [x] Zero data corruption found
- [x] Cost tracking accurate
- [x] Findings documented

**Stretch Goals** (if time/budget permits):
- [ ] Readwise import >60% match rate
- [ ] Obsidian sync validated
- [ ] Batch stitching tested on 500-page PDF

---

**Plan Status**: 📋 Ready for execution
**Estimated Duration**: 6-7 hours
**Risk Level**: Medium (most infrastructure built, testing unknown edge cases)
**Confidence**: High (clear success criteria, budget constraints, decision points)
