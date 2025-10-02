# AI Chunking

## What's Changing

**Current approach:** Local code splits markdown into paragraphs, AI just adds metadata
**New approach:** AI identifies semantic chunk boundaries AND extracts metadata in one pass

This aligns with the vision of "complete thought units" but costs ~2x more tokens in the metadata step (~$0.20 → ~$0.40 per book).

## Core Changes Required

### 1. Batch Strategy Changes

**Old concept:**
```typescript
// Batch = pre-chunked content with known boundaries
{
  content: "chunk1\n\nchunk2\n\nchunk3",
  chunks: [
    { start: 0, end: 500 },
    { start: 502, end: 1200 },
    { start: 1202, end: 1800 }
  ]
}
```

**New concept:**
```typescript
// Batch = window of text, AI identifies chunk boundaries
{
  content: "...", // 100K characters
  startOffset: 0, // Absolute position in full document
  endOffset: 100000
}
// AI returns: chunks with relative offsets + where to continue
```

### 2. Modified `createBatches()` Function

Replace the current `createBatches()` with this simpler version:

```typescript
function createBatches(markdown: string, maxBatchSize: number): MetadataExtractionBatch[] {
  const batches: MetadataExtractionBatch[] = []
  const OVERLAP_SIZE = 2000 // 2K character overlap to avoid losing chunks at boundaries
  
  let position = 0
  let batchIndex = 0
  
  while (position < markdown.length) {
    const endPosition = Math.min(position + maxBatchSize, markdown.length)
    const content = markdown.substring(position, endPosition)
    
    batches.push({
      batchId: `batch-${batchIndex}`,
      content: content,
      startOffset: position,
      endOffset: endPosition,
      chunks: [] // No longer used - AI will identify chunks
    })
    
    // Move to next batch with overlap (unless we're at the end)
    if (endPosition < markdown.length) {
      position = endPosition - OVERLAP_SIZE
    } else {
      break
    }
    
    batchIndex++
  }
  
  console.log(`[AI Metadata] Created ${batches.length} batches with ${OVERLAP_SIZE} char overlap`)
  return batches
}
```

**Key differences:**
- No paragraph splitting
- Simple windowing with 2K overlap
- `chunks` array is empty (AI will populate)
- Overlap prevents chunks from being split across batch boundaries

### 3. Update Return Type

Change the final return type to include offsets:

```typescript
// OLD
export async function batchChunkAndExtractMetadata(
  markdown: string,
  config: BatchMetadataConfig = {},
  onProgress?: (progress: MetadataExtractionProgress) => void | Promise<void>
): Promise<Array<{ content: string; metadata: AIChunkMetadata }>>

// NEW
export async function batchChunkAndExtractMetadata(
  markdown: string,
  config: BatchMetadataConfig = {},
  onProgress?: (progress: MetadataExtractionProgress) => void | Promise<void>
): Promise<Array<{
  content: string;
  start_offset: number;  // Absolute position in full document
  end_offset: number;
  chunk_index: number;
  metadata: AIChunkMetadata;
}>>
```

### 4. New AI Prompt (Semantic Chunking)

Replace `generateMetadataExtractionPrompt()`:

```typescript
function generateMetadataExtractionPrompt(batch: MetadataExtractionBatch): string {
  return `Analyze this document section and identify semantic chunks.

A semantic chunk is a COMPLETE UNIT OF THOUGHT (300-500 words typically):
- May span multiple paragraphs if they form one coherent idea
- May split a long paragraph if it covers multiple distinct ideas
- Should feel like a natural "node" in a knowledge graph

For each chunk you identify, extract:

1. **content**: The exact text of this chunk (verbatim from the document)
2. **start_offset**: Character position where chunk starts (relative to provided text, starting at 0)
3. **end_offset**: Character position where chunk ends (relative to provided text)
4. **themes**: 2-5 key themes/topics (e.g., ["authentication", "security"])
5. **concepts**: 5-10 specific concepts with importance scores
   - Format: [{"text": "JWT tokens", "importance": 0.8}, {"text": "OAuth2", "importance": 0.6}]
   - Importance: 0.0-1.0 representing how central each concept is to this chunk
   - Be specific - these drive cross-domain connections
6. **importance**: 0.0-1.0 score for how significant this chunk is to the overall document
7. **summary**: One-sentence summary of what this chunk covers
8. **domain**: Domain classification (technical, narrative, academic, business, etc.)
9. **emotional**: Emotional metadata for contradiction detection
   - **polarity**: -1.0 (very negative) to +1.0 (very positive)
   - **primaryEmotion**: joy, fear, anger, sadness, surprise, neutral, etc.
   - **intensity**: 0.0-1.0 (how strongly the emotion is expressed)

