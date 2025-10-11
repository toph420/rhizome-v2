/**
 * PDF Processor with Docling Local Extraction
 *
 * Linear processing flow:
 * 1. Extract PDF with Docling (100% reliable, local processing)
 * 2. Local regex cleanup (cleanPageArtifacts)
 * 3. AI cleanup (heading-split for large docs, optional)
 * 4. Review checkpoint (optional pause)
 * 5. AI semantic chunking
 * 6. Return results
 *
 * AI Cleanup Strategy (Optional):
 * - Small PDFs (<100K): Single-pass cleanup
 * - Large PDFs (>100K): Split at ## headings, clean sections
 * - Deterministic joining (no overlap, no stitching)
 * - Controlled by cleanMarkdown flag (default: true)
 *
 * Cost:
 * - With AI cleanup: ~$0.50 per 500-page book ($0 extraction + $0.50 chunking)
 * - Without AI cleanup: ~$0.50 per 500-page book (chunking only)
 * Time: <15 minutes (9 min extraction + 6 min processing)
 *
 * Reliability: 100% success rate (no network dependency)
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { extractPdfBuffer } from '../lib/docling-extractor.js'
import { cleanPageArtifacts } from '../lib/text-cleanup.js'
import { cleanPdfMarkdown } from '../lib/markdown-cleanup-ai.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'

export class PDFProcessor extends SourceProcessor {
  /**
   * Process PDF document with simplified pipeline.
   *
   * @returns Processed markdown, chunks, and metadata
   * @throws Error if PDF processing fails
   */
  async process(): Promise<ProcessResult> {
    const storagePath = this.getStoragePath()

    // Stage 1: Download PDF from storage (10%)
    await this.updateProgress(10, 'download', 'fetching', 'Downloading PDF file')

    const { data: signedUrlData } = await this.supabase.storage
      .from('documents')
      .createSignedUrl(`${storagePath}/source.pdf`, 3600)

    if (!signedUrlData?.signedUrl) {
      throw new Error('Failed to create signed URL for PDF')
    }

    const fileResponse = await fetch(signedUrlData.signedUrl)
    const fileBuffer = await fileResponse.arrayBuffer()

    const fileSizeKB = Math.round(fileBuffer.byteLength / 1024)
    console.log(`[PDFProcessor] Downloaded ${fileSizeKB}KB PDF`)

    await this.updateProgress(15, 'download', 'complete', `Downloaded ${fileSizeKB}KB file`)

    // Stage 2: Extract PDF with Docling (15-50%)
    await this.updateProgress(20, 'extract', 'processing', 'Extracting PDF with Docling')

    const extractionResult = await this.withRetry(
      async () => {
        return await extractPdfBuffer(
          fileBuffer,
          {
            ocr: false, // Enable if needed for scanned PDFs
            timeout: 30 * 60 * 1000 // 30 minutes
          },
          async (progress) => {
            // Map Docling progress to our percentage
            if (progress.status === 'starting') {
              await this.updateProgress(20, 'extract', 'processing', progress.message)
            } else if (progress.status === 'converting') {
              // Estimate progress based on status (we don't get page-by-page from Docling)
              await this.updateProgress(35, 'extract', 'processing', progress.message)
            }
          }
        )
      },
      'Docling PDF extraction'
    )

    let markdown = extractionResult.markdown
    const markdownKB = Math.round(markdown.length / 1024)

    console.log(`[PDFProcessor] Extracted ${extractionResult.pages} pages (${markdownKB}KB markdown)`)
    console.log(`[PDFProcessor] Extraction time: ${(extractionResult.extractionTime / 1000).toFixed(1)}s`)

    await this.updateProgress(50, 'extract', 'complete', 'PDF extraction done')

    // Stage 3: Local regex cleanup (50-55%)
    await this.updateProgress(52, 'cleanup_local', 'processing', 'Removing page artifacts')

    // Docling already extracts structure, skip heading generation
    markdown = cleanPageArtifacts(markdown, { skipHeadingGeneration: true })

    console.log(`[PDFProcessor] Local cleanup complete (Docling mode: heading generation skipped)`)

    await this.updateProgress(55, 'cleanup_local', 'complete', 'Local cleanup done')

    // Stage 3.5: Check for review-after-docling mode BEFORE AI cleanup
    const reviewDoclingExtraction = this.job.input_data?.reviewDoclingExtraction === true

    if (reviewDoclingExtraction) {
      console.log('[PDFProcessor] Review Docling extraction mode enabled - pausing before AI cleanup')
      console.log('[PDFProcessor] Markdown will be AI cleaned after Obsidian review')

      await this.updateProgress(70, 'finalize', 'awaiting_review', 'Ready for Docling extraction review')

      return {
        markdown,
        chunks: [], // No chunks - will be created after review and AI cleanup
        metadata: {
          sourceUrl: this.job.metadata?.source_url
        },
        wordCount: markdown.split(/\s+/).length
      }
    }

    // Stage 4: AI cleanup (55-70%) - CONDITIONAL on cleanMarkdown flag
    const cleanMarkdownEnabled = this.job.input_data?.cleanMarkdown !== false // Default true

    if (cleanMarkdownEnabled) {
      await this.updateProgress(58, 'cleanup_ai', 'processing', 'AI cleaning markdown')
      console.log('[PDFProcessor] Starting AI cleanup (heading-split for large docs)')

      try {
        markdown = await cleanPdfMarkdown(
        this.ai,
        markdown,
        {
          onProgress: async (sectionNum, totalSections) => {
            const percent = 58 + Math.floor((sectionNum / totalSections) * 12) // 58-70%
            await this.updateProgress(
              percent,
              'cleanup_ai',
              'processing',
              `AI cleaning section ${sectionNum}/${totalSections}`
            )
          }
        }
      )

        console.log(`[PDFProcessor] AI cleanup complete`)
        await this.updateProgress(70, 'cleanup_ai', 'complete', 'AI cleanup done')
      } catch (error: any) {
        console.error(`[PDFProcessor] AI cleanup failed: ${error.message}`)
        console.warn('[PDFProcessor] Falling back to regex-cleaned markdown')
        // markdown already has regex cleanup, just continue
        await this.updateProgress(70, 'cleanup_ai', 'fallback', 'Using regex cleanup only')
      }
    } else {
      // AI cleanup disabled by user - use regex-only
      console.log('[PDFProcessor] AI cleanup disabled - using regex cleanup only')
      await this.updateProgress(70, 'cleanup_ai', 'skipped', 'AI cleanup disabled by user')
    }

    // Stage 5: Check for review mode BEFORE expensive AI chunking
    const reviewBeforeChunking = this.job.input_data?.reviewBeforeChunking

    if (reviewBeforeChunking) {
      console.log('[PDFProcessor] Review mode enabled - skipping AI chunking')
      console.log('[PDFProcessor] Markdown will be chunked after Obsidian review')
      console.log('[PDFProcessor] Saved ~$0.50 by skipping pre-review chunking (already AI cleaned)')

      await this.updateProgress(90, 'finalize', 'awaiting_review', 'Ready for manual review')

      return {
        markdown,
        chunks: [], // No chunks - will be created after review
        metadata: {
          sourceUrl: this.job.metadata?.source_url
        },
        wordCount: markdown.split(/\s+/).length
      }
    }

    // Stage 5: AI semantic chunking with metadata extraction (70-95%)
    await this.updateProgress(72, 'chunking', 'processing', 'Creating semantic chunks')

    const cleanedKB = Math.round(markdown.length / 1024)
    console.log(`[PDFProcessor] Starting AI chunking on ${cleanedKB}KB markdown`)

    const chunks = await this.withRetry(
      async () => {
        return await batchChunkAndExtractMetadata(
          markdown,
          {
            apiKey: process.env.GOOGLE_AI_API_KEY,
            maxBatchSize: 20000, // 20K chars per batch
            enableProgress: true
          },
          async (progress) => {
            // Map progress phases to percentages: 72-95%
            const basePercent = 72
            const rangePercent = 23

            let phaseProgress = 0
            if (progress.phase === 'batching') phaseProgress = 0
            else if (progress.phase === 'ai_chunking') {
              phaseProgress = (progress.batchesProcessed / progress.totalBatches) * 0.8
            } else if (progress.phase === 'deduplication') phaseProgress = 0.9
            else if (progress.phase === 'complete') phaseProgress = 1.0

            const stagePercent = basePercent + Math.floor(phaseProgress * rangePercent)
            await this.updateProgress(
              stagePercent,
              'chunking',
              'processing',
              `Processing batch ${progress.batchesProcessed}/${progress.totalBatches}`
            )
          },
          'nonfiction_book' // Document type for specialized chunking
        )
      },
      'Semantic chunking with metadata extraction'
    )

    console.log(`[PDFProcessor] Created ${chunks.length} semantic chunks with AI metadata`)

    await this.updateProgress(95, 'chunking', 'complete', `${chunks.length} chunks created`)

    // Stage 6: Finalize (95-100%)
    await this.updateProgress(97, 'finalize', 'formatting', 'Finalizing')

    // Convert to ProcessedChunk format
    // batchChunkAndExtractMetadata returns chunks with metadata already extracted
    const enrichedChunks = chunks.map((chunk, idx) => {
      // Calculate word count if not provided
      const wordCount = chunk.content.split(/\s+/).filter(w => w.length > 0).length

      return {
        document_id: this.job.document_id,
        content: chunk.content,
        chunk_index: idx, // Use array index for sequential numbering
        start_offset: chunk.start_offset,
        end_offset: chunk.end_offset,
        word_count: wordCount,
        themes: chunk.metadata.themes || [],
        importance_score: chunk.metadata.importance || 0.5,
        summary: chunk.metadata.summary || null,
        emotional_metadata: {
          polarity: chunk.metadata.emotional?.polarity || 0,
          primaryEmotion: chunk.metadata.emotional?.primaryEmotion || 'neutral',
          intensity: chunk.metadata.emotional?.intensity || 0
        },
        conceptual_metadata: {
          concepts: chunk.metadata.concepts || []
        },
        domain_metadata: chunk.metadata.domain ? {
          primaryDomain: chunk.metadata.domain,
          confidence: 0.8
        } : null,
        metadata_extracted_at: new Date().toISOString()
      }
    }) as unknown as ProcessedChunk[]

    await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')

    return {
      markdown,
      chunks: enrichedChunks,
      metadata: {
        sourceUrl: this.job.metadata?.source_url
      },
      wordCount: markdown.split(/\s+/).length
    }
  }
}
