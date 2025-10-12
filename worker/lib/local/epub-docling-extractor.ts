/**
 * EPUB to HTML extractor for Docling processing (Phase 5 - Task 17)
 *
 * Extracts EPUB structure, concatenates HTML in spine order,
 * then feeds to Docling Python script for processing.
 *
 * Key differences from PDF:
 * - Uses HTML as intermediate format (not binary PDF)
 * - Preserves spine order for reading sequence
 * - Chunks have section_marker instead of page numbers
 * - No bounding boxes (HTML doesn't have PDF coordinates)
 *
 * Pattern from:
 * - worker/lib/epub/epub-parser.ts (existing EPUB extraction)
 * - worker/lib/docling-extractor.ts (Docling wrapper pattern from Phase 2)
 */

import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'
import { spawn } from 'child_process'
import path from 'path'
import TurndownService from 'turndown'
// Phase 5: Import standard DoclingChunk type from main extractor
import type { DoclingChunk, DoclingStructure } from '../docling-extractor.js'

/**
 * EPUB metadata extracted from content.opf
 * Pattern from: epub-parser.ts lines 6-15
 */
export interface EpubMetadata {
  title: string
  author: string
  publisher?: string
  publicationDate?: string
  isbn?: string
  language: string
  description?: string
  subjects?: string[]
}

/**
 * Result of EPUB→HTML extraction
 */
interface EpubToHtmlResult {
  html: string              // Unified HTML in spine order
  metadata: EpubMetadata    // Book metadata from OPF
  spine: string[]           // Chapter file paths in reading order
}

// Export DoclingChunk type for EPUB processor to use
export type { DoclingChunk }

// DoclingStructure imported from docling-extractor.ts above

/**
 * Final result from Docling EPUB processing
 * Pattern from Phase 5 spec lines 330-341
 */
export interface DoclingEpubResult {
  markdown: string
  structure: DoclingStructure
  chunks: DoclingChunk[]
  metadata: {
    source_format: 'epub'
    extraction_method: 'docling'
    chunk_count: number
    word_count: number
  }
}

/**
 * Extract EPUB to unified HTML
 * Pattern from: worker/lib/epub/epub-parser.ts (lines 40-83)
 *
 * CRITICAL: Must preserve spine order (reading sequence)
 * Phase 5 spec lines 512-525
 */
