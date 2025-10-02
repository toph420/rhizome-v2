/**
 * PDF processor for document extraction using Gemini Files API.
 * Handles PDF upload, extraction, chunking, and metadata generation.
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { simpleMarkdownChunking } from '../lib/markdown-chunking.js'
import { GeminiFileCache } from '../lib/gemini-cache.js'
import { extractLargePDF, DEFAULT_BATCH_CONFIG } from '../lib/pdf-batch-utils.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'
import type { MetadataExtractionProgress } from '../types/ai-metadata.js'
import { GEMINI_MODEL, MAX_OUTPUT_TOKENS } from '../lib/model-config.js'

// Thresholds for batched processing
const LARGE_PDF_PAGE_THRESHOLD = 200 // Use batching for PDFs with >200 pages
const LARGE_PDF_SIZE_MB_THRESHOLD = 10 // Or files larger than 10MB

/**
 * Extraction prompt for PDF processing.
 * Instructs Gemini to extract only markdown text for local chunking.
 */
const EXTRACTION_PROMPT = `
You are a PDF extraction assistant. Your task is to extract ALL text from this PDF document and convert it to clean markdown format.

IMPORTANT: Read the ENTIRE PDF document. Extract ALL pages, ALL paragraphs, ALL text.
Do not summarize or skip any content. Return the COMPLETE document text.

LINE BREAK HANDLING:
- Merge lines WITHIN paragraphs into continuous text
- Only preserve line breaks for semantic boundaries:
  - Paragraph breaks (use \n\n for new paragraphs)
  - Headings
  - List items
  - Code blocks
  - Block quotes

DO NOT preserve PDF formatting line wraps (lines that end because of page width).

Example of WRONG (preserves PDF line wrapping):
"This is a sentence that wraps\nat 80 characters because of the\nPDF page width."

Example of CORRECT (continuous paragraph):
"This is a sentence that wraps at 80 characters because of the PDF page width."

Format the output as clean markdown with:
- Proper heading hierarchy (# ## ###)
- Organized lists and paragraphs  
- Clear section breaks with \n\n between paragraphs
- Continuous text flow within paragraphs

Return only the markdown text, no JSON wrapper needed.
`

// No schema needed - expecting plain markdown text response

/**
 * PDF processor for extracting content using Gemini Files API.
 * Handles large PDFs by uploading to Gemini's file storage.
 * 
 * @example
 * const processor = new PDFProcessor(ai, supabase, job)
 * const result = await processor.process()
 */
