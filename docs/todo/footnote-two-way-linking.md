# Footnote Two-Way Linking Implementation Plan

**Status**: Ready for Implementation
**Priority**: High (Enhances Reading Experience)
**Risk**: Low (No Breaking Changes to Offsets/Annotations)
**Effort**: ~4-6 hours

---

## 🎯 Objective

Implement proper footnote rendering with two-way navigation (click reference → scroll to definition, click back arrow → return to reference) with smooth scrolling and visual feedback.

---

## 🐛 Current Problem

**Root Cause**: `marked.js` doesn't support GitHub-style footnotes.

**Current Behavior**:
```typescript
Input:  "Text[^1].\n\n[^1]: Note content."
Output: "<p>Text[^1].</p><p>[^1]: Note content.</p>"
```

Footnotes render as literal text with no links or superscripts.

**Expected Behavior**:
- Reference: `Text¹` (clickable superscript)
- Definition: Formatted footnote section with back-link ↩
- Click reference → smooth scroll to definition (with highlight)
- Click back arrow → smooth scroll to reference (with highlight)

---

## ✅ Safety Analysis

### Annotation System Impact: **SAFE** ✅

**Why annotations won't break:**

1. **Offsets track markdown positions, not HTML positions**
   ```typescript
   // block-parser.ts:52-53
   const raw = token.raw
   const endOffset = offset + raw.length  // ← Uses markdown length!
   ```

2. **Annotation injection uses block-relative offsets**
   ```typescript
   // inject.ts:72-76
   const relativeStart = Math.max(0, annotation.startOffset - blockStartOffset)
   const relativeEnd = Math.min(...)
   ```

3. **HTML structure changes don't affect offset tracking**
   - Marked: `[^1]` → `<p>[^1]</p>` (10 chars HTML, 4 chars in markdown)
   - Remark: `[^1]` → `<sup><a href="#fn-1">1</a></sup>` (29 chars HTML, **still 4 chars in markdown**)
   - Block offset calculation: Uses `token.raw.length` (markdown), not `html.length`

4. **Text content extraction** (for annotation traversal)
   ```typescript
   // inject.ts:126
   const textContent = node.textContent || ''
   // This extracts plain text, stripping all HTML tags
   // "Text¹" extracts as "Text1" - text node length matches markdown
   ```

**Verification Needed**: Test with a footnote-heavy document to confirm offset calculations stay accurate.

---

### Chunking System Impact: **SAFE** ✅

- Chunks are created from markdown content, not HTML
- Chunk offsets: `start_offset`, `end_offset` refer to markdown positions
- Block-to-chunk mapping: Uses offset ranges, HTML structure irrelevant

---

### Zustand Stores Impact: **NO CHANGES NEEDED** ✅

**ReaderStore** (`stores/reader-store.ts`):
- Stores: `markdownContent`, `chunks`, `scrollPosition`, `viewportOffsets`
- No markdown parsing logic - pure state management
- **Action Required**: None

**AnnotationStore**:
- Stores annotations with offset positions
- Works on markdown offsets, not HTML
- **Action Required**: None

**UIStore**:
- Visual state only (sidebar, panels, etc.)
- **Action Required**: None

---

## 📋 Implementation Plan

### Phase 1: Switch Markdown Parser (Core Change)

**File**: `src/lib/reader/block-parser.ts`

**Changes Required**:

1. **Install dependencies**:
   ```bash
   npm install unified remark-parse remark-rehype rehype-stringify
   ```
   Note: `remark-gfm` already installed ✅

2. **Replace marked with remark pipeline**:
   ```typescript
   // BEFORE (lines 1, 36, 64-71)
   import { marked } from 'marked'
   const tokens = marked.lexer(markdown)
   html = marked.parse(raw, { async: false, smartypants: true })

   // AFTER
   import { unified } from 'unified'
   import remarkParse from 'remark-parse'
   import remarkGfm from 'remark-gfm'
   import remarkRehype from 'remark-rehype'
   import rehypeStringify from 'rehype-stringify'
   import remarkMath from 'remark-math'  // Already installed
   import rehypeKatex from 'rehype-katex'  // Already installed

   // Create processor (reuse for all blocks for performance)
   const processor = unified()
     .use(remarkParse)
     .use(remarkGfm)        // Enables footnotes + tables + strikethrough
     .use(remarkMath)       // Math support (existing)
     .use(remarkRehype)     // markdown → HTML AST
     .use(rehypeKatex)      // Render math (existing)
     .use(rehypeStringify)  // HTML AST → string

   // In parseMarkdownToBlocks:
   // Option 1: Parse entire document once (better performance)
   const tree = processor.parse(markdown)
   const tokens = getTokensFromTree(tree)

   // Option 2: Parse each block separately (simpler migration)
   const result = await processor.process(raw)
   html = String(result)
   ```

