/**
 * Simplified EPUB Processor
 *
 * Linear processing flow:
 * 1. Parse EPUB (local, free)
 * 2. Local regex cleanup per chapter
 * 3. AI cleanup with batching
 * 4. Boundary-based chunking
 * 5. Return results
 *
 * Removed complexity:
 * - Review mode (reviewBeforeChunking)
 * - Type-specific chunking strategies
 * - Custom batching for chapters
 *
 * Cost: ~$0.50 per 500-page book
 * Time: <20 minutes processing
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { parseEPUB } from '../lib/epub/epub-parser.js'
import { cleanEpubArtifacts } from '../lib/epub/epub-cleaner.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'

export class EPUBProcessor extends SourceProcessor {
  /**
   * Process EPUB document with simplified pipeline.
   *
   * @returns Processed markdown, chunks, and metadata
   * @throws Error if EPUB is corrupted or processing fails
   */
  async process(): Promise<ProcessResult> {
    // Stage 1: Download EPUB file (10%)
    await this.updateProgress(10, 'download', 'fetching', 'Downloading EPUB file')

    const storagePath = this.getStoragePath()
    const fileData = await this.withRetry(
      async () => {
        const { data, error } = await this.supabase.storage
          .from('documents')
          .download(`${storagePath}/source.epub`)

        if (error) {
          throw new Error(`Failed to download EPUB: ${error.message}`)
        }

        return Buffer.from(await data.arrayBuffer())
      },
      'Download EPUB'
    )

    // Stage 2: Parse EPUB structure (20%)
    await this.updateProgress(20, 'parse', 'extracting', 'Parsing EPUB structure')

    const { metadata, chapters, coverImage } = await this.withRetry(
      async () => parseEPUB(fileData),
      'Parse EPUB'
    )

    console.log(`[EPUBProcessor] Parsed ${chapters.length} chapters from "${metadata.title}"`)

    // Stage 3: Save cover image if available (25%)
    if (coverImage) {
      await this.updateProgress(25, 'parse', 'cover', 'Uploading cover image')

      // Refresh connection before storage operation
      await this.refreshConnection()

      await this.withRetry(
        async () => {
          const { error } = await this.supabase.storage
            .from('documents')
            .upload(`${storagePath}/cover.jpg`, coverImage, {
              contentType: 'image/jpeg',
              upsert: true
            })

          if (error) {
            throw new Error(`Failed to upload cover: ${error.message}`)
          }
        },
        'Upload cover image'
      )

      console.log(`[EPUBProcessor] Cover image uploaded`)
    }

    // Stage 4: Local regex cleanup per chapter (30%)
    await this.updateProgress(30, 'cleanup_local', 'processing', 'Cleaning EPUB artifacts')

    const cleanedChapters = chapters.map(ch => ({
      title: ch.title,
      markdown: cleanEpubArtifacts(ch.markdown)
    }))

    console.log(`[EPUBProcessor] Regex cleaned ${cleanedChapters.length} chapters`)

    // Combine chapters with headings
    let combinedMarkdown = cleanedChapters
      .map(ch => {
        const startsWithHeading = /^#+\s/.test(ch.markdown.trim())
        const isFilename = /^[A-Z0-9]+EPUB-\d+$|^chapter\d+$|^\d+$/i.test(ch.title)

        if (startsWithHeading || isFilename) {
          return ch.markdown
        }
        return `# ${ch.title}\n\n${ch.markdown}`
      })
      .join('\n\n---\n\n')

    await this.updateProgress(40, 'cleanup_local', 'complete', 'Local cleanup done')

    // Stage 5: AI semantic chunking with metadata extraction (40-90%)
    // This replaces both AI cleanup AND boundary chunking with a single integrated step
    await this.updateProgress(45, 'chunking', 'processing', 'Creating semantic chunks')

    const markdownKB = Math.round(combinedMarkdown.length / 1024)
    console.log(`[EPUBProcessor] Starting AI chunking on ${markdownKB}KB markdown`)

    const chunks = await this.withRetry(
      async () => {
        return await batchChunkAndExtractMetadata(
          combinedMarkdown,
          {
            apiKey: process.env.GOOGLE_AI_API_KEY,
            maxBatchSize: 20000, // 20K chars per batch
            enableProgress: true
          },
          async (progress) => {
            // Map progress phases to percentages: 45-90%
            const basePercent = 45
            const rangePercent = 45

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
          'fiction' // Document type for specialized chunking
        )
      },
      'Semantic chunking with metadata extraction'
    )

    console.log(`[EPUBProcessor] Created ${chunks.length} semantic chunks with AI metadata`)

    await this.updateProgress(90, 'chunking', 'complete', `${chunks.length} chunks created`)

    // Stage 7: Finalize (90-100%)
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
      markdown: combinedMarkdown,
      chunks: enrichedChunks,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        extra: {
          isbn: metadata.isbn,
          publisher: metadata.publisher,
          publication_date: metadata.publicationDate,
          language: metadata.language,
          description: metadata.description,
          cover_image_url: coverImage ? `${storagePath}/cover.jpg` : undefined
        }
      },
      wordCount: combinedMarkdown.split(/\s+/).length
    }
  }
}
