/**
 * Metadata Extraction Server Actions
 *
 * Server Actions for extracting metadata from various document formats.
 * Migrated from API routes to follow Next.js 15 + React 19 best practices.
 *
 * Replaces:
 * - /api/extract-youtube-metadata
 * - /api/extract-text-metadata
 * - /api/extract-epub-metadata
 * - /api/extract-metadata (PDF)
 */

'use server'

import { GoogleGenAI } from '@google/genai'
import { google } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'
import { jsonrepair } from 'jsonrepair'
import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'
import path from 'path'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'

/**
 * Extract metadata from YouTube videos using Data API v3.
 */
export async function extractYoutubeMetadata(url: string) {
  if (!url) {
    throw new Error('No URL provided')
  }

  console.log('[extractYoutubeMetadata] Fetching metadata for URL:', url)

  const videoId = extractVideoId(url)
  const metadata = await fetchYouTubeMetadata(videoId)

  const result: DetectedMetadata = {
    title: metadata.title,
    author: metadata.channelName,
    type: 'article' as DocumentType,
    year: new Date(metadata.publishedAt).getFullYear().toString(),
    description: metadata.description.slice(0, 200) +
                (metadata.description.length > 200 ? '...' : ''),
    coverImage: metadata.thumbnail,
    language: 'en'
  }

  console.log('[extractYoutubeMetadata] Extraction complete:', result.title)

  return result
}

/**
 * Extract metadata from text/markdown content.
 * Strategy 1: Parse YAML frontmatter (instant, free)
 * Strategy 2: AI extraction with Vercel AI SDK (2s, $0.001)
 */
export async function extractTextMetadata(content: string) {
  if (!content) {
    throw new Error('No content provided')
  }

  // Strategy 1: Try frontmatter first (free and instant)
  const frontmatter = extractFrontmatter(content)
  if (frontmatter?.title && frontmatter?.author) {
    console.log('[extractTextMetadata] Using frontmatter (free path)')

    const result: DetectedMetadata = {
      title: frontmatter.title,
      author: frontmatter.author,
      type: (frontmatter.type as DocumentType) || 'article',
      year: frontmatter.year || frontmatter.date?.slice(0, 4),
      publisher: frontmatter.publisher,
      description: frontmatter.description,
      language: frontmatter.language || 'en'
    }

    return result
  }

  // Strategy 2: Fallback to AI extraction
  console.log('[extractTextMetadata] No frontmatter found, using AI extraction')

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error('Google AI API key not configured')
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'

  const metadataSchema = z.object({
    title: z.string(),
    author: z.string(),
    type: z.enum(['article', 'essay', 'nonfiction_book', 'technical_manual']),
    year: z.string().optional(),
    description: z.string().optional()
  })

  const { object } = await generateObject({
    model: google(modelName, { apiKey }),
    schema: metadataSchema,
    prompt: `Extract metadata from this document.

Rules:
- Title: Use main heading or infer from content
- Author: Look for author name or use "Unknown"
- Type: Classify as article, essay, nonfiction_book, or technical_manual
- Year: Publication year if mentioned (4 digits only, as string)
- Description: 1-2 sentence summary

Document (first 5000 chars):
${content.slice(0, 5000)}`
  })

  console.log('[extractTextMetadata] AI extraction complete:', object.title)

  return {
    ...object,
    language: 'en'
  } as DetectedMetadata
}

/**
 * Extract metadata from EPUB file buffer.
 */
export async function extractEpubMetadata(fileBuffer: ArrayBuffer) {
  const buffer = Buffer.from(fileBuffer)
  console.log('[extractEpubMetadata] Parsing EPUB file')

  const { metadata, coverImage } = await parseEPUBMetadata(buffer)

  console.log('[extractEpubMetadata] Extracted metadata:', {
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

  return result
}

/**
 * Extract metadata from PDF file buffer.
 */
export async function extractPdfMetadata(fileBuffer: ArrayBuffer) {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY not configured')
  }

  // Extract first 10 pages
  const firstPages = await extractFirstPagesFromPDF(fileBuffer, 10, apiKey)

  // Detect metadata
  const metadata = await detectDocumentMetadata(firstPages, apiKey)

  return metadata
}

// ==================== Helper Functions ====================

/**
 * Extract video ID from various YouTube URL formats.
 */
function extractVideoId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  throw new Error('Invalid YouTube URL format')
}

