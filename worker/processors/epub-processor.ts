/**
 * EPUB document processor with chapter-based batch boundaries.
 * Uses same AI chunking pipeline as PDFs but with natural chapter divisions.
 *
 * Processing stages:
 * 1. Download and parse EPUB (FREE - local processing)
 * 2. Extract metadata and cover image (FREE - local OPF parsing)
 * 3. Convert HTML→markdown (FREE - deterministic Turndown)
 * 4. AI chunk each chapter ($0.02 per chapter batch)
 * 5. Upload cover image to storage
 *
 * Cost: ~$0.40 per 500-page book (20% savings vs PDF)
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { parseEPUB } from '../lib/epub/epub-parser.js'
import { inferDocumentType } from '../lib/epub/type-inference.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'
import type { MetadataExtractionProgress } from '../types/chunking.js'
import { GEMINI_MODEL } from '../lib/model-config.js'
import { cleanEpubArtifacts } from '../lib/epub/epub-cleaner.js'
import { cleanMarkdownWithAI } from '../lib/markdown-cleanup-ai.js'

export class EPUBProcessor extends SourceProcessor {
  /**
   * Process EPUB document with chapter-based batching.
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

      // Refresh connection before first storage operation
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

    // Stage 4: Combine chapters into full document (30%)
    await this.updateProgress(30, 'convert', 'merging', 'Combining chapters')

    const rawMarkdown = chapters
      .map(ch => `# ${ch.title}\n\n${ch.markdown}`)
      .join('\n\n---\n\n')

    // Clean EPUB artifacts BEFORE chunking (TOC links, filename headings, boilerplate)
    let fullMarkdown = cleanEpubArtifacts(rawMarkdown)

    const markdownKB = Math.round(fullMarkdown.length / 1024)
    console.log(`[EPUBProcessor] Combined ${chapters.length} chapters into ${markdownKB}KB clean markdown`)

    // Stage 4.5: AI cleanup pass (if enabled)
    const { cleanMarkdown: cleanMarkdownEnabled = true } = this.job.input_data as any

    if (cleanMarkdownEnabled) {
      await this.updateProgress(32, 'cleanup', 'ai-polish', 'AI polishing markdown...')

      try {
        fullMarkdown = await cleanMarkdownWithAI(this.ai, fullMarkdown, {
          enableProgress: true,
          onProgress: async (batch, total) => {
            if (total > 1) {
              const progressPercent = 32 + Math.floor((batch / total) * 3) // 32-35%
              await this.updateProgress(
                progressPercent,
                'cleanup',
                'ai-polish',
                `AI cleanup: batch ${batch}/${total}`
              )
            }
          }
        })

        await this.updateProgress(35, 'cleanup', 'complete', 'Markdown cleanup complete')
      } catch (cleanupError: any) {
        console.warn(`[EPUBProcessor] AI cleanup failed, continuing: ${cleanupError.message}`)
        // Continue with EPUB-cleaned markdown - non-fatal
      }
    } else {
      console.log('[EPUBProcessor] AI cleanup skipped (cleanMarkdown: false)')
    }

    // Stage 5: Check if we should skip AI chunking (review mode)
    const documentType = inferDocumentType(metadata)
    console.log(`[EPUBProcessor] Inferred document type: ${documentType}`)

    const { reviewBeforeChunking = false } = this.job.input_data as any

    console.log('[EPUBProcessor] Debug - job.input_data:', JSON.stringify(this.job.input_data, null, 2))
    console.log('[EPUBProcessor] Debug - reviewBeforeChunking flag:', reviewBeforeChunking)

    if (reviewBeforeChunking) {
      console.log('[EPUBProcessor] Review mode: Using simple chunking (AI chunking deferred to continue-processing)')

      // Use cheap heading-based chunking (FREE - no AI cost)
      const { simpleMarkdownChunking } = await import('../lib/markdown-chunking.js')
      const simpleChunks = simpleMarkdownChunking(fullMarkdown)

      console.log(`[EPUBProcessor] Created ${simpleChunks.length} simple chunks (placeholder mode)`)
      await this.updateProgress(75, 'finalize', 'complete', `Created ${simpleChunks.length} placeholder chunks`)

      // Calculate metadata for simple mode
      const wordCount = fullMarkdown.split(/\s+/).filter(word => word.length > 0).length

      // Return simple chunks as placeholders (will be replaced in continue-processing)
      return {
        markdown: fullMarkdown,
        chunks: simpleChunks,
        metadata: {
          title: metadata.title,
          author: metadata.author,
          extra: {
            document_type: documentType,
            isbn: metadata.isbn,
            publisher: metadata.publisher,
            publication_date: metadata.publicationDate,
            language: metadata.language,
            description: metadata.description
          }
        },
        wordCount,
        outline: [] // No outline in review mode (deferred to continue-processing)
      }
    }

    // Normal mode: AI chunking with chapter boundaries (30-70%)
    await this.updateProgress(
      35,
      'extract',
      'chunking',
      `AI chunking ${chapters.length} chapters (${documentType})`
    )

    // CRITICAL: Build customBatches from CLEANED markdown, not original chapters
    // Split the cleaned markdown back into chapters using the separator
    const cleanedChapterSections = fullMarkdown.split(/\n\n---\n\n/)

    console.log(`[EPUBProcessor] Rebuilt ${cleanedChapterSections.length} chapters from cleaned markdown`)

    // Calculate absolute offsets for each chapter using CLEANED content
    const customBatches = cleanedChapterSections.map((chapterContent, i) => {
      // Calculate start offset: sum of all previous chapters + separators
      const precedingChapters = cleanedChapterSections.slice(0, i)

      const startOffset = precedingChapters.reduce((offset, prevChapter) => {
        const separatorLength = offset === 0 ? 0 : '\n\n---\n\n'.length
        return offset + prevChapter.length + separatorLength
      }, 0)

      const endOffset = startOffset + chapterContent.length

      return {
        content: chapterContent, // DON'T trim - keep offsets aligned with fullMarkdown positions
        startOffset,
        endOffset
      }
    })

    const progressCallback = (progress: MetadataExtractionProgress) => {
      const percentage = 35 + Math.floor(((progress.batchesProcessed + 1) / progress.totalBatches) * 35)
      this.updateProgress(
        percentage,
        'extract',
        'metadata',
        `AI metadata: chapter ${progress.batchesProcessed + 1}/${progress.totalBatches} (${progress.chunksIdentified} chunks)`
      )
    }

    const chunks = await this.withRetry(
      async () => batchChunkAndExtractMetadata(
        fullMarkdown,
        {
          apiKey: process.env.GOOGLE_AI_API_KEY,
          modelName: GEMINI_MODEL,
          enableProgress: true,
          customBatches // Use chapter boundaries instead of arbitrary windows
        },
        progressCallback,
        documentType // Use type-specific chunking prompt
      ),
      'AI metadata extraction'
    )

    console.log(`[EPUBProcessor] Created ${chunks.length} semantic chunks from ${chapters.length} chapters`)

    // Stage 6: Finalize (75%)
    // Note: Handler will upload markdown to storage (not processor responsibility)
    await this.updateProgress(75, 'finalize', 'complete', `Created ${chunks.length} chunks with AI metadata`)

    // Convert AI chunks to ProcessedChunk format with proper metadata mapping
    const enrichedChunks = chunks.map((aiChunk, index) => ({
      document_id: this.job.document_id,
      ...this.mapAIChunkToDatabase({
        ...aiChunk,
        chunk_index: index
      })
    })) as unknown as ProcessedChunk[]

    return {
      markdown: fullMarkdown,
      chunks: enrichedChunks,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        extra: {
          document_type: documentType,
          isbn: metadata.isbn,
          publisher: metadata.publisher,
          publication_date: metadata.publicationDate,
          language: metadata.language,
          description: metadata.description,
          cover_image_url: coverImage ? `${storagePath}/cover.jpg` : undefined
        }
      },
      wordCount: fullMarkdown.split(/\s+/).length
    }
  }
}