export class PDFProcessor extends SourceProcessor {
  /**
   * Process PDF document through Gemini Files API.
   * 
   * @returns Processed result with markdown and chunks
   * @throws Error if PDF processing fails
   */
  async process(): Promise<ProcessResult> {
    const storagePath = this.getStoragePath()

    // Stage 1: Download PDF from storage
    await this.updateProgress(10, 'download', 'fetching', 'Retrieving PDF from storage')

    const { data: signedUrlData } = await this.supabase.storage
      .from('documents')
      .createSignedUrl(`${storagePath}/source.pdf`, 3600)

    if (!signedUrlData?.signedUrl) {
      throw new Error('Failed to create signed URL for PDF')
    }

    const fileResponse = await fetch(signedUrlData.signedUrl)
    const fileBuffer = await fileResponse.arrayBuffer()

    const fileSizeKB = Math.round(fileBuffer.byteLength / 1024)
    const fileSizeMB = fileBuffer.byteLength / (1024 * 1024)

    await this.updateProgress(12, 'download', 'complete', `Downloaded ${fileSizeKB} KB file`)

    // Check if we should use batched processing based on file size
    // Note: Page count check will happen after initial extraction if needed
    const shouldUseBatchedProcessing = fileSizeMB > LARGE_PDF_SIZE_MB_THRESHOLD

    if (shouldUseBatchedProcessing) {
      console.log(
        `[PDFProcessor] Large PDF detected (${fileSizeMB.toFixed(1)}MB > ${LARGE_PDF_SIZE_MB_THRESHOLD}MB threshold), ` +
        `using batched extraction`
      )
      return await this.processBatched(fileBuffer, fileSizeMB)
    } else {
      console.log(
        `[PDFProcessor] Standard size PDF (${fileSizeMB.toFixed(1)}MB), ` +
        `using standard extraction`
      )
    }
    
    // Stage 2: Upload to Gemini Files API (with caching)
    await this.updateProgress(15, 'extract', 'uploading', `Processing ${fileSizeKB} KB PDF with Gemini`)
    
    const uploadStart = Date.now()
    const cache = GeminiFileCache.getInstance()
    
    // Use cache to avoid re-uploading same PDFs
    const fileUri = await cache.getOrUpload(
      fileBuffer,
      async (buffer) => {
        const pdfBlob = new Blob([buffer], { type: 'application/pdf' })
        return await this.withRetry(
          async () => {
            return await this.ai.files.upload({
              file: pdfBlob,
              config: { mimeType: 'application/pdf' }
            })
          },
          'PDF upload to Gemini'
        )
      }
    )
    
    const uploadTime = Math.round((Date.now() - uploadStart) / 1000)
    await this.updateProgress(20, 'extract', 'validating', `Processing time: ${uploadTime}s, validating file...`)
    
    // Stage 3: Wait for file to become active (only if it's a fresh upload)
    // Cached files are already active
    if (uploadTime > 1) {
      await this.waitForFileActive(fileUri)
    }
    
    // Stage 4: Generate content with structured output
    const estimatedTime = fileSizeMB < 1 ? '1-2 min' : fileSizeMB < 5 ? '2-5 min' : '5-10 min'
    await this.updateProgress(25, 'extract', 'analyzing', `AI analyzing document (~${estimatedTime})...`)
    
    const result = await this.extractContent({ uri: fileUri, name: fileUri })
    
    // Stage 5: Parse and validate response
    const { markdown, chunks } = await this.parseExtractionResult(result)
    
    const markdownKB = Math.round(markdown.length / 1024)
    await this.updateProgress(40, 'extract', 'complete', `Extracted ${chunks.length} chunks (${markdownKB} KB)`)

    // ALWAYS use AI metadata extraction (no conditional logic)
    console.log(`[PDFProcessor] Using AI metadata extraction for ${markdown.length} character document`)

    await this.updateProgress(45, 'metadata', 'ai-extraction', 'Processing with AI metadata extraction...')

    const aiChunks = await batchChunkAndExtractMetadata(
      markdown,
      {
        apiKey: process.env.GOOGLE_AI_API_KEY,
        modelName: GEMINI_MODEL,
        enableProgress: true
      },
      async (progress: MetadataExtractionProgress) => {
        // Map AI extraction progress to overall progress (45-85%)
        const aiProgressPercent = (progress.batchesProcessed + 1) / progress.totalBatches
        const overallPercent = 45 + Math.floor(aiProgressPercent * 40)

        await this.updateProgress(
          overallPercent,
          'metadata',
          progress.phase,
          `AI extraction: batch ${progress.batchesProcessed + 1}/${progress.totalBatches} (${progress.chunksIdentified} chunks identified)`
        )
      }
    )

    // Convert AI chunks to ProcessedChunk format with proper metadata mapping
    const enrichedChunks = aiChunks.map((aiChunk, index) => ({
      document_id: this.job.document_id,
      ...this.mapAIChunkToDatabase({
        ...aiChunk,
        chunk_index: index
      })
    }))

    await this.updateProgress(
      85,
      'metadata',
      'complete',
      `Extracted ${aiChunks.length} chunks with AI metadata`
    )

    // Calculate additional metadata
    const wordCount = markdown.split(/\s+/).filter(word => word.length > 0).length
    const outline = this.extractOutline(markdown)

    // Stage 7: Prepare final result
    await this.updateProgress(90, 'finalize', 'complete', 'Processing complete')

    // Return complete ProcessResult for handler to save
    return {
      markdown,
      chunks: enrichedChunks,
      metadata: {
        sourceUrl: this.job.metadata?.source_url,
        extra: {
          usedAIMetadata: true,
          processingMode: 'standard',
          markdownSize: markdown.length
        }
      },
      wordCount,
      outline
    }
  }