/**
 * Fetch video metadata from YouTube Data API v3.
 */
async function fetchYouTubeMetadata(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY not configured in environment')
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('id', videoId)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('part', 'snippet')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMessage = errorData.error?.message || ''
    const errorReason = errorData.error?.errors?.[0]?.reason || ''

    if (response.status === 403) {
      if (errorReason === 'quotaExceeded' || errorMessage.toLowerCase().includes('quota')) {
        const error = new Error('YouTube API daily quota exceeded. Consider pasting the transcript instead.')
        error.name = 'QUOTA_EXCEEDED'
        throw error
      }

      if (errorReason === 'accessNotConfigured' || errorMessage.includes('not enabled')) {
        const error = new Error('YouTube Data API v3 is not enabled in your Google Cloud Console.')
        error.name = 'API_NOT_ENABLED'
        throw error
      }

      if (errorReason === 'keyInvalid' || errorMessage.includes('API key')) {
        const error = new Error('YouTube API key is invalid or restricted.')
        error.name = 'INVALID_API_KEY'
        throw error
      }

      throw new Error(errorMessage || 'Access forbidden. Check API key restrictions.')
    }

    throw new Error(`YouTube API error: ${errorMessage || response.statusText}`)
  }

  const data = await response.json()

  if (!data.items || data.items.length === 0) {
    throw new Error('Video not found or is private')
  }

  const snippet = data.items[0].snippet

  return {
    title: snippet.title,
    channelName: snippet.channelTitle,
    description: snippet.description || '',
    thumbnail: snippet.thumbnails.maxres?.url ||
               snippet.thumbnails.high?.url ||
               snippet.thumbnails.medium?.url ||
               snippet.thumbnails.default?.url,
    publishedAt: snippet.publishedAt
  }
}

/**
 * Extract YAML frontmatter from markdown content.
 */
function extractFrontmatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  try {
    const yaml = match[1]
    const lines = yaml.split('\n')
    const data: Record<string, any> = {}

    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim().replace(/^['"]|['"]$/g, '')

      if (key && value) {
        data[key] = value
      }
    }

    return (data.title && data.author) ? data : null
  } catch (error) {
    console.warn('[extractFrontmatter] Parsing failed:', error)
    return null
  }
}

/**
 * Strip HTML tags from a string.
 */