3. **Handle async processing**:
   - Remark is async by default
   - Options:
     - Make `parseMarkdownToBlocks` async (changes VirtualizedReader.tsx:94)
     - Use `processSync()` if available
     - Parse entire document upfront, extract blocks from AST

4. **Preserve offset tracking**:
   ```typescript
   // Remark provides position info in AST nodes
   for (const token of tokens) {
     const raw = getRawFromToken(token)  // Extract markdown source
     const endOffset = offset + raw.length
     // ... rest stays the same
   }
   ```

**Testing Checklist**:
- [ ] Footnotes render as superscripts with links
- [ ] Footnote definitions render in proper section
- [ ] Annotations still highlight correctly
- [ ] Chunk boundaries align correctly
- [ ] Math equations still render (KaTeX)
- [ ] Tables render correctly (GFM)
- [ ] Offset calculations match pre-change values

---

### Phase 2: Add Footnote Click Handlers (Enhancement)

**File**: `src/components/reader/BlockRenderer.tsx`

**Changes**:

1. **Intercept footnote link clicks** (lines 85-97, expand `handleClick`):
   ```typescript
   const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
     // Existing annotation logic...
     if (onAnnotationClick) {
       const target = e.target as HTMLElement
       const annotationSpan = target.closest('[data-annotation-id]')
       if (annotationSpan) {
         // ... existing code
         return  // Don't process footnotes if annotation clicked
       }
     }

     // NEW: Handle footnote navigation
     const target = e.target as HTMLElement
     const footnoteLink = target.closest('a[href^="#fn"]')

     if (footnoteLink) {
       e.preventDefault()
       const href = footnoteLink.getAttribute('href')
       if (!href) return

       const targetId = href.slice(1)  // Remove '#'
       const targetElement = document.getElementById(targetId)

       if (targetElement) {
         // Smooth scroll to target
         targetElement.scrollIntoView({
           behavior: 'smooth',
           block: 'center'  // Center in viewport
         })

         // Add temporary highlight for visibility
         targetElement.classList.add('footnote-highlight')
         setTimeout(() => {
           targetElement.classList.remove('footnote-highlight')
         }, 1500)
       }
     }
   }
   ```

2. **Handle virtualized scrolling edge case**:
   - react-virtuoso may not have rendered the target element yet
   - Need to:
     1. Find target block index from href
     2. Use `virtuosoRef.scrollToIndex()` if target not in DOM
     3. Then scroll to element once rendered

**Implementation Note**: This requires passing `virtuosoRef` from VirtualizedReader to BlockRenderer, or using a different approach (e.g., event bus via Zustand).

**Simpler Approach**:
- Handle footnote clicks in VirtualizedReader instead
- Use event delegation on the Virtuoso container
- Access virtuosoRef directly

---

### Phase 3: Style Footnotes (Visual Polish)

**File**: `src/app/globals.css` (or new `src/styles/footnotes.css`)

**Styles**:

