# Feature Brainstorming Session: Document Reader & Annotation System

**Date:** 2025-09-28  
**Session Type:** Foundation Phase - Pre-Synthesis Infrastructure  
**Status:** ✅ Ready for Implementation

---

## 1. Context & Problem Statement

### Problem Description

The 7-engine connection synthesis system (documented in `2025-01-28-personal-connection-synthesis-engine.md`) requires user interaction infrastructure to function effectively. Without a document reading interface, there is no way to:

1. **Display connections** discovered by synthesis engines
2. **Capture validation feedback** (validate/reject/star) for learning system
3. **Tune engine weights** in real-time during actual reading sessions
4. **Create annotations** that synthesis can analyze for deeper understanding

**Current State**: 
- ✅ Multi-format document processing complete (6 input methods)
- ✅ Background job queue operational
- ✅ Chunk storage with embeddings functional
- ❌ No document reading interface
- ❌ No annotation capture system
- ❌ No connection display UI
- ❌ No weight tuning interface

**Without this foundation**, the synthesis system runs in a vacuum with no feedback loop, making it impossible to validate engine effectiveness or learn from user behavior.

### Target Users

- **Primary Users**: You (personal knowledge synthesis tool)
- **Secondary Users**: None (personal tool, not a product)

### Success Criteria

**Business Metrics:**
- Document reading experience preserves flow state (zero modal interruptions)
- Annotation creation takes <3 seconds from text selection to storage
- Connection validation takes <1 second (single keypress)
- System usable for 2+ hour reading sessions without friction

**User Metrics:**
- Can highlight and annotate while reading without interruption
- Connections surface in sidebar without blocking content
- Weight tuning provides immediate visual feedback (<100ms UI update)
- Reading flow never broken by context switches

**Technical Metrics:**
- Markdown streaming from storage achieves <500ms first paint
- Virtual scrolling supports documents >10,000 lines without lag
- Annotation positioning maintains >70% high-confidence (≥0.7) across document re-processing
- Weight changes re-rank connections in <100ms (client-side)

### Constraints & Assumptions

**Technical Constraints:**
- Must stream markdown from Supabase Storage (not database - files >100KB)
- Annotations must survive document re-processing via fuzzy matching
- ECS architecture required for all user-generated content
- No modals allowed (architectural requirement from APP_VISION.md)
- Must work with existing fuzzy matching algorithm from YouTube processing

**Business Constraints:**
- Timeline: 2 weeks for Phase 1 + weight tuning interface
- Must not delay connection synthesis work unnecessarily
- Personal tool = no compromises on features for "other users"
- Must be production-ready for synthesis testing immediately after completion

**Regulatory/Compliance:**
- N/A (personal tool, single user)

**Assumptions Made:**
- Fuzzy matching algorithm from YouTube processing (88.52% coverage, 24 tests) is sufficient for annotation resilience
- react-markdown is adequate for MVP (MDX migration later if needed)
- Phase 1 + weight tuning = sufficient testing ground for synthesis engines
- Mock connection data can validate UI before real engines are built
- Context7 MCP can provide necessary markdown rendering documentation

---

## 2. Brainstormed Ideas & Options

### Option A: Minimal Reader (Phase 1 Only)

**Description:** Ship basic reader with simple connection sidebar, defer all Phase 2 features (keyboard nav, export, search).

**Key Features:**
- Markdown streaming from Supabase Storage with signed URLs
- Basic highlighting with 5 color codes (green/yellow/red/blue/purple)
- Quick capture panel (appears on text selection)
- Annotation storage via ECS with position tracking
- Simple connection sidebar (display only, no filtering)
- No weight tuning interface (manual SQL updates required)

**Pros:**
- Fastest path to synthesis testing (1 week implementation)
- Validates core architecture decisions early
- Minimal scope creep risk
- Gets reader in hands immediately for validation

**Cons:**
- No weight tuning interface = terrible DX (manual SQL for testing)
- No connection filtering = poor UX when synthesis generates 50+ connections/chunk
- Missing features will be immediately painful in actual use
- Will likely require immediate Phase 2 work anyway

**Effort Estimate:** S (1 week)  
**Risk Level:** Medium (may require immediate Phase 2 work due to missing critical features)  
**Dependencies:** None (all processing infrastructure exists)

---

### Option B: Partial Phase 2 (Phase 1 + Weight Tuning) ✅ RECOMMENDED

**Description:** Ship Phase 1 complete + live weight tuning interface specifically for synthesis testing. This is the **hybrid mock-first approach**.

**Key Features:**
- All Phase 1 features (markdown rendering, annotations, sidebar)
- **Live weight tuning interface** with sliders for 7 engines
- Real-time connection re-ranking on weight changes
- Engine enable/disable toggles
- Connection filtering by engine type
- Visual preview of weight impact
- **Mock connection data** for immediate UI validation
- Collapsible sections per engine
- Strength threshold slider

