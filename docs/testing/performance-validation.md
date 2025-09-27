# Multi-Format Processing - Performance & Cost Validation

**Test Date**: 2025-09-27  
**Purpose**: Validate processing performance and API costs against success criteria  
**Success Criteria**: <2 minutes processing time, <$0.05 per document cost

---

## Success Criteria

### Performance Targets
- **Processing Time**: <2 minutes per document (95th percentile)
- **API Cost**: <$0.05 per document average
- **Throughput**: Worker handles 10+ concurrent jobs
- **Reliability**: >95% success rate for valid inputs

### Measurement Approach
1. **Instrumentation**: Add timing logs to worker handler
2. **Sample Size**: 10+ documents per source type
3. **Cost Calculation**: Track Gemini API calls and tokens
4. **Statistical Analysis**: Calculate averages, identify outliers

---

## Instrumentation Setup

### Add Performance Logging to Worker

**Location**: `worker/handlers/process-document.ts`

**Add at start of handler**:
```typescript
const startTime = Date.now()
const timings: Record<string, number> = {}

function logTiming(stage: string, duration: number) {
  timings[stage] = duration
  console.log(`[PERF] ${stage}: ${duration}ms`)
}
```

**Add at stage transitions**:
```typescript
const stageStart = Date.now()
// ... processing logic ...
logTiming('fetch_transcript', Date.now() - stageStart)
```

**Add at end of handler**:
```typescript
const totalTime = Date.now() - startTime
console.log(`[PERF] TOTAL: ${totalTime}ms`)
console.log(`[PERF] BREAKDOWN: ${JSON.stringify(timings)}`)
```

### Add Cost Tracking

**Track API calls**:
```typescript
let apiCallCount = 0
let totalTokens = 0

// Before each Gemini API call
apiCallCount++

// After each call
const response = await ai.models.generateContent(...)
const usage = response.usageMetadata
totalTokens += (usage.inputTokens || 0) + (usage.outputTokens || 0)

// At end
console.log(`[COST] API_CALLS: ${apiCallCount}`)
console.log(`[COST] TOTAL_TOKENS: ${totalTokens}`)
console.log(`[COST] INPUT_TOKENS: ${usage.inputTokens}`)
console.log(`[COST] OUTPUT_TOKENS: ${usage.outputTokens}`)
```

---

## Gemini API Pricing (as of 2025-01)

### Text Generation (gemini-2.5-flash)
- **Input**: $0.00025 per 1K tokens
- **Output**: $0.00050 per 1K tokens

### Embeddings (text-embedding-004)
- **All**: $0.000025 per 1K tokens

### Files API (for PDFs)
- Included in text generation pricing

---

## Test Data Collection

### Sample Documents per Type

**PDF** (10 samples):
1. 5-page research paper
2. 10-page technical doc
3. 20-page report
4. 50-page thesis (edge case)
5. 100-page book (edge case)
6. 3-page resume
7. 8-page whitepaper
8. 15-page user manual
9. 25-page legal document
10. 7-page presentation slides

**YouTube** (10 samples):
1. 5-minute tutorial
2. 10-minute lecture
3. 20-minute interview
4. 30-minute podcast
5. 60-minute webinar (edge case)
6. 3-minute demo
7. 15-minute product review
8. 45-minute conference talk
9. 8-minute explainer
10. 12-minute documentary segment

**Web Articles** (10 samples):
1. Short blog post (1000 words)
2. Medium article (2000 words)
3. Long-form journalism (5000 words)
4. Technical tutorial (3000 words)
5. News article (800 words)
6. Opinion piece (1500 words)
7. Product review (2500 words)
8. Research summary (4000 words)
9. How-to guide (3500 words)
10. Industry analysis (6000 words)

**Markdown Files** (5 samples each mode):
- As-is mode (5 samples)
- Clean mode (5 samples)

**Text Files** (5 samples)  
**Pasted Content** (5 samples)

---

## Performance Test Results

### PDF Processing

