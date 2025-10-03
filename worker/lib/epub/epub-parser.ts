import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'
import { htmlToMarkdown } from './html-to-markdown.js'
import path from 'path'

export interface EPUBMetadata {
  title: string
  author: string
  publisher?: string
  publicationDate?: string
  isbn?: string
  language: string
  description?: string
  subjects: string[]  // For type inference
}

export interface EPUBChapter {
  id: string
  title: string
  href: string
  content: string      // Raw HTML
  markdown: string     // Converted markdown
  order: number
}

export interface EPUBParseResult {
  metadata: EPUBMetadata
  chapters: EPUBChapter[]
  coverImage: Buffer | null
}

/**
 * Parse an EPUB file and extract metadata, chapters, and cover image.
 * Fails fast on corrupted EPUB files.
 *
 * @param buffer - EPUB file as Buffer
 * @returns Parsed EPUB data with metadata, chapters, and cover
 * @throws Error if EPUB is corrupted or malformed
 */
export async function parseEPUB(buffer: Buffer): Promise<EPUBParseResult> {
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
  const metadata = extractMetadata(opfData)

  // Extract chapters in reading order
  const opfDir = path.dirname(opfPath)
  const chapters = await extractChapters(zip, opfData, opfDir)

  if (chapters.length === 0) {
    throw new Error('EPUB is corrupted: No readable chapters found')
  }

  // Extract cover image using 3-strategy approach
  const coverImage = extractCoverImage(zip, opfData, opfDir)

  return {
    metadata,
    chapters,
    coverImage
  }
}

/**
 * Find the OPF (Open Packaging Format) file path.
 * Checks container.xml first, then searches for *.opf files.
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

  // Strategy 2: Search for *.opf file
  const entries = zip.getEntries()
  for (const entry of entries) {
    if (entry.entryName.endsWith('.opf')) {
      return entry.entryName
    }
  }

  return null
}

/**
 * Parse OPF XML file into structured data.
 */
function parseOPF(opfContent: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: false
  })

  return parser.parse(opfContent)
}

/**
 * Extract metadata from OPF data.
 */
function extractMetadata(opfData: any): EPUBMetadata {
  const metadata = opfData.package?.metadata || {}

  // Extract title
  const titleData = metadata['dc:title']
  const title = typeof titleData === 'string'
    ? titleData
    : titleData?.['#text'] || 'Unknown Title'

  // Extract author
  const creatorData = metadata['dc:creator']
  const author = typeof creatorData === 'string'
    ? creatorData
    : creatorData?.['#text'] || 'Unknown Author'

  // Extract publisher
  const publisherData = metadata['dc:publisher']
  const publisher = typeof publisherData === 'string'
    ? publisherData
    : publisherData?.['#text']

  // Extract publication date
  const dateData = metadata['dc:date']
  const publicationDate = typeof dateData === 'string'
    ? dateData
    : dateData?.['#text']

  // Extract ISBN (from dc:identifier)
  const identifiers = Array.isArray(metadata['dc:identifier'])
    ? metadata['dc:identifier']
    : [metadata['dc:identifier']].filter(Boolean)

  let isbn: string | undefined
  for (const id of identifiers) {
    const text = typeof id === 'string' ? id : id?.['#text'] || ''
    const scheme = typeof id === 'object' ? id?.['@_opf:scheme'] : ''

    if (scheme?.toLowerCase() === 'isbn' || text.match(/^(97[89])?\d{9}[\dX]$/i)) {
      isbn = text.replace(/[^0-9X]/gi, '')
      break
    }
  }

  // Extract language
  const langData = metadata['dc:language']
  const language = typeof langData === 'string'
    ? langData
    : langData?.['#text'] || 'en'

  // Extract description
  const descData = metadata['dc:description']
  const description = typeof descData === 'string'
    ? descData
    : descData?.['#text']

  // Extract subjects
  const subjectData = metadata['dc:subject']
  const subjects: string[] = []

  if (Array.isArray(subjectData)) {
    subjects.push(...subjectData.map(s =>
      typeof s === 'string' ? s : s?.['#text'] || ''
    ).filter(Boolean))
  } else if (subjectData) {
    const subject = typeof subjectData === 'string'
      ? subjectData
      : subjectData?.['#text']
    if (subject) subjects.push(subject)
  }

  return {
    title,
    author,
    publisher,
    publicationDate,
    isbn,
    language,
    description,
    subjects
  }
}

/**
 * Extract chapters in reading order from the EPUB.
 */
