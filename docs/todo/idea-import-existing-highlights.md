## Readwise → Rhizome Import Strategy

Yes, absolutely doable. This is actually critical for Rhizome's value - liberating your existing annotation graph from its silo.

### Readwise Reader API

Readwise has a solid API that returns:
- Highlight text
- Note/annotation 
- Location (sometimes percentage, sometimes location number)
- Tags
- Highlighted date
- Book metadata

**The problem**: Location data is inconsistent and doesn't map cleanly to your chunked text.

### The Fuzzy Matching Solution

**Step 1: Import Source Text**
- Upload Gravity's Rainbow to Rhizome
- Chunks get created with positions

**Step 2: Export from Readwise**
```json
{
  "text": "You never did the Kenosha Kid",
  "note": "Opening line variations = paranoid reading",
  "location": 127,
  "percentage": 0.02,
  "tags": ["paranoia", "repetition"],
  "highlighted_at": "2024-03-15"
}
```

**Step 3: Fuzzy Match Pipeline**

```python
For each highlight:
1. Clean the highlight text (normalize whitespace, punctuation)
2. Search for exact match first
3. If no exact match, fuzzy search:
   - Sliding window across chunks
   - Calculate similarity score (Levenshtein distance)
   - Account for OCR errors, edition differences
4. If match confidence > 80%:
   - Attach as annotation
   - Preserve original Readwise note
   - Add "imported" tag with confidence score
5. If match uncertain:
   - Create "orphan annotation" entity
   - Will attempt re-matching as more text added
```

### The Smart Approach: Contextual Matching

**Use surrounding context** for better matching:
- Export highlights with expanded context (Readwise supports this)
- Match on larger text segments
- Use multiple highlights as anchor points

**Example**:
```json
{
  "text": "the Kenosha Kid",
  "context_before": "You never did",
  "context_after": "which is a",
  "full_context": "You never did the Kenosha Kid, which is a..."
}
```

### Edition/Format Challenges

**Common Issues**:
- Different editions (pagination changes)
- PDF vs EPUB (formatting differences)  
- OCR errors in scanned texts

**Solution: Multi-pass matching**:
1. Try exact match
2. Try normalized match (strip punctuation/spacing)
3. Try phonetic match (for OCR errors)
4. Try semantic match (embed and find closest vector)

### Implementation Sketch

```javascript
// Import pipeline
async function importReadwiseHighlights(bookTitle, highlights) {
  const document = await findDocument(bookTitle);
  const chunks = await getDocumentChunks(document.id);
  
  for (const highlight of highlights) {
    // Try exact match
    let match = findExactMatch(highlight.text, chunks);
    
    // Fuzzy fallback
    if (!match) {
      match = fuzzyMatch(highlight.text, chunks, {
        threshold: 0.8,
        useContext: true,
        contextWindow: 50
      });
    }
    
    // Semantic fallback
    if (!match) {
      const embedding = await embed(highlight.text);
      match = findNearestChunk(embedding, chunks, 0.9);
    }
    
    if (match) {
      createAnnotation({
        chunkId: match.chunkId,
        text: highlight.text,
        note: highlight.note,
        tags: [...highlight.tags, 'readwise-import'],
        confidence: match.confidence,
        originalLocation: highlight.location
      });
    } else {
      // Create orphan for manual review
      createOrphanAnnotation(highlight);
    }
  }
}
```

### The Pynchon-Specific Challenge

Gravity's Rainbow is particularly tricky:
- Dense prose with long sentences
- Multiple editions with different pagination
- Lots of mathematical/technical passages that OCR mangles

**Special handling**:
- Use character names as anchor points ("Slothrop", "Roger Mexico")
- Section breaks as waypoints
- Famous passages ("A screaming comes across the sky") as calibration

### Manual Review Interface

For uncertain matches:
```
┌─────────────────────────────────────┐
│ Review Orphan Annotations (23)      │
├─────────────────────────────────────┤
│ "the Kenosha Kid" (87% match)      │
│ [Show in context] [Accept] [Find]  │
│                                     │
│ "They're in love. Fuck the war."   │
│ No match found                     │
│ [Search manually] [Skip]           │
└─────────────────────────────────────┘
```

### The Beautiful Part

Once imported, your Readwise highlights become:
- Full ECS entities
- Participate in collision detection
- Can spark new connections
- Maintain their original context AND gain Rhizome context

Your years of GR marginalia suddenly become active participants in the knowledge graph, colliding with your Deleuze notes, your technical writings, everything.

**Pro tip**: Start with your most annotated books first. They'll create the densest initial network for new documents to connect into.