import { NextRequest } from 'next/server'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'
import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 30 // EPUB parsing is fast

/**
 * Strip HTML tags from a string and convert to plain text.
 * Handles common HTML entities and preserves basic formatting.
 */
function stripHTML(html: string): string {
  return html
    // Remove script and style tags with their content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Replace <br> and </p> with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    // Remove all other HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/**
 * Extract year from publication date string.
 * Handles ISO dates, partial dates, and year-only formats.
 */
function extractYear(dateString: string): string | undefined {
  if (!dateString) return undefined

  // Try to extract 4-digit year from various formats
  const yearMatch = dateString.match(/\d{4}/)
  return yearMatch ? yearMatch[0] : undefined
}

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

    // Parse EPUB locally
    const buffer = Buffer.from(await file.arrayBuffer())
    const { metadata, coverImage } = await parseEPUBMetadata(buffer)

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
      year: metadata.publicationDate ? extractYear(metadata.publicationDate) : undefined,
      publisher: metadata.publisher || undefined,
      isbn: metadata.isbn || undefined,
      description: metadata.description ? stripHTML(metadata.description) : undefined,
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

/**
 * Simplified EPUB parser for metadata extraction only.
 * Based on worker/lib/epub/epub-parser.ts but without full chapter parsing.
 */
async function parseEPUBMetadata(buffer: Buffer): Promise<{
  metadata: {
    title: string
    author: string
    publisher?: string
    publicationDate?: string
    isbn?: string
    language: string
    description?: string
    subjects: string[]
  }
  coverImage: Buffer | null
}> {
  let zip: AdmZip

  try {
    zip = new AdmZip(buffer)
  } catch (err) {
    throw new Error(`EPUB is corrupted: Failed to read ZIP archive - ${(err as Error).message}`)
  }

  // Find OPF file (package document)
  const opfPath = findOPFPath(zip)
  if (!opfPath) {
    throw new Error('EPUB is corrupted: No OPF package file found')
  }

  // Parse OPF file
  const opfEntry = zip.getEntry(opfPath)
  if (!opfEntry) {
    throw new Error(`EPUB is corrupted: OPF file not found at ${opfPath}`)
  }

  const opfContent = opfEntry.getData().toString('utf8')
  const opfData = parseOPF(opfContent)

  // Extract metadata
  const metadata = extractMetadataFromOPF(opfData)

  // Extract cover image
  const opfDir = path.dirname(opfPath)
  const coverImage = extractCoverImage(zip, opfData, opfDir)

  return {
    metadata,
    coverImage
  }
}

/**
 * Find the OPF (Open Packaging Format) file path.
 */
function findOPFPath(zip: AdmZip): string | null {
  // Strategy 1: Check container.xml (EPUB 3 standard)
  const containerEntry = zip.getEntry('META-INF/container.xml')
  if (containerEntry) {
    const containerXml = containerEntry.getData().toString('utf8')
    const parser = new XMLParser({ ignoreAttributes: false })
    const container = parser.parse(containerXml)

    const rootfile = container?.container?.rootfiles?.rootfile
    if (rootfile) {
      const fullPath = rootfile['@_full-path']
      if (fullPath) return fullPath
    }
  }

  // Strategy 2: Search for *.opf files
  const entries = zip.getEntries()
  const opfEntry = entries.find(entry => entry.entryName.endsWith('.opf'))
  return opfEntry ? opfEntry.entryName : null
}

/**
 * Parse OPF XML content.
 */
function parseOPF(opfContent: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text'
  })
  return parser.parse(opfContent)
}

/**
 * Extract metadata from parsed OPF data.
 */
function extractMetadataFromOPF(opfData: any) {
  const metadata = opfData?.package?.metadata

  if (!metadata) {
    throw new Error('EPUB is corrupted: No metadata found in OPF file')
  }

  // Handle both single values and arrays
  const getMetaValue = (field: any): string => {
    if (!field) return ''
    if (typeof field === 'string') return field
    if (Array.isArray(field)) return field[0]
    return field['#text'] || field.toString()
  }

  const getMetaArray = (field: any): string[] => {
    if (!field) return []
    if (typeof field === 'string') return [field]
    if (Array.isArray(field)) return field.map(f => typeof f === 'string' ? f : f['#text'] || '')
    return [field['#text'] || field.toString()]
  }

  return {
    title: getMetaValue(metadata['dc:title']) || 'Untitled',
    author: getMetaValue(metadata['dc:creator']) || 'Unknown',
    publisher: getMetaValue(metadata['dc:publisher']) || undefined,
    publicationDate: getMetaValue(metadata['dc:date']) || undefined,
    isbn: getMetaValue(metadata['dc:identifier']) || undefined,
    language: getMetaValue(metadata['dc:language']) || 'en',
    description: getMetaValue(metadata['dc:description']) || undefined,
    subjects: getMetaArray(metadata['dc:subject'])
  }
}

/**
 * Extract cover image using 3-strategy approach.
 */
function extractCoverImage(zip: AdmZip, opfData: any, opfDir: string): Buffer | null {
  // Strategy 1: Look for cover in manifest with properties="cover-image"
  const manifest = opfData?.package?.manifest?.item
  if (manifest) {
    const items = Array.isArray(manifest) ? manifest : [manifest]
    const coverItem = items.find((item: any) =>
      item['@_properties'] === 'cover-image' ||
      item['@_id'] === 'cover' ||
      item['@_id'] === 'cover-image'
    )

    if (coverItem) {
      const coverPath = path.join(opfDir, coverItem['@_href'])
      const coverEntry = zip.getEntry(coverPath)
      if (coverEntry) {
        return coverEntry.getData()
      }
    }
  }

  // Strategy 2: Look for metadata cover reference
  const metadata = opfData?.package?.metadata?.meta
  if (metadata) {
    const metas = Array.isArray(metadata) ? metadata : [metadata]
    const coverMeta = metas.find((m: any) => m['@_name'] === 'cover')
    if (coverMeta) {
      const coverId = coverMeta['@_content']
      if (manifest) {
        const items = Array.isArray(manifest) ? manifest : [manifest]
        const coverItem = items.find((item: any) => item['@_id'] === coverId)
        if (coverItem) {
          const coverPath = path.join(opfDir, coverItem['@_href'])
          const coverEntry = zip.getEntry(coverPath)
          if (coverEntry) {
            return coverEntry.getData()
          }
        }
      }
    }
  }

  // Strategy 3: Search for common cover filenames
  const entries = zip.getEntries()
  const coverNames = ['cover.jpg', 'cover.jpeg', 'cover.png', 'Cover.jpg', 'Cover.jpeg', 'Cover.png']

  for (const name of coverNames) {
    const entry = entries.find(e => e.entryName.endsWith(name))
    if (entry) {
      return entry.getData()
    }
  }

  return null
}