```css
/* Footnote references (superscript numbers) */
sup {
  font-size: 0.75em;
  line-height: 0;
  position: relative;
  vertical-align: baseline;
  top: -0.5em;
}

sup a[href^="#fn"] {
  text-decoration: none;
  color: rgb(59, 130, 246); /* blue-500 */
  font-weight: 600;
  padding: 0 2px;
  border-radius: 2px;
  transition: background-color 0.2s;
}

sup a[href^="#fn"]:hover {
  background-color: rgba(59, 130, 246, 0.1);
  text-decoration: underline;
}

/* Footnote definitions section */
section[data-footnotes] {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 2px solid rgba(0, 0, 0, 0.1);
  font-size: 0.875rem;
  color: rgb(115, 115, 115); /* gray-500 */
}

.dark section[data-footnotes] {
  border-top-color: rgba(255, 255, 255, 0.1);
  color: rgb(163, 163, 163); /* gray-400 */
}

section[data-footnotes] h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: rgb(64, 64, 64); /* gray-700 */
}

.dark section[data-footnotes] h2 {
  color: rgb(212, 212, 212); /* gray-300 */
}

section[data-footnotes] ol {
  list-style: none;
  counter-reset: footnote-counter;
  padding-left: 0;
}

section[data-footnotes] li {
  counter-increment: footnote-counter;
  position: relative;
  padding-left: 2rem;
  margin-bottom: 0.75rem;
}

section[data-footnotes] li::before {
  content: counter(footnote-counter) ".";
  position: absolute;
  left: 0;
  font-weight: 600;
  color: rgb(59, 130, 246); /* blue-500 */
}

/* Back-to-reference links */
a[data-footnote-backref],
a[href^="#fnref"] {
  margin-left: 0.5rem;
  text-decoration: none;
  color: rgb(59, 130, 246); /* blue-500 */
  font-size: 0.875rem;
  transition: transform 0.2s;
  display: inline-block;
}

a[data-footnote-backref]:hover,
a[href^="#fnref"]:hover {
  transform: translateX(-2px);
}

/* Highlight animation for scroll targets */
.footnote-highlight {
  animation: footnote-pulse 1.5s ease-out;
}

@keyframes footnote-pulse {
  0%, 100% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(59, 130, 246, 0.2);
  }
}

/* Ensure footnotes are readable in both themes */
.dark section[data-footnotes] a {
  color: rgb(96, 165, 250); /* blue-400 for dark mode */
}
```

**Testing Checklist**:
- [ ] Superscripts are properly sized and positioned
- [ ] Hover states work for footnote links
- [ ] Footnote section has clear visual separation
- [ ] Highlight animation shows scroll target clearly
- [ ] Dark mode styles look good
- [ ] Mobile responsiveness works

---

### Phase 4: Handle Edge Cases

**Virtuoso Scrolling**:
- Target element may not be rendered yet (virtual scrolling)
- Solution: Check if element exists, if not, use `scrollToIndex`
- Need to map footnote IDs to block indices

**Multiple Documents**:
- Footnote IDs are document-scoped (should be unique per document)
- No conflicts expected since VirtualizedReader loads one document at a time

**Annotation Overlap**:
- Footnote superscripts may get annotation spans injected
- Test: Annotating text that contains `[^1]`
- Expected: Should work fine (span wraps the "1" text node)

**Long Documents**:
- Footnotes at bottom of 500-page book
- Virtuoso should handle this with `scrollToIndex`
- May need loading indicator during scroll

---

## 🧪 Testing Strategy

### Unit Tests

**File**: `src/lib/reader/__tests__/block-parser.test.ts`

```typescript
describe('block-parser with remark-gfm', () => {
  it('parses footnotes correctly', () => {
    const markdown = 'Text[^1].\n\n[^1]: Note.'
    const blocks = parseMarkdownToBlocks(markdown, [])

    // Check that footnote reference is in first block
    expect(blocks[0].html).toContain('<sup>')
    expect(blocks[0].html).toContain('href="#fn-1"')

    // Check that footnote definition is in separate block
    const footnoteBlock = blocks.find(b => b.html.includes('data-footnotes'))
    expect(footnoteBlock).toBeDefined()
    expect(footnoteBlock.html).toContain('href="#fnref-1"')
  })

  it('preserves offset calculations with footnotes', () => {
    const markdown = 'Line 1[^1].\n\nLine 2.\n\n[^1]: Note.'
    const blocks = parseMarkdownToBlocks(markdown, [])

    // Verify offsets point to correct positions in markdown
    expect(blocks[0].startOffset).toBe(0)
    expect(blocks[0].endOffset).toBe(12)  // "Line 1[^1].\n"
    expect(blocks[1].startOffset).toBe(13)  // "\nLine 2.\n"
  })
})
```

### Integration Tests

**File**: `src/components/reader/__tests__/VirtualizedReader.test.tsx`

```typescript
describe('Footnote Navigation', () => {
  it('scrolls to footnote definition on click', async () => {
    const { container } = render(<VirtualizedReader />)

    // Click footnote reference
    const footnoteRef = container.querySelector('sup a[href="#fn-1"]')
    fireEvent.click(footnoteRef!)

    // Wait for scroll
    await waitFor(() => {
      const footnoteEl = document.getElementById('fn-1')
      expect(footnoteEl).toHaveClass('footnote-highlight')
    })
  })

  it('scrolls back to reference on back-link click', async () => {
    // Similar test for ↩ click
  })
})
```

### Manual Testing Checklist

**Test Document**: Create `test-footnotes.md` with:
- Multiple footnotes in same paragraph
- Footnotes across multiple chunks
- Long footnote content
- Nested formatting in footnotes (`**bold**[^1]`)