| Sample # | Pages | File Size | Download | Extract | Chunk | Embed | Save | Total | Tokens | Cost | Pass |
|----------|-------|-----------|----------|---------|-------|-------|------|-------|--------|------|------|
| 1 | 5 | 2MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 2 | 10 | 4MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 3 | 20 | 8MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 4 | 50 | 20MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 5 | 100 | 40MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 6 | 3 | 1MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 7 | 8 | 3MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 8 | 15 | 6MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 9 | 25 | 10MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 10 | 7 | 3MB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |

**Statistics**:
- Average Time: ___ seconds
- Median Time: ___ seconds
- 95th Percentile: ___ seconds
- Average Cost: $____
- Median Cost: $____

**Target Comparison**:
- Time Target: <120 seconds (2 minutes)
- Cost Target: <$0.05
- **Result**: [ ] PASS [ ] FAIL

---

### YouTube Processing

| Sample # | Duration | Fetch | Rechunk | Embed | Save | Total | Tokens | Cost | Pass |
|----------|----------|-------|---------|-------|------|-------|--------|------|------|
| 1 | 5 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 2 | 10 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 3 | 20 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 4 | 30 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 5 | 60 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 6 | 3 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 7 | 15 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 8 | 45 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 9 | 8 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 10 | 12 min | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |

**Statistics**:
- Average Time: ___ seconds
- Median Time: ___ seconds
- 95th Percentile: ___ seconds
- Average Cost: $____
- Median Cost: $____

**Target Comparison**:
- Time Target: <90 seconds (1.5 minutes)
- Cost Target: <$0.05
- **Result**: [ ] PASS [ ] FAIL

---

### Web Article Processing

| Sample # | Word Count | Fetch | Extract | Clean | Chunk | Embed | Save | Total | Tokens | Cost | Pass |
|----------|------------|-------|---------|-------|-------|-------|------|-------|--------|------|------|
| 1 | 1000 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 2 | 2000 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 3 | 5000 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 4 | 3000 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 5 | 800 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 6 | 1500 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 7 | 2500 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 8 | 4000 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 9 | 3500 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 10 | 6000 | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |

**Statistics**:
- Average Time: ___ seconds
- Median Time: ___ seconds
- 95th Percentile: ___ seconds
- Average Cost: $____
- Median Cost: $____

**Target Comparison**:
- Time Target: <90 seconds
- Cost Target: <$0.05
- **Result**: [ ] PASS [ ] FAIL

---

### Markdown Processing

#### As-Is Mode (No AI)

| Sample # | File Size | Read | Chunk | Embed | Save | Total | Tokens | Cost | Pass |
|----------|-----------|------|-------|-------|------|-------|--------|------|------|
| 1 | 5KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 2 | 10KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 3 | 20KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 4 | 8KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 5 | 15KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |

**Average Time**: ___ seconds  
**Average Cost**: $____  
**Result**: [ ] PASS [ ] FAIL (Target: <30s, <$0.01)

#### Clean Mode (With AI)

| Sample # | File Size | Read | Clean | Rechunk | Embed | Save | Total | Tokens | Cost | Pass |
|----------|-----------|------|-------|---------|-------|------|-------|--------|------|------|
| 1 | 5KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 2 | 10KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 3 | 20KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 4 | 8KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 5 | 15KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |

**Average Time**: ___ seconds  
**Average Cost**: $____  
**Result**: [ ] PASS [ ] FAIL (Target: <60s, <$0.05)

---

### Text File Processing

| Sample # | File Size | Read | Convert | Chunk | Embed | Save | Total | Tokens | Cost | Pass |
|----------|-----------|------|---------|-------|-------|------|-------|--------|------|------|
| 1 | 3KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 2 | 5KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 3 | 10KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 4 | 8KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 5 | 12KB | ___ | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |

**Average Time**: ___ seconds  
**Average Cost**: $____  
**Result**: [ ] PASS [ ] FAIL (Target: <60s, <$0.05)

