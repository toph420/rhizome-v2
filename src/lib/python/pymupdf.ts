import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createAdminClient } from '@/lib/supabase/admin'

const execAsync = promisify(exec)

export interface PyMuPdfRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PyMuPdfResult {
  found: boolean
  rects: PyMuPdfRect[]
}

/**
 * Find text in PDF using PyMuPDF and return bounding boxes.
 *
 * Reuses Python IPC pattern from Docling extraction.
 *
 * @param documentId - Document UUID
 * @param pageNumber - 1-indexed page number
 * @param searchText - Text to search for
 * @returns Array of bounding box rectangles, or empty array if not found
 */
export async function findTextInPdfWithPyMuPDF(
  documentId: string,
  pageNumber: number,
  searchText: string
): Promise<PyMuPdfResult> {

  let pdfPath: string | null = null

  try {
    // Download PDF to temp file
    pdfPath = await getPdfPathFromStorage(documentId)

    if (!pdfPath) {
      console.warn('[pymupdf] No PDF file found for document', documentId)
      return { found: false, rects: [] }
    }

    // Escape search text for shell (prevent injection)
    const escapedText = searchText.replace(/'/g, "'\\''")

    // Execute PyMuPDF script
    const { stdout, stderr } = await execAsync(
      `python3 worker/scripts/find_text_in_pdf.py '${pdfPath}' ${pageNumber} '${escapedText}'`,
      {
        timeout: 5000, // 5 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      }
    )

    if (stderr) {
      console.error('[pymupdf] stderr:', stderr)
    }

    // Parse JSON results
    const rects = JSON.parse(stdout) as PyMuPdfRect[]

    console.log('[pymupdf] Found', rects.length, 'text instances on page', pageNumber)

    return {
      found: rects.length > 0,
      rects,
    }

  } catch (error) {
    console.error('[pymupdf] Error finding text:', error)
    return { found: false, rects: [] }
  } finally {
    // Cleanup: Delete temp file
    if (pdfPath) {
      try {
        await unlink(pdfPath)
        console.log('[pymupdf] Cleaned up temp file:', pdfPath)
      } catch (err) {
        console.warn('[pymupdf] Failed to cleanup temp file:', err)
      }
    }
  }
}

/**
 * Get local filesystem path to PDF from Supabase Storage.
 *
 * Downloads PDF to temporary file and returns path.
 * Uses admin client to access full storage_path from database.
 */
async function getPdfPathFromStorage(documentId: string): Promise<string | null> {
  const supabase = createAdminClient()

  // Get document to find storage path
  const { data: doc, error } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .single()

  if (error || !doc?.storage_path) {
    console.error('[pymupdf] Failed to fetch document:', error)
    return null
  }

  try {
    // Download PDF from Storage using full storage path
    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(`${doc.storage_path}/source.pdf`)

    if (downloadError || !pdfBlob) {
      console.error('[pymupdf] Failed to download PDF:', downloadError)
      return null
    }

    // Write to temp file
    const tempPath = join(tmpdir(), `pymupdf_${documentId}_${Date.now()}.pdf`)
    const buffer = await pdfBlob.arrayBuffer()
    await writeFile(tempPath, Buffer.from(buffer))

    console.log('[pymupdf] Downloaded PDF to temp file:', tempPath)
    return tempPath

  } catch (err) {
    console.error('[pymupdf] Error downloading PDF to temp file:', err)
    return null
  }
}