  /**
   * Wait for uploaded file to become active in Gemini.
   * 
   * @param fileUri - URI or name of uploaded file
   * @throws Error if file validation fails
   */
  private async waitForFileActive(fileUri: string): Promise<void> {
    try {
      // Extract file name from URI if full URI is provided
      const fileName = fileUri.includes('/files/') ? fileUri.split('/files/')[1] : fileUri
      let fileState = await this.ai.files.get({ name: fileName })
      let attempts = 0
      const maxAttempts = 30 // 60 seconds max
      
      while (fileState.state === 'PROCESSING' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        fileState = await this.ai.files.get({ name: fileName })
        attempts++
        
        if (attempts % 5 === 0) {
          await this.updateProgress(20, 'extract', 'validating', `Validating file... (${attempts * 2}s)`)
        }
      }
      
      if (fileState.state !== 'ACTIVE') {
        throw new Error('File validation failed. The file may be corrupted or in an unsupported format.')
      }
    } catch (error: any) {
      // If file status check fails (404), assume file is ready and continue
      // This can happen with cached files or API timing issues
      console.warn(`File status check failed (${error.message}), proceeding with processing...`)
    }
  }

  /**
   * Extract content from uploaded PDF using Gemini.
   * 
   * @param uploadedFile - File uploaded to Gemini
   * @returns Raw extraction result from AI
   */
  private async extractContent(uploadedFile: any): Promise<any> {
    const generateStart = Date.now()
    const GENERATION_TIMEOUT = 12 * 60 * 1000 // 12 minutes
    
    // Update progress periodically during generation
    const progressInterval = setInterval(async () => {
      const elapsed = Math.round((Date.now() - generateStart) / 1000)
      const minutes = Math.floor(elapsed / 60)
      const seconds = elapsed % 60
      const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
      await this.updateProgress(30, 'extract', 'analyzing', `Still analyzing... (${timeStr} elapsed)`)
    }, 30000)
    
    try {
      // Simple configuration for plain text markdown output
      const generationConfig = {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.1,
      }
      
      const generationPromise = this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          parts: [
            { fileData: { fileUri: uploadedFile.uri || uploadedFile.name, mimeType: 'application/pdf' } },
            { text: EXTRACTION_PROMPT }
          ]
        }],
        config: generationConfig
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => {
          reject(new Error('Analysis timeout after 12 minutes. PDF may be too complex. Try splitting into smaller documents.'))
        }, GENERATION_TIMEOUT)
      )
      
      return await Promise.race([generationPromise, timeoutPromise])
    } finally {
      clearInterval(progressInterval)
    }
  }

  /**
   * Parse extraction result and create chunks using local algorithm.
   * Following the pattern from MarkdownCleanProcessor - separate extraction from chunking.
   * 
   * @param result - Raw markdown text from Gemini
   * @returns Parsed markdown and locally-generated chunks
   */
  private async parseExtractionResult(result: any): Promise<{ markdown: string; chunks: ProcessedChunk[] }> {
    if (!result || !result.text) {
      throw new Error('AI returned empty response. Please try again.')
    }
    
    // Clean up the markdown text (remove any code block wrappers)
    let markdown = result.text.trim()
    if (markdown.startsWith('```markdown')) {
      markdown = markdown.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '')
    } else if (markdown.startsWith('```')) {
      markdown = markdown.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
    }
    
    if (!markdown || markdown.length < 50) {
      throw new Error('AI returned insufficient content. Please try again.')
    }
    
    // Use local chunking algorithm (same as MarkdownAsIsProcessor)
    const chunks = simpleMarkdownChunking(markdown)
    
    return {
      markdown,
      chunks: chunks.map(chunk => ({
        content: chunk.content,
        themes: chunk.themes,
        importance: chunk.importance_score,
        summary: chunk.summary,
        start_offset: chunk.start_offset,
        end_offset: chunk.end_offset,
        chunk_index: chunk.chunk_index,
        word_count: chunk.word_count,
        heading_path: chunk.heading_path
      }))
    }
  }

  // JSON repair method no longer needed - we expect plain markdown text

  /**
   * Extract document outline from markdown.
   *
   * @param markdown - Processed markdown content
   * @returns Hierarchical outline structure
   */
  private extractOutline(markdown: string): any[] {
    const lines = markdown.split('\n')
    const outline: any[] = []
    const stack: any[] = []
    let offset = 0

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        const level = headingMatch[1].length
        const title = headingMatch[2].trim()

        const section = {
          title,
          level,
          offset,
          children: []
        }

        // Find parent level
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop()
        }

        if (stack.length === 0) {
          outline.push(section)
        } else {
          stack[stack.length - 1].children.push(section)
        }

        stack.push(section)
      }

      offset += line.length + 1 // +1 for newline
    }

    return outline
  }

  /**
   * Process large PDF using batched extraction.
   * Splits PDF into 100-page batches with 10-page overlap.
   *
   * @param fileBuffer - PDF file buffer
   * @param fileSizeMB - File size in MB for logging
   * @returns Processed result with stitched markdown and chunks
   */
  private async processBatched(
    fileBuffer: ArrayBuffer,
    fileSizeMB: number
  ): Promise<ProcessResult> {
    // Stage 2: Extract using batched processing
    await this.updateProgress(
      15,
      'extract',
      'batching',
      `Processing large PDF (${fileSizeMB.toFixed(1)}MB) in batches...`
    )

    const result = await extractLargePDF(
      this.ai,
      fileBuffer,
      async (batchNumber, totalBatches) => {
        // Update progress as batches complete
        // Scale from 15% to 40% during extraction
        const progressPercent = 15 + Math.floor((batchNumber / totalBatches) * 25)
        await this.updateProgress(
          progressPercent,
          'extract',
          'batch',
          `Extracting batch ${batchNumber}/${totalBatches}...`
        )
      },
      {
        pagesPerBatch: DEFAULT_BATCH_CONFIG.pagesPerBatch,
        overlapPages: DEFAULT_BATCH_CONFIG.overlapPages,
        model: GEMINI_MODEL,
        maxOutputTokens: MAX_OUTPUT_TOKENS
      }
    )

    if (result.failedCount > 0) {
      console.warn(
        `[PDFProcessor] ${result.failedCount}/${result.batches.length} batches failed. ` +
        `Proceeding with partial results.`
      )
    }

    // Note: Stitching will be handled in T-006
    // For now, batches are concatenated with separators
    const markdown = result.markdown

    const markdownKB = Math.round(markdown.length / 1024)
    await this.updateProgress(
      40,
      'extract',
      'complete',
      `Extracted ${result.totalPages} pages in ${result.batches.length} batches (${markdownKB} KB)`
    )

    // Stage 3: Create chunks with AI metadata extraction
    await this.updateProgress(45, 'chunking', 'processing', 'Processing with AI metadata extraction...')

    console.log(
      `[PDFProcessor] Using AI metadata extraction for ${markdown.length} character document ` +
      `(batched processing)`
    )

    const aiChunks = await batchChunkAndExtractMetadata(
      markdown,
      {
        apiKey: process.env.GOOGLE_AI_API_KEY,
        modelName: GEMINI_MODEL,
        enableProgress: true
      },
      async (progress: MetadataExtractionProgress) => {
        // Map AI extraction progress to overall progress (45-85%)
        const aiProgressPercent = (progress.batchesProcessed + 1) / progress.totalBatches
        const overallPercent = 45 + Math.floor(aiProgressPercent * 40)

        await this.updateProgress(
          overallPercent,
          'metadata',
          progress.phase,
          `AI extraction: batch ${progress.batchesProcessed + 1}/${progress.totalBatches} (${progress.chunksIdentified} chunks identified)`
        )
      }
    )

    await this.updateProgress(
      85,
      'metadata',
      'complete',
      `Extracted ${aiChunks.length} chunks with AI metadata`
    )

    // Convert AI chunks to ProcessedChunk format with proper metadata mapping
    const enrichedChunks = aiChunks.map((aiChunk, index) => ({
      document_id: this.job.document_id,
      ...this.mapAIChunkToDatabase({
        ...aiChunk,
        chunk_index: index
      }),
      // Note: AI metadata system doesn't provide offsets yet
      // These will be calculated if needed for annotation support
      start_offset: 0,
      end_offset: aiChunk.content.length,
      word_count: aiChunk.content.split(/\s+/).length
    }))

    // Calculate additional document metadata
    const wordCount = markdown.split(/\s+/).filter(word => word.length > 0).length
    const outline = this.extractOutline(markdown)

    // Stage 4: Prepare final result
    await this.updateProgress(90, 'finalize', 'complete', 'Processing complete')

    return {
      markdown,
      chunks: enrichedChunks,
      metadata: {
        sourceUrl: this.job.metadata?.source_url,
        extra: {
          batchInfo: {
            totalBatches: result.batches.length,
            successfulBatches: result.successCount,
            failedBatches: result.failedCount,
            totalPages: result.totalPages,
            processingTimeMs: result.totalTime
          },
          usedAIMetadata: true,
          processingMode: 'batched'
        }
      },
      wordCount,
      outline
    }
  }
}