function stripHTML(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/**
 * Extract year from publication date string.
 */
function extractYear(dateString: string): string | undefined {
  if (!dateString) return undefined
  const yearMatch = dateString.match(/\d{4}/)
  return yearMatch ? yearMatch[0] : undefined
}

/**
 * Infer document type from EPUB metadata.
 */
function inferTypeFromEPUB(metadata: { publisher?: string; subjects?: string[] }): DocumentType {
  const publisher = metadata.publisher?.toLowerCase() || ''
  const subjects = metadata.subjects?.join(' ').toLowerCase() || ''

  if (publisher.includes("o'reilly") || publisher.includes('packt') ||
      publisher.includes('manning') || publisher.includes('apress')) {
    return 'technical_manual'
  }

  if (subjects.includes('textbook') || publisher.includes('university press') ||
      publisher.includes('academic') || subjects.includes('academic')) {
    return 'academic_paper'
  }

  if (subjects.includes('biography') || subjects.includes('history') ||
      subjects.includes('science') || subjects.includes('philosophy')) {
    return 'nonfiction_book'
  }

  return 'fiction'
}

/**
 * Parse EPUB metadata.
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

  const opfPath = findOPFPath(zip)
  if (!opfPath) {
    throw new Error('EPUB is corrupted: No OPF package file found')
  }

  const opfEntry = zip.getEntry(opfPath)
  if (!opfEntry) {
    throw new Error(`EPUB is corrupted: OPF file not found at ${opfPath}`)
  }

  const opfContent = opfEntry.getData().toString('utf8')
  const opfData = parseOPF(opfContent)
  const metadata = extractMetadataFromOPF(opfData)
  const opfDir = path.dirname(opfPath)
  const coverImage = extractCoverImage(zip, opfData, opfDir)

  return { metadata, coverImage }
}

function findOPFPath(zip: AdmZip): string | null {
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

  const entries = zip.getEntries()
  const opfEntry = entries.find(entry => entry.entryName.endsWith('.opf'))
  return opfEntry ? opfEntry.entryName : null
}

function parseOPF(opfContent: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text'
  })
  return parser.parse(opfContent)
}

function extractMetadataFromOPF(opfData: any) {
  const metadata = opfData?.package?.metadata
  if (!metadata) {
    throw new Error('EPUB is corrupted: No metadata found in OPF file')
  }

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

function extractCoverImage(zip: AdmZip, opfData: any, opfDir: string): Buffer | null {
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

/**
 * Extract first N pages from PDF using Gemini Files API.
 */
async function extractFirstPagesFromPDF(fileBuffer: ArrayBuffer, pageCount: number, apiKey: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })

  const pdfBlob = new Blob([fileBuffer], { type: 'application/pdf' })

  const uploadedFile = await ai.files.upload({
    file: pdfBlob,
    config: { mimeType: 'application/pdf' }
  })

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
 * Detect document metadata from extracted pages.
 */
async function detectDocumentMetadata(markdown: string, apiKey: string): Promise<DetectedMetadata> {
  const ai = new GoogleGenAI({ apiKey })

  const prompt = `Extract metadata from this document's first pages.

REQUIRED OUTPUT FORMAT - Return ONLY a JSON object with these EXACT fields:
{
  "title": "Full document title from title page",
  "author": "Author name(s) - use 'Unknown' if not found",
  "type": "article",
  "year": "2024",
  "publisher": "Publisher name",
  "description": "Brief 1-2 sentence summary"
}

STRICT REQUIREMENTS:
1. title, author, and type are REQUIRED - never omit these fields
2. If title is not found, use the first heading or "Untitled Document"
3. If author is not found, use "Unknown"
4. type must be ONE of: fiction, nonfiction_book, academic_paper, technical_manual, article, essay
5. year must be a string (e.g. "2024"), not a number
6. publisher and description are optional (use null if not found)
7. Return ONLY the JSON object - NO markdown code blocks, NO arrays

Document text (first 5000 chars):
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

  let metadata
  try {
    const rawText = result.text || '{}'
    const cleanedText = rawText.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim()
    metadata = JSON.parse(cleanedText)
  } catch (parseError) {
    try {
      const rawText = result.text || '{}'
      const cleanedText = rawText.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim()
      const repairedJson = jsonrepair(cleanedText)
      metadata = JSON.parse(repairedJson)
    } catch (repairError) {
      throw new Error('Failed to parse AI response as JSON')
    }
  }

  if (Array.isArray(metadata)) {
    if (metadata.length === 0) {
      throw new Error('AI returned empty array')
    }
    metadata = metadata[0]
  }

  // Validate and provide defaults for missing fields
  if (!metadata.title || !metadata.author || !metadata.type) {
    console.error('[detectDocumentMetadata] Incomplete metadata:', {
      hasTitle: !!metadata.title,
      hasAuthor: !!metadata.author,
      hasType: !!metadata.type,
      metadata
    })

    // Provide defaults for missing required fields
    const result: DetectedMetadata = {
      title: metadata.title || 'Untitled Document',
      author: metadata.author || 'Unknown',
      type: metadata.type || 'article',
      year: metadata.year,
      publisher: metadata.publisher,
      description: metadata.description || 'AI extraction incomplete. Please edit metadata.',
      language: 'en'
    }

    return result
  }

  return metadata as DetectedMetadata
}
