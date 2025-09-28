# Annotation System Dogfooding Test Plan

**Test Date**: Week 2 Day 7  
**Duration**: 2 hours  
**Tester**: [Your name]  
**Build Version**: [Git commit hash]

## Test Environment Setup

- [ ] Supabase running (`npx supabase start`)
- [ ] Next.js dev server running (`npm run dev`)
- [ ] Browser DevTools open (Console + Network tabs)
- [ ] Test documents prepared (1 PDF, 1 YouTube, 1 Web article)

## Test 1: Read 3 Full Documents with Annotations

### Document 1: Technical PDF
- [ ] Upload technical paper (>20 pages, includes math/code)
- [ ] Wait for processing to complete
- [ ] Open reader view
- [ ] Markdown renders correctly (<500ms first paint)
- [ ] Math equations display properly
- [ ] Code blocks syntax highlighted

### Document 2: YouTube Video
- [ ] Submit YouTube URL (30+ minute video)
- [ ] Verify AI-cleaned transcript (no timestamps)
- [ ] Read through 5+ sections
- [ ] Verify headings added by AI
- [ ] Grammar corrections visible

### Document 3: Web Article
- [ ] Submit web article URL
- [ ] Verify Readability extraction
- [ ] Images display inline
- [ ] Article structure preserved

**Success Criteria**: All 3 documents render correctly without blocking errors

## Test 2: Create 10+ Annotations with Different Colors and Notes

### Color Highlighting Tests
- [ ] Select text, press `g` → Green highlight appears
- [ ] Select text, press `y` → Yellow highlight appears
- [ ] Select text, press `r` → Red highlight appears
- [ ] Select text, press `b` → Blue highlight appears
- [ ] Select text, press `p` → Purple highlight appears
- [ ] Verify highlights persist after browser refresh

### Note Annotations Tests
- [ ] Select text, add note in Quick Capture panel
- [ ] Verify note saves on blur (<200ms)
- [ ] Hover over highlight → note displays in tooltip
- [ ] Edit note → verify update persists
- [ ] Delete annotation → verify removal

**Success Criteria**: 10+ annotations created, all colors functional, notes persist

## Test 3: Validate 20+ Mock Connections

### Connection Validation Tests
- [ ] Open right panel → Connections tab
- [ ] Verify 50 mock connections loaded
- [ ] Click connection card → navigates to target chunk
- [ ] Press `v` on connection → "Connection validated" toast appears
- [ ] Press `r` on connection → "Connection rejected" toast appears
- [ ] Press `s` on connection → "Connection starred" toast appears
- [ ] Verify feedback stored to localStorage

**Success Criteria**: 20+ connections validated, navigation works, feedback captured

## Test 4: Weight Tuning Interface

### Slider Adjustment Tests
- [ ] Adjust semantic weight 0.5 → 0.8 → connections re-rank <100ms
- [ ] Adjust thematic weight 0.5 → 0.2 → connections re-rank <100ms
- [ ] Adjust all 7 engine weights simultaneously
- [ ] Verify visual feedback (cards animate with spring physics)
- [ ] Check DevTools console for performance warnings

### Preset Tests
- [ ] Click "Max Friction" preset → weights update correctly
- [ ] Verify connections re-rank with contradiction emphasis
- [ ] Click "Thematic Focus" → verify thematic connections prioritized
- [ ] Click "Balanced" → all weights 0.5
- [ ] Click "Chaos" → all weights 0.8

**Success Criteria**: All presets apply correctly, re-ranking <100ms, smooth animations

## Test 5: Connection Filtering

### Engine Toggle Tests
- [ ] Disable semantic engine → semantic connections hidden
- [ ] Disable thematic engine → thematic connections hidden
- [ ] Disable all engines → empty state displays
- [ ] Re-enable engines → connections reappear
- [ ] Verify collapsible sections work per engine

### Strength Threshold Tests
- [ ] Set threshold to 0.8 → weak connections hidden
- [ ] Set threshold to 0.3 → all connections visible
- [ ] Adjust slider gradually → connections filter in real-time
- [ ] Verify smooth animations during filtering

**Success Criteria**: Filtering instant (<50ms), empty state helpful, animations smooth

## Test 6: Keyboard Shortcuts

### Hotkey Tests
- [ ] Press `g` during text selection → green highlight
- [ ] Press `y` during text selection → yellow highlight
- [ ] Press `?` → keyboard shortcuts help panel opens
- [ ] Press `Escape` → closes help panel
- [ ] Press `Escape` → closes Quick Capture panel
- [ ] Verify `v/r/s` keys work on active connection

**Success Criteria**: All hotkeys functional, help panel comprehensive

## Test 7: Flow State Validation

### No-Modal Architecture Test
- [ ] Complete all tests above
- [ ] Confirm NO modal dialogs appeared (zero)
- [ ] All panels are non-blocking (can still read behind them)
- [ ] Quick Capture panel positioned near selection (not center screen)
- [ ] Right panel collapsible (doesn't force reading narrow column)

**Success Criteria**: Zero modal interruptions, flow state preserved throughout testing

## Test 8: Performance Validation

### Timing Measurements
- [ ] First paint time: _____ ms (target: <500ms)
- [ ] Annotation save time: _____ ms (target: <200ms)
- [ ] Weight re-ranking time: _____ ms (target: <100ms)
- [ ] Fuzzy matching confidence: _____ % high (target: >70%)

**Measure with**:
- DevTools Performance tab for first paint
- Console.log timestamps for save time
- Console.log timestamps for re-ranking
- Run `npm run benchmark:annotations` for automated measurements

**Success Criteria**: All performance targets met

## Bug Reporting Template

### P0 - Blocking (Cannot Complete Testing)
- **Issue**: [Description]
- **Steps to Reproduce**: [1, 2, 3]
- **Expected**: [Behavior]
- **Actual**: [Behavior]
- **Screenshot**: [Attach]

### P1 - High (Functionality Broken)
- **Issue**: [Description]
- **Steps to Reproduce**: [1, 2, 3]
- **Workaround**: [If any]

### P2 - Medium (UX Issue)
- **Issue**: [Description]
- **Suggestion**: [Improvement]

## Final Sign-Off

- [ ] All tests completed
- [ ] No P0/P1 blocking bugs
- [ ] Performance targets met
- [ ] Flow state preserved
- [ ] Ready for user testing

**Tester Signature**: _______________  
**Date**: _______________  
**Overall Assessment**: _______________

## Notes Section

Use this section to capture observations, insights, or suggestions discovered during testing:

---

### Positive Observations
- 

### Areas for Improvement
- 

### Feature Suggestions
- 

### Accessibility Notes
-