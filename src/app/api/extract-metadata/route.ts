import { NextRequest } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute timeout

export type DocumentType =
  | 'fiction'
  | 'nonfiction_book'
  | 'academic_paper'
  | 'technical_manual'
  | 'article'
  | 'essay'

export interface DetectedMetadata {
  title: string
  author: string
  type: DocumentType
  year?: number
  publisher?: string
  description?: string
}

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

Return JSON with:
- title: Full document title (STRING, required)
- author: Author name(s) or "Unknown" (STRING, required)
- type: One of: "fiction" | "nonfiction_book" | "academic_paper" | "technical_manual" | "article" | "essay" (STRING, required)
- year: Publication year as integer or null (NUMBER or NULL)
- publisher: Publisher name or null (STRING or NULL)
- description: 1-2 sentence description of what this document is about (STRING, required)

Document text:
${markdown.slice(0, 5000)}

Return ONLY valid JSON, no markdown formatting.`

  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 1024,
      temperature: 0.1
    }
  })

  const metadata = JSON.parse(result.text || '{}')

  // Validation
  if (!metadata.title || !metadata.author || !metadata.type) {
    throw new Error('Invalid metadata response from AI')
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
