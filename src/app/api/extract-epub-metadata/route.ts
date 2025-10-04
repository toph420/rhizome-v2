import { NextRequest } from 'next/server'
import { parseEPUB } from '@/../../worker/lib/epub/epub-parser'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'

export const runtime = 'nodejs'
export const maxDuration = 30 // EPUB parsing is fast

/**
 * Extract metadata from EPUB files using local OPF parsing.
 * Returns metadata + base64-encoded cover image.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log('[extract-epub-metadata] Parsing EPUB file:', file.name)

    // Parse EPUB locally (worker library)
    const buffer = Buffer.from(await file.arrayBuffer())
    const { metadata, coverImage } = await parseEPUB(buffer)

    console.log('[extract-epub-metadata] Extracted metadata:', {
      title: metadata.title,
      author: metadata.author,
      hasCover: !!coverImage
    })

    // Convert cover to base64 data URI
    const coverBase64 = coverImage
      ? `data:image/jpeg;base64,${coverImage.toString('base64')}`
      : undefined

    const result: DetectedMetadata = {
      title: metadata.title || 'Untitled',
      author: metadata.author || 'Unknown',
      type: inferTypeFromEPUB(metadata),
      year: metadata.publicationDate || undefined,
      publisher: metadata.publisher || undefined,
      isbn: metadata.isbn || undefined,
      description: metadata.description || undefined,
      coverImage: coverBase64,
      language: metadata.language || 'en'
    }

    return Response.json(result)
  } catch (error) {
    console.error('[extract-epub-metadata] Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to extract EPUB metadata' },
      { status: 500 }
    )
  }
}

/**
 * Infer document type from EPUB metadata.
 * Uses publisher and subject tags for classification.
 * @param metadata - EPUB metadata object
 * @returns Inferred document type
 */
function inferTypeFromEPUB(metadata: { publisher?: string; subjects?: string[] }): DocumentType {
  const publisher = metadata.publisher?.toLowerCase() || ''
  const subjects = metadata.subjects?.join(' ').toLowerCase() || ''

  // Technical publishers
  if (publisher.includes("o'reilly") ||
      publisher.includes('packt') ||
      publisher.includes('manning') ||
      publisher.includes('apress')) {
    return 'technical_manual'
  }

  // Academic publishers
  if (subjects.includes('textbook') ||
      publisher.includes('university press') ||
      publisher.includes('academic') ||
      subjects.includes('academic')) {
    return 'academic_paper'
  }

  // Non-fiction indicators
  if (subjects.includes('biography') ||
      subjects.includes('history') ||
      subjects.includes('science') ||
      subjects.includes('philosophy')) {
    return 'nonfiction_book'
  }

  // Default to fiction for EPUBs (most common consumer format)
  return 'fiction'
}
