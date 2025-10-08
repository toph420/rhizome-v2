/**
 * Simplified PDF Processor
 *
 * Linear processing flow:
 * 1. Extract PDF with batching (uses existing extractLargePDF)
 * 2. Local regex cleanup (cleanPageArtifacts)
 * 3. AI cleanup with batching
 * 4. Boundary-based chunking
 * 5. Return results
 *
 * Removed complexity:
 * - Review mode (reviewBeforeChunking)
 * - Type-specific chunking strategies
 * - Complex progress tracking with intervals
 * - Gemini file upload flow (uses extractLargePDF directly)
 *
 * Cost: ~$0.55 per 500-page book
 * Time: <20 minutes processing
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { extractLargePDF } from '../lib/pdf-batch-utils.js'
import { cleanPageArtifacts } from '../lib/text-cleanup.js'
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

    // Stage 2: Extract PDF with batching (15-40%)
    await this.updateProgress(20, 'extract', 'processing', 'Extracting PDF content')

    const extractionResult = await this.withRetry(
      async () => {
        return await extractLargePDF(
          this.ai,
          fileBuffer,
          (percent) => {
            const stagePercent = 20 + Math.floor(percent * 0.20) // 20-40%
            this.updateProgress(
              stagePercent,
              'extract',
              'processing',
              `${percent}% extracted`
            )
          }
        )
      },
      'PDF extraction'
    )

    let markdown = extractionResult.markdown
    const markdownKB = Math.round(markdown.length / 1024)

    console.log(`[PDFProcessor] Extracted ${markdownKB}KB markdown`)

    await this.updateProgress(40, 'extract', 'complete', 'PDF extraction done')

    // Stage 3: Local regex cleanup (40-45%)
    await this.updateProgress(42, 'cleanup_local', 'processing', 'Removing page artifacts')

    markdown = cleanPageArtifacts(markdown)

    console.log(`[PDFProcessor] Local cleanup complete`)

    await this.updateProgress(45, 'cleanup_local', 'complete', 'Local cleanup done')

    // Stage 4: AI semantic chunking with metadata extraction (45-90%)
    // This replaces both AI cleanup AND boundary chunking with a single integrated step
    await this.updateProgress(50, 'chunking', 'processing', 'Creating semantic chunks')

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
            // Map progress phases to percentages: 50-90%
            const basePercent = 50
            const rangePercent = 40

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

    await this.updateProgress(90, 'chunking', 'complete', `${chunks.length} chunks created`)

    // Stage 6: Finalize (90-100%)
    await this.updateProgress(95, 'finalize', 'formatting', 'Finalizing')

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