**Test Scenarios**:
1. [ ] Click footnote ref → scrolls to definition
2. [ ] Click back arrow → returns to reference
3. [ ] Highlight animation appears on target
4. [ ] Works with annotations present
5. [ ] Works in virtualized scrolling (far distances)
6. [ ] Multiple clicks work correctly
7. [ ] Dark mode looks good
8. [ ] Mobile touch targets work

---

## 🚀 Deployment Plan

### Rollout Strategy

**Phase 1**: Internal Testing (This Branch)
- Implement all changes
- Test with multiple documents
- Verify annotations still work

**Phase 2**: Dogfooding (Merge to Main)
- Use in daily reading for 1 week
- Identify edge cases
- Refine scroll behavior

**Phase 3**: Production
- Already in production (personal tool, no users)

---

## 📊 Success Metrics

**Functional**:
- [ ] Footnotes render with proper HTML structure
- [ ] Click navigation works 100% of the time
- [ ] No annotation offset bugs
- [ ] No performance regressions

**User Experience**:
- [ ] Smooth scrolling feels natural
- [ ] Highlight flash is noticeable but not jarring
- [ ] Footnote section is visually distinct
- [ ] Mobile experience is smooth

---

## ⚠️ Risks & Mitigation

### Risk 1: Async Processing Breaks VirtualizedReader

**Probability**: Medium
**Impact**: High

**Mitigation**:
- Option A: Make `parseMarkdownToBlocks` async, update VirtualizedReader useMemo
- Option B: Use `processSync()` if available in unified
- Option C: Parse document upfront in server component, pass blocks as props

**Preferred**: Option A (cleanest architecture)

### Risk 2: Offset Calculations Break Annotations

**Probability**: Low
**Impact**: Critical

**Mitigation**:
- Comprehensive offset tests before merging
- Test with real documents (Gravity's Rainbow has footnotes)
- Keep marked.js branch available for quick rollback

### Risk 3: Virtual Scrolling Edge Cases

**Probability**: Medium
**Impact**: Low (UX issue, not data loss)

**Mitigation**:
- Test with documents >100 footnotes
- Add fallback: if target not found after 500ms, show toast
- Consider adding "Footnote" label to target highlight

---

## 🔄 Rollback Plan

**If critical bugs found**:

1. **Immediate**: Revert commit, push to main
2. **Short-term**: Keep branch for investigation
3. **Long-term**: Fix issues, re-test, re-deploy

**Rollback Triggers**:
- Annotations broken (offsets misaligned)
- App crashes on footnote-heavy documents
- Virtual scrolling infinite loops

---

## 📚 References

### Documentation
- [remark-gfm footnotes](https://github.com/remarkjs/remark-gfm#footnotes)
- [unified processing](https://unifiedjs.com/learn/guide/introduction-to-unified/)
- [react-virtuoso scrollToIndex](https://virtuoso.dev/scroll-to-index/)

### Related Files
- `src/lib/reader/block-parser.ts` - Main implementation
- `src/components/reader/BlockRenderer.tsx` - Click handling
- `src/components/reader/VirtualizedReader.tsx` - Virtuoso integration
- `src/lib/annotations/inject.ts` - Annotation system (unchanged)
- `src/stores/reader-store.ts` - State management (unchanged)

### Testing Resources
- `worker/lib/prompts/markdown-cleanup.ts` - Footnote preservation (already fixed)
- Real documents with footnotes: Gravity's Rainbow, academic papers

---

## ✅ Definition of Done

- [ ] All tests pass (unit + integration)
- [ ] Manual testing checklist complete
- [ ] Documentation updated (this file)
- [ ] Code reviewed (self-review sufficient for personal tool)
- [ ] Deployed to main branch
- [ ] Used in daily reading for 1 week without issues

---

## 🎯 Next Steps

1. **Immediate**: Review this plan with yourself (the user)
2. **Phase 1**: Implement parser switch, test offsets
3. **Phase 2**: Add click handlers, test navigation
4. **Phase 3**: Polish styles, dark mode
5. **Deploy**: Merge to main, dogfood for a week

**Estimated Time**: 4-6 hours total
- Parser switch: 2-3 hours
- Click handlers: 1-2 hours
- Styling: 1 hour
- Testing: Ongoing

---

**Last Updated**: 2025-01-13
**Author**: Claude Code
**Status**: Ready for Implementation
