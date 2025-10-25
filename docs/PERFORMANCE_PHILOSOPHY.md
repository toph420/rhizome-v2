# Performance Philosophy

For a personal tool, "performance" means something different than enterprise software.

## What Matters for Personal Tools

1. **Does processing annoy me?** (subjective wait time)
2. **Am I spending too much?** (cost per book)
3. **Did I lose work?** (data integrity)

Production metrics (p95 latency, cache hit rates, throughput) don't matter for one user.

---

## Processing Time Targets

**Goal**: Process a book while making coffee (~15-25 minutes)

### Current Performance (M1 Max 64GB)

- **Small PDFs (<50 pages)**: <5 minutes (~$0.10 cost)
- **Medium PDFs (200 pages)**: 15-25 minutes (~$0.42 cost)
- **Large PDFs (500 pages)**: 60-80 minutes (~$0.55 cost)

### Why These Targets?

**15-25 minutes is the sweet spot because:**
- Long enough to make coffee and grab a snack
- Short enough to still be "the same session"
- Predictable enough to plan around

**Not optimized for:**
- Millisecond response times
- Concurrent user loads
- 99.9% uptime SLAs

---

## When to Optimize

### ✅ Optimize When:

1. **Processing takes >30 minutes**
   - Annoying during coffee break
   - Breaks "same session" mental model
   - User loses focus and context

2. **Cost exceeds $1 per book**
   - Monthly budget concern for heavy users
   - Adds up over dozens of books
   - Local processing becomes worth the setup

3. **Data loss occurs**
   - Critical bug that loses user work
   - Annotations, sparks, flashcards disappear
   - Zero tolerance - fix immediately

### ❌ Don't Optimize When:

1. **Theoretical performance concerns**
   - "This could be slow if..." (but isn't)
   - "Best practices say..." (but no real issue)
   - Premature optimization

2. **Production best practices say you should**
   - Caching strategies for 1 user
   - Load balancing for 1 user
   - CDN for local development

3. **Code doesn't look "clean" but works fine**
   - Readable but not optimal
   - Gets the job done
   - No user complaints

---

## Cost Optimization

### Cloud Processing (Gemini)

**Per-book costs:**
- Small book (50 pages): ~$0.10
- Medium book (200 pages): ~$0.42
- Large book (500 pages): ~$0.55

**When cloud makes sense:**
- Quick setup (just add API key)
- Reliable quality
- No local resource constraints
- Processing <20 books/month (~$10)

### Local Processing (Docling + Ollama)

**Per-book costs:**
- All sizes: $0.00

**When local makes sense:**
- Processing >20 books/month (save $10+)
- Privacy concerns
- Offline capability
- Have powerful local hardware (M1/M2 Mac, GPU)

**Trade-offs:**
- Initial setup time (~1-2 hours)
- Requires 16GB+ RAM
- Slightly lower quality metadata
- More configuration complexity

**See**: `docs/local-pipeline-setup.md` for complete setup

---

## Time Optimization

### What to Measure

**Useful metrics:**
- End-to-end processing time (user perception)
- Cost per document (budget impact)
- Recovery success rate (data integrity)

**Not useful metrics:**
- API response time (user doesn't see individual calls)
- Cache hit rate (only 1 user)
- Throughput (not processing multiple simultaneously)

### Optimization Priorities

1. **Reduce expensive API calls**
   - Aggressive filtering before AI
   - Cache embeddings
   - Batch operations

2. **Parallelize independent work**
   - Process chunks in parallel
   - Run engines concurrently
   - Async I/O operations

3. **Skip unnecessary work**
   - Don't reprocess unchanged documents
   - Use cached chunks when possible
   - Smart Mode connection reprocessing

---

## Data Integrity (Zero Tolerance)

### Critical Data (Never Lose)

1. **Annotations** - Manual user work
2. **Sparks** - Quick insights
3. **Flashcards** - Study progress
4. **Source documents** - Original files

**Protection strategies:**
- Storage-first architecture (Supabase Storage = source of truth)
- Hourly annotation exports
- Transaction-safe reprocessing
- Fuzzy matching recovery (>90% success rate)

### Regenerable Data (Can Lose)

1. **Chunks** - Can reprocess from document
2. **Embeddings** - Can regenerate from chunks
3. **Connections** - Auto-detected, can rerun engines

**Trade-off:**
- Cheap to regenerate (~$0.20-0.60)
- Slower than restoring from backup
- Acceptable risk for personal tool

---

## Performance Anti-Patterns

### ❌ Don't Do These

1. **Premature optimization**
   - Optimizing before measuring
   - "This might be slow" without evidence
   - Over-engineering for 1 user

2. **Enterprise patterns for personal use**
   - Kubernetes for local dev
   - Redis cache for 1 user
   - Microservices for simple operations

3. **Ignoring user perception**
   - Optimizing milliseconds user doesn't notice
   - Neglecting "feels slow" feedback
   - Missing actual pain points

### ✅ Do These Instead

1. **Measure first**
   - Time end-to-end operations
   - Track cost per document
   - Monitor data loss incidents

2. **Optimize pain points**
   - Fix what annoys you
   - Reduce what costs too much
   - Prevent what loses data

3. **Keep it simple**
   - Solve real problems
   - Use simple solutions
   - Iterate based on usage

---

## Example: Connection Detection Optimization

### Original (7 engines, no filtering)

- **Time**: 45 minutes for 200-page book
- **Cost**: $1.20 per book
- **AI calls**: 2000+ per document
- **Result**: User annoyed, too expensive

### Optimized (3 engines, aggressive filtering)

- **Time**: 15-25 minutes for 200-page book
- **Cost**: $0.42 per book
- **AI calls**: <300 per document
- **Result**: "Process a book while making coffee"

### What Changed?

1. **Dropped 4 engines** - Diminishing returns on quality
2. **Aggressive filtering** - Only run AI on promising candidates
3. **User-configurable weights** - Tune to personal preference

### What Didn't Change?

- Connection quality (actually improved with focus)
- User satisfaction (better with faster results)
- Code complexity (simpler with fewer engines)

---

## Summary: Personal Tool Performance

**Optimize for:**
- User perception (does it feel fast enough?)
- Cost efficiency (can I afford this?)
- Data safety (will I lose my work?)

**Don't optimize for:**
- Millisecond response times
- Theoretical scalability
- Enterprise best practices

**Remember**: If it works and doesn't annoy you, it's fast enough.
