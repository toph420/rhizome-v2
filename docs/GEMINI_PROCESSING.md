# Gemini Document Processing

> **SDK Version**: This document uses `@google/genai` (the new unified SDK)  
> **Last Updated**: January 2025

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

### Complete Document Processing Flow
```typescript
// supabase/functions/process-document/index.ts
import { GoogleGenAI } from 'npm:@google/genai'

/**
 * Process a document: extract content, chunk, embed, and store.
 * @param documentId - Document UUID
 * @param storagePath - Storage path prefix (userId/documentId)
 */
export async function processDocument(
  documentId: string, 
  storagePath: string
) {
  // Initialize Gemini SDK
  const ai = new GoogleGenAI({ 
    apiKey: Deno.env.get('GOOGLE_AI_API_KEY') 
  })
  
  // 1. Get PDF from storage and convert to base64
  const { data: signedUrlData } = await supabase.storage
    .from('documents')
    .createSignedUrl(`${storagePath}/source.pdf`, 3600)
  
  const pdfResponse = await fetch(signedUrlData.signedUrl)
  const pdfBuffer = await pdfResponse.arrayBuffer()
  const pdfBase64 = arrayBufferToBase64(pdfBuffer)
  
  // 2. Extract markdown and semantic chunks from PDF
  // CRITICAL: Use ai.models.generateContent (note .models namespace)
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        },
        { text: EXTRACTION_AND_CHUNKING_PROMPT }
      ]
    }],
    config: {  // Note: config not generationConfig
      responseMimeType: "application/json",
      responseSchema: DOCUMENT_SCHEMA
    }
  })
  
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
  // CRITICAL: Use ai.models.embedContent (note .models namespace)
  const embeddings = await Promise.all(
    chunks.map(async (chunk, index) => {
      const embedResult = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: chunk.content,
        config: {
          outputDimensionality: 768
        }
      })
      
      // Extract embedding vector (note nested structure)
      if (!embedResult.embedding?.values) {
        throw new Error(`Invalid embedding for chunk ${index}`)
      }
      
      return embedResult.embedding.values
    })
  )
  
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
 * Convert ArrayBuffer to base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
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
```typescript
/**
 * Generate embeddings for multiple texts efficiently.
 * Handles rate limits with exponential backoff.
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
            model: 'text-embedding-004',
            contents: text,
            config: { outputDimensionality: 768 }
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
```typescript
async function robustEmbedContent(ai: GoogleGenAI, text: string, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
        config: { outputDimensionality: 768 }
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
| `text-embedding-004` | 768 | English-focused | Deprecating 2026-01-14 |
| `gemini-embedding-001` | 768 | 100+ languages | Recommended |

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