CRITICAL REQUIREMENTS:
- Identify chunk boundaries based on semantic completeness, not paragraph breaks
- Target 300-500 words per chunk (can vary if semantically necessary)
- Return chunks in sequential order
- start_offset and end_offset must be accurate character positions
- content must be exact text from document (verbatim)
- Emotional polarity is CRITICAL for detecting contradictions

Return JSON in this exact format:
{
  "chunks": [
    {
      "content": "The exact text of the chunk...",
      "start_offset": 0,
      "end_offset": 1847,
      "themes": ["theme1", "theme2"],
      "concepts": [
        {"text": "specific concept", "importance": 0.9},
        {"text": "another concept", "importance": 0.7}
      ],
      "importance": 0.8,
      "summary": "Brief summary of chunk",
      "domain": "technical",
      "emotional": {
        "polarity": 0.3,
        "primaryEmotion": "neutral",
        "intensity": 0.4
      }
    }
  ]
}

DOCUMENT SECTION (this text starts at character ${batch.startOffset} in the full document):
${batch.content}

Identify complete semantic chunks with accurate offsets.`
}
```

### 5. Update Response Schema

```typescript
async function callGeminiForMetadata(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string
): Promise<Array<{
  content: string;
  start_offset: number;
  end_offset: number;
  metadata: AIChunkMetadata;
}>> {
  const prompt = generateMetadataExtractionPrompt(batch)

  const result = await geminiClient.models.generateContent({
    model: modelName,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          chunks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING },
                start_offset: { type: Type.NUMBER },
                end_offset: { type: Type.NUMBER },
                themes: { type: Type.ARRAY, items: { type: Type.STRING } },
                concepts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      importance: { type: Type.NUMBER }
                    },
                    required: ['text', 'importance']
                  }
                },
                importance: { type: Type.NUMBER },
                summary: { type: Type.STRING },
                domain: { type: Type.STRING },
                emotional: {
                  type: Type.OBJECT,
                  properties: {
                    polarity: { type: Type.NUMBER },
                    primaryEmotion: { type: Type.STRING },
                    intensity: { type: Type.NUMBER }
                  },
                  required: ['polarity', 'primaryEmotion', 'intensity']
                }
              },
              required: [
                'content',
                'start_offset', 
                'end_offset',
                'themes',
                'concepts',
                'importance',
                'emotional'
              ]
            }
          }
        },
        required: ['chunks']
      }
    } as any
  })

  const text = result.text || ''
  if (!text) {
    throw new Error('Empty response from Gemini API')
  }

  return parseMetadataResponse(text, batch)
}
```

### 6. Updated Parsing Logic

Replace `parseMetadataResponse()` to handle new structure:

