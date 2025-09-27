import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenAI } from 'npm:@google/genai'

const EXTRACTION_PROMPT = `
Extract this PDF document to clean, well-formatted markdown preserving all structure and formatting.
Then break the content into semantic chunks where each chunk represents a complete thought or concept.

For each chunk, identify:
1. Themes: Key topics or concepts discussed (array of strings)
2. Importance score: 0.0 to 1.0 indicating how central this chunk is to the document
3. Summary: One sentence summary of the chunk content

Return a JSON object with:
- markdown: The full document in markdown format
- chunks: Array of chunk objects with content, themes, importance_score, summary
`

/**
 * Chunk interface from Gemini response.
 */
interface ChunkData {
  content: string
  themes: string[]
  importance_score: number
  summary: string
}

/**
 * Document extraction response from Gemini.
 */
interface ExtractionResponse {
  markdown: string
  chunks: ChunkData[]
}

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
          themes: { type: "array", items: { type: "string" } },
          importance_score: { type: "number" },
          summary: { type: "string" }
        },
        required: ["content", "themes", "importance_score", "summary"]
      }
    }
  },
  required: ["markdown", "chunks"]
}

/**
 * Converts ArrayBuffer to base64 string.
 * @param buffer - The ArrayBuffer to convert.
 * @returns Base64 encoded string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Processes a document: extracts content, generates embeddings, stores results.
 * @param documentId - Document ID to process.
 * @param storagePath - Path prefix in Storage.
 * @param supabase - Supabase client.
 * @param genAI - Google AI client.
 * @returns Processing result.
 */
async function processDocument(
  documentId: string,
  storagePath: string,
  supabase: ReturnType<typeof createClient>,
  ai: GoogleGenAI
) {
  const sourcePath = `${storagePath}/source.pdf`
  
  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(sourcePath, 3600)
  
  if (urlError) throw new Error(`Failed to get signed URL: ${urlError.message}`)
  
  const pdfResponse = await fetch(signedUrlData.signedUrl)
  const pdfBuffer = await pdfResponse.arrayBuffer()
  const pdfBase64 = arrayBufferToBase64(pdfBuffer)
  
  await supabase
    .from('documents')
    .update({ processing_status: 'processing' })
    .eq('id', documentId)
  
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBase64
            }
          },
          { text: EXTRACTION_PROMPT }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: DOCUMENT_SCHEMA
    }
  })
  
  if (!result.text) {
    throw new Error('Gemini returned empty response')
  }
  
  let response: ExtractionResponse
  try {
    response = JSON.parse(result.text)
  } catch (error) {
    throw new Error(`Failed to parse Gemini response: ${error instanceof Error ? error.message : 'Invalid JSON'}`)
  }
  
  if (!response.markdown || !response.chunks || !Array.isArray(response.chunks)) {
    throw new Error('Invalid response structure from Gemini')
  }
  const { markdown, chunks } = response
  
  await supabase
    .from('documents')
    .update({ processing_status: 'embedding' })
    .eq('id', documentId)
  
  const embeddings = await Promise.all(
    chunks.map(async (chunk: ChunkData, index: number) => {
      try {
        const result = await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: chunk.content,
          config: {
            outputDimensionality: 768
          }
        })
        
        console.log(`Chunk ${index} embedding response keys:`, Object.keys(result))
        console.log(`Chunk ${index} has .embedding?`, !!result.embedding)
        console.log(`Chunk ${index} has .values?`, !!result.values)
        
        if (!result.embedding?.values || !Array.isArray(result.embedding.values)) {
          console.error(`Invalid embedding for chunk ${index}:`, JSON.stringify(result, null, 2))
          throw new Error(`Invalid embedding response for chunk ${index}`)
        }
        
        return result.embedding.values
      } catch (error) {
        throw new Error(`Failed to generate embedding for chunk ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    })
  )
  
  const markdownBlob = new Blob([markdown], { type: 'text/markdown' })
  const { error: markdownError } = await supabase.storage
    .from('documents')
    .upload(`${storagePath}/content.md`, markdownBlob, {
      contentType: 'text/markdown',
      upsert: true
    })
  
  if (markdownError) throw new Error(`Failed to save markdown: ${markdownError.message}`)
  
  const geminiResponseBlob = new Blob([JSON.stringify(response, null, 2)], { 
    type: 'application/json' 
  })
  await supabase.storage
    .from('documents')
    .upload(`${storagePath}/gemini-response.json`, geminiResponseBlob, {
      contentType: 'application/json',
      upsert: true
    })
  
  const chunksToInsert = chunks.map((chunk: ChunkData, index: number) => ({
    document_id: documentId,
    content: chunk.content,
    chunk_index: index,
    embedding: embeddings[index],
    themes: chunk.themes,
    importance_score: chunk.importance_score,
    summary: chunk.summary
  }))
  
  const { error: chunksError } = await supabase
    .from('chunks')
    .insert(chunksToInsert)
  
  if (chunksError) throw new Error(`Failed to insert chunks: ${chunksError.message}`)
  
  await supabase
    .from('documents')
    .update({
      processing_status: 'completed',
      processing_completed_at: new Date().toISOString()
    })
    .eq('id', documentId)
  
  return { success: true, chunksCount: chunks.length }
}

serve(async (req: Request) => {
  // Parse request body once and store for error handling
  let requestBody: { documentId?: string; storagePath?: string } = {}
  
  try {
    requestBody = await req.json()
    const { documentId, storagePath } = requestBody
    
    if (!documentId || !storagePath) {
      return new Response(
        JSON.stringify({ error: 'Missing documentId or storagePath' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Edge Functions automatically provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
    // But in local dev with --env-file, they might not be set, so we need defaults
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321'
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 
                        Deno.env.get('SUPABASE_ANON_KEY') || ''
    
    console.log('Supabase URL:', supabaseUrl)
    console.log('Has Service Role Key:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    console.log('Has Anon Key:', !!Deno.env.get('SUPABASE_ANON_KEY'))
    
    if (!supabaseKey) {
      throw new Error('No Supabase key available')
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY not configured')
    }
    
    const ai = new GoogleGenAI({ apiKey })
    
    const result = await processDocument(documentId, storagePath, supabase, ai)
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Processing error:', error)
    
    // Check if it's a quota error
    const isQuotaError = error instanceof Error && 
      (error.message?.includes('429') || error.message?.includes('quota'))
    
    let userMessage = error instanceof Error ? error.message : 'Unknown error'
    let statusCode = 500
    
    if (isQuotaError) {
      userMessage = 'Gemini API quota exceeded. Please wait 60 seconds and try again, or use a different API key.'
      statusCode = 429
    }
    
    if (error instanceof Error && requestBody.documentId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      
      await supabase
        .from('documents')
        .update({
          processing_status: 'failed',
          processing_error: userMessage
        })
        .eq('id', requestBody.documentId)
    }
    
    return new Response(
      JSON.stringify({ error: userMessage }),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    )
  }
})