export async function extractEpubToHtml(
  epubBuffer: ArrayBuffer
): Promise<EpubToHtmlResult> {
  const buffer = Buffer.from(epubBuffer)
  let zip: AdmZip

  try {
    zip = new AdmZip(buffer)
  } catch (err) {
    throw new Error(`Failed to read EPUB ZIP: ${(err as Error).message}`)
  }

  // Parse container.xml to find content.opf
  // Pattern from epub-parser.ts lines 89-100
  const containerEntry = zip.getEntry('META-INF/container.xml')
  if (!containerEntry) {
    throw new Error('Invalid EPUB: missing container.xml')
  }

  const containerXml = containerEntry.getData().toString('utf8')
  const containerParser = new XMLParser({ ignoreAttributes: false })
  const container = containerParser.parse(containerXml)

  const rootfile = container?.container?.rootfiles?.rootfile
  const opfPath = rootfile?.['@_full-path']
  if (!opfPath) {
    throw new Error('Invalid EPUB: cannot find OPF path')
  }

  const opfDir = path.posix.dirname(opfPath)

  // Parse content.opf for metadata and spine
  const opfEntry = zip.getEntry(opfPath)
  if (!opfEntry) {
    throw new Error('Invalid EPUB: missing content.opf')
  }

  const opfXml = opfEntry.getData().toString('utf8')
  const opfParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text'
  })
  const opfData = opfParser.parse(opfXml)

  // Extract metadata
  // Pattern from epub-parser.ts lines 132-213
  const meta = opfData.package?.metadata || {}

  const titleData = meta['dc:title']
  const title = typeof titleData === 'string' ? titleData : (titleData?.['#text'] || 'Unknown Title')

  const creatorData = meta['dc:creator']
  const author = typeof creatorData === 'string' ? creatorData : (creatorData?.['#text'] || 'Unknown Author')

  const publisherData = meta['dc:publisher']
  const publisher = typeof publisherData === 'string' ? publisherData : publisherData?.['#text']

  const dateData = meta['dc:date']
  const publicationDate = typeof dateData === 'string' ? dateData : dateData?.['#text']

  const langData = meta['dc:language']
  const language = typeof langData === 'string' ? langData : (langData?.['#text'] || 'en')

  const descData = meta['dc:description']
  const description = typeof descData === 'string' ? descData : descData?.['#text']

  const metadata: EpubMetadata = {
    title,
    author,
    publisher,
    publicationDate,
    language,
    description
  }

  // Extract spine order (reading sequence)
  // Pattern from epub-parser.ts lines 218-290
  // CRITICAL: Must process in spine order, not alphabetical (Phase 5 spec lines 512-525)
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

  // Extract HTML files in spine order
  const htmlChunks: string[] = []
  const spineItems: string[] = []
  const spineRefs = Array.isArray(spine) ? spine : [spine]

  for (const itemref of spineRefs) {
    const idref = itemref?.['@_idref']
    if (!idref) continue

    const manifestItem = manifestMap.get(idref)
    if (!manifestItem) continue

    const href = manifestItem['@_href']
    const mediaType = manifestItem['@_media-type']

    // Only process HTML/XHTML files
    if (!mediaType?.includes('html')) continue

    // Read chapter file
    const fullPath = path.posix.join(opfDir, href)
    const entry = zip.getEntry(fullPath)

    if (!entry) {
      console.warn(`EPUB: Could not find chapter at ${fullPath}`)
      continue
    }

    try {
      const htmlContent = entry.getData().toString('utf8')

      // Skip cover pages (usually just images, no extractable text)
      // Check for common cover page indicators
      const isCoverPage =
        htmlContent.includes('calibre:cover') ||
        htmlContent.includes('<title>Cover</title>') ||
        fullPath.toLowerCase().includes('cover')

      if (isCoverPage) {
        console.log(`[EPUB] Skipping cover page: ${fullPath}`)
        continue
      }

      htmlChunks.push(htmlContent)
      spineItems.push(fullPath)
    } catch (err) {
      console.warn(`EPUB: Failed to read chapter ${fullPath}: ${(err as Error).message}`)
    }
  }

  if (htmlChunks.length === 0) {
    throw new Error('Invalid EPUB: no HTML chapters found')
  }

  // CRITICAL: Docling has known bug where HTML headings all become H2
  // Solution: Use Turndown.js to convert HTML → Markdown (preserves structure)
  // Then feed markdown to Docling (markdown format DOES preserve hierarchy)

  console.log(`[EPUB] Converting ${htmlChunks.length} chapters with Turndown.js...`)

  const turndown = new TurndownService({
    headingStyle: 'atx',  // Use # for headings (not underline style)
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**'
  })

  // Convert each chapter HTML to markdown
  const markdownChapters: string[] = []
  for (let i = 0; i < htmlChunks.length; i++) {
    const chapterMarkdown = turndown.turndown(htmlChunks[i])
    markdownChapters.push(chapterMarkdown)
    console.log(`[EPUB] Converted chapter ${i + 1}/${htmlChunks.length} to markdown`)
  }

  // Join chapters with section break (---) which markdown processors understand
  const unifiedMarkdown = markdownChapters.join('\n\n---\n\n')

  console.log(`[EPUB] Combined markdown: ${unifiedMarkdown.length} chars, ${markdownChapters.length} chapters`)

  return {
    html: unifiedMarkdown,  // Actually markdown now, but keeping field name for compatibility
    metadata,
    spine: spineItems
  }
}

/**
 * Process EPUB HTML with Docling Python script
 * Pattern from: worker/lib/docling-extractor.ts
 * IPC pattern from Phase 2 (lines 527-536 in Phase 5 spec)
 */
