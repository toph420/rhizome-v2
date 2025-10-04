import { NextRequest } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import type { DetectedMetadata } from '@/types/metadata'

export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute timeout

/**
 * Extract first N pages from PDF using Gemini Files API
 */
async function extractFirstPages(file: File, pageCount: number): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY not configured')
  }

  const ai = new GoogleGenAI({ apiKey })

  const buffer = await file.arrayBuffer()
  const pdfBlob = new Blob([buffer], { type: 'application/pdf' })

  // Upload to Gemini Files API
  const uploadedFile = await ai.files.upload({
    file: pdfBlob,
    config: { mimeType: 'application/pdf' }
  })

  // Wait for file to be active
  let fileState = await ai.files.get({ name: uploadedFile.name })
  let attempts = 0
  while (fileState.state === 'PROCESSING' && attempts < 15) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    fileState = await ai.files.get({ name: uploadedFile.name })
    attempts++
  }

  if (fileState.state !== 'ACTIVE') {
    throw new Error('File processing failed')
  }

  // Extract first pages as markdown
  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: [{
      parts: [
        { fileData: { fileUri: uploadedFile.uri, mimeType: 'application/pdf' } },
        {
          text: `Extract pages 1-${pageCount} as clean markdown.

Include title page, copyright page, table of contents, and first chapter/section.
Return ONLY the markdown text, no JSON wrapper.`
        }
      ]
    }],
    config: {
      maxOutputTokens: 8192,
      temperature: 0.1
    }
  })

  return result.text || ''
}

/**
 * Detect document metadata from extracted pages
 */
async function detectDocumentMetadata(markdown: string): Promise<DetectedMetadata> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY not configured')
  }

  const ai = new GoogleGenAI({ apiKey })

  const prompt = `Analyze these first pages and extract document metadata.

Return a SINGLE JSON object (not an array) with these exact fields:
{
  "title": "Full document title",
  "author": "Author name(s) or Unknown",
  "type": "fiction | nonfiction_book | academic_paper | technical_manual | article | essay",
  "year": "1848" or null (as string),
  "publisher": "Publisher name or null",
  "description": "1-2 sentence description of what this document is about"
}

IMPORTANT:
- Return ONLY the JSON object itself, NOT wrapped in an array or markdown code blocks
- year must be a string, not a number

Document text:
${markdown.slice(0, 5000)}`

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'

  const result = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 1024,
      temperature: 0.1
    }
  })

  console.log('[extract-metadata] AI raw response:', result.text?.slice(0, 500))

  let metadata
  try {
    metadata = JSON.parse(result.text || '{}')
  } catch (parseError) {
    console.error('[extract-metadata] JSON parse error:', parseError)
    console.error('[extract-metadata] Raw text:', result.text)
    throw new Error('Failed to parse AI response as JSON')
  }

  // Handle edge case where AI returns array instead of object
  if (Array.isArray(metadata)) {
    console.log('[extract-metadata] AI returned array, extracting first element')
    if (metadata.length === 0) {
      throw new Error('AI returned empty array')
    }
    metadata = metadata[0]
  }

  console.log('[extract-metadata] Parsed metadata:', metadata)

  // Validation with better error message
  if (!metadata.title || !metadata.author || !metadata.type) {
    console.error('[extract-metadata] Missing required fields:', {
      hasTitle: !!metadata.title,
      hasAuthor: !!metadata.author,
      hasType: !!metadata.type,
      metadata
    })
    throw new Error(`Invalid metadata response from AI - missing required fields. Got: ${JSON.stringify(metadata)}`)
  }

  return metadata as DetectedMetadata
}

/**
 * POST /api/extract-metadata
 *
 * Extracts first 10 pages of PDF and detects metadata for preview
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return Response.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!file.type.includes('pdf')) {
      return Response.json(
        { error: 'Only PDF files supported for metadata extraction' },
        { status: 400 }
      )
    }

    // Extract first 10 pages
    const firstPages = await extractFirstPages(file, 10)

    // Detect metadata
    const metadata = await detectDocumentMetadata(firstPages)

    return Response.json(metadata)

  } catch (error: any) {
    console.error('[extract-metadata] Error:', error)
    return Response.json(
      { error: error.message || 'Failed to extract metadata' },
      { status: 500 }
    )
  }
}
