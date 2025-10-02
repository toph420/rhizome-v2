# Gemini API Usage Patterns (@google/genai)

## Package Information
- NPM Package: `@google/genai`
- Import: `import { GoogleGenAI } from 'npm:@google/genai'` (Deno Edge Functions)
- Initialization: `const ai = new GoogleGenAI({ apiKey })`

## Method Access Pattern
**CRITICAL**: All methods accessed through `.models` namespace

```typescript
// ❌ WRONG
await genAI.generateContent(...)
await genAI.embedContent(...)

// ✅ CORRECT
await ai.models.generateContent(...)
await ai.models.embedContent(...)
```

## Content Generation

### Basic Text Generation
```typescript
const result = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Your prompt here',
  config: {
    maxOutputTokens: 1000,
    temperature: 0.7
  }
})

const text = result.text  // Concatenated text from all parts
```

### Multimodal (PDF/Image) Input
```typescript
const result = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{
    parts: [
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64String  // PDF as base64
        }
      },
      { text: 'Your prompt about the PDF' }
    ]
  }],
  config: {
    responseMimeType: 'application/json',
    responseSchema: YOUR_SCHEMA  // Optional: structured output
  }
})
```

### Structured JSON Output
```typescript
const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "number" }
        }
      }
    }
  },
  required: ["title", "items"]
}

const result = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Extract data from this text...',
  config: {
    responseMimeType: "application/json",
    responseSchema: SCHEMA
  }
})

const data = JSON.parse(result.text)
```

## Text Embeddings

### Single Text Embedding
```typescript
const result = await ai.models.embedContent({
  model: 'text-embedding-004',
  contents: 'Text to embed',
  config: {
    outputDimensionality: 768  // 768, 1536, etc.
  }
})

// Response structure
{
  embedding: {
    values: number[],      // The embedding vector
    statistics?: {
      tokenCount?: number,
      truncated?: boolean
    }
  }
}

const vector = result.embedding.values
```

### Multiple Text Embeddings (Batch)
```typescript
const result = await ai.models.embedContent({
  model: 'text-embedding-004',
  contents: ['Text 1', 'Text 2', 'Text 3'],
  config: {
    outputDimensionality: 768
  }
})

// Response structure
{
  embeddings: [
    { values: number[], statistics?: {...} },
    { values: number[], statistics?: {...} },
    { values: number[], statistics?: {...} }
  ]
}

const vectors = result.embeddings.map(e => e.values)
```

## Model Names

### Generation Models
- `gemini-2.5-flash` - Fast, general purpose
- `gemini-2.5-flash-lite` - Fast, general purpose
- `gemini-2.5-pro` - More capable, slower

### Embedding Models
- `text-embedding-004` - Current recommended (being deprecated 2026-01-14)
- `gemini-embedding-001` - Newer model, 100+ languages

### Image Generation
- `imagen-3.0-fast-generate-001` - Fast image generation
- `imagen-4.0-fast-generate-001` - Latest version

## Error Handling

### API Errors
```typescript
try {
  const result = await ai.models.generateContent({...})
} catch (error) {
  // Check for quota errors
  if (error.message?.includes('429') || error.message?.includes('quota')) {
    // Rate limit hit
  }
  // Check for invalid request
  if (error.message?.includes('400')) {
    // Bad request - check parameters
  }
}
```

### Response Validation
```typescript
const result = await ai.models.generateContent({...})

// Always check result exists
if (!result.text) {
  throw new Error('Empty response from Gemini')
}

// For JSON responses
try {
  const data = JSON.parse(result.text)
  if (!data.expectedField) {
    throw new Error('Invalid response structure')
  }
} catch (parseError) {
  throw new Error(`Failed to parse JSON: ${parseError.message}`)
}

// For embeddings
if (!result.embedding?.values || !Array.isArray(result.embedding.values)) {
  throw new Error('Invalid embedding response')
}
```

## Best Practices

1. **Always use `.models` namespace** for method access
2. **Validate responses** before using - API can return unexpected formats
3. **Add try-catch** around all API calls with context in error messages
4. **Use appropriate models** - Flash for speed, Pro for quality
5. **Check response structure** - Log keys/structure when debugging
6. **Handle rate limits** - Implement retry logic with backoff
7. **Base64 encode binary data** for multimodal inputs
8. **Use structured output** (responseSchema) when possible for reliability

## Common Pitfalls

1. ❌ Forgetting `.models` in method calls
2. ❌ Assuming `result.values` instead of `result.embedding.values`
3. ❌ Not validating JSON.parse for structured outputs
4. ❌ Using wrong model names (e.g., REST API names vs SDK names)
5. ❌ Not handling empty responses or API errors
6. ❌ Assuming consistent response structure without validation