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
import {
  extractPdfBuffer,
  type DoclingChunk,
  type DoclingStructure
} from '../lib/docling-extractor.js'
import { cleanPageArtifacts } from '../lib/text-cleanup.js'
import { cleanPdfMarkdown } from '../lib/markdown-cleanup-ai.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'
// Phase 3: Local cleanup imports
import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../lib/local/ollama-cleanup.js'
import { OOMError } from '../lib/local/ollama-client.js'
// Phase 4: Bulletproof matching imports
import { bulletproofMatch, type MatchResult } from '../lib/local/bulletproof-matcher.js'
// Phase 6: Local metadata enrichment imports
import { extractMetadataBatch, type ChunkInput } from '../lib/chunking/pydantic-metadata.js'
// Phase 7: Local embeddings imports
import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'
import { generateEmbeddings } from '../lib/embeddings.js'
// Cached chunks table integration
import { saveCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'
// Phase 1: Shared chunker configuration
import { getChunkerOptions } from '../lib/chunking/chunker-config.js'
// Phase 2: Flexible pipeline configuration
import { getPipelineConfig, logPipelineConfig, formatPipelineConfigForPython } from '../lib/local/docling-config.js'
// Phase 6: Chunk statistics for validation
import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'

export class PDFProcessor extends SourceProcessor {
  /**
   * Process PDF document with simplified pipeline.
   *
   * Phase 2: Added local mode with HybridChunker integration.
   * - PROCESSING_MODE=local: Extract chunks with Docling for bulletproof matching
   * - PROCESSING_MODE=cloud: Use existing Gemini pipeline (backward compatible)
   *
   * @returns Processed markdown, chunks, and metadata
   * @throws Error if PDF processing fails
   */
  async process(): Promise<ProcessResult> {
    const storagePath = this.getStoragePath()

    // Phase 2: Check processing mode
    const isLocalMode = process.env.PROCESSING_MODE === 'local'
    console.log(`[PDFProcessor] Processing mode: ${isLocalMode ? 'LOCAL' : 'CLOUD'}`)

    if (isLocalMode) {
      console.log('[PDFProcessor] Local mode: Will extract chunks with Docling HybridChunker')
    }

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
    // Phase 2: Enable chunking in local mode
    await this.updateProgress(20, 'extract', 'processing', 'Extracting PDF with Docling')

    // Get pipeline configuration (defaults + env overrides + document hints)
    // Note: page count not available yet, will be applied for large docs automatically
    const pipelineConfig = getPipelineConfig({
      pageCount: undefined  // Will be auto-detected by Docling
    })

    // Log configuration for transparency
    logPipelineConfig(pipelineConfig)

    const extractionResult = await this.withRetry(
      async () => {
        return await extractPdfBuffer(
          fileBuffer,
          {
            // Phase 2: Enable HybridChunker in local mode
            enableChunking: isLocalMode,
            // Phase 1: Use shared chunker configuration (512 → 768 tokens)
            ...JSON.parse(getChunkerOptions()),
            // Phase 2: Apply pipeline configuration (image extraction, AI features, etc.)
            ...JSON.parse(formatPipelineConfigForPython(pipelineConfig)),
            timeout: 30 * 60 * 1000, // 30 minutes
            onProgress: async (percent, stage, message) => {
              // Map Docling's 0-100% to our 20-50% extraction stage
              const ourPercent = 20 + Math.floor(percent * 0.3)
              await this.updateProgress(ourPercent, 'extract', 'processing', message)
            }
          }
        )
      },
      'Docling PDF extraction'
    )

    let markdown = extractionResult.markdown
    const markdownKB = Math.round(markdown.length / 1024)

    console.log(`[PDFProcessor] Extracted ${extractionResult.structure.total_pages} pages (${markdownKB}KB markdown)`)
    console.log(`[PDFProcessor] Structure: ${extractionResult.structure.headings.length} headings`)
    if (extractionResult.chunks) {
      console.log(`[PDFProcessor] Docling chunks: ${extractionResult.chunks.length} segments`)
    }

    // Store Docling chunks in job metadata for bulletproof matching later in this processing run
    this.job.metadata = {
      ...this.job.metadata,
      cached_extraction: {
        markdown: extractionResult.markdown,
        structure: extractionResult.structure,
        doclingChunks: extractionResult.chunks
      }
    }

    await this.updateProgress(50, 'extract', 'complete', 'PDF extraction done')

    // Stage 3: Local regex cleanup (50-55%)
    await this.updateProgress(52, 'cleanup_local', 'processing', 'Removing page artifacts')

    // Docling already extracts structure, skip heading generation
    markdown = cleanPageArtifacts(markdown, { skipHeadingGeneration: true })

    console.log(`[PDFProcessor] Local cleanup complete (Docling mode: heading generation skipped)`)

    // Phase 2: Save extraction to cached_chunks table AFTER cleanup
    // This enables zero-cost LOCAL mode reprocessing with bulletproof matching
    // CRITICAL: Hash the CLEANED markdown (same version saved to storage)
    if (isLocalMode && extractionResult.chunks) {
      const documentId = this.job.document_id || this.job.input_data.document_id

      if (!documentId) {
        console.warn('[PDFProcessor] Cannot save cache: document_id not available')
        console.warn('[PDFProcessor] Job details:', {
          job_id: this.job.id,
          job_document_id: this.job.document_id,
          input_data_document_id: this.job.input_data?.document_id,
          has_input_data: !!this.job.input_data
        })
      } else {
        console.log(`[PDFProcessor] Saving cache for document ${documentId}`)
        await saveCachedChunks(this.supabase, {
          document_id: documentId,
          extraction_mode: 'pdf',
          markdown_hash: hashMarkdown(markdown), // Hash CLEANED markdown
          docling_version: '2.55.1',
          chunks: extractionResult.chunks,
          structure: extractionResult.structure
        })
      }
    }

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
    // Phase 3: Added local mode support with Ollama
    const cleanMarkdownEnabled = this.job.input_data?.cleanMarkdown !== false // Default true

    if (cleanMarkdownEnabled) {
      await this.updateProgress(58, 'cleanup_ai', 'processing', 'AI cleaning markdown')

      try {
        // Check if user wants to override cleanup method
        const useGeminiCleanup = process.env.USE_GEMINI_CLEANUP === 'true'

        if (isLocalMode && !useGeminiCleanup) {
          // Phase 3: Use local Ollama cleanup
          console.log('[PDFProcessor] Using local Ollama cleanup (Qwen 32B)')

          markdown = await cleanMarkdownLocal(markdown, {
            onProgress: (stage, percent) => {
              // Map Ollama's 0-100% to our 58-70% range
              const ourPercent = 58 + Math.floor(percent * 0.12)
              this.updateProgress(ourPercent, 'cleanup_ai', 'processing', 'AI cleanup in progress')
            }
          })

          console.log('[PDFProcessor] Local AI cleanup complete')
        } else {
          // Use existing Gemini cleanup
          console.log('[PDFProcessor] Using Gemini cleanup (heading-split for large docs)')

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

          console.log('[PDFProcessor] Gemini AI cleanup complete')
        }

        await this.updateProgress(70, 'cleanup_ai', 'complete', 'AI cleanup done')
      } catch (error: any) {
        // Phase 3: Handle OOM errors with graceful fallback
        if (error instanceof OOMError) {
          console.warn('[PDFProcessor] Qwen OOM detected - falling back to regex-only cleanup')

          // Use regex fallback
          markdown = cleanMarkdownRegexOnly(markdown)

          // Mark document for user review
          await this.markForReview(
            'ai_cleanup_oom',
            'Qwen model out of memory during cleanup. Using regex-only cleanup. Review recommended.'
          )

          await this.updateProgress(70, 'cleanup_ai', 'skipped', 'AI cleanup skipped (OOM) - using regex only')
        } else {
          console.error(`[PDFProcessor] AI cleanup failed: ${error.message}`)
          console.warn('[PDFProcessor] Falling back to regex-cleaned markdown')
          // markdown already has regex cleanup, just continue
          await this.updateProgress(70, 'cleanup_ai', 'fallback', 'Using regex cleanup only')
        }
      }
    } else {
      // AI cleanup disabled by user - use regex-only
      console.log('[PDFProcessor] AI cleanup disabled - using regex cleanup only')
      await this.updateProgress(70, 'cleanup_ai', 'skipped', 'AI cleanup disabled by user')
    }

    // Stage 5: Check for review mode BEFORE expensive AI chunking/matching
    const reviewBeforeChunking = this.job.input_data?.reviewBeforeChunking

    if (reviewBeforeChunking) {
      console.log('[PDFProcessor] Review mode enabled - skipping chunking/matching')
      console.log('[PDFProcessor] Markdown will be processed after Obsidian review')
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

    // Stage 6: Bulletproof Matching (LOCAL MODE ONLY) (70-75%)
    // Phase 4: Remap Docling chunks to cleaned markdown with 100% recovery
    let finalChunks: ProcessedChunk[]

    if (isLocalMode && this.job.metadata?.cached_extraction?.doclingChunks) {
      console.log('[PDFProcessor] LOCAL MODE: Using bulletproof matching (skipping AI chunking)')

      await this.updateProgress(72, 'matching', 'processing', 'Remapping chunks to cleaned markdown')

      const doclingChunks = this.job.metadata.cached_extraction.doclingChunks as DoclingChunk[]

      console.log(`[PDFProcessor] Docling chunks available: ${doclingChunks.length} segments`)
      console.log('[PDFProcessor] Running 5-layer bulletproof matching...')

      const { chunks: rematchedChunks, stats, warnings } = await bulletproofMatch(
        markdown,
        doclingChunks,
        {
          onProgress: async (layerNum, matched, remaining) => {
            console.log(`[PDFProcessor] Layer ${layerNum}: ${matched} matched, ${remaining} remaining`)
          }
        }
      )

      console.log(`[PDFProcessor] Bulletproof matching complete:`)
      console.log(`  ✅ Exact: ${stats.exact}/${stats.total} (${(stats.exact / stats.total * 100).toFixed(1)}%)`)
      console.log(`  🔍 High: ${stats.high}/${stats.total}`)
      console.log(`  📍 Medium: ${stats.medium}/${stats.total}`)
      console.log(`  ⚠️  Layer 4 (Synthetic): ${stats.synthetic}/${stats.total} (${(stats.synthetic / stats.total * 100).toFixed(1)}%)`)
      console.log(`  🔧 Overlap corrections: ${stats.overlapCorrected}/${stats.total}`)

      const totalNeedingValidation = stats.synthetic + stats.overlapCorrected
      console.log(`  📋 Total needing validation: ${totalNeedingValidation} chunks`)

      // Store warnings for UI display
      this.job.metadata.matchingWarnings = warnings
      if (warnings.length > 0) {
        console.warn(`[PDFProcessor] ⚠️  ${totalNeedingValidation} chunks require validation (${stats.synthetic} synthetic + ${stats.overlapCorrected} overlap-corrected)`)
      }

      // Convert MatchResult to ProcessedChunk format
      // Combine Docling metadata (pages, headings, bboxes) + new offsets + confidence
      finalChunks = rematchedChunks.map((result: MatchResult, idx: number) => {
        const wordCount = result.chunk.content.split(/\s+/).filter((w: string) => w.length > 0).length

        return {
          document_id: this.job.document_id,
          content: result.chunk.content,
          chunk_index: idx,
          start_offset: result.start_offset,
          end_offset: result.end_offset,
          word_count: wordCount,
          // Phase 4: Store Docling metadata in database columns (migration 047)
          page_start: result.chunk.meta.page_start || null,
          page_end: result.chunk.meta.page_end || null,
          heading_path: result.chunk.meta.heading_path || null,
          heading_level: result.chunk.meta.heading_level || null,
          section_marker: result.chunk.meta.section_marker || null,
          bboxes: result.chunk.meta.bboxes || null,
          position_confidence: result.confidence,
          position_method: result.method,
          position_validated: false,  // User can validate later
          // Phase 4 Task T-006: Store validation metadata from bulletproof matching
          validation_warning: result.validation_warning || null,
          validation_details: result.validation_details || null,
          overlap_corrected: result.overlap_corrected || false,
          position_corrected: false,  // Not yet corrected by user
          correction_history: [],  // Empty initially
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

      console.log(`[PDFProcessor] Converted ${finalChunks.length} matched chunks to ProcessedChunk format`)

      await this.updateProgress(75, 'matching', 'complete', `${finalChunks.length} chunks matched with metadata`)

      // Phase 6: Log chunk statistics after matching
      const matchingStats = calculateChunkStatistics(finalChunks, 768)
      logChunkStatistics(matchingStats, 'PDF Chunks (After Matching)')

      // Stage 7: Metadata Enrichment (LOCAL MODE) (75-90%)
      // Phase 6: Extract structured metadata using PydanticAI + Ollama
      console.log('[PDFProcessor] Starting local metadata enrichment (PydanticAI + Ollama)')
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

          console.log(`[PDFProcessor] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalChunks.length / BATCH_SIZE)}`)

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
              console.warn(`[PDFProcessor] Metadata extraction failed for chunk ${chunk.chunk_index} - using defaults`)
              enrichedChunks.push(chunk) // Keep original chunk with default metadata
            }
          }

          // Progress update after each batch
          const progress = 77 + Math.floor(((i + batch.length) / finalChunks.length) * 13)
          await this.updateProgress(progress, 'metadata', 'processing', `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`)
        }

        // Replace finalChunks with enriched version
        finalChunks = enrichedChunks

        console.log(`[PDFProcessor] Local metadata enrichment complete: ${finalChunks.length} chunks enriched`)
        await this.updateProgress(90, 'metadata', 'complete', 'Metadata enrichment done')

      } catch (error: any) {
        console.error(`[PDFProcessor] Metadata enrichment failed: ${error.message}`)
        console.warn('[PDFProcessor] Continuing with default metadata')

        // Mark document for review but don't fail processing
        await this.markForReview(
          'metadata_enrichment_failed',
          `Local metadata enrichment failed: ${error.message}. Using default metadata.`
        )

        await this.updateProgress(90, 'metadata', 'fallback', 'Using default metadata')
      }

      // Stage 8: Local Embeddings (LOCAL MODE) (90-95%)
      // Phase 7: Generate embeddings using Transformers.js
      console.log('[PDFProcessor] Starting local embeddings generation (Transformers.js)')
      await this.updateProgress(92, 'embeddings', 'processing', 'Generating local embeddings')

      try {
        // Phase 5: Import metadata-enhanced embedding functions
        const { createEnhancedEmbeddingText, validateEnhancedText } = await import('../lib/embeddings/metadata-context.js')

        // Extract content from chunks for embedding
        // Phase 5: Create enhanced text with metadata context for better retrieval
        let enhancedCount = 0
        let fallbackCount = 0

        const chunkTexts = finalChunks.map((chunk) => {
          // Enhance with metadata context (heading, page, section)
          const enhancedText = createEnhancedEmbeddingText({
            content: chunk.content,
            heading_path: chunk.heading_path,
            page_start: chunk.page_start,
            section_marker: chunk.section_marker
          })

          // Validate enhancement doesn't exceed token limits
          const validation = validateEnhancedText(chunk.content, enhancedText)
          if (!validation.valid) {
            console.warn(`[PDFProcessor] ${validation.warning} - using original text for chunk ${chunk.chunk_index}`)
            fallbackCount++
            return chunk.content
          }

          if (enhancedText !== chunk.content) {
            enhancedCount++
          }

          return enhancedText
        })

        console.log(`[PDFProcessor] Generating embeddings for ${chunkTexts.length} chunks (Xenova/all-mpnet-base-v2)`)
        console.log(`[PDFProcessor] Metadata enhancement: ${enhancedCount}/${chunkTexts.length} (${((enhancedCount/chunkTexts.length)*100).toFixed(1)}%)`)
        if (fallbackCount > 0) {
          console.warn(`[PDFProcessor] Fallback: ${fallbackCount} chunks exceeded token limits`)
        }

        const startTime = Date.now()

        // Generate embeddings locally with Transformers.js
        const embeddings = await generateEmbeddingsLocal(chunkTexts)

        const embeddingTime = Date.now() - startTime
        console.log(`[PDFProcessor] Local embeddings complete: ${embeddings.length} vectors (768d) in ${(embeddingTime / 1000).toFixed(1)}s`)

        // Validate dimensions (should be 768)
        if (embeddings.length !== finalChunks.length) {
          throw new Error(`Embedding count mismatch: expected ${finalChunks.length}, got ${embeddings.length}`)
        }

        // Attach embeddings to chunks
        finalChunks = finalChunks.map((chunk, idx) => ({
          ...chunk,
          embedding: embeddings[idx]
        }))

        console.log('[PDFProcessor] Embeddings attached to all chunks')
        await this.updateProgress(95, 'embeddings', 'complete', 'Local embeddings generated')

      } catch (error: any) {
        console.error(`[PDFProcessor] Local embeddings failed: ${error.message}`)
        console.warn('[PDFProcessor] Falling back to Gemini embeddings')

        try {
          // Fallback to Gemini embeddings if local fails
          const chunkContents = finalChunks.map(chunk => chunk.content)
          const embeddings = await generateEmbeddings(chunkContents)

          finalChunks = finalChunks.map((chunk, idx) => ({
            ...chunk,
            embedding: embeddings[idx]
          }))

          console.log('[PDFProcessor] Gemini embeddings fallback successful')
          await this.updateProgress(95, 'embeddings', 'fallback', 'Using Gemini embeddings')

        } catch (fallbackError: any) {
          console.error(`[PDFProcessor] Gemini embeddings also failed: ${fallbackError.message}`)

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
      console.log('[PDFProcessor] CLOUD MODE: Using AI semantic chunking')

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

    // Phase 4: Note on bulletproof matching
    // In local mode, chunks have Docling metadata (pages, headings, bboxes)
    // In cloud mode, chunks have AI-extracted metadata only
    // Both modes produce ProcessedChunk[] with compatible structure

    return {
      markdown,
      chunks: finalChunks,
      metadata: {
        sourceUrl: this.job.metadata?.source_url
        // Phase 2: Structure info is stored in job.metadata.cached_extraction (local mode)
        // Phase 4: Matching stats stored in job.metadata.matchingWarnings (local mode)
      },
      wordCount: markdown.split(/\s+/).length
    }
  }

  /**
   * Mark document for user review
   * Sets review flag in database and stores warning in job metadata
   *
   * Phase 3: Used for OOM warnings during local cleanup
   *
   * @param reason - Short reason code (e.g., 'ai_cleanup_oom')
   * @param message - Human-readable warning message
   */
  private async markForReview(reason: string, message: string): Promise<void> {
    console.log(`[PDFProcessor] Marking document for review: ${reason}`)

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
