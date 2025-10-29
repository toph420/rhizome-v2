/**
 * PyMuPDF Selection - Server Action for Precise PDF Text Selection
 *
 * Provides pixel-perfect word-level rectangles for PDF text selections using PyMuPDF.
 * Reuses same temp file download pattern as pymupdf.ts for consistency.
 *
 * @module pymupdf-selection
 */

'use server'

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createAdminClient } from '@/lib/supabase/admin'

const execAsync = promisify(exec)

/**
 * Rectangle format matching PyMuPDF output
 */
export interface PyMuPdfRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Result from PDF selection rectangle extraction
 */
export interface PyMuPdfSelectionResult {
  found: boolean
  rects: PyMuPdfRect[]
  method?: 'exact' | 'whitespace' | 'aggressive' | 'fuzzy'
  similarity?: number
}

/**
 * Get precise word-level rectangles for PDF text selection using PyMuPDF.
 *
 * Server Action that:
 * 1. Downloads PDF from Supabase Storage to temp file
 * 2. Executes PyMuPDF script to find text with word-level precision
 * 3. Returns precise rectangles
 * 4. Cleans up temp file
 *
 * Reuses same IPC pattern as pymupdf.ts for consistency.
 *
 * @param documentId - Document UUID
 * @param pageNumber - 1-indexed page number
 * @param selectedText - Text selected by user in PDF view
 * @returns Precise word-level rectangles for the selection
 *
 * @example
 * ```typescript
 * const result = await getPdfSelectionRects(docId, 5, "The Scream does really")
 * if (result.found) {
 *   // Use result.rects for annotation creation
 *   console.log(`Found ${result.rects.length} word-level rectangles`)
 * }
 * ```
 */
export async function getPdfSelectionRects(
  documentId: string,
  pageNumber: number,
  selectedText: string
): Promise<PyMuPdfSelectionResult> {
  let tempFilePath: string | null = null

  try {
    // Step 1: Download PDF to temp file (same pattern as pymupdf.ts)
    const supabase = createAdminClient()

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', documentId)
      .single()

    if (docError || !doc?.storage_path) {
      console.error('[getPdfSelectionRects] Document not found:', docError)
      return { found: false, rects: [] }
    }

    // Download PDF from Storage (use source.pdf like pymupdf.ts)
    const pdfPath = `${doc.storage_path}/source.pdf`
    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(pdfPath)

    if (downloadError || !pdfBlob) {
      console.error('[getPdfSelectionRects] PDF download failed:', downloadError)
      return { found: false, rects: [] }
    }

    // Create temp file
    tempFilePath = path.join(os.tmpdir(), `pymupdf_selection_${documentId}_${Date.now()}.pdf`)
    const buffer = Buffer.from(await pdfBlob.arrayBuffer())
    await fs.writeFile(tempFilePath, buffer)

    console.log('[getPdfSelectionRects] Downloaded PDF to temp file:', tempFilePath)

    // Step 2: Execute PyMuPDF selection script
    // Escape search text for shell (prevent injection)
    const escapedText = selectedText.replace(/'/g, "'\\''")

    const { stdout, stderr } = await execAsync(
      `python3 worker/scripts/get_pdf_selection_rects.py '${tempFilePath}' ${pageNumber} '${escapedText}'`,
      {
        timeout: 10000, // 10 second timeout (longer than coordinate mapper for complex selections)
        maxBuffer: 2 * 1024 * 1024, // 2MB buffer (larger selections possible)
      }
    )

    if (stderr) {
      // Log stderr for debugging but don't treat as error (PyMuPDF logs to stderr)
      console.log('[getPdfSelectionRects] Script output:', stderr)
    }

    // Step 3: Parse JSON results
    const rects = JSON.parse(stdout) as PyMuPdfRect[]

    console.log('[getPdfSelectionRects] Found', rects.length, 'word-level rectangles')

    return {
      found: rects.length > 0,
      rects,
    }
  } catch (error) {
    console.error('[getPdfSelectionRects] Error:', error)
    return { found: false, rects: [] }
  } finally {
    // Step 4: Cleanup temp file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath)
        console.log('[getPdfSelectionRects] Cleaned up temp file:', tempFilePath)
      } catch (cleanupError) {
        console.error('[getPdfSelectionRects] Cleanup error:', cleanupError)
      }
    }
  }
}
