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
import { cleanEpubChaptersWithAI } from '../lib/markdown-cleanup-ai.js'

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

    // Stage 4: Clean chapters with regex BEFORE combining (30%)
    await this.updateProgress(30, 'cleanup', 'regex', 'Cleaning EPUB artifacts')

    // Step 1: Regex cleanup (per chapter)
    const regexCleaned = chapters.map(ch => ({
      title: ch.title,
      markdown: cleanEpubArtifacts(ch.markdown)
    }))

    console.log(`[EPUBProcessor] Regex cleaned ${regexCleaned.length} chapters`)

    // Stage 4.5: AI cleanup pass (if enabled) - per chapter, no batching
    const { cleanMarkdown: cleanMarkdownEnabled = true } = this.job.input_data as any
    let fullMarkdown: string

    if (cleanMarkdownEnabled) {
      await this.updateProgress(32, 'cleanup', 'ai-polish', 'AI polishing chapters...')

      try {
        // Step 2: AI cleanup (per chapter) + Step 3: Join with ---
        fullMarkdown = await cleanEpubChaptersWithAI(this.ai, regexCleaned, {
          enableProgress: true,
          onProgress: async (chapter, total) => {
            const progressPercent = 32 + Math.floor((chapter / total) * 3) // 32-35%
            await this.updateProgress(
              progressPercent,
              'cleanup',
              'ai-polish',
              `AI cleanup: chapter ${chapter}/${total}`
            )
          }
        })

        await this.updateProgress(35, 'cleanup', 'complete', 'Markdown cleanup complete')

        const markdownKB = Math.round(fullMarkdown.length / 1024)
        console.log(
          `[EPUBProcessor] AI cleaned ${regexCleaned.length} chapters → ${markdownKB}KB markdown ` +
          `(joined with deterministic --- separators)`
        )
      } catch (cleanupError: any) {
        console.warn(`[EPUBProcessor] AI cleanup failed, using regex-only: ${cleanupError.message}`)

        // Fallback: just combine regex-cleaned chapters
        // Check if markdown already has a heading to prevent duplicates
        // Skip prepending if title looks like a filename (e.g., "V4135EPUB-9" or "chapter01")
        fullMarkdown = regexCleaned
          .map(ch => {
            const startsWithHeading = /^#+\s/.test(ch.markdown.trim())
            const isFilename = /^[A-Z0-9]+EPUB-\d+$|^chapter\d+$|^\d+$/i.test(ch.title)

            if (startsWithHeading || isFilename) {
              return ch.markdown
            }
            return `# ${ch.title}\n\n${ch.markdown}`
          })
          .join('\n\n---\n\n')
      }
    } else {
      console.log('[EPUBProcessor] AI cleanup skipped (cleanMarkdown: false)')

      // No AI cleanup: just combine regex-cleaned chapters
      // Check if markdown already has a heading to prevent duplicates
      // Skip prepending if title looks like a filename (e.g., "V4135EPUB-9" or "chapter01")
      fullMarkdown = regexCleaned
        .map(ch => {
          const startsWithHeading = /^#+\s/.test(ch.markdown.trim())
          const isFilename = /^[A-Z0-9]+EPUB-\d+$|^chapter\d+$|^\d+$/i.test(ch.title)

          if (startsWithHeading || isFilename) {
            return ch.markdown
          }
          return `# ${ch.title}\n\n${ch.markdown}`
        })
        .join('\n\n---\n\n')
    }

    const markdownKB = Math.round(fullMarkdown.length / 1024)
    console.log(`[EPUBProcessor] Final markdown: ${markdownKB}KB`)

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

    // Normal mode: AI chunking with windowed batching (30-70%)
    await this.updateProgress(
      35,
      'extract',
      'chunking',
      `AI chunking with semantic analysis (${documentType})`
    )

    // Use windowed batching (same as PDFs) for consistent behavior
    // The AI will create semantic chunks regardless of chapter boundaries
    console.log(`[EPUBProcessor] Using windowed batching for ${fullMarkdown.length} chars of markdown`)

    const progressCallback = (progress: MetadataExtractionProgress) => {
      const percentage = 35 + Math.floor(((progress.batchesProcessed + 1) / progress.totalBatches) * 35)
      this.updateProgress(
        percentage,
        'extract',
        'metadata',
        `AI metadata: batch ${progress.batchesProcessed + 1}/${progress.totalBatches} (${progress.chunksIdentified} chunks)`
      )
    }

    const chunks = await this.withRetry(
      async () => batchChunkAndExtractMetadata(
        fullMarkdown,
        {
          apiKey: process.env.GOOGLE_AI_API_KEY,
          modelName: GEMINI_MODEL,
          enableProgress: true
          // No customBatches - use default windowed approach like PDFs
        },
        progressCallback,
        documentType // Use type-specific chunking prompt
      ),
      'AI metadata extraction'
    )

    console.log(`[EPUBProcessor] Created ${chunks.length} semantic chunks using windowed batching`)

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