**Pros:**
- Critical synthesis testing capability (weight tuning) included
- Better UX for connection exploration (filtering prevents overload)
- Still ships in 1.5 weeks (only +50% time vs Option A)
- Aligns perfectly with synthesis engine configuration needs
- Mock data allows UI validation before engines are built
- Enables parallel development (reader polish + engine implementation)
- Drop-in replacement when real engines are ready

**Cons:**
- Slightly delays synthesis work (0.5 weeks)
- More scope than absolute minimum viable
- Requires creating realistic mock connection dataset

**Effort Estimate:** M (1.5 weeks)  
**Risk Level:** Low (features are well-defined, no unknowns, parallel development possible)  
**Dependencies:** None (mock data eliminates engine dependency)

---

### Option C: Complete Phase 2 Before Synthesis

**Description:** Ship all Phase 2 features (keyboard nav, export, annotation search, settings) before starting synthesis work.

**Key Features:**
- All Phase 1 features
- All weight tuning features (from Option B)
- Keyboard navigation (vim-style: j/k/g/G for scrolling)
- Annotation search with PostgreSQL full-text search
- Export annotations to JSON
- Settings persistence (font size, theme, layout preferences)
- Hotkey customization panel

**Pros:**
- Complete reader experience with zero feature gaps
- No future rework needed on reader
- Better for long-term quality and polish
- All quality-of-life features included

**Cons:**
- Delays synthesis work by 2 weeks (unacceptable delay)
- Export and keyboard navigation don't impact synthesis testing
- Annotation search not needed until large annotation volumes exist (100+)
- Over-engineering for immediate needs

**Effort Estimate:** L (2 weeks)  
**Risk Level:** Low (well-defined features)  
**Dependencies:** None

---

### Additional Ideas Considered

**MDX with remark/rehype:**
- Considered for advanced interactive annotations
- **Decision:** Deferred to later phase (react-markdown sufficient for MVP)
- **Reasoning:** Custom renderers handle highlight overlays adequately
- **Migration path:** Annotation data structure kept MDX-compatible

**Virtual scrolling:**
- Considered for large document performance
- **Decision:** Deferred to Phase 3 (not needed for typical document sizes)
- **Reasoning:** Most documents <5,000 lines, react-markdown handles this

**Annotation conflict resolution:**
- Considered for multi-device sync scenarios
- **Decision:** Deferred until multi-device sync feature (Phase 4+)
- **Reasoning:** Single-user tool, no device conflicts currently

**Mobile responsive design:**
- Considered for tablet/mobile reading
- **Decision:** Deferred to Phase 4 (desktop-first for personal tool)
- **Reasoning:** Primary use case is desktop research sessions

---

## 3. Decision Outcome

### Chosen Approach

**Selected Solution:** Option B - Partial Phase 2 (Phase 1 + Weight Tuning) with Hybrid Mock-First Development

### Rationale

**Primary Factors in Decision:**

1. **Weight Tuning is Critical for Synthesis Testing**
   - Without it, testing synthesis engines requires manual SQL updates (terrible DX)
   - Real-time weight adjustment enables rapid iteration on engine tuning
   - Synthesis config panel (from connection brainstorm) depends on this infrastructure
   - Absolute requirement for validating engine effectiveness

2. **Connection Filtering Prevents UX Disaster**
   - Synthesis engines will generate 50+ connections per chunk (by design - store everything)
   - Without filtering, right panel becomes unusable scrolling nightmare
   - Grouping by engine type is essential for validation workflow
   - Users need to understand which engine produced which connection

3. **Mock-First Enables Parallel Development**
   - UI can be validated immediately without waiting for engines
   - Reader polish and engine implementation happen in parallel
   - Drop-in replacement when engines are ready (same data schema)
   - Aligns with "Ship broken things, fix when annoying" philosophy from APP_VISION.md
   - 2 weeks saved vs sequential approach

4. **Time Trade-off is Acceptable**
   - +50% time investment (0.5 weeks) for critical features
   - Saves time later by avoiding weight tuning UI rework
   - Keyboard navigation and export don't justify 2-week delay
   - Gets to synthesis validation faster than complete Phase 2

**Decision Matrix:**

| Feature | MVP Need? | Synthesis Testing Impact | Time Cost | Include? |
|---------|-----------|-------------------------|-----------|----------|
| Phase 1 core | ✅ Yes | High - enables display | 1 week | ✅ Yes |
| Weight tuning | ✅ Yes | **Critical** - enables testing | +0.3 weeks | ✅ Yes |
| Connection filtering | ✅ Yes | High - prevents UX disaster | +0.2 weeks | ✅ Yes |
| Mock connections | ✅ Yes | **Critical** - enables parallel dev | +0.1 weeks | ✅ Yes |
| Keyboard nav | ❌ No | None - quality of life only | +0.3 weeks | ❌ Defer |
| Export annotations | ❌ No | None - not needed for synthesis | +0.2 weeks | ❌ Defer |
| Annotation search | ❌ No | Low - defer until volume exists | +0.3 weeks | ❌ Defer |

**Total for Option B: 1.6 weeks**  
**Total for Option C: 2.5 weeks**  
**Savings: 0.9 weeks (36% faster to synthesis validation)**