```typescript
function parseMetadataResponse(
  responseText: string,
  batch: MetadataExtractionBatch
): Array<{
  content: string;
  start_offset: number;
  end_offset: number;
  metadata: AIChunkMetadata;
}> {
  try {
    const parsed = JSON.parse(responseText.trim())

    if (!parsed.chunks || !Array.isArray(parsed.chunks)) {
      throw new Error('Invalid response structure: missing chunks array')
    }

    console.log(`[AI Metadata] Batch ${batch.batchId}: AI identified ${parsed.chunks.length} semantic chunks`)

    // Validate and convert to absolute offsets
    const validated = parsed.chunks.map((chunk: any, index: number) => {
      // Validate required fields
      if (!chunk.content || typeof chunk.content !== 'string') {
        throw new Error(`Chunk ${index}: Missing or invalid content`)
      }

      if (typeof chunk.start_offset !== 'number' || typeof chunk.end_offset !== 'number') {
        throw new Error(`Chunk ${index}: Missing or invalid offsets`)
      }

      // Convert relative offsets to absolute offsets
      const absoluteStart = batch.startOffset + chunk.start_offset
      const absoluteEnd = batch.startOffset + chunk.end_offset

      // Validate offset logic
      if (absoluteStart >= absoluteEnd) {
        console.warn(`[AI Metadata] Chunk ${index}: Invalid offsets (${absoluteStart} >= ${absoluteEnd}), using content length`)
      }

      // Validate themes
      if (!chunk.themes || !Array.isArray(chunk.themes) || chunk.themes.length === 0) {
        console.warn(`[AI Metadata] Chunk ${index}: Missing themes, defaulting to ['general']`)
        chunk.themes = ['general']
      }

      // Validate concepts
      if (!chunk.concepts || !Array.isArray(chunk.concepts) || chunk.concepts.length === 0) {
        console.warn(`[AI Metadata] Chunk ${index}: Missing concepts, defaulting to empty array`)
        chunk.concepts = []
      } else {
        chunk.concepts = chunk.concepts.map((c: any) => ({
          text: c.text || 'unknown',
          importance: typeof c.importance === 'number' 
            ? Math.max(0, Math.min(1, c.importance)) 
            : 0.5
        }))
      }

      // Validate importance
      if (typeof chunk.importance !== 'number' || chunk.importance < 0 || chunk.importance > 1) {
        console.warn(`[AI Metadata] Chunk ${index}: Invalid importance, defaulting to 0.5`)
        chunk.importance = 0.5
      }

      // Validate emotional metadata
      if (!chunk.emotional || typeof chunk.emotional !== 'object') {
        console.warn(`[AI Metadata] Chunk ${index}: Missing emotional metadata, using defaults`)
        chunk.emotional = { polarity: 0, primaryEmotion: 'neutral', intensity: 0 }
      } else {
        chunk.emotional = {
          polarity: typeof chunk.emotional.polarity === 'number' 
            ? Math.max(-1, Math.min(1, chunk.emotional.polarity))
            : 0,
          primaryEmotion: chunk.emotional.primaryEmotion || 'neutral',
          intensity: typeof chunk.emotional.intensity === 'number'
            ? Math.max(0, Math.min(1, chunk.emotional.intensity))
            : 0
        }
      }

      return {
        content: chunk.content.trim(),
        start_offset: absoluteStart,
        end_offset: absoluteEnd,
        metadata: {
          themes: chunk.themes,
          concepts: chunk.concepts,
          importance: chunk.importance,
          summary: chunk.summary || undefined,
          domain: chunk.domain || undefined,
          emotional: chunk.emotional
        }
      }
    })

    return validated
  } catch (error: any) {
    console.error('[AI Metadata] Failed to parse metadata response:', error)
    throw new Error(`Metadata parsing failed: ${error.message}`)
  }
}
```

### 7. Handle Overlapping Chunks Between Batches

New function to deduplicate chunks from overlapping batch boundaries:

```typescript
function deduplicateOverlappingChunks(
  allChunks: Array<{
    content: string;
    start_offset: number;
    end_offset: number;
    metadata: AIChunkMetadata;
  }>
): Array<{
  content: string;
  start_offset: number;
  end_offset: number;
  chunk_index: number;
  metadata: AIChunkMetadata;
}> {
  if (allChunks.length === 0) return []

  // Sort by start_offset to process in document order
  const sorted = [...allChunks].sort((a, b) => a.start_offset - b.start_offset)
  
  const deduplicated: Array<{
    content: string;
    start_offset: number;
    end_offset: number;
    chunk_index: number;
    metadata: AIChunkMetadata;
  }> = []
  
  let lastEnd = -1
  let chunkIndex = 0

  for (const chunk of sorted) {
    // Skip if this chunk is completely contained within the last chunk
    if (chunk.start_offset < lastEnd && chunk.end_offset <= lastEnd) {
      console.log(`[AI Metadata] Skipping duplicate chunk at offset ${chunk.start_offset}`)
      continue
    }

    // If there's significant overlap (>50% of chunk), take the one with higher importance
    const overlapStart = Math.max(chunk.start_offset, lastEnd)
    const overlapEnd = Math.min(chunk.end_offset, lastEnd)
    const overlapSize = Math.max(0, overlapEnd - overlapStart)
    const chunkSize = chunk.end_offset - chunk.start_offset
    const overlapRatio = overlapSize / chunkSize

    if (overlapRatio > 0.5 && deduplicated.length > 0) {
      const prevChunk = deduplicated[deduplicated.length - 1]
      
      // Keep the chunk with higher importance
      if (chunk.metadata.importance > prevChunk.metadata.importance) {
        console.log(`[AI Metadata] Replacing overlapping chunk (importance ${prevChunk.metadata.importance} → ${chunk.metadata.importance})`)
        deduplicated[deduplicated.length - 1] = {
          ...chunk,
          chunk_index: chunkIndex - 1
        }
      } else {
        console.log(`[AI Metadata] Keeping previous chunk (higher importance)`)
      }
      continue
    }

    // Add this chunk
    deduplicated.push({
      ...chunk,
      chunk_index: chunkIndex
    })
    
    lastEnd = chunk.end_offset
    chunkIndex++
  }

  console.log(`[AI Metadata] Deduplicated ${allChunks.length} chunks → ${deduplicated.length} unique chunks`)
  return deduplicated
}
```