export async function processEpubWithDocling(
  html: string,
  options: {
    tokenizer?: string
    chunkSize?: number
    onProgress?: (percent: number, stage: string, message: string) => void
  } = {}
): Promise<DoclingEpubResult> {
  const {
    tokenizer = 'Xenova/all-mpnet-base-v2',  // CRITICAL: Must match embeddings model (Phase 1)
    chunkSize = 512,
    onProgress
  } = options

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'docling_extract_epub.py')
    const scriptOptions = JSON.stringify({ tokenizer, chunk_size: chunkSize })

    console.log(`[EPUB Docling] Spawning Python script: ${scriptPath}`)
    console.log(`[EPUB Docling] Markdown size: ${html.length} bytes`)
    console.log(`[EPUB Docling] Newline count:`, (html.match(/\n/g) || []).length)
    console.log(`[EPUB Docling] Markdown preview (first 500 chars):`, html.slice(0, 500))
    console.log(`[EPUB Docling] Options: ${scriptOptions}`)

    const pythonProcess = spawn('python3', [scriptPath, scriptOptions], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''
    let finalResult: DoclingEpubResult | null = null

    // CRITICAL: Accumulate ALL stdout data
    // Progress updates come line-by-line, but final result may be large multi-line JSON
    pythonProcess.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdoutBuffer += chunk  // Accumulate everything

      // Try to parse complete lines for progress updates
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const parsed = JSON.parse(line)

          // Progress updates (type === 'progress')
          if (parsed.type === 'progress') {
            onProgress?.(parsed.progress, parsed.status, parsed.message)
          }
        } catch {
          // Ignore parse errors - we'll parse the full buffer at the end
        }
      }
    })

    pythonProcess.stderr.on('data', (data) => {
      stderrBuffer += data.toString()
    })

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Docling EPUB extraction failed (exit code ${code}): ${stderrBuffer}`))
        return
      }

      console.log(`[EPUB Docling] Process closed, stdout buffer size: ${stdoutBuffer.length} bytes`)

      // Parse the complete accumulated stdout buffer
      // It contains progress updates + final result, need to extract the last complete JSON
      try {
        // Split by newlines and find the last valid JSON object with markdown field
        const lines = stdoutBuffer.trim().split('\n').filter(l => l.trim())
        console.log(`[EPUB Docling] Parsing ${lines.length} output lines`)

        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(lines[i])
            // Check if this is the final result (has 'markdown' field, regardless of value)
            if ('markdown' in parsed) {
              const mdNewlines = (parsed.markdown.match(/\n/g) || []).length
              console.log(`[EPUB Docling] Found result JSON at line ${i}/${lines.length}`)
              console.log(`[EPUB Docling] Result markdown: ${parsed.markdown.length} bytes, ${mdNewlines} newlines, ${parsed.chunks?.length || 0} chunks`)
              resolve(parsed as DoclingEpubResult)
              return
            }
          } catch (err) {
            console.log(`[EPUB Docling] Line ${i} failed to parse: ${(err as Error).message}`)
          }
        }

        // If we get here, no result found
        reject(new Error(`No result JSON found in ${lines.length} lines. All lines are progress updates. Buffer: ${stdoutBuffer}`))

      } catch (error) {
        reject(new Error(`Failed to parse Docling output: ${error}\nStdout size: ${stdoutBuffer.length} bytes\nFirst 500 chars: ${stdoutBuffer.slice(0, 500)}\nLast 500 chars: ${stdoutBuffer.slice(-500)}\nStderr: ${stderrBuffer}`))
      }
    })

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`))
    })

    // Write HTML to Python process stdin
    console.log(`[EPUB Docling] Writing HTML to stdin...`)
    pythonProcess.stdin.write(html)
    pythonProcess.stdin.end()
    console.log(`[EPUB Docling] Stdin write complete`)
  })
}

/**
 * Complete EPUB extraction pipeline: EPUB → HTML → Docling → Result
 * Pattern from Phase 5 spec lines 484-508
 */
export async function extractEpubWithDocling(
  epubBuffer: ArrayBuffer,
  options: {
    tokenizer?: string
    chunkSize?: number
    onProgress?: (percent: number, stage: string, message: string) => void
  } = {}
): Promise<DoclingEpubResult & { epubMetadata: EpubMetadata }> {
  // Step 1: Extract EPUB to HTML (0-20%)
  options.onProgress?.(10, 'extract', 'Extracting EPUB structure')
  const { html, metadata } = await extractEpubToHtml(epubBuffer)

  // Step 2: Process HTML with Docling (20-100%)
  options.onProgress?.(20, 'extract', 'Processing with Docling')
  const result = await processEpubWithDocling(html, options)

  return {
    ...result,
    epubMetadata: metadata
  }
}