### Trade-offs Accepted

**What We're Gaining:**
- Critical synthesis testing infrastructure (weight tuning + filtering)
- Usable connection exploration UX (prevents 50+ connection overload)
- Faster path to synthesis validation (0.9 weeks saved)
- Parallel development capability (UI + engines simultaneously)
- Immediate UI validation with mock data
- Drop-in architecture for real engines

**What We're Sacrificing:**
- Keyboard navigation (can add later with zero rework)
- Export annotations (not needed until multi-device sync)
- Annotation search (not needed until 100+ annotations exist)
- Some polish and quality-of-life features

**Future Considerations:**
- **Keyboard navigation:** Add in Phase 3 with full hotkey customization system
- **Export system:** Build with complete ZIP bundle (markdown + annotations + flashcards + connections)
- **Annotation search:** Implement with PostgreSQL full-text search when annotation volume justifies it (100+ threshold)
- **Virtual scrolling:** Add when document size becomes performance issue (>10,000 lines)

---

## 4. Implementation Plan

### MVP Scope (Phase 1 + Weight Tuning + Mock Connections)

**Week 1: Core Reader Foundation**

**Day 1-2: Markdown Rendering & Streaming**
- [ ] Create `/read/[id]` page with Server Component data fetching
- [ ] Implement storage path retrieval from documents table
- [ ] Stream markdown from Supabase Storage with signed URLs (1-hour expiry)
- [ ] Implement react-markdown with custom renderers for highlights
- [ ] Add syntax highlighting with Shiki for code blocks
- [ ] Add math rendering with KaTeX for equations
- [ ] Test with 5 documents from different sources (PDF, YouTube, Web, Markdown, Text)
- [ ] Verify first paint <500ms for typical documents

**Day 3-4: Text Selection & Quick Capture**
- [ ] Implement text selection handler with Range API
- [ ] Build Quick Capture panel (appears on selection, no modal)
- [ ] Add 5 highlight colors with hotkeys (g/y/r/b/p for green/yellow/red/blue/purple)
- [ ] Implement note input inline (textarea in panel)
- [ ] Add "Create Flashcard" button (deferred implementation to Phase 2)
- [ ] Test selection across chunk boundaries
- [ ] Verify panel appears <200ms after mouseup

**Day 5: Annotation Storage & Rendering**
- [ ] Create annotation entities via ECS (`ecs.createEntity()`)
- [ ] Store position data (chunk_id, start_offset, end_offset)
- [ ] Store context windows (±5 words before/after for fuzzy matching)
- [ ] Implement fuzzy matching for position resilience (reuse YouTube algorithm)
- [ ] Render highlights as markdown overlays with CSS
- [ ] Test annotation persistence across browser sessions
- [ ] Verify fuzzy matching maintains >70% confidence

**Day 6-7: Connection Sidebar (Basic with Mock Data)**
- [ ] Build right panel with tabs (Connections/Annotations)
- [ ] Create mock connection dataset (50 examples across 7 engines)
- [ ] Query mock connections by current chunk
- [ ] Display connection cards with engine badges
- [ ] Implement navigation to target chunks (scroll + highlight)
- [ ] Test with various connection densities (5-50 per chunk)
- [ ] Verify sidebar doesn't block main content

**Week 2: Weight Tuning & Connection Filtering**

**Day 1-2: Weight Tuning Interface**
- [ ] Build engine weight sliders (7 engines: semantic, thematic, structural, contradiction, emotional, methodological, temporal)
- [ ] Add enable/disable toggles per engine
- [ ] Implement real-time connection re-ranking (client-side, <100ms)
- [ ] Add preset configurations (Max Friction, Thematic Focus, Balanced, Chaos)
- [ ] Store weights in localStorage (temporary - migrate to user_synthesis_config table in Week 3)
- [ ] Test weight changes reflect in connection order immediately
- [ ] Add visual feedback (connection cards re-sort with animation)

**Day 3: Connection Filtering & Grouping**
- [ ] Group mock connections by engine type
- [ ] Add collapsible sections per engine (default: expanded)
- [ ] Show connection count badges per engine
- [ ] Filter by strength threshold (slider: 0.3-1.0)
- [ ] Test with 50+ connections per chunk
- [ ] Verify grouping makes sidebar manageable

**Day 4-5: Validation Capture (Preparation for Learning System)**
- [ ] Implement single-key validation handlers (v/r/s for validate/reject/star)
- [ ] Create connection_feedback table entries (schema ready, mock data)
- [ ] Capture rich context (time_of_day, current_mode, document_id)
- [ ] Show immediate visual feedback (toast notification)
- [ ] Test validation persists to localStorage (migrate to DB in Week 6)
- [ ] Add keyboard shortcuts help panel (? key)