### 8. Update `combineBatchResults()`

Replace the current version:

```typescript
function combineBatchResults(
  batches: MetadataExtractionBatch[],
  results: MetadataExtractionResult[],
  originalMarkdown: string
): Array<{
  content: string;
  start_offset: number;
  end_offset: number;
  chunk_index: number;
  metadata: AIChunkMetadata;
}> {
  // Collect all chunks from all batches
  const allChunks: Array<{
    content: string;
    start_offset: number;
    end_offset: number;
    metadata: AIChunkMetadata;
  }> = []

  for (const result of results) {
    if (result.status === 'failed') {
      console.warn(`[AI Metadata] Batch ${result.batchId} failed, skipping`)
      continue
    }

    // Results now contain chunks with absolute offsets and content
    allChunks.push(...result.chunkMetadata)
  }

  // Deduplicate overlapping chunks (from batch boundaries)
  const deduplicated = deduplicateOverlappingChunks(allChunks)

  console.log(`[AI Metadata] Final: ${deduplicated.length} semantic chunks`)
  return deduplicated
}
```

### 9. Update Type Definitions

Add to your `ai-metadata.ts` types:

```typescript
// Update MetadataExtractionResult to include actual chunks, not just metadata
export interface MetadataExtractionResult {
  batchId: string
  chunkMetadata: Array<{
    content: string
    start_offset: number
    end_offset: number
    metadata: AIChunkMetadata
  }>
  status: 'success' | 'partial' | 'failed'
  errors?: Array<{ chunkIndex: number; error: string }>
  processingTime: number
}
```

### 10. Update Fallback Metadata

```typescript
function createFallbackMetadataForBatch(
  batch: MetadataExtractionBatch
): Array<{
  content: string;
  start_offset: number;
  end_offset: number;
  metadata: AIChunkMetadata;
}> {
  // If AI completely fails, split batch content into ~1500 char chunks locally
  const chunks: Array<{
    content: string;
    start_offset: number;
    end_offset: number;
    metadata: AIChunkMetadata;
  }> = []
  
  const FALLBACK_CHUNK_SIZE = 1500
  let position = 0
  
  while (position < batch.content.length) {
    const end = Math.min(position + FALLBACK_CHUNK_SIZE, batch.content.length)
    const content = batch.content.substring(position, end)
    
    chunks.push({
      content: content.trim(),
      start_offset: batch.startOffset + position,
      end_offset: batch.startOffset + end,
      metadata: createFallbackMetadata()
    })
    
    position = end
  }
  
  console.log(`[AI Metadata] Created ${chunks.length} fallback chunks for failed batch`)
  return chunks
}
```

## Cost Implications

**Before (paragraph chunking):** ~$0.20 per 500-page book for metadata
**After (AI chunking):** ~$0.40 per 500-page book for metadata

**Why the increase:**
- AI now processes more tokens (identifying boundaries + extracting metadata)
- More complex prompt
- Still reasonable for the vision

**Total cost per book remains under $0.60:**
- Extraction: $0.12
- AI Chunking + Metadata: $0.40
- Embeddings: $0.02
- ThematicBridge: $0.20

## Testing Strategy

1. **Test on one small document first** (10 pages)
   - Verify chunks make semantic sense
   - Check that offsets are correct
   - Validate metadata quality

2. **Test on one large book** (400+ pages)
   - Verify batching works correctly
   - Check overlap deduplication
   - Validate no chunks are lost at boundaries

3. **Compare chunk quality**
   - Look at 10 random chunks
   - Do they feel like "complete thoughts"?
   - Are they better than paragraph-based chunks?

4. **Validate offsets in reader**
   - Load processed document
   - Scroll through it
   - Verify sidebar shows connections for visible chunks
   - Check that chunk boundaries align with actual content

## Edge Cases to Handle

1. **AI returns overlapping chunks** → Deduplication function handles this
2. **AI misses content between chunks** → Log warning, consider gap too large
3. **Offsets don't match content length** → Validation catches this
4. **Batch completely fails** → Fallback creates local chunks
5. **Empty chunks returned** → Skip and warn
