# Gemini Document Processing

## Processing Pipeline

```typescript
// supabase/functions/process-document/index.ts
import { GoogleGenerativeAI } from '@google/generative-ai'

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' })

export async function processDocument(documentId: string) {
  // 1. Get markdown content
  const { markdown } = await getDocument(documentId)
  
  // 2. Semantic chunking with full context
  const result = await model.generateContent({
    contents: [{
      parts: [{
        text: `${CHUNKING_PROMPT}\n\nDocument:\n${markdown}`
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          chunks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string" },
                type: { type: "string" },
                themes: { 
                  type: "array",
                  items: { type: "string" }
                },
                importance: { type: "number" },
                summary: { type: "string" }
              }
            }
          }
        }
      }
    }
  })
  
  const chunks = JSON.parse(result.response.text()).chunks
  
  // 3. Generate embeddings
  const embedModel = gemini.getGenerativeModel({ 
    model: 'text-embedding-004' 
  })
  
  const embeddings = await Promise.all(
    chunks.map(chunk => 
      embedModel.embedContent(chunk.content)
    )
  )
  
  // 4. Store chunks
  for (let i = 0; i < chunks.length; i++) {
    await createChunkEntity(chunks[i], embeddings[i], documentId)
  }
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

## Rate Limits & Optimization

```typescript
// Batch processing for efficiency
async function batchEmbed(texts: string[]) {
  const BATCH_SIZE = 100 // Gemini allows batching
  const batches = chunk(texts, BATCH_SIZE)
  
  const results = []
  for (const batch of batches) {
    const embeddings = await Promise.all(
      batch.map(text => embedModel.embedContent(text))
    )
    results.push(...embeddings)
    
    // Rate limit: 60 requests per minute
    await sleep(1000)
  }
  
  return results
}
```