---

### Pasted Content Processing

| Sample # | Content Size | Process | Chunk | Embed | Save | Total | Tokens | Cost | Pass |
|----------|--------------|---------|-------|-------|------|-------|--------|------|------|
| 1 | 2KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 2 | 4KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 3 | 6KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 4 | 3KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |
| 5 | 5KB | ___ | ___ | ___ | ___ | ___ | ___ | $____ | [ ] |

**Average Time**: ___ seconds  
**Average Cost**: $____  
**Result**: [ ] PASS [ ] FAIL (Target: <30s, <$0.03)

---

## Cost Breakdown Analysis

### Per Source Type

| Source Type | Avg Input Tokens | Avg Output Tokens | Avg Embedding Tokens | Avg API Calls | Avg Total Cost |
|-------------|------------------|-------------------|----------------------|---------------|----------------|
| PDF | ____ | ____ | ____ | ____ | $____ |
| YouTube | ____ | ____ | ____ | ____ | $____ |
| Web URL | ____ | ____ | ____ | ____ | $____ |
| Markdown (as-is) | ____ | ____ | ____ | ____ | $____ |
| Markdown (clean) | ____ | ____ | ____ | ____ | $____ |
| Text | ____ | ____ | ____ | ____ | $____ |
| Paste | ____ | ____ | ____ | ____ | $____ |

### Cost Components

**Text Generation Costs**:
- Extraction: $____
- Chunking/Rechunking: $____
- Cleanup: $____

**Embedding Costs**:
- Per chunk average: $____
- Average chunks per document: ____
- Total embedding cost per doc: $____

**Total Average Cost**: $____

---

## Performance Bottleneck Analysis

### Identified Bottlenecks

1. **Slowest Stage**: _______________
   - Average Duration: ___ seconds
   - % of Total Time: ___%
   - Optimization Potential: [ ] High [ ] Medium [ ] Low

2. **Second Slowest Stage**: _______________
   - Average Duration: ___ seconds
   - % of Total Time: ___%
   - Optimization Potential: [ ] High [ ] Medium [ ] Low

3. **Third Slowest Stage**: _______________
   - Average Duration: ___ seconds
   - % of Total Time: ___%
   - Optimization Potential: [ ] High [ ] Medium [ ] Low

### Stage Timing Breakdown (Average)

```
Total Processing Time: 100%
├─ Download/Fetch:   ___%  (___ seconds)
├─ Extraction:       ___%  (___ seconds)
├─ AI Processing:    ___%  (___ seconds)
├─ Chunking:         ___%  (___ seconds)
├─ Embedding:        ___%  (___ seconds)
└─ Storage Save:     ___%  (___ seconds)
```

---

## Optimization Recommendations

### Performance Optimizations

**High Priority** (>10% improvement potential):
1. ______________________________
   - Expected Improvement: ___%
   - Implementation Effort: [ ] Low [ ] Medium [ ] High
   - Recommendation: _____________

2. ______________________________
   - Expected Improvement: ___%
   - Implementation Effort: [ ] Low [ ] Medium [ ] High
   - Recommendation: _____________

**Medium Priority** (5-10% improvement):
1. ______________________________
2. ______________________________

**Low Priority** (<5% improvement):
1. ______________________________
2. ______________________________

### Cost Optimizations

**Potential Savings**:
1. **Reduce chunking tokens**: _________ (~$____ savings per doc)
2. **Optimize embedding batch size**: _________ (~$____ savings per doc)
3. **Skip AI for simple content**: _________ (~$____ savings per doc)

**Total Potential Savings**: $____ per document (__% reduction)

---

## Scalability Analysis

### Throughput Testing

**Concurrent Job Processing**:

