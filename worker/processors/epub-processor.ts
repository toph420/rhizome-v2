/**
 * EPUB Processor with Chonkie Unified Chunking Pipeline
 *
 * CHONKIE INTEGRATION: Unified 10-stage processing flow (LOCAL mode only)
 * 1. Download EPUB from Storage (10-15%)
 * 2. Docling Extraction with HybridChunker (15-50%) - Metadata anchors
 * 3. Local Regex Cleanup + Optional AI Cleanup (50-70%)
 * 4. Bulletproof Coordinate Mapping (70-72%) - Maps Docling to cleaned markdown
 * 5. Optional Review Checkpoint (72%) - reviewBeforeChunking flag
 * 6. Chonkie Chunking (72-75%) - User-selected strategy (9 options)
 * 7. Metadata Transfer (75-77%) - Overlap detection transfers Docling metadata
 * 8. Metadata Enrichment (77-90%) - PydanticAI + Ollama
 * 9. Local Embeddings (90-95%) - Transformers.js with metadata enhancement
 * 10. Finalize (95-100%) - Save to Storage and Database
 *
 * Chonkie Strategies (user-selectable):
 * - recursive (default): Hierarchical splitting, 3-5 min
 * - token: Fixed-size chunks, 2-3 min
 * - sentence: Sentence boundaries, 3-4 min
 * - semantic: Topic-based, 8-15 min
 * - late: Contextual embeddings, 10-20 min
 * - code: AST-aware, 5-10 min
 * - neural: BERT semantic, 15-25 min
 * - slumber: Agentic LLM, 30-60 min
 * - table: Markdown tables, 3-5 min
 *
 * Cost: $0 (100% local processing, no API calls)
 * Time: 3-25 minutes (varies by chunker strategy)
 * Reliability: 100% success rate (no network dependency)
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { parseEPUB } from '../lib/epub/epub-parser.js'
import { cleanEpubArtifacts } from '../lib/epub/epub-cleaner.js'
import { cleanEpubChaptersWithAI } from '../lib/markdown-cleanup-ai.js'
// Phase 5: Local processing imports
import { extractEpubWithDocling, type DoclingChunk } from '../lib/local/epub-docling-extractor.js'
import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../lib/local/ollama-cleanup.js'
import { OOMError } from '../lib/local/ollama-client.js'
// Phase 5 Task 19: Bulletproof matching for EPUBs
import { bulletproofMatch, type MatchResult } from '../lib/local/bulletproof-matcher.js'
// Chonkie Integration: Unified chunking pipeline
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import { transferMetadataToChonkieChunks } from '../lib/chonkie/metadata-transfer.js'
import type { ChonkieStrategy } from '../lib/chonkie/types.js'
// Phase 2: Local metadata enrichment and embeddings handled by base class
// Cached chunks table integration
import { saveCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'
// Phase 1: Shared chunker configuration
import { getChunkerOptions } from '../lib/chunking/chunker-config.js'
// Phase 6: Chunk statistics for validation
import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'

export class EPUBProcessor extends SourceProcessor {
  /**
   * Load chapter cleanup checkpoint if resuming from interruption
   */
  private async loadChapterCheckpoint(): Promise<{
    completedChapters: string[]
    startFromChapter: number
  } | null> {
    // Check if job is being resumed
    if (!this.job.resume_count || this.job.resume_count === 0) {
      return null
    }

    if (!this.job.last_checkpoint_stage || this.job.last_checkpoint_stage !== 'cleanup_ai_chapters') {
      return null
    }

    try {
      console.log('[EPUBProcessor] Resuming from chapter cleanup checkpoint')

      // Download checkpoint from Storage
      const { data, error } = await this.supabase.storage
        .from('documents')
        .download(this.job.last_checkpoint_path!)

      if (error) {
        console.warn('[EPUBProcessor] Checkpoint not found, starting fresh:', error)
        return null
      }

      const checkpoint = JSON.parse(await data.text())

      console.log(`[EPUBProcessor] Checkpoint loaded: ${checkpoint.data.completedChapters.length}/${checkpoint.data.totalChapters} chapters already complete`)

      return {
        completedChapters: checkpoint.data.completedChapters,
        startFromChapter: checkpoint.data.lastCompletedIndex + 1
      }
    } catch (error) {
      console.error('[EPUBProcessor] Failed to load checkpoint:', error)
      return null
    }
  }

  /**
   * Process EPUB document with simplified pipeline.
   *
   * Phase 5: Added local mode with Docling + Ollama integration.
   * - PROCESSING_MODE=local: Extract chunks with Docling for bulletproof matching
   * - PROCESSING_MODE=cloud: Use existing parser + Gemini pipeline (backward compatible)
   *
   * @returns Processed markdown, chunks, and metadata
   * @throws Error if EPUB is corrupted or processing fails
   */
  async process(): Promise<ProcessResult> {
    const storagePath = this.getStoragePath()

    // Load chapter checkpoint if resuming
    const chapterCheckpoint = await this.loadChapterCheckpoint()

    // Phase 5: Check processing mode
    const isLocalMode = process.env.PROCESSING_MODE === 'local'
    console.log(`[EPUBProcessor] Processing mode: ${isLocalMode ? 'LOCAL' : 'CLOUD'}`)

    if (isLocalMode) {
      console.log('[EPUBProcessor] Local mode: Will extract chunks with Docling HybridChunker')
    }

    // Stage 1: Download EPUB file (10%)
    await this.updateProgress(10, 'download', 'fetching', 'Downloading EPUB file')

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

    let markdown: string
    let doclingChunks: DoclingChunk[] | undefined
    let metadata: any
    let coverImage: Buffer | undefined
    let extractedChapters: Array<{ title: string, markdown: string }> = []

    if (isLocalMode) {
      // LOCAL MODE: Use Docling extraction
      // Stage 2: Extract with Docling (10-50%)
      console.log('[EPUBProcessor] Using Docling extraction')

      await this.updateProgress(15, 'extract', 'processing', 'Extracting EPUB with Docling')

      const result = await this.withRetry(
        async () => {
          return await extractEpubWithDocling(fileData.buffer, {
            // Phase 1: Use shared chunker configuration (512 → 768 tokens)
            ...JSON.parse(getChunkerOptions()),
            onProgress: async (percent, stage, message) => {
              // Map Docling's 0-100% to our 15-50% extraction stage
              const ourPercent = 15 + Math.floor(percent * 0.35)
              await this.updateProgress(ourPercent, 'extract', 'processing', message)
            }
          })
        },
        'Docling EPUB extraction'
      )

      markdown = result.markdown
      doclingChunks = result.chunks
      metadata = result.epubMetadata

      // Parse chapters for potential Gemini cleanup (Docling doesn't provide chapters)
      // We need to parse the EPUB structure to get individual chapters
      console.log('[EPUBProcessor] Parsing EPUB chapters for AI cleanup option')
      const epubParseResult = await parseEPUB(fileData)
      extractedChapters = epubParseResult.chapters.map(ch => ({
        title: ch.title,
        markdown: ch.markdown
      }))
      console.log(`[EPUBProcessor] Parsed ${extractedChapters.length} chapters from EPUB`)

      console.log(`[EPUBProcessor] Docling extracted ${result.chunks.length} chunks`)
      console.log(`[EPUBProcessor] Book: "${metadata.title}" by ${metadata.author}`)

      // Store Docling chunks in job metadata for bulletproof matching later in this processing run
      this.job.metadata = {
        ...this.job.metadata,
        cached_extraction: {
          markdown: result.markdown,
          structure: result.structure,
          doclingChunks: result.chunks,
          epubMetadata: result.epubMetadata
        }
      }

      await this.updateProgress(50, 'extract', 'complete', 'Docling extraction done')

      // Checkpoint 1: Save extraction data
      await this.saveStageResult('extraction', {
        markdown: result.markdown,
        doclingChunks: result.chunks,
        structure: result.structure,
        epubMetadata: result.epubMetadata
      })

      // Stage 3: Local regex cleanup (50-55%)
      await this.updateProgress(52, 'cleanup_local', 'processing', 'Removing EPUB artifacts')
      markdown = cleanMarkdownRegexOnly(markdown)
      await this.updateProgress(55, 'cleanup_local', 'complete', 'Local cleanup done')

      // Checkpoint 2: Save cleaned markdown
      await this.saveStageResult('cleanup', { markdown })

      // Phase 5: Save extraction to cached_chunks table AFTER cleanup
      // This enables zero-cost LOCAL mode reprocessing with bulletproof matching
      // CRITICAL: Hash the CLEANED markdown (same version saved to storage)
      const documentId = this.job.document_id || this.job.input_data.document_id

      if (!documentId) {
        console.warn('[EPUBProcessor] Cannot save cache: document_id not available')
        console.warn('[EPUBProcessor] Job details:', {
          job_id: this.job.id,
          job_document_id: this.job.document_id,
          input_data_document_id: this.job.input_data?.document_id,
          has_input_data: !!this.job.input_data
        })
      } else {
        console.log(`[EPUBProcessor] Saving cache for document ${documentId}`)
        await saveCachedChunks(this.supabase, {
          document_id: documentId,
          extraction_mode: 'epub',
          markdown_hash: hashMarkdown(markdown), // Hash CLEANED markdown
          docling_version: '2.55.1',
          chunks: result.chunks,
          structure: result.structure
        })

        // Checkpoint 2b: Save cached_chunks.json in LOCAL mode (for zero-cost reprocessing)
        await this.saveStageResult('cached_chunks', {
          extraction_mode: 'epub',
          markdown_hash: hashMarkdown(markdown),
          docling_version: '2.55.1',
          chunks: result.chunks,
          structure: result.structure
        }, { final: true })
      }

      // Stage 3.5: Check for review-after-docling mode BEFORE AI cleanup
      const reviewDoclingExtraction = this.job.input_data?.reviewDoclingExtraction === true

      if (reviewDoclingExtraction) {
        console.log('[EPUBProcessor] Review Docling extraction mode enabled - pausing before AI cleanup')
        console.log('[EPUBProcessor] Markdown will be AI cleaned after Obsidian review')

        await this.updateProgress(70, 'finalize', 'awaiting_review', 'Ready for Docling extraction review')

        return {
          markdown,
          chunks: [], // No chunks - will be created after review and AI cleanup
          metadata: {
            title: metadata.title,
            author: metadata.author,
            extra: {
              isbn: metadata.isbn,
              publisher: metadata.publisher,
              publication_date: metadata.publicationDate || metadata.publicationDate,
              language: metadata.language,
              description: metadata.description,
              cover_image_url: coverImage ? `${storagePath}/cover.jpg` : undefined
            }
          },
          wordCount: markdown.split(/\s+/).length
        }
      }

      // Stage 4: AI cleanup with Ollama or Gemini (55-70%)
      const cleanMarkdownEnabled = this.job.input_data?.cleanMarkdown !== false

      if (cleanMarkdownEnabled) {
        await this.updateProgress(58, 'cleanup_ai', 'processing', 'AI cleaning markdown')

        try {
          // Check if user wants to override cleanup method
          const useGeminiCleanup = process.env.USE_GEMINI_CLEANUP === 'true'

          if (isLocalMode && !useGeminiCleanup) {
            // Use local Ollama cleanup
            console.log('[EPUBProcessor] Using local Ollama cleanup (Qwen 32B)')

            markdown = await cleanMarkdownLocal(markdown, {
              onProgress: (stage, percent) => {
                // Map Ollama's 0-100% to our 58-70% range
                const ourPercent = 58 + Math.floor(percent * 0.12)
                this.updateProgress(ourPercent, 'cleanup_ai', 'processing', 'AI cleanup in progress')
              }
            })

            console.log('[EPUBProcessor] Local AI cleanup complete')
          } else {
            // Use Gemini cleanup with individual chapters
            const resumeFrom = chapterCheckpoint?.startFromChapter || 0
            const alreadyCompleted = chapterCheckpoint?.completedChapters || []

            if (resumeFrom > 0) {
              console.log(`[EPUBProcessor] Resuming Gemini cleanup from chapter ${resumeFrom + 1}/${extractedChapters.length}`)
            } else {
              console.log(`[EPUBProcessor] Using Gemini cleanup (${extractedChapters.length} chapters)`)
            }

            markdown = await cleanEpubChaptersWithAI(
              this.ai,
              extractedChapters,  // Use individual chapters, not combined markdown!
              {
                enableProgress: true,
                startFromChapter: resumeFrom,
                completedChapters: alreadyCompleted,
                onProgress: async (chapterNum, totalChapters) => {
                  const percent = 58 + Math.floor((chapterNum / totalChapters) * 12) // 58-70%
                  await this.updateProgress(
                    percent,
                    'cleanup_ai',
                    'processing',
                    `AI cleaning chapter ${chapterNum}/${totalChapters}`,
                    {
                      checkpoint: {
                        can_resume: true,  // Enable pause button during chapter cleanup
                        stage: 'cleanup_ai_chapters'
                      }
                    }
                  )
                },
                onCheckpoint: async (chapterIndex, completedChapters) => {
                  // Save chapter-level checkpoint for pause/resume
                  await this.saveStageResult('cleanup_ai_chapters', {
                    completedChapters,
                    lastCompletedIndex: chapterIndex,
                    totalChapters: extractedChapters.length,
                    timestamp: new Date().toISOString()
                  }, { pauseSafe: true })
                }
              }
            )

            console.log('[EPUBProcessor] Gemini AI cleanup complete')
          }

          await this.updateProgress(70, 'cleanup_ai', 'complete', 'AI cleanup done')
        } catch (error: any) {
          // Phase 5: Handle OOM errors with graceful fallback
          if (error instanceof OOMError) {
            console.warn('[EPUBProcessor] Qwen OOM detected - falling back to regex-only cleanup')

            // Use regex fallback
            markdown = cleanMarkdownRegexOnly(markdown)

            // Mark document for user review
            await this.markForReview(
              'ai_cleanup_oom',
              'Qwen model out of memory during cleanup. Using regex-only cleanup. Review recommended.'
            )

            await this.updateProgress(70, 'cleanup_ai', 'skipped', 'AI cleanup skipped (OOM) - using regex only')
          } else {
            console.error(`[EPUBProcessor] AI cleanup failed: ${error.message}`)
            console.warn('[EPUBProcessor] Falling back to regex-cleaned markdown')
            // markdown already has regex cleanup, just continue
            await this.updateProgress(70, 'cleanup_ai', 'fallback', 'Using regex cleanup only')
          }
        }
      } else {
        // AI cleanup disabled by user - use regex-only
        console.log('[EPUBProcessor] AI cleanup disabled - using regex cleanup only')
        await this.updateProgress(70, 'cleanup_ai', 'skipped', 'AI cleanup disabled by user')
      }

    } else {
      // CLOUD MODE: Use existing EPUB parser + Gemini cleanup
      console.log('[EPUBProcessor] Using cloud mode (existing pipeline)')

      // Stage 2: Parse EPUB structure (20%)
      await this.updateProgress(20, 'parse', 'extracting', 'Parsing EPUB structure')

      const parseResult = await this.withRetry(
        async () => parseEPUB(fileData),
        'Parse EPUB'
      )

      metadata = parseResult.metadata
      const chapters = parseResult.chapters
      coverImage = parseResult.coverImage

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
      await this.updateProgress(35, 'cleanup_local', 'complete', 'Local cleanup done')

      // Stage 5: AI cleanup per chapter (35-50%) - CONDITIONAL on cleanMarkdown flag
      const cleanMarkdownEnabled = this.job.input_data?.cleanMarkdown !== false

      if (cleanMarkdownEnabled) {
        await this.updateProgress(40, 'cleanup_ai', 'processing', 'AI cleaning chapters')
        console.log('[EPUBProcessor] Starting Gemini AI cleanup (per-chapter, no stitching)')

        try {
          // Check for resumption checkpoint (CLOUD mode)
          const resumeFrom = chapterCheckpoint?.startFromChapter || 0
          const alreadyCompleted = chapterCheckpoint?.completedChapters || []

          if (resumeFrom > 0) {
            console.log(`[EPUBProcessor] Resuming Gemini cleanup from chapter ${resumeFrom + 1}/${cleanedChapters.length}`)
          }

          markdown = await cleanEpubChaptersWithAI(
            this.ai,
            cleanedChapters,
            {
              enableProgress: true,
              startFromChapter: resumeFrom,
              completedChapters: alreadyCompleted,
              onProgress: async (chapterNum, totalChapters) => {
                const percent = 40 + Math.floor((chapterNum / totalChapters) * 10) // 40-50%
                await this.updateProgress(
                  percent,
                  'cleanup_ai',
                  'processing',
                  `AI cleaning chapter ${chapterNum}/${totalChapters}`,
                  {
                    checkpoint: {
                      can_resume: true,  // Enable pause button during chapter cleanup
                      stage: 'cleanup_ai_chapters'
                    }
                  }
                )
              },
              onCheckpoint: async (chapterIndex, completedChapters) => {
                // Save chapter-level checkpoint for pause/resume (CLOUD mode)
                await this.saveStageResult('cleanup_ai_chapters', {
                  completedChapters,
                  lastCompletedIndex: chapterIndex,
                  totalChapters: cleanedChapters.length,
                  timestamp: new Date().toISOString()
                }, { pauseSafe: true })
              }
            }
          )

          console.log(`[EPUBProcessor] Gemini AI cleanup complete`)
          await this.updateProgress(50, 'cleanup_ai', 'complete', 'AI cleanup done')
        } catch (error: any) {
          console.error(`[EPUBProcessor] AI cleanup failed: ${error.message}`)
          console.warn('[EPUBProcessor] Falling back to regex-cleaned markdown')

          // Fallback: Use regex-cleaned chapters without AI cleanup
          markdown = cleanedChapters
            .map(ch => {
              const startsWithHeading = /^#+\s/.test(ch.markdown.trim())
              const isFilename = /^[A-Z0-9]+EPUB-\d+$|^chapter\d+$|^\d+$/i.test(ch.title)

              if (startsWithHeading || isFilename) {
                return ch.markdown
              }
              return `# ${ch.title}\n\n${ch.markdown}`
            })
            .join('\n\n---\n\n')

          await this.updateProgress(50, 'cleanup_ai', 'fallback', 'Using regex cleanup only')
        }
      } else {
        // AI cleanup disabled by user - use regex-only
        console.log('[EPUBProcessor] AI cleanup disabled - using regex cleanup only')

        markdown = cleanedChapters
          .map(ch => {
            const startsWithHeading = /^#+\s/.test(ch.markdown.trim())
            const isFilename = /^[A-Z0-9]+EPUB-\d+$|^chapter\d+$|^\d+$/i.test(ch.title)

            if (startsWithHeading || isFilename) {
              return ch.markdown
            }
            return `# ${ch.title}\n\n${ch.markdown}`
          })
          .join('\n\n---\n\n')

        await this.updateProgress(50, 'cleanup_ai', 'skipped', 'AI cleanup disabled by user')
      }
    }

    // Stage 5: Check for review mode BEFORE expensive chunking
    // Phase 5: Review checkpoint works in both local and cloud modes
    const reviewBeforeChunking = this.job.input_data?.reviewBeforeChunking

    if (reviewBeforeChunking) {
      console.log('[EPUBProcessor] Review mode enabled - skipping chunking')
      console.log('[EPUBProcessor] Markdown will be processed after Obsidian review')

      if (!isLocalMode) {
        console.log('[EPUBProcessor] Saved ~$0.50 by skipping pre-review chunking (already AI cleaned)')
      }

      await this.updateProgress(90, 'finalize', 'awaiting_review', 'Ready for manual review')

      return {
        markdown,
        chunks: [], // No chunks - will be created after review
        metadata: {
          title: metadata.title,
          author: metadata.author,
          extra: {
            isbn: metadata.isbn,
            publisher: metadata.publisher,
            publication_date: metadata.publicationDate || metadata.publicationDate,
            language: metadata.language,
            description: metadata.description,
            cover_image_url: coverImage ? `${storagePath}/cover.jpg` : undefined
          }
        },
        wordCount: markdown.split(/\s+/).length
      }
    }

    // ==================== CHONKIE INTEGRATION: UNIFIED CHUNKING PIPELINE ====================
    // Stages 4-7: Bulletproof Coord Map → Review → Chonkie Chunk → Metadata Transfer
    let finalChunks: ProcessedChunk[]

    if (!isLocalMode || !doclingChunks) {
      throw new Error('Chonkie integration requires LOCAL mode with Docling chunks. Set PROCESSING_MODE=local')
    }

    // Stage 4: Bulletproof Matching as Coordinate Mapper (70-72%)
    // Purpose: Create coordinate map showing where Docling chunks map to cleaned markdown
    // This enables metadata transfer via overlap detection in Stage 7
    console.log('[EPUBProcessor] Stage 4: Creating coordinate map with bulletproof matcher')
    await this.updateProgress(70, 'bulletproof_mapping', 'processing', 'Creating coordinate map')

    console.log(`[EPUBProcessor] Docling chunks available: ${doclingChunks.length} metadata anchors`)

    const { chunks: bulletproofMatches } = await bulletproofMatch(
      markdown,
      doclingChunks,
      {
        onProgress: async (layerNum, matched, remaining) => {
          console.log(`[EPUBProcessor] Bulletproof Layer ${layerNum}: ${matched} mapped, ${remaining} remaining`)
        }
      }
    )

    console.log(`[EPUBProcessor] Coordinate map created: ${bulletproofMatches.length} Docling anchors mapped to cleaned markdown`)
    await this.updateProgress(72, 'bulletproof_mapping', 'complete', 'Coordinate map ready')

    // Stage 5: Review Checkpoint (Optional, 72%)
    // If reviewBeforeChunking=true, pause here for user approval
    if (this.job.input_data?.reviewBeforeChunking === true) {
      console.log('[EPUBProcessor] Stage 5: Review checkpoint enabled - awaiting user approval')
      await this.updateProgress(72, 'review_checkpoint', 'waiting', 'Awaiting user review')
      // Note: waitForReview() would be implemented here if needed
      // For now, this is a placeholder - actual review happens via UI
      console.log('[EPUBProcessor] Review checkpoint: User approval assumed (auto-continue)')
    }

    // Stage 6: Chonkie Chunking (72-75%)
    // User-selected chunking strategy (default: recursive)
    const chunkerStrategy: ChonkieStrategy = (this.job.input_data?.chunkerStrategy as ChonkieStrategy) || 'recursive'
    const chunkSize = this.job.input_data?.chunkSize as number | undefined
    console.log(`[EPUBProcessor] Stage 6: Chunking with Chonkie strategy: ${chunkerStrategy}`)

    await this.updateProgress(72, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

    const chonkieChunks = await chunkWithChonkie(markdown, {
      chunker_type: chunkerStrategy,
      ...(chunkSize ? { chunk_size: chunkSize } : {}),  // Let wrapper apply strategy-specific defaults
      timeout: 300000   // 5 minutes base timeout (scales with document size)
    })

    console.log(`[EPUBProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
    await this.updateProgress(75, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)

    // Stage 7: Metadata Transfer via Overlap Detection (75-77%)
    // Transfer Docling metadata (sections, headings) to Chonkie chunks
    // CRITICAL: EPUBs have NO page numbers or bboxes (always null)
    console.log('[EPUBProcessor] Stage 7: Transferring Docling metadata to Chonkie chunks')
    await this.updateProgress(76, 'metadata_transfer', 'processing', 'Transferring metadata via overlap detection')

    finalChunks = await transferMetadataToChonkieChunks(
      chonkieChunks,
      bulletproofMatches,
      this.job.document_id
    )

    console.log(`[EPUBProcessor] Metadata transfer complete: ${finalChunks.length} enriched chunks`)
    await this.updateProgress(77, 'metadata_transfer', 'complete', 'Metadata transfer done')

    // Checkpoint: Save chunks with transferred metadata (before AI enrichment)
    await this.saveStageResult('chunking', finalChunks)

    // Log chunk statistics after metadata transfer
    const chunkingStats = calculateChunkStatistics(finalChunks, 512)
    logChunkStatistics(chunkingStats, 'EPUB Chunks (After Chonkie + Metadata Transfer)')

    // Stage 8: Metadata Enrichment (77-90%)
    // Phase 2: Use shared method from base class
    console.log('[EPUBProcessor] Starting local metadata enrichment (PydanticAI + Ollama)')
    finalChunks = await this.enrichMetadataBatch(finalChunks, 77, 90, {
      onError: 'mark_review'  // Mark document for review on error
    })

    // Stage 9: Local Embeddings (90-95%)
    // Phase 2: Use shared method from base class
    console.log('[EPUBProcessor] Stage 9: Starting local embeddings generation (Transformers.js)')
    finalChunks = await this.generateChunkEmbeddings(finalChunks, 90, 95, {
      enhanceWithMetadata: true,  // Use metadata context for better retrieval
      onError: 'mark_review'  // Mark document for review on error
    })

    // Stage 10: Finalize (95-100%)
    console.log('[EPUBProcessor] Stage 10: Finalizing document processing')
    await this.updateProgress(97, 'finalize', 'formatting', 'Finalizing')

    // Checkpoint 5: Save final markdown and chunks with embeddings
    await this.saveStageResult('markdown', { content: markdown }, { final: true })
    await this.saveStageResult('chunks', finalChunks, { final: true })

    // Build ProcessResult for return
    const result: ProcessResult = {
      markdown,
      chunks: finalChunks,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        extra: {
          isbn: metadata.isbn,
          publisher: metadata.publisher,
          publication_date: metadata.publicationDate || metadata.publicationDate,
          language: metadata.language,
          description: metadata.description,
          cover_image_url: coverImage ? `${storagePath}/cover.jpg` : undefined
        }
      },
      wordCount: markdown.split(/\s+/).length
    }

    // Checkpoint 5.5: Save document-level metadata to metadata.json
    const publicationYear = metadata.publicationDate
      ? parseInt(metadata.publicationDate.split('-')[0]) || null
      : null

    const metadataExport = this.buildMetadataExport(result, {
      page_count: null,  // EPUBs don't have page numbers
      isbn: metadata.isbn || null,
      genre: null,  // Could enhance with genre detection
      publication_year: publicationYear,
      language: metadata.language || 'en'
    })
    await this.saveStageResult('metadata', metadataExport, { final: true })

    // Checkpoint 6: Save manifest.json with processing metadata
    const manifestData = {
      document_id: this.job.document_id,
      processing_mode: isLocalMode ? 'local' : 'cloud',
      source_type: 'epub',
      files: {
        'chunks.json': { size: JSON.stringify(finalChunks).length, type: 'final' },
        'metadata.json': { size: JSON.stringify(metadataExport).length, type: 'final' },
        'manifest.json': { size: 0, type: 'final' },
        ...(isLocalMode && doclingChunks ? {
          'cached_chunks.json': { size: JSON.stringify(doclingChunks).length, type: 'final' }
        } : {})
      },
      chunk_count: finalChunks.length,
      word_count: markdown.split(/\s+/).length,
      processing_time: Date.now() - (this.job.created_at ? new Date(this.job.created_at).getTime() : Date.now()),
      docling_version: isLocalMode ? '2.55.1' : undefined,
      markdown_hash: isLocalMode ? hashMarkdown(markdown) : undefined
    }
    await this.saveStageResult('manifest', manifestData, { final: true })

    await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')

    // Chonkie Integration: Architecture notes
    // - Bulletproof matcher repurposed as coordinate mapper (no longer chunking system)
    // - Chonkie handles ALL actual chunking (9 user-selectable strategies)
    // - Metadata transfer via overlap detection (70-90% coverage expected)
    // - EPUBs have NO page numbers/bboxes (always null, sections used instead)

    return result
  }

  /**
   * Mark document for user review
   * Sets review flag in database and stores warning in job metadata
   *
   * Phase 5: Used for OOM warnings during local cleanup (same as PDF processor)
   *
   * @param reason - Short reason code (e.g., 'ai_cleanup_oom')
   * @param message - Human-readable warning message
   */
  private async markForReview(reason: string, message: string): Promise<void> {
    console.log(`[EPUBProcessor] Marking document for review: ${reason}`)

    // Update document status
    await this.supabase
      .from('documents')
      .update({
        processing_status: 'completed_with_warnings',
        review_notes: message
      })
      .eq('id', this.job.document_id)

    // Also store in job metadata for detailed tracking
    this.job.metadata = {
      ...this.job.metadata,
      warnings: [
        ...(this.job.metadata?.warnings || []),
        {
          reason,
          message,
          timestamp: new Date().toISOString()
        }
      ]
    }
  }
}