**Day 6-7: Polish & Testing**
- [ ] Fix UI bugs and edge cases
- [ ] Add loading states (skeleton screens)
- [ ] Add error handling (storage fetch failures, annotation save errors)
- [ ] Test full flow: read → select text → annotate → view connections → validate
- [ ] Verify fuzzy matching maintains >70% confidence across 10 test documents
- [ ] Performance audit: first paint, re-ranking speed, scroll smoothness
- [ ] Document any discovered issues in GitHub issues

**Acceptance Criteria:**

**As a reader**, I can:
- ✅ Open a processed document and see rendered markdown with syntax highlighting
- ✅ Select text and create highlights with 5 color options via hotkeys
- ✅ Add notes to highlights without modal interruption
- ✅ See my annotations persist across sessions
- ✅ View mock connections in right sidebar grouped by engine type
- ✅ Adjust engine weights with sliders and see connections re-rank in real-time
- ✅ Filter connections by strength threshold
- ✅ Validate connections with single keypress (v/r/s)
- ✅ Navigate to target chunks by clicking connection cards

**Definition of Done:**
- [ ] Phase 1 features implemented and tested (markdown rendering, annotations, sidebar)
- [ ] Weight tuning interface functional with real-time updates (<100ms)
- [ ] Connection filtering by engine type working (collapsible sections)
- [ ] Validation capture stores to localStorage (ready for DB migration)
- [ ] Mock connection dataset realistic and comprehensive (50 examples)
- [ ] Fuzzy matching maintains >70% confidence across 10 test documents
- [ ] Code reviewed and documented (JSDoc on all exported functions)
- [ ] No blocking bugs (P0/P1 issues resolved)
- [ ] Performance targets met (first paint <500ms, re-ranking <100ms)

### Future Enhancements (Phase 2 Complete - After Synthesis Integration)

**Features for Week 3-4 (After Synthesis Testing Validates Approach):**
- Keyboard navigation (vim-style: j/k scroll, g/G top/bottom)
- Annotation search with PostgreSQL full-text search
- Export annotations to JSON
- Settings persistence (font size, theme, layout preferences)
- Hotkey customization panel
- Real connection_feedback table migration from localStorage

**Nice-to-Have Improvements (Phase 3 - Polish):**
- Virtual scrolling for >10,000 line documents
- Chunk prefetching for smooth navigation (n+1, n-1)
- Annotation conflict resolution UI (for multi-device future)
- Context menu for annotations (right-click actions)
- Annotation threading (reply to annotations - discussion system)
- Markdown table of contents sidebar
- Reading progress tracking
- Focus mode (hide sidebar, dim distractions)

---

## 5. Action Items & Next Steps

### Immediate Actions (Week 1: Core Reader)

- [ ] **Create `/read/[id]` page structure**
  - **Owner**: You
  - **Dependencies**: None (all infrastructure exists)
  - **Success Criteria**: Page loads document metadata from database, renders basic layout

- [ ] **Implement markdown streaming from Storage**
  - **Owner**: You
  - **Dependencies**: Document page structure exists
  - **Success Criteria**: Signed URL fetches markdown, renders with react-markdown, first paint <500ms

- [ ] **Build Quick Capture panel for text selection**
  - **Owner**: You
  - **Dependencies**: Text selection handler working (Range API)
  - **Success Criteria**: Panel appears on selection, creates annotations via ECS

- [ ] **Implement annotation storage via ECS**
  - **Owner**: You
  - **Dependencies**: Quick Capture panel functional
  - **Success Criteria**: Annotations persist, survive re-processing with fuzzy matching >70% confidence

- [ ] **Create mock connection dataset (50 examples)**
  - **Owner**: You
  - **Dependencies**: Understanding of 7 engine types from synthesis brainstorm
  - **Success Criteria**: Realistic examples across all 7 engines, various strengths (0.3-1.0)

- [ ] **Build connection sidebar with mock data**
  - **Owner**: You
  - **Dependencies**: Mock dataset created
  - **Success Criteria**: Displays connections grouped by engine, navigates to targets on click

### Short-term Actions (Week 2: Weight Tuning)

- [ ] **Build weight tuning interface with sliders**
  - **Owner**: You
  - **Dependencies**: Connection sidebar displays mock data
  - **Success Criteria**: Sliders update weights, connections re-rank in real-time (<100ms)

- [ ] **Implement connection filtering by engine and strength**
  - **Owner**: You
  - **Dependencies**: Weight tuning working
  - **Success Criteria**: Connections grouped by engine with collapsible sections, strength slider filters

- [ ] **Add validation capture (v/r/s keys)**
  - **Owner**: You
  - **Dependencies**: Connection cards display
  - **Success Criteria**: Keypresses store to localStorage, visual feedback shown

- [ ] **Polish and test full reading flow**
  - **Owner**: You
  - **Dependencies**: All features implemented
  - **Success Criteria**: Read → Annotate → Validate connections works end-to-end, no P0/P1 bugs

### Validation Actions (Before Starting Synthesis in Week 3)

- [ ] **Test annotation resilience with document re-processing**
  - Re-process 5 documents after making edits
  - Verify annotations maintain >70% high-confidence positioning
  - Document any edge cases where fuzzy matching fails
  - Create GitHub issues for fuzzy matching improvements if needed

