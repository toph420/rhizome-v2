# Gemini Document Processing

> **SDK Version**: This document uses `@google/genai` (the new unified SDK)  
> **Processing Method**: Files API for PDFs ([Documentation](https://ai.google.dev/gemini-api/docs/files))  
> **Architecture Note**: Hybrid approach - Native Gemini SDK for document processing, Vercel AI SDK for embeddings  
> **Last Updated**: September 27, 2025

## 🏗️ Hybrid Architecture Context

Rhizome V2 uses **two AI SDKs strategically**:

1. **Native Gemini SDK** (`@google/genai`) - This document
   - Document processing with Files API
   - Handles large PDFs (>15MB)
   - Production-critical pipeline

2. **Vercel AI SDK** (`ai` + `@ai-sdk/google`) - See `AI_DOCUMENTATION.md`
   - Embeddings generation (`worker/lib/embeddings.ts`)
   - Future interactive features (chat, flashcards, synthesis)
   - Provider flexibility

**Why Hybrid?** Vercel AI SDK lacks Files API support, limiting PDF processing to ~15MB via base64. Native SDK provides reliable large file processing. **See**: `docs/AI_DOCUMENTATION.md` for complete architecture guide.

## SDK Setup

### Package Installation
```bash
# For Deno Edge Functions (Supabase)
# No install needed - use npm: prefix in imports

# For Node.js (Worker)
npm install @google/genai
```

### Initialization
```typescript
// Deno (Edge Functions)
import { GoogleGenAI } from 'npm:@google/genai'
const ai = new GoogleGenAI({ apiKey: Deno.env.get('GOOGLE_AI_API_KEY') })

// Node.js (Worker)
import { GoogleGenAI } from '@google/genai'
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
```

## Processing Pipeline

### Complete Document Processing Flow (Files API)

**Why Files API?** The Files API is superior to inline base64 for PDFs because:
- ✅ Handles larger files without payload bloat
- ✅ Server-side validation before processing
- ✅ More reliable for complex documents
- ✅ Cleaner code without base64 conversion
- ✅ Better error messages via file state tracking

**Reference:** [Gemini Files API Documentation](https://ai.google.dev/gemini-api/docs/files)

```typescript
// worker/handlers/process-document.ts
import { GoogleGenAI } from '@google/genai'

/**
 * Process a document using Gemini Files API.
 * Three-phase approach: Upload → Validate → Process
 * 
 * @param documentId - Document UUID
 * @param storagePath - Storage path prefix (userId/documentId)
 */
export async function processDocument(
  documentId: string, 
  storagePath: string
) {
  // Initialize Gemini SDK
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GOOGLE_AI_API_KEY,
    httpOptions: {
      timeout: 600000 // 10 minutes for HTTP-level timeout
    }
  })
  
  // ═══════════════════════════════════════════════════════════
  // PHASE 1: UPLOAD TO FILES API
  // ═══════════════════════════════════════════════════════════
  
  // 1. Get PDF from storage
  const { data: signedUrlData } = await supabase.storage
    .from('documents')
    .createSignedUrl(`${storagePath}/source.pdf`, 3600)
  
  const pdfResponse = await fetch(signedUrlData.signedUrl)
  const pdfBuffer = await pdfResponse.arrayBuffer()
  const fileSizeMB = pdfBuffer.byteLength / (1024 * 1024)
  
  // 2. Upload to Files API (no base64 conversion needed!)
  await updateProgress(supabase, jobId, 15, 'extract', 'uploading', 
    `Uploading ${fileSizeMB.toFixed(1)} MB PDF to Gemini`)
  
  const uploadStart = Date.now()
  const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
  const uploadedFile = await ai.files.upload({
    file: pdfBlob,
    config: { mimeType: 'application/pdf' }
  })
  const uploadTime = Math.round((Date.now() - uploadStart) / 1000)
  
  // ═══════════════════════════════════════════════════════════
  // PHASE 2: VALIDATE FILE STATE
  // ═══════════════════════════════════════════════════════════
  
  await updateProgress(supabase, jobId, 20, 'extract', 'validating', 
    `Upload complete (${uploadTime}s), validating file...`)
  
  let fileState = await ai.files.get({ name: uploadedFile.name || '' })
  let attempts = 0
  const maxAttempts = 30 // 60 seconds max (2s per attempt)
  
  while (fileState.state === 'PROCESSING' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    fileState = await ai.files.get({ name: uploadedFile.name || '' })
    attempts++
    
    if (attempts % 5 === 0) {
      await updateProgress(supabase, jobId, 20, 'extract', 'validating', 
        `Validating file... (${attempts * 2}s)`)
    }
  }
  
  if (fileState.state !== 'ACTIVE') {
    throw new Error(`File validation failed. State: ${fileState.state}. ` +
      `The file may be corrupted or in an unsupported format.`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // PHASE 3: AI EXTRACTION & PROCESSING
  // ═══════════════════════════════════════════════════════════
  
  const estimatedTime = fileSizeMB < 1 ? '1-2 min' : 
                        fileSizeMB < 5 ? '2-5 min' : '5-10 min'
  await updateProgress(supabase, jobId, 25, 'extract', 'analyzing', 
    `AI analyzing document (~${estimatedTime})...`)
  
  // 3. Extract markdown and semantic chunks from uploaded file
  // CRITICAL: Use fileData with URI reference, not inlineData
  const generateStart = Date.now()
  const GENERATION_TIMEOUT = 8 * 60 * 1000 // 8 minutes
  
  // Update progress every 30 seconds during generation
  const progressInterval = setInterval(async () => {
    const elapsed = Math.round((Date.now() - generateStart) / 1000)
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
    await updateProgress(supabase, jobId, 30, 'extract', 'analyzing', 
      `Still analyzing... (${timeStr} elapsed)`)
  }, 30000)
  
  let result
  try {
    const generationPromise = ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [
          { 
            fileData: { 
              fileUri: uploadedFile.uri || uploadedFile.name, 
              mimeType: 'application/pdf' 
            } 
          },
          { text: EXTRACTION_PROMPT }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: EXTRACTION_SCHEMA
      }
    })
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => {
        reject(new Error(`Analysis timeout after 8 minutes. ` +
          `PDF may be too complex. Try splitting into smaller documents.`))
      }, GENERATION_TIMEOUT)
    )
    
    result = await Promise.race([generationPromise, timeoutPromise]) as any
  } finally {
    clearInterval(progressInterval)
  }
  
  const generateTime = Math.round((Date.now() - generateStart) / 1000)
  
  // 3. Parse JSON response
  if (!result.text) {
    throw new Error('Empty response from Gemini')
  }
  
  const { markdown, chunks } = JSON.parse(result.text)
  
  // 4. Save markdown to Storage
  await supabase.storage
    .from('documents')
    .upload(`${storagePath}/content.md`, markdown, { upsert: true })
  
  // 5. Generate embeddings for each chunk
  // ⚠️ NOTE: This example shows conceptual flow
  // ✅ ACTUAL IMPLEMENTATION: Use worker/lib/embeddings.ts (Vercel AI SDK)
  //    See docs/AI_DOCUMENTATION.md for hybrid architecture rationale
  import { generateEmbeddings } from './lib/embeddings.js'
  
  const chunkContents = chunks.map(c => c.content)
  const embeddings = await generateEmbeddings(chunkContents)
  
  // Vercel AI SDK returns direct number[][] (no nested .values structure)
  // Batch processing: 100 chunks per API call vs 1 at a time
  // Built-in validation, rate limiting, and retry logic
  
  // 6. Store chunks in database
  const chunksToInsert = chunks.map((chunk, index) => ({
    document_id: documentId,
    content: chunk.content,
    chunk_index: index,
    embedding: embeddings[index],
    themes: chunk.themes,
    importance_score: chunk.importance_score,
    summary: chunk.summary
  }))
  
  await supabase.from('chunks').insert(chunksToInsert)
  
  return { success: true, chunksCount: chunks.length }
}
```

### Helper Functions
```typescript
/**
 * Update job progress in database.
 */
async function updateProgress(
  supabase: any,
  jobId: string,
  percent: number,
  stage: string,
  substage: string,
  details: string
) {
  await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent,
        stage,
        substage,
        details,
        updated_at: new Date().toISOString()
      }
    })
    .eq('id', jobId)
}
```

## Schema Definitions

### Document Extraction Schema
```typescript
const DOCUMENT_SCHEMA = {
  type: "object",
  properties: {
    markdown: { type: "string" },
    chunks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "string" },
          themes: { 
            type: "array", 
            items: { type: "string" } 
          },
          importance_score: { 
            type: "number",
            minimum: 0,
            maximum: 1
          },
          summary: { type: "string" }
        },
        required: ["content", "themes", "importance_score", "summary"]
      }
    }
  },
  required: ["markdown", "chunks"]
}
```

## Prompts

```typescript
const CHUNKING_PROMPT = `
You are an expert at analyzing documents and breaking them into semantic chunks.
Each chunk should be a complete thought or idea that can stand alone.

Rules:
1. Preserve markdown formatting
2. Keep related ideas together
3. Mark natural transition points
4. Identify key themes and concepts
5. Rate importance (0-1) for synthesis

For each chunk, identify:
- Type: introduction, argument, evidence, conclusion, example
- Themes: key concepts discussed
- Entities: people, works, organizations mentioned
- Importance: how central to the document's thesis
`

const SYNTHESIS_PROMPT = `
Given these two chunks, identify the relationship:
1. Supports - reinforces the same idea
2. Contradicts - opposes or challenges
3. Extends - builds upon
4. References - explicitly mentions
5. Parallel - similar structure/pattern

Provide confidence score 0-1.
`
```

## Advanced Examples

### Streaming Content Generation
```typescript
import { GoogleGenAI } from 'npm:@google/genai'

const ai = new GoogleGenAI({ apiKey: Deno.env.get('GOOGLE_AI_API_KEY') })

// Stream response chunks as they arrive
const response = await ai.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: 'Write a detailed analysis...',
  config: {
    maxOutputTokens: 2048,
    temperature: 0.7
  }
})

for await (const chunk of response) {
  console.log(chunk.text)
  // Update progress UI in real-time
}
```

### Multimodal Input (Images + Text)
```typescript
import { GoogleGenAI } from 'npm:@google/genai'
import * as fs from 'fs'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })

// Helper to convert local file to Part object
function fileToGenerativePart(path: string, mimeType: string) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    }
  }
}

const imagePart = fileToGenerativePart("diagram.jpg", "image/jpeg")

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [imagePart, "Explain this diagram in detail"]
})

console.log(response.text)
```

### Batch Embedding Generation

> **⚠️ DEPRECATED PATTERN**: This shows Native Gemini SDK approach for reference only.  
> **✅ CURRENT IMPLEMENTATION**: Use `worker/lib/embeddings.ts` (Vercel AI SDK)  
> See `docs/AI_DOCUMENTATION.md` for hybrid architecture details.

```typescript
/**
 * Generate embeddings for multiple texts efficiently.
 * Handles rate limits with exponential backoff.
 * 
 * NOTE: This is a reference implementation using Native Gemini SDK.
 * Production code uses Vercel AI SDK wrapper in worker/lib/embeddings.ts
 */
async function batchEmbed(
  ai: GoogleGenAI,
  texts: string[],
  options = { batchSize: 50, delayMs: 1000 }
) {
  const results: number[][] = []
  
  for (let i = 0; i < texts.length; i += options.batchSize) {
    const batch = texts.slice(i, i + options.batchSize)
    
    try {
      const embeddings = await Promise.all(
        batch.map(async (text) => {
          const result = await ai.models.embedContent({
            model: 'gemini-embedding-001',
            content: text,
            outputDimensionality: 768
          })
          return result.embedding.values
        })
      )
      
      results.push(...embeddings)
      
      // Rate limit protection: 60 requests per minute
      if (i + options.batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, options.delayMs))
      }
    } catch (error) {
      // Handle rate limit errors with exponential backoff
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        console.log('Rate limit hit, waiting 60 seconds...')
        await new Promise(resolve => setTimeout(resolve, 60000))
        // Retry this batch
        i -= options.batchSize
        continue
      }
      throw error
    }
  }
  
  return results
}
```

## Files API vs Inline Data Comparison

### When to Use Files API

**Use Files API for:**
- ✅ PDFs over 1MB
- ✅ Complex multi-page documents
- ✅ Production applications requiring reliability
- ✅ When you need server-side validation
- ✅ When timeout control is important

**Use Inline Data for:**
- Simple text files under 100KB
- Quick prototyping and testing
- When immediate processing is required

### Key Differences

| Feature | Files API | Inline Data (base64) |
|---------|-----------|---------------------|
| Upload | Separate upload step | Included in request |
| Max Size | Much larger (exact limit varies) | ~10MB practical limit |
| Processing | Server-side validation | Immediate processing |
| Code | Two-phase (upload → reference) | Single-phase |
| Payload | URI reference only | Full base64 string |
| Timeout | Separate timeout per phase | Single timeout for all |
| Error Messages | Detailed file state | Generic errors |

### Code Comparison

```typescript
// ❌ OLD: Inline Data (Don't use for PDFs)
const base64 = Buffer.from(pdfBuffer).toString('base64')
const result = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
  contents: [{
    parts: [
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
      { text: prompt }
    ]
  }]
})

// ✅ NEW: Files API (Use this for PDFs)
const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
const uploadedFile = await ai.files.upload({
  file: pdfBlob,
  config: { mimeType: 'application/pdf' }
})

// Validate file state
let fileState = await ai.files.get({ name: uploadedFile.name })
while (fileState.state === 'PROCESSING') {
  await new Promise(resolve => setTimeout(resolve, 2000))
  fileState = await ai.files.get({ name: uploadedFile.name })
}

// Use file reference
const result = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
  contents: [{
    parts: [
      { fileData: { fileUri: uploadedFile.uri, mimeType: 'application/pdf' } },
      { text: prompt }
    ]
  }]
})
```

### Safety Settings Configuration
```typescript
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from 'npm:@google/genai'

const ai = new GoogleGenAI({ apiKey: Deno.env.get('GOOGLE_AI_API_KEY') })

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Analyze this social media post...',
  config: {
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
      }
    ]
  }
})
```

## Rate Limits & Best Practices

### Rate Limits (Gemini API Free Tier)
- **Requests per minute**: 15 (generateContent), 1500 (embedContent)
- **Requests per day**: 1500 (generateContent), 100,000 (embedContent)
- **Tokens per minute**: 1M input, 30K output

### Optimization Strategies

1. **Batch Operations**: Process multiple embeddings in parallel
2. **Retry Logic**: Implement exponential backoff for rate limits
3. **Progress Tracking**: Update UI every N chunks to show progress
4. **Checkpoint System**: Save intermediate results to recover from failures
5. **Model Selection**: Use `gemini-2.5-flash` for speed, `gemini-2.5-pro` for quality

### Error Handling Patterns

> **⚠️ REFERENCE ONLY**: Native Gemini SDK pattern shown below.  
> **✅ PRODUCTION**: Error handling built into `worker/lib/embeddings.ts`

```typescript
// Reference implementation (Native SDK)
async function robustEmbedContent(ai: GoogleGenAI, text: string, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        content: text,
        outputDimensionality: 768
      })
      
      // Validate response
      if (!result.embedding?.values || !Array.isArray(result.embedding.values)) {
        throw new Error('Invalid embedding response structure')
      }
      
      return result.embedding.values
    } catch (error) {
      const isRateLimit = error.message?.includes('429') || 
                          error.message?.includes('quota')
      const isTransient = error.message?.includes('503') || 
                          error.message?.includes('timeout')
      
      if ((isRateLimit || isTransient) && attempt < retries - 1) {
        // Exponential backoff: 5s, 25s, 125s
        const delay = 5000 * Math.pow(5, attempt)
        console.log(`Retry ${attempt + 1}/${retries} after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      throw error
    }
  }
}
```

## Model Comparison

### Generation Models
| Model | Speed | Quality | Context | Best For |
|-------|-------|---------|---------|----------|
| `gemini-2.5-flash` | Fast | Good | 1M tokens | Production, real-time |
| `gemini-2.5-pro` | Slower | Excellent | 2M tokens | Complex analysis |
| `gemini-2.0-flash-exp` | Fast | Good | 1M tokens | Experimental features |

### Embedding Models
| Model | Dimensions | Languages | Status |
|-------|------------|-----------|--------|
| `gemini-embedding-001` | 128-3072 (recommended: 768, 1536, 3072) | 100+ languages | Recommended (current) |
| `embedding-001` | 768 | Limited | Deprecating Oct 2025 |
| `embedding-gecko-001` | 768 | Limited | Deprecating Oct 2025 |

## Common Issues & Solutions

### Issue: Empty Response
```typescript
// Problem: result.text is undefined
const result = await ai.models.generateContent({...})
console.log(result.text)  // undefined