async function extractChapters(
  zip: AdmZip,
  opfData: any,
  opfDir: string
): Promise<EPUBChapter[]> {
  const manifest = opfData.package?.manifest?.item || []
  const spine = opfData.package?.spine?.itemref || []

  // Build manifest lookup
  const manifestMap = new Map<string, any>()
  const items = Array.isArray(manifest) ? manifest : [manifest]

  for (const item of items) {
    if (item?.['@_id']) {
      manifestMap.set(item['@_id'], item)
    }
  }

  // Extract chapters in spine order
  const chapters: EPUBChapter[] = []
  const spineItems = Array.isArray(spine) ? spine : [spine]

  for (let i = 0; i < spineItems.length; i++) {
    const itemref = spineItems[i]
    const idref = itemref?.['@_idref']

    if (!idref) continue

    const manifestItem = manifestMap.get(idref)
    if (!manifestItem) {
      throw new Error(
        `EPUB is corrupted: Chapter ${i + 1} references missing manifest item '${idref}'`
      )
    }

    const href = manifestItem['@_href']
    const mediaType = manifestItem['@_media-type']

    // Only process HTML/XHTML files
    if (!mediaType?.includes('html')) continue

    // Read chapter file
    const fullPath = path.posix.join(opfDir, href)
    const entry = zip.getEntry(fullPath)

    if (!entry) {
      throw new Error(
        `EPUB is corrupted: Failed to read chapter ${i + 1} at ${fullPath}`
      )
    }

    try {
      const content = entry.getData().toString('utf8')
      const markdown = htmlToMarkdown(content)

      // Extract chapter title from HTML or use filename
      const title = extractChapterTitle(content) ||
                   path.basename(href, path.extname(href))

      chapters.push({
        id: idref,
        title,
        href,
        content,
        markdown,
        order: i
      })
    } catch (err) {
      throw new Error(
        `EPUB is corrupted: Failed to parse chapter ${i + 1} at ${fullPath}: ${(err as Error).message}`
      )
    }
  }

  return chapters
}

/**
 * Extract chapter title from HTML content.
 */
function extractChapterTitle(html: string): string | null {
  // Try to find <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) return titleMatch[1].trim()

  // Try to find first <h1> tag
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1Match) return h1Match[1].trim()

  return null
}

/**
 * Extract cover image using 3-strategy approach.
 * Returns null if no cover found.
 */
function extractCoverImage(
  zip: AdmZip,
  opfData: any,
  opfDir: string
): Buffer | null {
  const manifest = opfData.package?.manifest?.item || []
  const metadata = opfData.package?.metadata || {}
  const items = Array.isArray(manifest) ? manifest : [manifest]

  // Strategy 1: Look for cover-image property
  for (const item of items) {
    const properties = item?.['@_properties'] || ''
    if (properties.includes('cover-image')) {
      const href = item['@_href']
      if (href) {
        const coverBuffer = readImageFromZip(zip, opfDir, href)
        if (coverBuffer) return coverBuffer
      }
    }
  }

  // Strategy 2: Look for id="cover" in manifest
  for (const item of items) {
    const id = item?.['@_id'] || ''
    if (id.toLowerCase() === 'cover' || id.toLowerCase() === 'cover-image') {
      const href = item['@_href']
      if (href) {
        const coverBuffer = readImageFromZip(zip, opfDir, href)
        if (coverBuffer) return coverBuffer
      }
    }
  }

  // Strategy 3: Look for <meta name="cover"> in metadata
  const metaTags = Array.isArray(metadata.meta)
    ? metadata.meta
    : metadata.meta ? [metadata.meta] : []

  for (const meta of metaTags) {
    const name = meta?.['@_name']
    const content = meta?.['@_content']

    if (name === 'cover' && content) {
      // Find manifest item with this ID
      const coverItem = items.find(item => item?.['@_id'] === content)
      if (coverItem) {
        const href = coverItem['@_href']
        if (href) {
          const coverBuffer = readImageFromZip(zip, opfDir, href)
          if (coverBuffer) return coverBuffer
        }
      }
    }
  }

  return null
}

/**
 * Read an image file from the ZIP archive.
 */
function readImageFromZip(
  zip: AdmZip,
  baseDir: string,
  href: string
): Buffer | null {
  try {
    const fullPath = path.posix.join(baseDir, href)
    const entry = zip.getEntry(fullPath)

    if (!entry) return null

    return entry.getData()
  } catch {
    return null
  }
}