- [ ] **Test weight tuning impact on connection ranking**
  - Generate 50 mock connections with varying strengths
  - Adjust each engine weight from 0.1 to 1.0
  - Verify weight changes affect ranking correctly
  - Measure re-ranking performance (must be <100ms)

- [ ] **User acceptance testing (dogfooding)**
  - Read 3 full documents with annotations (real-world usage)
  - Validate 20+ mock connections to test feedback capture
  - Confirm flow state preservation (no interruptions, smooth experience)
  - Document any UX friction points for Phase 2

---

## 6. Risks & Dependencies

### Technical Risks

**Risk: Annotation positioning breaks on document re-processing**
- **Impact:** High (annotations are core feature, data loss unacceptable)
- **Probability:** Medium (fuzzy matching untested on real annotation workload at scale)
- **Mitigation Strategy:** 
  - Use existing YouTube fuzzy matching algorithm (88.52% coverage, 24 tests pass)
  - Start with 0.75 trigram threshold (validated in YouTube processing T19)
  - Store context windows (±5 words before/after) for future re-calculation
  - Show confidence badges on annotations (<0.5 = "Approximate", 0.5-0.7 = "Good", >0.7 = "Exact")
  - **Fallback**: Disable precise highlighting for <0.5 confidence, show as range instead
  - **Monitoring**: Log confidence distribution per document for quality tracking

**Risk: react-markdown insufficient for interactive annotations**
- **Impact:** Medium (may require MDX migration, 2-3 days rework)
- **Probability:** Low (custom renderers should handle highlight overlays)
- **Mitigation Strategy:**
  - Validate react-markdown with custom `mark` component in Week 1 Day 2
  - Test with complex annotations (overlapping highlights, multi-chunk selections)
  - Keep annotation data structure MDX-compatible from start (uses offsets, not DOM structure)
  - If insufficient, migrate to MDX in Week 3 (after synthesis testing)
  - **Fallback**: Use prosemirror or tiptap if MDX also insufficient (last resort)

**Risk: Weight tuning re-ranking is too slow (>100ms latency)**
- **Impact:** Medium (poor UX for synthesis testing, unusable sliders)
- **Probability:** Low (client-side re-sorting should be <100ms for <200 connections)
- **Mitigation Strategy:**
  - Pre-fetch all connections for visible chunks (no database query on weight change)
  - Re-rank client-side using JavaScript sort (O(n log n), fast for n<200)
  - Add optimistic UI updates (slider moves immediately, re-ranking happens async)
  - Use Web Workers for re-ranking if >200 connections (offload from main thread)
  - **Fallback**: Debounce weight changes to 500ms (acceptable compromise)
  - **Monitoring**: Track re-ranking time with performance.now(), log if >100ms

**Risk: Connection sidebar becomes unusable with 50+ connections/chunk**
- **Impact:** High (core synthesis testing interface, users overwhelmed)
- **Probability:** High (synthesis engines designed to generate many connections by design)
- **Mitigation Strategy:**
  - Implement connection filtering by engine type from Day 1 (Week 2)
  - Add collapsible sections per engine (default: expanded, user can collapse)
  - Show top 5 connections per engine by default, "Show more" button to expand
  - Add strength threshold slider (0.3-1.0) to hide weak connections
  - Consider pagination if >100 connections (lazy load on scroll)
  - **Fallback**: Virtual scrolling for connection list if needed

**Risk: Mock connection data doesn't represent real engine output**
- **Impact:** Medium (UI validated against unrealistic data, may need adjustments)
- **Probability:** Medium (mock data is educated guess, not real engine output)
- **Mitigation Strategy:**
  - Review synthesis brainstorm doc thoroughly to understand engine output format
  - Create 50 diverse examples covering all 7 engines and connection types
  - Include edge cases (very low strength 0.3, very high 0.99, conflicting engines)
  - Validate mock schema matches real connections table schema exactly
  - Plan for schema adjustments during Week 3 integration if needed
  - **Fallback**: Quick schema migration if real engines require different structure

### Business Risks

**Risk: Phase 1 + weight tuning insufficient for synthesis testing**
- **Impact:** High (delays synthesis work by 1 week to build Phase 2 features)
- **Probability:** Low (weight tuning is the critical feature identified in both brainstorm docs)
- **Mitigation Strategy:**
  - Validate minimum viable features with synthesis requirements after Week 1
  - If keyboard nav or export needed, add in parallel with synthesis work (Week 3-4)
  - Document any feature gaps discovered during synthesis testing in GitHub issues
  - Re-prioritize Phase 2 features based on actual synthesis testing needs
  - **Fallback**: Extend timeline by 1 week if critical features missing

