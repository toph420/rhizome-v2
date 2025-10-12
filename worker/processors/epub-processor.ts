/**
 * EPUB Processor with Two-Pass AI Cleanup
 *
 * Linear processing flow:
 * 1. Parse EPUB (local, free)
 * 2. Local regex cleanup per chapter
 * 3. AI cleanup per chapter (zero-stitching)
 * 4. Review checkpoint (optional pause)
 * 5. AI semantic chunking
 * 6. Return results
 *
 * AI Cleanup Strategy (Optional):
 * - Per-chapter cleanup (natural semantic boundaries)
 * - Deterministic joining with \n\n---\n\n
 * - No overlap, no stitching, no content drift
 * - Controlled by cleanMarkdown flag (default: true)
 *
 * Cost:
 * - With AI cleanup: ~$1.10 per 500-page book ($0.60 cleanup + $0.50 chunking)
 * - Without AI cleanup: ~$0.50 per 500-page book (chunking only)
 * Time: <25 minutes with cleanup, <15 minutes without
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { parseEPUB } from '../lib/epub/epub-parser.js'
import { cleanEpubArtifacts } from '../lib/epub/epub-cleaner.js'
import { cleanEpubChaptersWithAI } from '../lib/markdown-cleanup-ai.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'
// Phase 5: Local processing imports
import { extractEpubWithDocling, type DoclingChunk } from '../lib/local/epub-docling-extractor.js'
import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../lib/local/ollama-cleanup.js'
import { OOMError } from '../lib/local/ollama-client.js'
// Phase 5 Task 19: Bulletproof matching for EPUBs
import { bulletproofMatch, type MatchResult } from '../lib/local/bulletproof-matcher.js'
// Phase 6: Local metadata enrichment imports
import { extractMetadataBatch, type ChunkInput } from '../lib/chunking/pydantic-metadata.js'
// Phase 7: Local embeddings imports
import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'
import { generateEmbeddings } from '../lib/embeddings.js'

export class EPUBProcessor extends SourceProcessor {
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

    if (isLocalMode) {
      // LOCAL MODE: Use Docling extraction
      // Stage 2: Extract with Docling (10-50%)
      console.log('[EPUBProcessor] Using Docling extraction')

      await this.updateProgress(15, 'extract', 'processing', 'Extracting EPUB with Docling')

      const result = await this.withRetry(
        async () => {
          return await extractEpubWithDocling(fileData.buffer, {
            tokenizer: 'Xenova/all-mpnet-base-v2',  // CRITICAL: Must match embeddings model
            chunkSize: 512,
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

      console.log(`[EPUBProcessor] Docling extracted ${result.chunks.length} chunks`)
      console.log(`[EPUBProcessor] Book: "${metadata.title}" by ${metadata.author}`)

      // Phase 5: Cache extraction result in job metadata
      // CRITICAL: Must store doclingChunks for Phase 5 Task 19 bulletproof matching
      this.job.metadata = {
        ...this.job.metadata,
        cached_extraction: {
          markdown: result.markdown,
          structure: result.structure,
          doclingChunks: result.chunks,  // Required for matching
          epubMetadata: result.epubMetadata
        }
      }

      await this.updateProgress(50, 'extract', 'complete', 'Docling extraction done')

      // Stage 3: Local regex cleanup (50-55%)
      await this.updateProgress(52, 'cleanup_local', 'processing', 'Removing EPUB artifacts')
      markdown = cleanMarkdownRegexOnly(markdown)
      await this.updateProgress(55, 'cleanup_local', 'complete', 'Local cleanup done')

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

      // Stage 4: AI cleanup with Ollama (55-70%)
      const cleanMarkdownEnabled = this.job.input_data?.cleanMarkdown !== false

      if (cleanMarkdownEnabled) {
        await this.updateProgress(58, 'cleanup_ai', 'processing', 'AI cleaning markdown')

        try {
          console.log('[EPUBProcessor] Using local Ollama cleanup (Qwen 32B)')

          markdown = await cleanMarkdownLocal(markdown, {
            onProgress: (stage, percent) => {
              // Map Ollama's 0-100% to our 58-70% range
              const ourPercent = 58 + Math.floor(percent * 0.12)
              this.updateProgress(ourPercent, 'cleanup_ai', 'processing', 'AI cleanup in progress')
            }
          })

          console.log('[EPUBProcessor] Local AI cleanup complete')
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
          markdown = await cleanEpubChaptersWithAI(
            this.ai,
            cleanedChapters,
            {
              enableProgress: true,
              onProgress: async (chapterNum, totalChapters) => {
                const percent = 40 + Math.floor((chapterNum / totalChapters) * 10) // 40-50%
                await this.updateProgress(
                  percent,
                  'cleanup_ai',
                  'processing',
                  `AI cleaning chapter ${chapterNum}/${totalChapters}`
                )
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

    // Stage 6: Bulletproof Matching (LOCAL MODE ONLY) (70-75%)
    // Phase 5 Task 19: Remap Docling chunks to cleaned markdown with 100% recovery
    let finalChunks: ProcessedChunk[]

    if (isLocalMode && doclingChunks) {
      console.log('[EPUBProcessor] LOCAL MODE: Using bulletproof matching (skipping AI chunking)')

      await this.updateProgress(72, 'matching', 'processing', 'Remapping chunks to cleaned markdown')

      console.log(`[EPUBProcessor] Docling chunks available: ${doclingChunks.length} segments`)
      console.log('[EPUBProcessor] Running 5-layer bulletproof matching...')

      const { chunks: rematchedChunks, stats, warnings } = await bulletproofMatch(
        markdown,
        doclingChunks,
        {
          onProgress: async (layerNum, matched, remaining) => {
            console.log(`[EPUBProcessor] Layer ${layerNum}: ${matched} matched, ${remaining} remaining`)
          }
        }
      )

      console.log(`[EPUBProcessor] Bulletproof matching complete:`)
      console.log(`  ✅ Exact: ${stats.exact}/${stats.total} (${(stats.exact / stats.total * 100).toFixed(1)}%)`)
      console.log(`  🔍 High: ${stats.high}/${stats.total}`)
      console.log(`  📍 Medium: ${stats.medium}/${stats.total}`)
      console.log(`  ⚠️  Synthetic: ${stats.synthetic}/${stats.total} (${(stats.synthetic / stats.total * 100).toFixed(1)}%)`)

      // Store warnings for UI display
      this.job.metadata.matchingWarnings = warnings
      if (warnings.length > 0) {
        console.warn(`[EPUBProcessor] ⚠️  ${warnings.length} synthetic chunks require validation`)
      }

      // Convert MatchResult to ProcessedChunk format
      // Phase 5: Combine Docling EPUB metadata (sections, headings) + new offsets + confidence
      // CRITICAL: EPUBs have NO page numbers or bboxes (always null)
      finalChunks = rematchedChunks.map((result: MatchResult, idx: number) => {
        const wordCount = result.chunk.content.split(/\s+/).filter((w: string) => w.length > 0).length

        return {
          document_id: this.job.document_id,
          content: result.chunk.content,
          chunk_index: idx,
          start_offset: result.start_offset,
          end_offset: result.end_offset,
          word_count: wordCount,
          // Phase 5: Store Docling EPUB metadata in database columns (migration 045)
          // CRITICAL: EPUBs have NO page numbers (always null)
          page_start: null,  // Always null for EPUB
          page_end: null,    // Always null for EPUB
          heading_level: result.chunk.meta.heading_level || null,
          heading_path: result.chunk.meta.heading_path || null,
          section_marker: result.chunk.meta.section_marker || null,  // Used instead of page numbers
          bboxes: null,  // Always null for EPUB (no PDF coordinates)
          position_confidence: result.confidence,
          position_method: result.method,
          position_validated: false,  // User can validate later
          // Metadata extraction happens in next stage (Phase 6)
          themes: [],
          importance_score: 0.5,
          summary: null,
          emotional_metadata: {
            polarity: 0,
            primaryEmotion: 'neutral',
            intensity: 0
          },
          conceptual_metadata: {
            concepts: []
          },
          domain_metadata: null,
          metadata_extracted_at: null
        }
      })

      console.log(`[EPUBProcessor] Converted ${finalChunks.length} matched chunks to ProcessedChunk format`)

      await this.updateProgress(75, 'matching', 'complete', `${finalChunks.length} chunks matched with metadata`)

      // Stage 7: Metadata Enrichment (LOCAL MODE) (75-90%)
      // Phase 6: Extract structured metadata using PydanticAI + Ollama
      console.log('[EPUBProcessor] Starting local metadata enrichment (PydanticAI + Ollama)')
      await this.updateProgress(77, 'metadata', 'processing', 'Extracting structured metadata')

      try {
        const BATCH_SIZE = 10 // Process 10 chunks at a time (balance speed vs memory)
        const enrichedChunks: ProcessedChunk[] = []

        for (let i = 0; i < finalChunks.length; i += BATCH_SIZE) {
          const batch = finalChunks.slice(i, i + BATCH_SIZE)

          // Prepare batch for metadata extraction
          const batchInput: ChunkInput[] = batch.map(chunk => ({
            id: `${this.job.document_id}-${chunk.chunk_index}`,
            content: chunk.content
          }))

          console.log(`[EPUBProcessor] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalChunks.length / BATCH_SIZE)}`)

          // Extract metadata
          const metadataMap = await extractMetadataBatch(batchInput, {
            onProgress: (processed, total) => {
              const overallProgress = 77 + Math.floor(((i + processed) / finalChunks.length) * 13)
              this.updateProgress(overallProgress, 'metadata', 'processing', `Enriching chunk ${i + processed}/${finalChunks.length}`)
            }
          })

          // Enrich chunks with metadata
          for (const chunk of batch) {
            const chunkId = `${this.job.document_id}-${chunk.chunk_index}`
            const metadata = metadataMap.get(chunkId)

            if (metadata) {
              enrichedChunks.push({
                ...chunk,
                themes: metadata.themes,
                importance_score: metadata.importance,
                summary: metadata.summary,
                emotional_metadata: {
                  polarity: metadata.emotional.polarity,
                  primaryEmotion: metadata.emotional.primaryEmotion as any, // PydanticAI returns string
                  intensity: metadata.emotional.intensity
                },
                conceptual_metadata: {
                  concepts: metadata.concepts as any // PydanticAI returns simplified structure
                },
                domain_metadata: {
                  primaryDomain: metadata.domain as any, // PydanticAI returns string
                  confidence: 0.8 // PydanticAI extracts with high confidence
                },
                metadata_extracted_at: new Date().toISOString()
              })
            } else {
              // Fallback: use default metadata if extraction failed
              console.warn(`[EPUBProcessor] Metadata extraction failed for chunk ${chunk.chunk_index} - using defaults`)
              enrichedChunks.push(chunk) // Keep original chunk with default metadata
            }
          }

          // Progress update after each batch
          const progress = 77 + Math.floor(((i + batch.length) / finalChunks.length) * 13)
          await this.updateProgress(progress, 'metadata', 'processing', `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`)
        }

        // Replace finalChunks with enriched version
        finalChunks = enrichedChunks

        console.log(`[EPUBProcessor] Local metadata enrichment complete: ${finalChunks.length} chunks enriched`)
        await this.updateProgress(90, 'metadata', 'complete', 'Metadata enrichment done')

      } catch (error: any) {
        console.error(`[EPUBProcessor] Metadata enrichment failed: ${error.message}`)
        console.warn('[EPUBProcessor] Continuing with default metadata')

        // Mark document for review but don't fail processing
        await this.markForReview(
          'metadata_enrichment_failed',
          `Local metadata enrichment failed: ${error.message}. Using default metadata.`
        )

        await this.updateProgress(90, 'metadata', 'fallback', 'Using default metadata')
      }

      // Stage 8: Local Embeddings (LOCAL MODE) (90-95%)
      // Phase 7: Generate embeddings using Transformers.js
      console.log('[EPUBProcessor] Starting local embeddings generation (Transformers.js)')
      await this.updateProgress(92, 'embeddings', 'processing', 'Generating local embeddings')

      try {
        // Extract content from chunks for embedding
        const chunkContents = finalChunks.map(chunk => chunk.content)

        console.log(`[EPUBProcessor] Generating embeddings for ${chunkContents.length} chunks (Xenova/all-mpnet-base-v2)`)
        const startTime = Date.now()

        // Generate embeddings locally with Transformers.js
        const embeddings = await generateEmbeddingsLocal(chunkContents)

        const embeddingTime = Date.now() - startTime
        console.log(`[EPUBProcessor] Local embeddings complete: ${embeddings.length} vectors (768d) in ${(embeddingTime / 1000).toFixed(1)}s`)

        // Validate dimensions (should be 768)
        if (embeddings.length !== finalChunks.length) {
          throw new Error(`Embedding count mismatch: expected ${finalChunks.length}, got ${embeddings.length}`)
        }

        // Attach embeddings to chunks
        finalChunks = finalChunks.map((chunk, idx) => ({
          ...chunk,
          embedding: embeddings[idx]
        }))

        console.log('[EPUBProcessor] Embeddings attached to all chunks')
        await this.updateProgress(95, 'embeddings', 'complete', 'Local embeddings generated')

      } catch (error: any) {
        console.error(`[EPUBProcessor] Local embeddings failed: ${error.message}`)
        console.warn('[EPUBProcessor] Falling back to Gemini embeddings')

        try {
          // Fallback to Gemini embeddings if local fails
          const chunkContents = finalChunks.map(chunk => chunk.content)
          const embeddings = await generateEmbeddings(chunkContents)

          finalChunks = finalChunks.map((chunk, idx) => ({
            ...chunk,
            embedding: embeddings[idx]
          }))

          console.log('[EPUBProcessor] Gemini embeddings fallback successful')
          await this.updateProgress(95, 'embeddings', 'fallback', 'Using Gemini embeddings')

        } catch (fallbackError: any) {
          console.error(`[EPUBProcessor] Gemini embeddings also failed: ${fallbackError.message}`)

          // Mark document for review but don't fail processing
          await this.markForReview(
            'embeddings_failed',
            `Both local and Gemini embeddings failed. Chunks saved without embeddings. Error: ${fallbackError.message}`
          )

          await this.updateProgress(95, 'embeddings', 'failed', 'Embeddings generation failed')
        }
      }

    } else {
      // CLOUD MODE: Use existing AI semantic chunking
      console.log('[EPUBProcessor] CLOUD MODE: Using AI semantic chunking')

      await this.updateProgress(72, 'chunking', 'processing', 'Creating semantic chunks')

      const markdownKB = Math.round(markdown.length / 1024)
      console.log(`[EPUBProcessor] Starting AI chunking on ${markdownKB}KB markdown`)

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
            'fiction' // Document type for specialized chunking
          )
        },
        'Semantic chunking with metadata extraction'
      )

      console.log(`[EPUBProcessor] Created ${chunks.length} semantic chunks with AI metadata`)

      await this.updateProgress(95, 'chunking', 'complete', `${chunks.length} chunks created`)

      // Convert to ProcessedChunk format
      // batchChunkAndExtractMetadata returns chunks with metadata already extracted
      finalChunks = chunks.map((chunk, idx) => {
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
            primaryEmotion: (chunk.metadata.emotional?.primaryEmotion || 'neutral') as any,
            intensity: chunk.metadata.emotional?.intensity || 0
          },
          conceptual_metadata: {
            concepts: (chunk.metadata.concepts || []) as any
          },
          domain_metadata: chunk.metadata.domain ? {
            primaryDomain: chunk.metadata.domain as any,
            confidence: 0.8
          } : null,
          metadata_extracted_at: new Date().toISOString()
        }
      })
    }

    // Stage 9: Finalize (95-100%)
    // Phase 7: Updated from Stage 8 (90-100%) to Stage 9 (95-100%)
    await this.updateProgress(97, 'finalize', 'formatting', 'Finalizing')

    await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')

    // Phase 5: Note on mode differences
    // In local mode, chunks will have Docling metadata after Task 19 (bulletproof matching)
    // In cloud mode, chunks have AI-extracted metadata only
    // Both modes produce ProcessedChunk[] with compatible structure

    return {
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
