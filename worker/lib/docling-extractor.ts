/**
 * Docling PDF Extraction - TypeScript Bridge
 *
 * Integrates Python Docling library via child_process for local PDF extraction.
 * Provides 100% reliable extraction without network dependency.
 */

import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface DoclingOptions {
  /** Enable OCR for scanned PDFs (slower) */
  ocr?: boolean
  /** Maximum number of pages to process (for testing) */
  maxPages?: number
  /** Page range to extract [start, end] (1-indexed) */
  pageRange?: [number, number]
  /** Timeout in milliseconds (default: 30 minutes) */
  timeout?: number
  /** Python executable path (default: python3) */
  pythonPath?: string
  /** Extract images from PDF (adds ~30-40% processing time) */
  extractImages?: boolean
  /** Image quality scale (1.0-2.0, default: 1.5) */
  imagesScale?: number
  /** Image mode: 'embedded' (base64 in markdown) or 'referenced' (separate PNG files) */
  imageMode?: 'embedded' | 'referenced'
}

export interface DoclingResult {
  /** Extracted markdown content */
  markdown: string
  /** Number of pages processed */
  pages: number
  /** Extraction metadata */
  metadata: {
    pageCount: number
    hasTables: boolean
    extractionMethod: string
  }
  /** Extraction time in milliseconds */
  extractionTime: number
  /** Extracted images (if extractImages option enabled) */
  images?: Array<{
    /** Image filename */
    filename: string
    /** Image data (base64 if embedded, buffer if referenced) */
    data: Buffer | string
    /** Image index */
    index: number
  }>
}

export interface DoclingProgress {
  type: 'progress'
  status: 'starting' | 'converting' | 'complete'
  message: string
  page?: number
  totalPages?: number
}

/**
 * Extract PDF using Docling (Python) via child process.
 *
 * @param pdfPath - Path to PDF file (absolute path)
 * @param options - Extraction options
 * @param onProgress - Progress callback
 * @returns Extracted markdown and metadata
 * @throws Error if extraction fails
 *
 * @example
 * const result = await extractWithDocling('/tmp/document.pdf', {
 *   ocr: false,
 *   timeout: 600000 // 10 minutes
 * }, (progress) => {
 *   console.log(`Progress: ${progress.message}`)
 * })
 */
export async function extractWithDocling(
  pdfPath: string,
  options: DoclingOptions = {},
  onProgress?: (progress: DoclingProgress) => void | Promise<void>
): Promise<DoclingResult> {
  const startTime = Date.now()

  // Validate PDF path
  const pdfAbsPath = path.resolve(pdfPath)
  const pdfExists = await fs.access(pdfAbsPath).then(() => true).catch(() => false)

  if (!pdfExists) {
    throw new Error(`PDF file not found: ${pdfAbsPath}`)
  }

  // Prepare options JSON
  const pythonOptions = {
    ocr: options.ocr || false,
    max_pages: options.maxPages,
    page_range: options.pageRange,
    // TODO: Image extraction support (requires Python script updates)
    // extract_images: options.extractImages || false,
    // images_scale: options.imagesScale || 1.5,
    // image_mode: options.imageMode || 'referenced'
  }

  const scriptPath = path.join(__dirname, '../scripts/docling_extract.py')
  const pythonPath = options.pythonPath || 'python3'
  const timeout = options.timeout || 30 * 60 * 1000 // 30 minutes default

  console.log('[Docling] Starting extraction...')
  console.log(`  PDF: ${pdfAbsPath}`)
  console.log(`  Options: ${JSON.stringify(pythonOptions)}`)

  return new Promise((resolve, reject) => {
    // Spawn Python process with unbuffered output (-u flag)
    const python = spawn(pythonPath, [
      '-u', // Unbuffered output for real-time progress
      scriptPath,
      pdfAbsPath,
      JSON.stringify(pythonOptions)
    ], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })

    let stdout = ''
    let stderr = ''
    let timeoutHandle: NodeJS.Timeout

    // Set timeout
    timeoutHandle = setTimeout(() => {
      python.kill('SIGTERM')
      reject(new Error(`Docling extraction timeout after ${timeout}ms`))
    }, timeout)

    // Capture stdout (result JSON)
    python.stdout.on('data', (data: Buffer) => {
      const text = data.toString()
      stdout += text

      // Try to parse progress updates (one JSON per line)
      const lines = text.split('\n').filter(l => l.trim())
      for (const line of lines) {
        try {
          const json = JSON.parse(line)
          if (json.type === 'progress' && onProgress) {
            onProgress(json as DoclingProgress)
          }
        } catch {
          // Not JSON, ignore
        }
      }
    })

    // Capture stderr (errors)
    python.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    // Handle process exit
    python.on('close', (code) => {
      clearTimeout(timeoutHandle)

      if (code === 0) {
        // Success - parse final JSON result
        try {
          // Get last JSON object from stdout (final result)
          const lines = stdout.trim().split('\n')
          const lastLine = lines[lines.length - 1]
          const result = JSON.parse(lastLine)

          if (!result.success) {
            reject(new Error(result.error || 'Docling extraction failed'))
            return
          }

          const extractionTime = Date.now() - startTime

          console.log('[Docling] Extraction complete')
          console.log(`  Pages: ${result.pages}`)
          console.log(`  Markdown size: ${Math.round(result.markdown.length / 1024)}KB`)
          console.log(`  Time: ${(extractionTime / 1000).toFixed(1)}s`)

          resolve({
            markdown: result.markdown,
            pages: result.pages,
            metadata: result.metadata,
            extractionTime
          })
        } catch (parseError: any) {
          reject(new Error(`Failed to parse Docling output: ${parseError.message}\nOutput: ${stdout.slice(0, 500)}`))
        }
      } else {
        // Error
        let errorMessage = 'Docling extraction failed'

        // Try to parse structured error from stderr
        try {
          const errorJson = JSON.parse(stderr)
          errorMessage = errorJson.error || errorMessage
        } catch {
          // Not JSON, use raw stderr
          errorMessage = stderr || stdout || errorMessage
        }

        reject(new Error(`${errorMessage} (exit code ${code})`))
      }
    })

    // Handle spawn errors
    python.on('error', (error) => {
      clearTimeout(timeoutHandle)
      reject(new Error(`Failed to spawn Python process: ${error.message}`))
    })
  })
}

/**
 * Extract PDF from buffer (saves to temp file first).
 *
 * @param pdfBuffer - PDF file buffer
 * @param options - Extraction options
 * @param onProgress - Progress callback
 * @returns Extracted markdown and metadata
 */
export async function extractPdfBuffer(
  pdfBuffer: ArrayBuffer | Buffer,
  options: DoclingOptions = {},
  onProgress?: (progress: DoclingProgress) => void | Promise<void>
): Promise<DoclingResult> {
  // Save to temp file
  const tempDir = os.tmpdir()
  const tempPath = path.join(tempDir, `docling-${Date.now()}.pdf`)

  const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)
  await fs.writeFile(tempPath, buffer)

  console.log(`[Docling] Saved PDF to temp file: ${tempPath} (${Math.round(buffer.length / 1024)}KB)`)

  try {
    const result = await extractWithDocling(tempPath, options, onProgress)
    return result
  } finally {
    // Cleanup temp file
    await fs.unlink(tempPath).catch(() => {})
    console.log('[Docling] Cleaned up temp file')
  }
}