| Concurrent Jobs | Avg Time per Job | Worker CPU | Worker Memory | DB Connections | Pass/Fail |
|-----------------|------------------|------------|---------------|----------------|-----------|
| 1 | ___ seconds | __% | ___ MB | ___ | [ ] |
| 5 | ___ seconds | __% | ___ MB | ___ | [ ] |
| 10 | ___ seconds | __% | ___ MB | ___ | [ ] |
| 20 | ___ seconds | __% | ___ MB | ___ | [ ] |
| 50 | ___ seconds | __% | ___ MB | ___ | [ ] |

**Scalability Notes**:
- Optimal concurrency level: ___
- Resource bottleneck: [ ] CPU [ ] Memory [ ] Network [ ] Database
- Recommended max concurrent jobs: ___

---

## Reliability Metrics

### Success Rates

| Source Type | Attempts | Successes | Failures | Success Rate | Target | Pass |
|-------------|----------|-----------|----------|--------------|--------|------|
| PDF | ___ | ___ | ___ | __% | 95% | [ ] |
| YouTube | ___ | ___ | ___ | __% | 95% | [ ] |
| Web URL | ___ | ___ | ___ | __% | 95% | [ ] |
| Markdown | ___ | ___ | ___ | __% | 95% | [ ] |
| Text | ___ | ___ | ___ | __% | 95% | [ ] |
| Paste | ___ | ___ | ___ | __% | 95% | [ ] |

**Overall Success Rate**: ___%  
**Target**: >95%  
**Result**: [ ] PASS [ ] FAIL

### Failure Analysis

**Common Failure Modes**:
1. ________________ (___% of failures)
2. ________________ (___% of failures)
3. ________________ (___% of failures)

---

## Summary Report

### Overall Assessment

**Performance**: [ ] PASS [ ] FAIL  
- 95th percentile: ___ seconds (Target: <120s)
- Average: ___ seconds

**Cost**: [ ] PASS [ ] FAIL  
- Average cost: $____ (Target: <$0.05)
- Median cost: $____

**Reliability**: [ ] PASS [ ] FAIL  
- Success rate: __% (Target: >95%)

**Scalability**: [ ] PASS [ ] FAIL  
- Handles 10+ concurrent jobs: [ ] Yes [ ] No

### Final Verdict

[ ] **APPROVED** - All targets met, ready for production  
[ ] **CONDITIONAL** - Meets most targets, minor optimizations needed  
[ ] **NEEDS WORK** - Does not meet targets, requires optimization

### Action Items

**Before Production**:
1. [ ] _________________________
2. [ ] _________________________
3. [ ] _________________________

**Future Optimizations**:
1. [ ] _________________________
2. [ ] _________________________
3. [ ] _________________________

---

## Appendix: Cost Calculation Examples

### Example 1: PDF Processing (10 pages)

**Inputs**:
- Extraction: 15,000 input tokens → $0.00375
- Extraction output: 5,000 tokens → $0.0025
- Rechunking input: 5,000 tokens → $0.00125
- Rechunking output: 3,000 tokens → $0.0015
- Embeddings: 10 chunks × 500 tokens = 5,000 tokens → $0.000125

**Total**: $0.009375 (~$0.01 per document)

### Example 2: YouTube Video (10 minutes)

**Inputs**:
- Transcript fetch: $0 (library, no API cost)
- Rechunking input: 3,000 tokens → $0.00075
- Rechunking output: 2,000 tokens → $0.001
- Embeddings: 6 chunks × 400 tokens = 2,400 tokens → $0.00006

**Total**: $0.00181 (~$0.002 per video)

### Example 3: Web Article (3000 words)

**Inputs**:
- Extraction: $0 (jsdom/Readability, no API cost)
- Cleanup input: 4,000 tokens → $0.001
- Cleanup output: 3,500 tokens → $0.00175
- Rechunking input: 3,500 tokens → $0.000875
- Rechunking output: 2,500 tokens → $0.00125
- Embeddings: 8 chunks × 450 tokens = 3,600 tokens → $0.00009

**Total**: $0.00497 (~$0.005 per article)

---

**Document Version**: 1.0  
**Last Updated**: 2025-09-27  
**Test Status**: Ready for Execution