**Risk: Reading experience doesn't preserve flow state**
- **Impact:** High (core design principle violated, unusable for deep reading)
- **Probability:** Low (no-modal architecture enforced, Quick Capture panel non-blocking)
- **Mitigation Strategy:**
  - Test with real 2+ hour reading sessions in Week 2 Day 7
  - Ensure all interactions are non-blocking (panels slide in, don't cover content)
  - Add keyboard shortcuts for all actions (no mouse required)
  - Implement auto-save for annotations (no explicit "Save" button needed)
  - Get user feedback after dogfooding 3 full documents
  - **Fallback**: Redesign any blocking interactions discovered during testing

### Dependencies

**Hard Dependencies (Blocking):**
- ✅ Document processing complete (6 input methods working) - DONE
- ✅ Chunks table with embeddings populated - DONE
- ✅ ECS implementation functional (`src/lib/ecs/ecs.ts`) - DONE
- ✅ Supabase Storage with markdown files - DONE
- ✅ Fuzzy matching algorithm (`worker/lib/fuzzy-matching.ts`) - DONE

**Soft Dependencies (Nice to Have):**
- ❌ Connection synthesis engines (using mock data eliminates dependency) - Week 3
- ❌ Weight tuning persistence in database (using localStorage for MVP) - Week 3
- ❌ User authentication (using dev-user-123 for MVP) - Phase 4
- ❌ Real-time collaboration (not needed for personal tool) - Never

**External Dependencies:**
- react-markdown library (stable, widely used)
- Shiki syntax highlighter (stable, maintained)
- KaTeX math rendering (stable, standard)
- Radix UI primitives (stable, used throughout app)

---

## 7. Resources & References

### Technical Documentation

**Markdown Rendering:**
- react-markdown: https://github.com/remarkjs/react-markdown
  - Custom renderers for highlight overlays
  - Component mapping for semantic HTML
- remark plugins: https://github.com/remarkjs/remark/blob/main/doc/plugins.md
  - remark-gfm for GitHub Flavored Markdown (tables, strikethrough)
  - remark-math for LaTeX equations
- rehype plugins: https://github.com/rehypejs/rehype/blob/main/doc/plugins.md
  - rehype-katex for math rendering
  - rehype-highlight for code syntax (alternative to Shiki)
- Shiki syntax highlighting: https://shiki.style/
  - VSCode-quality syntax highlighting
  - Multiple theme support
- KaTeX math rendering: https://katex.org/
  - Fast math rendering (faster than MathJax)
  - LaTeX compatibility

**Text Selection & Range API:**
- MDN Selection API: https://developer.mozilla.org/en-US/docs/Web/API/Selection
  - getSelection(), getRangeAt() for text capture
- MDN Range API: https://developer.mozilla.org/en-US/docs/Web/API/Range
  - getBoundingClientRect() for panel positioning
  - startOffset/endOffset for precise positioning
- XPath for DOM nodes: https://developer.mozilla.org/en-US/docs/Web/XPath
  - Alternative to offset-based positioning (more resilient to DOM changes)

**Fuzzy Matching (Existing Implementation):**
- `worker/lib/fuzzy-matching.ts` (365 lines, 88.52% coverage, 24 tests)
  - Trigram similarity algorithm (Jaccard index)
  - 3-tier fallback: exact → fuzzy (0.75 threshold) → approximate
  - Context window extraction (±5 words for re-calculation)
  - Confidence scoring (0.3-1.0)

### Codebase References

**Existing Infrastructure:**
- `src/lib/ecs/ecs.ts` (100 lines) - Entity-Component-System implementation
  - `ecs.createEntity()` - Create annotations
  - `ecs.query()` - Fetch annotations by document
  - `ecs.updateComponent()` - Update annotation data
- `src/components/layout/ProcessingDock.tsx` - No-modal pattern example
  - Bottom panel, collapsible, non-blocking
  - Real-time progress updates
- `worker/lib/fuzzy-matching.ts` - Annotation positioning algorithm
  - `fuzzyMatchChunkToSource()` - Main matching function
  - `generateTrigrams()` - Trigram generation
  - `calculateTrigramSimilarity()` - Jaccard similarity
- `worker/lib/youtube-cleaning.ts` - Graceful degradation pattern
  - Always returns usable result (never fails)
  - Confidence scoring for quality assessment

**Database Schema:**
- `supabase/migrations/001_initial_schema.sql` - Entities and components tables
  - entities: Basic entity records
  - components: Component data (JSONB for flexibility)
- `supabase/migrations/010_multi_format_support.sql` - Source types
  - source_type enum for routing
- `supabase/migrations/012_youtube_position_context.sql` - position_context JSONB column
  - Fuzzy matching metadata storage
  - Context windows for re-calculation

**New Migrations Needed:**
- `013_annotation_components.sql` - Add annotation component type validation
  - Component type enum or check constraint
  - Indexes for annotation queries
- `014_connection_feedback.sql` - Validation tracking table
  - User feedback on connections (validate/reject/star)
  - Rich context capture (time, mode, document)
- `015_user_synthesis_config.sql` - Weight tuning persistence
  - Engine weights JSONB
  - Preset configurations

### Design Resources

**UI Patterns (from `docs/UI_PATTERNS.md`):**
- Right Panel: `fixed right-0 top-0 bottom-0 w-96 border-l`
  - Tabs for Connections/Annotations
  - Collapsible sections per engine
- Quick Capture: `fixed bottom-20 left-1/2 -translate-x-1/2`
  - Appears on text selection
  - Color picker + note input
- No modals: Use Sheet (mobile) or inline panels only
  - Architectural requirement from APP_VISION.md
- Highlight colors: TailwindCSS color palette
  - Green: `bg-green-200/30`, Yellow: `bg-yellow-200/30`, Red: `bg-red-200/30`
  - Blue: `bg-blue-200/30`, Purple: `bg-purple-200/30`

**Component Library:**
- shadcn/ui: https://ui.shadcn.com/
  - Button, Card, Tabs, Badge, Progress, Slider, Switch
  - All components already installed (`components.json`)
- Radix UI primitives: https://www.radix-ui.com/
  - Base components for shadcn (pre-installed)
  - Excellent accessibility support
- Framer Motion animations: https://www.framer.com/motion/
  - Panel slide-in animations
  - Connection card re-sorting animations

### External Research

**Annotation Systems:**
- Hypothesis web annotations: https://web.hypothes.is/
  - Context-based anchoring (similar to our approach)
  - Fuzzy text matching for resilience
- Readwise Reader: https://readwise.io/reader
  - Highlight sync across versions
  - Position persistence strategies
- Zotero annotations: https://www.zotero.org/
  - PDF annotation persistence
  - SQLite storage for annotations

**Fuzzy Matching Algorithms:**
- Trigram similarity: https://en.wikipedia.org/wiki/Trigram
  - N-gram based string matching
  - Fast and effective for natural language
- Jaccard index: https://en.wikipedia.org/wiki/Jaccard_index
  - Set similarity measure
  - Used in our trigram implementation
- Levenshtein distance: https://en.wikipedia.org/wiki/Levenshtein_distance
  - Not used (too slow for large texts)
  - Edit distance between strings

**React Performance:**
- Virtual scrolling with react-window: https://github.com/bvaughn/react-window
  - For >10,000 line documents (Phase 3)
- Intersection Observer API: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
  - Lazy load annotations on scroll
- React Query for server state: https://tanstack.com/query/latest
  - Already using for document data

---

## 8. Session Notes & Insights

### Key Insights Discovered

1. **Fuzzy Matching Solves Annotation Resilience**
   - YouTube processing already implements exact algorithm needed (trigram similarity with context windows)
   - 88.52% test coverage validates robustness
   - Confidence scoring (0.3-1.0) enables UI adaptation (show badges, disable precision highlighting for <0.5)
   - No need to invent new positioning strategy - reuse existing, battle-tested code
   - Context windows (±5 words) enable future re-calculation if markdown changes significantly

2. **Weight Tuning is Non-Negotiable for Synthesis Testing**
   - Without it, testing requires manual SQL updates (terrible developer experience)
   - Real-time re-ranking validates synthesis engine behavior immediately
   - Synthesis config panel (from connection brainstorm) depends on this infrastructure
   - +0.3 weeks for critical feature is acceptable trade-off vs 1+ week debugging without it
   - Sliders provide intuitive interface for experimentation

3. **react-markdown Sufficient for MVP, MDX is Overkill**
   - Custom renderers handle highlight overlays (just need `mark` component)
   - Component embedding (MDX feature) not needed until advanced interactive annotations (Phase 3+)
   - Migration path exists if needed later (annotation data structure compatible - uses offsets not DOM)
   - Faster implementation (1 day vs 3 days for MDX setup with remark/rehype pipeline)

4. **Connection Filtering Prevents Synthesis UX Disaster**
   - Engines generate 50+ connections/chunk by design (store everything, filter at display)
   - Without grouping by engine type, sidebar becomes unusable scrolling nightmare
   - Collapsible sections + top 5 default = manageable UX even with 100+ connections
   - Strength threshold slider adds additional filtering dimension (hide weak connections)
   - Users need to understand which engine produced which connection (trust/validation)

5. **Phase 1 + Weight Tuning = Minimum Viable Testing Ground**
   - Keyboard navigation doesn't impact synthesis testing (quality-of-life feature)
   - Export annotations not needed until multi-device sync (Phase 4+)
   - Annotation search not needed until 100+ annotations exist (typical user has <20 initially)
   - Completing full Phase 2 delays synthesis by 0.9 weeks for zero synthesis benefit
   - Can always add deferred features in parallel with synthesis work if needed

6. **Mock-First Enables Parallel Development**
   - UI can be validated immediately without waiting 2+ weeks for engines
   - Reader polish (bug fixes, UX improvements) happens while engines are built
   - Drop-in replacement when engines ready (same connections table schema)
   - Aligns with "Ship broken things, fix when annoying" from APP_VISION.md
   - Reduces integration risk (UI tested independently, engines tested independently)

### Questions Raised (For Future Investigation)

**Annotation System:**
- How do annotations behave when markdown is heavily reformatted (e.g., AI adds 20+ headings)?
  - Test with aggressive re-processing (add headings, reorder sections)
  - Measure confidence score distribution
- Should we support annotation threads (replies to annotations)?
  - Defer to Phase 3 (discussion feature)
  - Would require UI for nested comments
- What's the UX for low-confidence annotations (<0.5)?
  - Show as approximate range (no precise highlight)
  - Badge: "Position may have shifted - click to verify"
- Can we improve fuzzy matching beyond 70% confidence?
  - Experiment with different trigram thresholds (0.70, 0.75, 0.80)
  - Try n-gram sizes (bigrams, quadgrams)

**Weight Tuning:**
- Should weight changes persist globally or per-document?
  - Start with global (simpler)
  - Consider per-document in Phase 2 if needed
- Do we need context-specific weight profiles (reading mode vs writing mode)?
  - Interesting idea from synthesis brainstorm (weight_contexts table)
  - Defer to Week 6+ (learning system Phase 2)
- Should starred connections temporarily boost engine weights?
  - Yes - synthesis brainstorm specifies 2x multiplier for 24 hours
  - Implement in Week 6 (learning system)

**Connection Display:**
- What's the optimal number of connections to show per engine by default?
  - Start with top 5, test with users
  - May need dynamic adjustment based on connection density
- Should we prefetch connections for off-screen chunks?
  - Yes - preload n+1, n-1 chunks
  - Implement in Week 2 if time permits
- Do we need a "hide connection" feature (vs just reject)?
  - Reject = never show again (strong signal)
  - Hide = temporary (for this session only)
  - Start with reject only, add hide if users request

**Performance:**
- At what document size does virtual scrolling become necessary?
  - Test with 5,000 / 10,000 / 20,000 line documents
  - Measure scroll FPS with React DevTools Profiler
  - Implement if FPS drops below 30
- Should we implement chunk-level lazy loading for annotations?
  - Query only annotations for visible chunks
  - Reduces initial load time for heavily annotated documents
- What's the performance impact of 500+ annotations on a single document?
  - Stress test with synthetic annotation data
  - May need virtualization or pagination

### Team Feedback

**Concerns Raised:**
- Annotation resilience is high-risk (fuzzy matching may fail on edge cases)
  - **Response**: Existing YouTube algorithm has 88.52% coverage, 24 passing tests
  - Confidence scoring allows graceful degradation
  - Can improve algorithm iteratively if issues found
  
- Weight tuning re-ranking performance unknown (could be >1s on large connection sets)
  - **Response**: Client-side sort is O(n log n), fast for <200 connections
  - Web Workers available if needed
  - Debounce to 500ms as fallback
  
- react-markdown may be limiting for future interactive features
  - **Response**: Annotation data structure kept MDX-compatible
  - Migration path exists (2-3 days work)
  - Can defer decision until actual limitation hit

**Risk Mitigation Decisions:**
- Use existing fuzzy matching code (88.52% coverage validates approach)
- Test weight tuning with 100+ mock connections in Week 1 Day 7
- Keep annotation data structure MDX-compatible for future migration
- Plan for schema adjustments during Week 3 integration if needed

**Process Improvements:**
- Create migration checklist for annotation positioning (context window extraction)
  - Document in `docs/ARCHITECTURE.md` under "Annotation System"
- Document weight tuning performance benchmarks for synthesis testing
  - Add performance section to synthesis brainstorm doc
- Add "test with real data" validation gate before synthesis work begins
  - Dogfooding 3 full documents in Week 2 Day 7
  - User acceptance testing checklist

---

## Next Steps

### Implementation Start (Week 1)

1. **Create feature branch**: `git checkout -b feature/document-reader-phase1`
2. **Set up reader page**: Create `src/app/read/[id]/page.tsx` with Server Component
3. **Implement markdown streaming**: Signed URLs from Supabase Storage, react-markdown rendering
4. **Build Quick Capture panel**: Use shadcn Popover as base, add color picker and note input
5. **Test annotation creation**: Verify ECS storage, fuzzy matching, position persistence

### Validation Checkpoint (End of Week 1)

- Run 10 documents through read → annotate flow
- Verify annotations persist across sessions
- Test fuzzy matching maintains >70% confidence with re-processing
- Confirm no modal interruptions during reading (flow state preserved)
- Performance check: first paint <500ms, annotation save <200ms

### Week 2 Goals

- Build weight tuning interface with live preview
- Implement connection filtering by engine
- Add validation capture (v/r/s keys)
- Create comprehensive mock connection dataset
- Polish UI and fix bugs
- Prepare for synthesis handoff (Week 3)

### Synthesis Handoff (End of Week 2)

- Document weight tuning interface API for synthesis engines
- Provide connection filtering examples (how to group by engine)
- Share validation capture data schema (connection_feedback table)
- Create handoff document with integration checklist
- Schedule synthesis engine integration kickoff (Week 3 Day 1)

---

**Session Completed**: 2025-09-28  
**Status**: ✅ Ready for Implementation  
**Next Session**: Week 3 - Connection Synthesis Engine Integration (7 Engines + Learning System)