// Solution: Validate response
if (!result.text) {
  throw new Error('Empty response from Gemini API')
}
```

### Issue: Wrong Embedding Structure
```typescript
// Problem: Trying to access result.values directly
const vector = result.values  // undefined

// Solution: Use nested structure
const vector = result.embedding.values  // ✓ Correct
```

### Issue: Rate Limit Errors
```typescript
// Problem: 429 errors during batch processing
// Solution: Add delays and retry logic (see examples above)
```

## Migration from Old SDK

### Quick Migration Guide
```typescript
// OLD SDK (@google/generative-ai)
import { GoogleGenerativeAI } from '@google/generative-ai'
const genAI = new GoogleGenerativeAI(apiKey)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
const result = await model.generateContent('prompt')
const text = result.response.text()

// NEW SDK (@google/genai)
import { GoogleGenAI } from '@google/genai'
const ai = new GoogleGenAI({ apiKey })
const result = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'prompt'
})
const text = result.text  // Direct access
```

### Key Differences
1. **Import**: `GoogleGenAI` not `GoogleGenerativeAI`
2. **Initialization**: `new GoogleGenAI({ apiKey })` not `new GoogleGenerativeAI(apiKey)`
3. **Method Access**: `ai.models.generateContent()` not `model.generateContent()`
4. **Config**: `config` parameter not `generationConfig`
5. **Response**: `result.text` not `result.response.text()`
6. **Embeddings**: `result.embedding.values` not `result.values`