# Feature Brainstorming Session: Complete Connection Synthesis System

**Date:** 2025-09-28  
**Session Type:** 7-Engine Detection + Validation Learning + Obsidian Sync  
**Status:** ✅ Ready for Implementation (Week 3-8)  
**Prerequisites:** Document Reader & Annotation System (Weeks 1-2)

---

## 1. Context & Problem Statement

### Problem Description

Rhizome V2 aims to be a **personal cognitive prosthetic** - an external thinking system that aggressively discovers connections between ideas and learns from validation patterns. The core innovation is a **7-engine parallel detection system** that finds different types of relationships across documents, combined with a **3-phase learning system** that adapts to personal preferences.

**Current State (After Week 2):**
- ✅ Document reader with annotation system operational
- ✅ Weight tuning interface with mock connections validated
- ✅ Connection filtering and grouping working
- ✅ Validation capture (v/r/s keys) ready
- ❌ No real connection detection (using mock data)
- ❌ No 7-engine implementation
- ❌ No learning system
- ❌ No Obsidian bidirectional sync

**The Problem Without Synthesis:**
- Manual connection discovery (slow, biased, limited by working memory)
- No cross-domain bridge detection (miss unexpected insights)
- No contradiction detection (miss productive friction)
- No learning from reading patterns (system doesn't adapt to you)
- No Obsidian integration (knowledge graph disconnected from Rhizome)

**Vision:** Build a system that surfaces **everything** (store 50 connections/chunk), filters intelligently (weighted scoring), and learns continuously (auto-tune weights, train personal model).

### Target Users

- **Primary Users**: You (personal thinking tool, not a product)
- **Secondary Users**: None (explicitly personal, no sharing/collaboration features)

### Success Criteria

**Business Metrics:**
- Connection detection completes <5 seconds per document
- System discovers 50+ connections per chunk (store everything)
- Cross-domain bridges found (thematic engine validates against philosophy + biology documents)
- Contradictions detected (contradiction engine finds opposing views on same concept)
- Obsidian graph integration works (wikilinks visible in graph view)

**User Metrics:**
- Connections provide serendipitous insights (validation rate >20% = good)
- Weight tuning feels responsive (<100ms re-ranking after adjustment)
- Validation is frictionless (single keypress v/r/s)
- Learning system adapts weights automatically (visible improvements within 30 days)
- Chaos mode delivers interesting surprises (random high-strength connection every hour)

**Technical Metrics:**
- 7 engines run in parallel (<5s total for all engines)
- Store top 50 connections/chunk, top 10/engine
- Weight auto-tuning adjusts by ±0.1 per 30-day cycle
- Personal model achieves >70% accuracy predicting useful connections
- Obsidian sync generates companion section <2s per document

### Constraints & Assumptions

**Technical Constraints:**
- Must work with existing chunks table (embeddings, themes, metadata already populated)
- All connections stored in single `connections` table (hybrid referencing - chunks AND entities)
- ECS architecture for user-created connections (threads, manual links)
- pgvector required for semantic similarity (cosine distance)
- Must preserve connection history across document re-processing (version tracking)

**Business Constraints:**
- Timeline: 6 weeks (Weeks 3-8 after reader completion)
- Personal tool = maximum intelligence, minimum friction (no compromises)
- Must not break existing reader/annotation system
- Obsidian sync must be non-destructive (companion section only)

**Regulatory/Compliance:**
- N/A (personal tool, single user, local data)

**Assumptions Made:**
- Thematic fingerprinting from document processing is sufficient for engine detection
- Jaccard similarity adequate for thematic/structural matching
- Client-side re-ranking scales to 200 connections (<100ms)
- Personal model can train nightly on 30 days of feedback (enough data)
- Obsidian wikilinks sufficient for graph integration (no custom plugin needed)

---

## 2. Brainstormed Ideas & Options

### Option A: Sequential Engine Implementation (Conservative)

**Description:** Build one engine at a time, test thoroughly, then move to next. Start with semantic (easiest), end with temporal (hardest).

**Key Features:**
- Week 3: Semantic similarity engine only
- Week 4: Add thematic bridges engine
- Week 5: Add structural isomorphisms engine
- Week 6: Add contradiction, emotional, methodological engines
- Week 7: Add temporal rhythms engine
- Week 8: Obsidian sync + learning system

**Pros:**
- Lower risk (each engine tested independently)
- Easier debugging (isolate issues to single engine)
- Can ship partial functionality early (semantic connections useful alone)
- Less cognitive load (focus on one detection algorithm at a time)

**Cons:**
- Delayed full system validation (don't see all 7 engines together until Week 7)
- No early feedback on engine interaction (do they conflict? complement?)
- Obsidian sync delayed to end (can't dogfood graph integration)
- Learning system delayed (no feedback data until late)

**Effort Estimate:** XL (8 weeks total)  
**Risk Level:** Low (conservative, incremental)  
**Dependencies:** Reader complete (Week 2)

---

### Option B: Parallel Engine Development (Aggressive) ✅ RECOMMENDED

**Description:** Implement all 7 engines in parallel during Weeks 3-4, integrate Week 5, then add learning and Obsidian sync.

**Key Features:**
- Week 3: Implement all 7 engine detection functions (parallel work)
- Week 4: Parallel execution pipeline + connection storage with limits
- Week 5: Integration testing + replace mock data in reader
- Week 6: Validation learning system (explicit tracking)
- Week 7: Obsidian bidirectional sync
- Week 8: Weight auto-tuning + personal model

**Pros:**
- Faster to full system (all engines working by Week 5)
- Early feedback on engine interaction (Week 5 testing reveals issues)
- Can validate UI with real connections early (Week 5 vs Week 7)
- Obsidian sync tested with full connection set (Week 7)
- Learning system has 2 weeks of feedback data by Week 8

**Cons:**
- Higher initial complexity (7 engines at once)
- Integration risk (engines may conflict or need schema changes)
- Harder debugging if issues emerge (which engine caused problem?)
- Requires discipline to keep engines independent

**Effort Estimate:** L (6 weeks after reader)  
**Risk Level:** Medium (managed with good testing)  
**Dependencies:** Reader complete (Week 2)

---

### Option C: MVP Engine Set (Pragmatic)

**Description:** Build only the 3 most valuable engines first (semantic, thematic, contradiction), defer others to Phase 2.

**Key Features:**
- Week 3: Semantic + Thematic + Contradiction engines
- Week 4: Integration + testing
- Week 5: Validation learning system
- Week 6: Obsidian sync
- Week 7-8: Add remaining 4 engines (structural, emotional, methodological, temporal)

**Pros:**
- Fastest to "good enough" (3 engines cover 70% of value)
- Lower risk (fewer engines = fewer bugs)
- Can validate core hypothesis early (do connections provide value?)
- Easier to tune weights (3 sliders vs 7)

**Cons:**
- Delayed full system (missing structural, emotional, methodological, temporal)
- Incomplete testing of engine framework (may need rework for 4 additional engines)
- Personal preference for contradiction/thematic not validated against full set
- May discover need for "missing" engines during testing (structural isomorphisms important)

**Effort Estimate:** M (5 weeks after reader)  
**Risk Level:** Medium (may need Phase 2 sooner than expected)  
**Dependencies:** Reader complete (Week 2)

---

### Additional Ideas Considered

**Manual Connection Creation:**
- Considered allowing users to manually create connections
- **Decision:** Deferred to Phase 2 (focus on auto-detection first)
- **Reasoning:** Manual connections are entities with connection component (ECS handles this)
- **Implementation:** Add "Create Connection" button to chunk context menu (Phase 2)

**Connection Confidence Scores:**
- Considered adding confidence scores separate from strength
- **Decision:** Deferred (raw_strength sufficient for MVP)
- **Reasoning:** Confidence can be computed later (strength * user_validation_rate)
- **Implementation:** Add confidence column in migration 020 if needed

**Connection Types Beyond 7 Engines:**
- Considered adding temporal proximity (documents read around same time)
- Considered adding co-annotation (chunks annotated together)
- **Decision:** Deferred to Phase 3 (7 engines sufficient for validation)
- **Reasoning:** Can add as "meta-engines" later using connection metadata

**Real-time Connection Updates:**
- Considered live updates as connections are detected
- **Decision:** Batch updates acceptable (detection happens during processing)
- **Reasoning:** Background job queue already batches updates (processing dock shows progress)

---

## 3. Decision Outcome

### Chosen Approach

**Selected Solution:** Option B - Parallel Engine Development (Aggressive Implementation)

### Rationale

**Primary Factors in Decision:**

1. **Full System Validation by Week 5**
   - All 7 engines working together reveals interaction patterns early
   - Can validate personal weight preferences (contradiction 1.0, thematic 0.9) against real data
   - Early feedback on which engines provide most value (may adjust weights)
   - Reader UI tested with full connection density (50/chunk realistic load)

2. **Engine Independence Makes Parallel Development Safe**
   - Each engine is isolated function (input: chunk, output: connections[])
   - Shared schema for all engines (same connections table structure)
   - No inter-engine dependencies (semantic doesn't need thematic results)
   - Can test each engine independently with unit tests before integration

3. **Aligns with "Maximum Intelligence, Minimum Friction" Philosophy**
   - From APP_VISION.md: "Aggressive connection detection - Surface everything, filter later"
   - All 7 engines running = maximum intelligence (catch every connection type)
   - Weighted scoring = filter at display time (minimum friction)
   - Personal tuning available immediately (adjust weights as soon as data exists)

4. **Learning System Needs Full Engine Data**
   - Auto-tuning requires feedback across all 7 engines (can't tune what doesn't exist)
   - Personal model needs diverse connection types to learn patterns
   - By Week 8, have 3 weeks of feedback data across all engines (sufficient for initial model)

5. **Time Savings vs Option A (Sequential)**
   - Option A: 8 weeks total (one engine per week + learning + Obsidian)
   - Option B: 6 weeks total (parallel development + integration)
   - **Savings: 2 weeks** (25% faster to full system)

**Decision Matrix:**

| Approach | Time to Full System | Risk Level | Early Validation | Learning Data by Week 8 | Recommendation |
|----------|-------------------|-----------|-----------------|------------------------|---------------|
| Option A (Sequential) | 8 weeks | Low | Week 7 | 1 week | ❌ Too slow |
| Option B (Parallel) | 6 weeks | Medium | **Week 5** | **3 weeks** | ✅ **Best** |
| Option C (MVP 3 Engines) | 7 weeks | Medium | Week 4 | 2 weeks | ❌ Incomplete |

### Trade-offs Accepted

**What We're Gaining:**
- Full system operational 2 weeks earlier (Week 6 vs Week 8)
- Early validation of engine interactions (Week 5 testing)
- 3 weeks of learning data by Week 8 (vs 1 week for Option A)
- Complete synthesis system for Obsidian graph integration (Week 7)
- Can adjust architecture based on real data faster

**What We're Sacrificing:**
- Higher complexity during Weeks 3-4 (7 engines simultaneously)
- Integration risk if engines conflict (schema changes needed)
- Harder debugging if issues emerge (which engine responsible?)
- Need strong testing discipline (unit tests per engine required)

**Future Considerations:**
- **Engine refinement:** After Week 5 validation, may discover some engines need rework
- **Schema evolution:** May need to add engine-specific metadata columns (migration 020+)
- **Performance optimization:** May need to optimize specific engines if >5s detection time
- **New engine types:** Can add "meta-engines" in Phase 2 (temporal proximity, co-annotation)

---

## 4. Implementation Plan

### MVP Scope (7-Engine System + Learning + Obsidian Sync)

**Week 3: 7-Engine Implementation (Parallel Development)**

**Day 1-2: Engine 1-3 (Semantic, Thematic, Structural)**

Engine 1: **Semantic Similarity** (Baseline)
- [ ] Implement `findSemanticMatches(chunk)` using pgvector
- [ ] Query with `match_chunks` RPC function (cosine distance)
- [ ] Return top 20 matches with similarity scores
- [ ] Filter by threshold 0.3 (store weak connections)
- [ ] Exclude same document (cross-document only)
- [ ] Unit tests: 5 test cases (high similarity, low similarity, no matches, same document exclusion, limit enforcement)

Engine 2: **Thematic Bridges** (Cross-Domain)
- [ ] Implement `findThematicBridges(chunk)` 
- [ ] Query chunks with overlapping themes (array overlap operator `ov`)
- [ ] Calculate Jaccard similarity for theme sets
- [ ] Measure domain distance using structural patterns
- [ ] Filter: theme overlap ≥0.5 AND domain difference ≥0.6
- [ ] Unit tests: 5 test cases (perfect bridge, weak bridge, same domain exclusion, edge cases, performance)

Engine 3: **Structural Isomorphisms** (Pattern Matching)
- [ ] Implement `findStructuralIsomorphisms(chunk)`
- [ ] Query chunks with overlapping structural patterns
- [ ] Calculate Jaccard similarity for pattern sets
- [ ] Filter: pattern similarity ≥0.6
- [ ] Unit tests: 5 test cases (high similarity, low similarity, no patterns, edge cases, performance)

**Day 3-4: Engine 4-5 (Contradiction, Emotional)**

Engine 4: **Contradiction Tensions** (Opposing Views) - YOUR MAX WEIGHT 1.0
- [ ] Implement `findContradictions(chunk)`
- [ ] Define opposing tone mappings (critical↔affirmative, skeptical↔confident, etc.)
- [ ] Query chunks with opposing emotional tones
- [ ] Check concept similarity (must discuss same thing with opposite stance)
- [ ] Filter: concept similarity ≥0.7 (high conceptual overlap required)
- [ ] Unit tests: 5 test cases (clear contradiction, weak opposition, same tone exclusion, concept mismatch, edge cases)

Engine 5: **Emotional Resonance** (Mood/Tone)
- [ ] Implement `findEmotionalResonance(chunk)`
- [ ] Query chunks with overlapping emotional tones
- [ ] Calculate Jaccard similarity for tone sets
- [ ] Return all matches with tone overlap >0
- [ ] Unit tests: 5 test cases (perfect match, partial match, no overlap, single tone, performance)

**Day 5-6: Engine 6-7 (Methodological, Temporal)**

Engine 6: **Methodological Echoes** (Analytical Approaches) - YOUR HIGH WEIGHT 0.8
- [ ] Implement `findMethodologicalEchoes(chunk)`
- [ ] Extract method signatures from metadata (dialectical, genealogical, etc.)
- [ ] Query all chunks (no filtering - need to compare methods)
- [ ] Compare methodology signatures with custom similarity function
- [ ] Filter: methodology similarity ≥0.3
- [ ] Unit tests: 5 test cases (same method, different method, no method metadata, edge cases, performance)

Engine 7: **Temporal Rhythms** (Narrative Patterns) - YOUR LOW WEIGHT 0.2
- [ ] Implement `findTemporalRhythms(chunk)`
- [ ] Analyze narrative rhythm (buildup, reveal, reflection, argument, example)
- [ ] Calculate density (themes/sentences) and momentum
- [ ] Query all chunks (no filtering - need to compare rhythms)
- [ ] Compare rhythm similarity with custom function
- [ ] Filter: rhythm similarity ≥0.3
- [ ] Unit tests: 5 test cases (matching rhythms, different rhythms, no rhythm detected, edge cases, performance)

**Day 7: Engine Integration Testing**
- [ ] Test each engine independently with real document chunks
- [ ] Measure detection time per engine (<1s target each)
- [ ] Validate connection output format matches schema
- [ ] Check for duplicate connections across engines
- [ ] Verify theme/metadata availability in chunks table

---

**Week 4: Parallel Execution Pipeline + Connection Storage**

**Day 1-2: Parallel Pipeline Implementation**

- [ ] Implement `detectConnectionsForDocument(documentId, versionId)`
- [ ] Run all 7 engines in parallel with `Promise.all()`
- [ ] Collect results from all engines
- [ ] Tag each connection with engine type
- [ ] Measure total execution time (<5s target)
- [ ] Handle engine failures gracefully (skip failed engine, log error)

**Day 3-4: Connection Storage with Limits**

- [ ] Implement `storeConnectionsWithLimits(connections, config)`
- [ ] Group connections by source chunk
- [ ] Apply weighted scoring (raw_strength * engineWeight)
- [ ] Sort by engine priority order (user config)
- [ ] Take top 50 per chunk (configurable limit)
- [ ] Take top 10 per engine (prevent single engine domination)
- [ ] Insert to connections table with version tracking
- [ ] Handle duplicate detection (same source/target/type)

**Day 5: User Synthesis Config**

- [ ] Create `user_synthesis_config` table migration (016)
- [ ] Default weights: semantic 0.3, thematic 0.9, structural 0.7, contradiction 1.0, emotional 0.4, methodological 0.8, temporal 0.2
- [ ] Default order: contradiction, thematic, methodological, structural, semantic, emotional, temporal
- [ ] Default limits: 50/chunk, 10/engine
- [ ] Implement config retrieval in detection pipeline
- [ ] Test config overrides affect storage limits

**Day 6-7: Background Job Integration**

- [ ] Add connection detection to document processing pipeline
- [ ] Call `detectConnectionsForDocument()` after chunk embedding
- [ ] Update processing progress (85% → 95% during detection)
- [ ] Store connections before marking document complete
- [ ] Test with 5 real documents (various sizes, formats)
- [ ] Verify ProcessingDock shows connection counts per engine

---

**Week 5: Integration Testing + Replace Mock Data**

**Day 1-2: Reader Integration**

- [ ] Remove mock connection data from reader
- [ ] Query real connections from database (`connections` table)
- [ ] Apply user weights from `user_synthesis_config`
- [ ] Implement client-side re-ranking on weight change
- [ ] Test weight sliders affect real connection order
- [ ] Verify connection filtering by engine works
- [ ] Measure re-ranking performance (<100ms target)

**Day 3-4: Comprehensive Testing**

- [ ] Process 10 diverse documents (philosophy, biology, technical, etc.)
- [ ] Validate cross-domain bridges detected (philosophy ↔ biology)
- [ ] Validate contradictions detected (opposing views on same concept)
- [ ] Check connection density (50/chunk achieved?)
- [ ] Measure detection time (<5s per document?)
- [ ] Test with documents of varying sizes (100 chunks, 500 chunks)

**Day 5: Performance Optimization**

- [ ] Profile slow engines (use `console.time()`)
- [ ] Add database indexes if needed (theme queries, pattern queries)
- [ ] Optimize Jaccard similarity calculations (cache trigrams)
- [ ] Consider batch processing for large documents (>500 chunks)
- [ ] Test with 1000-chunk document (worst case)

**Day 6-7: Bug Fixes + Polish**

- [ ] Fix any bugs discovered during testing
- [ ] Improve error messages (which engine failed?)
- [ ] Add retry logic for transient failures
- [ ] Update documentation (engine descriptions, configuration)
- [ ] Create troubleshooting guide

---

**Week 6: Validation Learning System (Phase 1 - Explicit Tracking)**

**Day 1-2: Connection Feedback Infrastructure**

- [ ] Create `connection_feedback` table migration (017)
- [ ] Columns: connection_id, user_id, action (validated/rejected/starred/clicked/ignored), context JSONB, note TEXT, timestamp
- [ ] Implement feedback capture on v/r/s keypress
- [ ] Migrate from localStorage to database (from Week 2)
- [ ] Capture rich context: reading_document_id, time_of_day, day_of_week, current_mode, time_spent_ms
- [ ] Test feedback persistence

**Day 3-4: Validation Dashboard**

- [ ] Build stats display (validated/rejected/starred counts)
- [ ] Show feedback history (recent validations with context)
- [ ] Context analysis (time of day patterns, mode patterns)
- [ ] Per-engine validation rates (which engines are most useful?)
- [ ] Export feedback data to CSV (for manual analysis)

**Day 5: Quick Note Feature**

- [ ] Add note popover to connection cards (shadcn Popover)
- [ ] Textarea for "Why was this connection useful/useless?"
- [ ] Auto-save on blur (no explicit save button)
- [ ] Display notes in validation dashboard
- [ ] Test note persistence and retrieval

**Day 6-7: Testing + Dogfooding**

- [ ] Validate feedback capture works reliably
- [ ] Test context gathering (verify correct time, mode, document)
- [ ] Dogfooding: validate 50+ real connections
- [ ] Analyze validation patterns (which engines get validated most?)
- [ ] Document insights for Week 8 auto-tuning

---

**Week 7: Obsidian Bidirectional Sync**

**Day 1-2: Companion Section Implementation**

- [ ] Implement `syncToObsidian(documentId)` function
- [ ] Download markdown from storage
- [ ] Query strong connections (strength ≥0.8)
- [ ] Query active threads (if any exist)
- [ ] Build companion section markdown:
  - Header: `## Rhizome Connections`
  - Comment: `<!-- AUTO-GENERATED - DO NOT EDIT BELOW THIS LINE -->`
  - Connections list with wikilinks: `[[Target Doc]] - (0.92) 🌉 Cross-domain bridge`
  - Threads list: `[[Thread - Name]]`
  - Metadata: Rhizome ID, connection count, importance, last synced
- [ ] Merge companion section with original markdown
- [ ] Test section placement (always at end of document)

**Day 2-3: Connection Icons + Formatting**

- [ ] Define connection type icons:
  - contradiction: ⚡
  - cross_domain_bridge: 🌉
  - structural_isomorphism: 🏗️
  - similar: 🔗
  - emotional_resonance: 💭
  - methodological_echo: 🔧
  - temporal_rhythm: ⏱️
- [ ] Format connection strength (0.92 → "0.92")
- [ ] Format connection type (cross_domain_bridge → "Cross-domain bridge")
- [ ] Test with various connection types

**Day 4-5: File Writing + Obsidian Integration**

- [ ] Implement Obsidian vault path configuration (user setting)
- [ ] Write merged markdown to Obsidian vault
- [ ] Preserve original frontmatter (YAML)
- [ ] Handle file conflicts (backup original if changed)
- [ ] Test with real Obsidian vault
- [ ] Verify wikilinks appear in Obsidian graph view

**Day 6: Sync Service + Automation**

- [ ] Implement file watching (watch for Obsidian changes)
- [ ] Conflict resolution (Obsidian modified → re-sync)
- [ ] Incremental sync (only changed documents)
- [ ] Manual sync button in UI
- [ ] Test bidirectional sync (Obsidian → Rhizome → Obsidian)

**Day 7: Testing + Polish**

- [ ] Test with 10 documents in Obsidian vault
- [ ] Validate graph integration (wikilinks work)
- [ ] Test companion section updates (re-sync after new connections)
- [ ] Verify non-destructive (original content unchanged)
- [ ] Document sync workflow for users

---

**Week 8: Weight Auto-Tuning + Personal Model (Phase 2-3)**

**Day 1-3: Nightly Weight Auto-Tuning**

- [ ] Implement `autoTuneWeights(userId)` background job
- [ ] Get last 30 days of feedback from connection_feedback table
- [ ] Calculate adjustments per engine:
  - validated * 1 + starred * 2 - rejected * 1
  - Adjust weight ±0.1 per cycle
  - Clamp to range [0.1, 1.0]
- [ ] Update user_synthesis_config table
- [ ] Schedule cron job (nightly at 3am)
- [ ] Test with synthetic feedback data (simulate 30 days)
- [ ] Log weight changes for transparency

**Day 4-5: Context-Specific Weights**

- [ ] Create `weight_contexts` table migration (018)
- [ ] Columns: user_id, context (writing_criticism, technical_research, morning, etc.), engine, weight_multiplier, updated_at
- [ ] Implement context detection (reading vs writing, time of day)
- [ ] Apply context multipliers to base weights
- [ ] Test with different contexts (morning vs evening)

**Day 6: Starred Behavior (Temporary Boost)**

- [ ] Implement 2x multiplier for starred connection's engine
- [ ] Store in weight_contexts table with context='starred_boost'
- [ ] Expire after 24 hours (cleanup job)
- [ ] Test boost affects connection ranking immediately
- [ ] Verify expiration works (boost removed after 24h)

**Day 7: Personal Model (Experimental)**

- [ ] Implement `trainPersonalModel(userId)` function
- [ ] Extract features: engine, raw_strength, time_of_day, day_of_week, current_mode, recent_starred, recent_rejected
- [ ] Labels: validated/starred = 1, rejected = 0
- [ ] Train simple classifier (logistic regression or decision tree)
- [ ] Save model to user_models table (migration 019)
- [ ] Implement blend: 70% model score + 30% weighted score
- [ ] Test with synthetic training data
- [ ] Measure accuracy (>70% target)

---

**Acceptance Criteria:**

**As a synthesis user**, I can:
- ✅ Process a document and see real connections detected by all 7 engines
- ✅ View connections grouped by engine in right sidebar
- ✅ Adjust engine weights and see ranking change in real-time
- ✅ Validate connections with single keypress (v/r/s)
- ✅ See validation stats per engine (which are most useful?)
- ✅ Sync documents to Obsidian with companion section
- ✅ Navigate Obsidian graph via Rhizome wikilinks
- ✅ Observe weight auto-tuning adapting to my preferences over 30 days
- ✅ Experience connection ranking improving with personal model

**Definition of Done:**
- [ ] All 7 engines implemented and tested (unit tests pass)
- [ ] Parallel execution pipeline <5s for typical document
- [ ] Connection storage with limits working (50/chunk, 10/engine)
- [ ] Reader integrated with real connections (mock data removed)
- [ ] Validation learning system capturing feedback reliably
- [ ] Obsidian sync generating companion section correctly
- [ ] Weight auto-tuning adjusting weights based on 30-day feedback
- [ ] Personal model training nightly (optional, experimental)
- [ ] Performance targets met (detection <5s, re-ranking <100ms)
- [ ] No data loss (version tracking preserves connection history)
- [ ] Code reviewed and documented (JSDoc on all exported functions)
- [ ] No blocking bugs (P0/P1 issues resolved)

### Future Enhancements (Phase 2+)

**Meta-Engines (Week 9+):**
- Temporal proximity (documents read around same time)
- Co-annotation (chunks annotated together in same session)
- User-created connections (manual links via ECS)
- Citation networks (explicit references between documents)

**Advanced Learning (Week 10+):**
- Multi-armed bandit for engine exploration/exploitation
- Reinforcement learning for optimal weight schedules
- Transfer learning from other users (if ever multi-user)

**Performance Optimization (When Needed):**
- Engine result caching (avoid re-detection on re-processing)
- Incremental detection (only new chunks, not full document)
- Connection pruning (remove low-strength connections over time)

**Obsidian Advanced Sync (Week 11+):**
- Custom Obsidian plugin for richer integration
- Inline connection annotations in Obsidian
- Rhizome panel in Obsidian sidebar
- Live sync (real-time updates)

---

## 5. Action Items & Next Steps

### Immediate Actions (Week 3: Engine Implementation)

- [ ] **Implement Engine 1-3 (Semantic, Thematic, Structural)**
  - **Owner**: You
  - **Dependencies**: Chunks table populated with themes, metadata, embeddings
  - **Success Criteria**: Each engine returns connections array, unit tests pass

- [ ] **Implement Engine 4-5 (Contradiction, Emotional)**
  - **Owner**: You
  - **Dependencies**: Chunks table with emotional_tone in metadata
  - **Success Criteria**: Contradiction engine finds opposing views, emotional engine finds tone matches

- [ ] **Implement Engine 6-7 (Methodological, Temporal)**
  - **Owner**: You
  - **Dependencies**: Chunks table with structural_patterns in metadata
  - **Success Criteria**: Methodological engine finds similar methods, temporal engine finds rhythm matches

- [ ] **Integration testing with real documents**
  - **Owner**: You
  - **Dependencies**: All 7 engines implemented
  - **Success Criteria**: Each engine detects connections on real document, no errors

### Short-term Actions (Week 4: Pipeline + Storage)

- [ ] **Build parallel execution pipeline**
  - **Owner**: You
  - **Dependencies**: All 7 engines tested independently
  - **Success Criteria**: Promise.all() runs engines in parallel, <5s total time

- [ ] **Implement connection storage with limits**
  - **Owner**: You
  - **Dependencies**: Parallel pipeline working
  - **Success Criteria**: Top 50/chunk stored, top 10/engine, weighted by config

- [ ] **Create user_synthesis_config table**
  - **Owner**: You
  - **Dependencies**: None (new migration)
  - **Success Criteria**: Default config available, can query in detection pipeline

- [ ] **Integrate with background job queue**
  - **Owner**: You
  - **Dependencies**: Connection storage working
  - **Success Criteria**: Documents processed → connections detected → stored automatically

### Medium-term Actions (Week 5-6: Integration + Learning)

- [ ] **Replace mock data in reader**
  - **Owner**: You
  - **Dependencies**: Real connections stored in database
  - **Success Criteria**: Reader displays real connections, weight sliders affect order

- [ ] **Build connection feedback system**
  - **Owner**: You
  - **Dependencies**: connection_feedback table created
  - **Success Criteria**: v/r/s keys store feedback, rich context captured

- [ ] **Create validation dashboard**
  - **Owner**: You
  - **Dependencies**: Feedback data accumulating
  - **Success Criteria**: Stats displayed, per-engine validation rates shown

### Long-term Actions (Week 7-8: Obsidian + Auto-Tuning)

- [ ] **Implement Obsidian sync**
  - **Owner**: You
  - **Dependencies**: Strong connections available (strength ≥0.8)
  - **Success Criteria**: Companion section generated, wikilinks work in graph

- [ ] **Build weight auto-tuning job**
  - **Owner**: You
  - **Dependencies**: 30 days of feedback data (can simulate)
  - **Success Criteria**: Weights adjust ±0.1 based on feedback, cron job runs nightly

- [ ] **Train personal model (experimental)**
  - **Owner**: You
  - **Dependencies**: 30 days of feedback, model training infrastructure
  - **Success Criteria**: Model achieves >70% accuracy, ranking improves

---

## 6. Risks & Dependencies

### Technical Risks

**Risk: 7 engines take >5s to run in parallel**
- **Impact:** High (poor UX, documents take too long to process)
- **Probability:** Medium (some engines may be slow on large documents)
- **Mitigation Strategy:**
  - Profile each engine with `console.time()` on real documents
  - Optimize slow engines (add database indexes, cache calculations)
  - Consider batching for documents >500 chunks
  - Set timeout per engine (5s max, skip if exceeded)
  - **Fallback:** Run engines sequentially if parallel causes issues (accept 10-15s processing)

**Risk: Engine conflicts (duplicate connections, schema mismatches)**
- **Impact:** High (data corruption, integration delays)
- **Probability:** Medium (engines may detect same connection differently)
- **Mitigation Strategy:**
  - Unit test each engine independently before integration
  - Validate connection output format matches schema exactly
  - Implement duplicate detection in storage layer (same source/target/type)
  - Log conflicts for manual review
  - **Fallback:** Add engine-specific metadata columns if schema too restrictive

**Risk: Thematic/structural data missing from chunks**
- **Impact:** High (engines fail, no connections detected)
- **Probability:** Low (document processing already extracts themes/patterns)
- **Mitigation Strategy:**
  - Validate chunks table has required metadata (themes, emotional_tone, structural_patterns, key_concepts)
  - Add default values if missing (themes: ['general'], emotional_tone: ['neutral'])
  - Log warnings for chunks with missing metadata
  - **Fallback:** Re-process documents to extract missing metadata (migration 020)

**Risk: pgvector performance degrades with 10,000+ chunks**
- **Impact:** Medium (slow semantic similarity queries)
- **Probability:** Low (pgvector designed for large datasets)
- **Mitigation Strategy:**
  - Add IVFFlat index on embedding column (already exists from migration 001)
  - Tune index parameters (lists, probes) for optimal performance
  - Consider limiting semantic similarity to top 1000 most relevant chunks
  - **Fallback:** Use approximate nearest neighbor (ANN) if exact search too slow

**Risk: Weight auto-tuning makes connections worse**
- **Impact:** Medium (user has to manually revert weights)
- **Probability:** Low (±0.1 adjustment is conservative)
- **Mitigation Strategy:**
  - Log all weight changes for transparency
  - Allow manual override in config panel
  - Implement "revert to defaults" button
  - Test with synthetic feedback data (simulate good/bad patterns)
  - **Fallback:** Disable auto-tuning if users complain (keep manual tuning only)

**Risk: Personal model overfits to recent behavior**
- **Impact:** Low (model is experimental, can disable)
- **Probability:** Medium (30 days may not be enough data)
- **Mitigation Strategy:**
  - Use simple model (logistic regression, not deep learning)
  - Regularization to prevent overfitting
  - Blend with weighted scoring (70/30) to smooth predictions
  - Track accuracy over time (alert if drops below 60%)
  - **Fallback:** Disable personal model, use weighted scoring only

### Business Risks

**Risk: 7 engines don't provide enough value vs 3 engines (MVP)**
- **Impact:** Medium (wasted development time on unnecessary engines)
- **Probability:** Low (personal preference for contradiction/thematic/methodological clear)
- **Mitigation Strategy:**
  - Validate with real documents in Week 5 (test cross-domain bridges, contradictions)
  - Track validation rates per engine (which get validated most?)
  - Allow disabling engines in config panel (turn off unused engines)
  - Document insights for future engine refinement
  - **Fallback:** Deprecate low-value engines in Phase 2 (keep top 5 only)

**Risk: Obsidian sync breaks user's vault (data loss)**
- **Impact:** Critical (unacceptable for personal tool)
- **Probability:** Low (non-destructive companion section)
- **Mitigation Strategy:**
  - Backup original markdown before syncing (timestamp backup file)
  - Only append companion section (never modify original content)
  - Test with copy of vault first (not production vault)
  - Add "dry run" mode (preview changes without writing)
  - **Fallback:** Manual export to separate folder if auto-sync causes issues

**Risk: Learning system doesn't adapt to personal preferences**
- **Impact:** Medium (system doesn't improve over time, static weights)
- **Probability:** Medium (learning is hard, may need more data/features)
- **Mitigation Strategy:**
  - Start with explicit tracking only (Week 6) - validate feedback capture works
  - Defer auto-tuning until sufficient feedback data (30 days)
  - Allow manual weight adjustment as fallback
  - Track validation rates per engine to validate learning
  - **Fallback:** Keep manual tuning as primary interface, auto-tuning as "suggestion"

### Dependencies

**Hard Dependencies (Blocking):**
- ✅ Document reader complete with weight tuning interface (Week 2) - REQUIRED
- ✅ Chunks table with embeddings, themes, metadata (document processing) - DONE
- ✅ ECS implementation functional - DONE
- ✅ pgvector extension installed - DONE
- ❌ User synthesis config table (create in Week 4) - BLOCKING
- ❌ Connection feedback table (create in Week 6) - BLOCKING

**Soft Dependencies (Nice to Have):**
- ❌ 30 days of feedback data (can simulate for testing) - Week 8
- ❌ Obsidian vault (can test with sample vault) - Week 7
- ❌ Personal model training infrastructure (experimental) - Week 8

**External Dependencies:**
- PostgreSQL with pgvector extension (already installed)
- Supabase admin client for background jobs
- Node.js cron library for scheduled jobs (nightly auto-tuning)

---

## 7. Resources & References

### Technical Documentation

**pgvector Similarity Search:**
- pgvector documentation: https://github.com/pgvector/pgvector
  - Cosine distance for semantic similarity (<=> operator)
  - IVFFlat index for performance (CREATE INDEX USING ivfflat)
- PostgreSQL full-text search: https://www.postgresql.org/docs/current/textsearch.html
  - For annotation search (Phase 2)

**Machine Learning (Personal Model):**
- Logistic Regression: https://scikit-learn.org/stable/modules/linear_model.html#logistic-regression
  - Simple, interpretable, fast training
- Decision Trees: https://scikit-learn.org/stable/modules/tree.html
  - Alternative if logistic regression insufficient
- Model serialization: https://scikit-learn.org/stable/model_persistence.html
  - Save/load models from database (JSONB column)

**Cron Jobs (Background Automation):**
- node-cron library: https://www.npmjs.com/package/node-cron
  - Schedule nightly jobs (auto-tuning, model training)
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
  - Alternative to local cron (cloud-based scheduling)

### Codebase References

**Existing Infrastructure:**
- `src/lib/ecs/ecs.ts` - Entity-Component-System (use for user-created connections)
- `worker/lib/fuzzy-matching.ts` - Jaccard similarity reference (reuse for thematic/structural engines)
- `worker/lib/embeddings.ts` - Vercel AI SDK embeddings (already generating 768d vectors)
- `src/components/layout/ProcessingDock.tsx` - Progress updates (show connection detection progress)

**Database Schema:**
- `supabase/migrations/001_initial_schema.sql` - chunks table (has embeddings, themes)
- `supabase/migrations/012_youtube_position_context.sql` - JSONB column pattern (use for connection metadata)

**New Migrations Needed:**
- `016_user_synthesis_config.sql` - User engine weights and limits
- `017_connection_feedback.sql` - Validation tracking
- `018_weight_contexts.sql` - Context-specific weight multipliers
- `019_user_models.sql` - Personal model storage
- `020_connections_table.sql` - Main connections table (hybrid referencing)

### Design Resources

**Connection Type Icons:**
```typescript
const CONNECTION_ICONS = {
  'contradiction': '⚡',
  'cross_domain_bridge': '🌉',
  'structural_isomorphism': '🏗️',
  'similar': '🔗',
  'emotional_resonance': '💭',
  'methodological_echo': '🔧',
  'temporal_rhythm': '⏱️'
}
```

**UI Components (from shadcn/ui):**
- Slider: Engine weight tuning
- Switch: Enable/disable engines
- Badge: Connection type indicators
- Tabs: Validation dashboard sections
- Progress: Detection progress bar

### External Research

**Connection Detection Algorithms:**
- Jaccard similarity: https://en.wikipedia.org/wiki/Jaccard_index
  - Used in thematic bridges, structural isomorphisms
- Cosine similarity: https://en.wikipedia.org/wiki/Cosine_similarity
  - Used in semantic similarity (pgvector)
- tf-idf: https://en.wikipedia.org/wiki/Tf%E2%80%93idf
  - Potential enhancement for thematic matching

**Knowledge Graph Systems:**
- Neo4j graph algorithms: https://neo4j.com/docs/graph-data-science/current/algorithms/
  - Inspiration for meta-engines (community detection, centrality)
- Roam Research: https://roamresearch.com/
  - Bidirectional linking patterns
- Obsidian graph view: https://help.obsidian.md/Plugins/Graph+view
  - Wikilink integration reference

**Machine Learning for Personalization:**
- Collaborative filtering: https://en.wikipedia.org/wiki/Collaborative_filtering
  - Not applicable (single user, but pattern reference)
- Multi-armed bandit: https://en.wikipedia.org/wiki/Multi-armed_bandit
  - Potential for engine exploration/exploitation (Phase 2)
- Online learning: https://en.wikipedia.org/wiki/Online_machine_learning
  - Update model incrementally as feedback arrives

---

## 8. Session Notes & Insights

### Key Insights Discovered

1. **Parallel Engine Development is Safe with Proper Testing**
   - Each engine is isolated function (input: chunk, output: connections[])
   - Unit tests validate each engine independently before integration
   - Shared schema reduces integration risk (all engines use same connections table)
   - 2 weeks saved vs sequential approach (25% faster to full system)

2. **Engine Independence Enables Modular Architecture**
   - Can disable engines in config panel (turn off unused engines)
   - Can add new engines later without modifying existing ones (meta-engines in Phase 2)
   - Can deprecate low-value engines based on validation data
   - Engine order defines storage priority (configurable per user)

3. **Learning System Needs Full Engine Data**
   - Auto-tuning requires feedback across all 7 engines (can't tune what doesn't exist)
   - Personal model needs diverse connection types to learn patterns
   - By Week 8, have 3 weeks of feedback data (sufficient for initial model)
   - Starting with explicit tracking (Week 6) validates feedback capture works

4. **Obsidian Companion Section is Non-Destructive Integration**
   - Only appends to end of document (never modifies original content)
   - Wikilinks sufficient for graph integration (no custom plugin needed)
   - Connection icons provide visual distinction (⚡ contradiction, 🌉 bridge)
   - Metadata section enables future features (importance, sync timestamp)

5. **Weight Auto-Tuning Must Be Conservative**
   - ±0.1 adjustment per 30-day cycle (avoid drastic changes)
   - Clamp to range [0.1, 1.0] (prevent disabling engines accidentally)
   - Log all changes for transparency (users need to trust system)
   - Manual override always available (fallback if auto-tuning makes worse)

6. **Personal Model is Experimental (Nice-to-Have)**
   - 70/30 blend with weighted scoring smooths predictions
   - Simple model (logistic regression) prevents overfitting
   - Can disable if accuracy drops below 70%
   - Not required for system to be valuable (manual weights sufficient)

### Questions Raised (For Future Investigation)

**Engine Performance:**
- Which engines are slowest? (profile with console.time() in Week 3)
- Can we cache engine results across re-processing? (avoid re-detection)
- Should we parallelize within engines? (e.g., thematic bridge queries in batches)
- What's the breaking point for parallel execution? (500 chunks? 1000 chunks?)

**Connection Quality:**
- Which engines produce most validated connections? (track validation rates per engine in Week 6)
- Do engines conflict (same connection detected differently)? (test in Week 5 integration)
- Should we add engine-specific confidence scores? (e.g., thematic bridges more reliable than emotional resonance)
- Can we combine engines? (e.g., thematic + structural = "methodological bridge")

**Learning System:**
- Is 30 days enough feedback data? (may need 60-90 days for stable patterns)
- Should we track rejection reasons? (why was connection rejected?)
- Can we learn time-of-day preferences? (morning = methodological, evening = emotional)
- Should starred connections boost for 24h or 7 days? (test different durations)

**Obsidian Integration:**
- Should we inline connections in original content? (vs separate section)
- Can we detect Obsidian edits and trigger re-sync? (file watching)
- Should we create separate pages for threads? (wikilink to thread detail page)
- Can we export to other formats? (Logseq, Roam Research)

**Personal Model:**
- What features are most predictive? (engine? time_of_day? document_type?)
- Should we use neural network? (vs logistic regression)
- Can we do transfer learning? (if ever multi-user)
- Should model predict connection strength? (vs just useful/not useful binary)

### Team Feedback

**Concerns Raised:**
- 7 engines simultaneously is high complexity
  - **Response:** Each engine tested independently with unit tests
  - Parallel development managed with good testing discipline
  - Can disable engines if causing issues

- Integration risk if engines conflict
  - **Response:** Duplicate detection in storage layer
  - Unit tests validate output format matches schema
  - Week 5 dedicated to integration testing

- Weight auto-tuning may make connections worse
  - **Response:** Conservative ±0.1 adjustment
  - Manual override always available
  - Log all changes for transparency

**Risk Mitigation Decisions:**
- Strong unit testing per engine (5 test cases minimum)
- Week 5 dedicated to integration testing (catch conflicts early)
- Manual weight tuning as fallback (auto-tuning optional)
- Obsidian sync with dry-run mode (preview before writing)

**Process Improvements:**
- Create engine implementation checklist (ensure consistency across engines)
- Document connection schema clearly (reduce integration issues)
- Add performance benchmarks (detect slow engines early)
- Validate feedback capture in Week 6 (before building auto-tuning on top)

---

## Next Steps

### Implementation Start (Week 3)

1. **Create feature branch**: `git checkout -b feature/connection-synthesis-system`
2. **Implement Engine 1 (Semantic)**: Use pgvector match_chunks RPC, validate output format
3. **Implement Engine 2 (Thematic)**: Jaccard similarity on themes, domain distance filtering
4. **Implement Engine 3 (Structural)**: Pattern matching with structural_patterns metadata
5. **Unit test all 3 engines**: 5 test cases each, validate against real chunks

### Validation Checkpoint (End of Week 3)

- All 7 engines implemented with unit tests passing
- Each engine tested independently with real document chunks
- Measure detection time per engine (<1s target)
- Validate connection output format matches connections table schema
- No errors or exceptions during detection

### Week 4 Goals

- Build parallel execution pipeline (Promise.all() for all 7 engines)
- Implement connection storage with limits (50/chunk, 10/engine)
- Create user_synthesis_config table (default weights and limits)
- Integrate with background job queue (automatic detection after embedding)
- Test with 5 real documents (various sizes, formats)

### Integration Handoff (End of Week 5)

- Replace mock data in reader with real connections
- Validate weight sliders affect real connection ranking
- Test with 10 diverse documents (cross-domain bridges, contradictions)
- Measure performance (detection <5s, re-ranking <100ms)
- Document any discovered issues or needed optimizations

### Learning System Kickoff (Week 6)

- Create connection_feedback table with rich context
- Migrate validation capture from localStorage to database
- Build validation dashboard with per-engine stats
- Dogfood: validate 50+ real connections to test feedback capture
- Prepare for Week 8 auto-tuning (analyze validation patterns)

---

**Session Completed**: 2025-09-28  
**Status**: ✅ Ready for Implementation (Weeks 3-8)  
**Prerequisites**: Document Reader & Annotation System (Weeks 1-2) MUST be complete  
**Next Session**: Week 9+ - Meta-Engines & Advanced Learning (Future Enhancements)