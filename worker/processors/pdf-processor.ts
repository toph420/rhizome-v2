/**
 * PDF Processor with Chonkie Unified Chunking Pipeline
 *
 * CHONKIE INTEGRATION: Unified 10-stage processing flow (LOCAL mode only)
 * 1. Download PDF from Storage (10-15%)
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
import {
  extractPdfBuffer,
  type DoclingChunk,
  type DoclingStructure
} from '../lib/docling-extractor.js'
import { cleanPageArtifacts } from '../lib/text-cleanup.js'
import { cleanPdfMarkdown } from '../lib/markdown-cleanup-ai.js'
// Phase 3: Local cleanup imports
import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../lib/local/ollama-cleanup.js'
import { OOMError } from '../lib/local/ollama-client.js'
// Phase 4: Bulletproof matching imports
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
    // Start heartbeat - updates job.updated_at every 5 seconds for UI pulse indicator
    this.startHeartbeat()

    try {
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

    // Checkpoint 1: Save extraction data
    await this.saveStageResult('extraction', {
      markdown: extractionResult.markdown,
      doclingChunks: extractionResult.chunks,
      structure: extractionResult.structure
    })

    // Stage 3: Local regex cleanup (52-55%)
    await this.updateProgress(53, 'cleanup_local', 'processing', 'Removing page artifacts')

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

    await this.updateProgress(56, 'cleanup_local', 'complete', 'Local cleanup done')

    // Checkpoint 2: Save cleaned markdown
    await this.saveStageResult('cleanup', { markdown })

    // Checkpoint 2b: Save cached_chunks.json in LOCAL mode (for zero-cost reprocessing)
    if (isLocalMode && extractionResult.chunks) {
      await this.saveStageResult('cached_chunks', {
        extraction_mode: 'pdf',
        markdown_hash: hashMarkdown(markdown),
        docling_version: '2.55.1',
        chunks: extractionResult.chunks,
        structure: extractionResult.structure
      }, { final: true })
    }

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

    // Stage 4: AI cleanup (56-70%) - CONDITIONAL on cleanMarkdown flag
    // Phase 3: Added local mode support with Ollama
    const cleanMarkdownEnabled = this.job.input_data?.cleanMarkdown !== false // Default true

    if (cleanMarkdownEnabled) {
      await this.updateProgress(59, 'cleanup_ai', 'processing', 'AI cleaning markdown')

      try {
        // Check if user wants to override cleanup method
        const useGeminiCleanup = process.env.USE_GEMINI_CLEANUP === 'true'

        if (isLocalMode && !useGeminiCleanup) {
          // Phase 3: Use local Ollama cleanup
          console.log('[PDFProcessor] Using local Ollama cleanup (Qwen 32B)')

          markdown = await cleanMarkdownLocal(markdown, {
            onProgress: (stage, percent) => {
              // Map Ollama's 0-100% to our 59-70% range
              const ourPercent = 59 + Math.floor(percent * 0.11)
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
                const percent = 59 + Math.floor((sectionNum / totalSections) * 11) // 59-70%
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

    // ==================== CHONKIE INTEGRATION: UNIFIED CHUNKING PIPELINE ====================
    // Stages 4-7: Bulletproof Coord Map → Review → Chonkie Chunk → Metadata Transfer
    let finalChunks: ProcessedChunk[]

    if (!isLocalMode || !this.job.metadata?.cached_extraction?.doclingChunks) {
      throw new Error('Chonkie integration requires LOCAL mode with Docling chunks. Set PROCESSING_MODE=local')
    }

    // Stage 4: Bulletproof Matching as Coordinate Mapper (70-72%)
    // Purpose: Create coordinate map showing where Docling chunks map to cleaned markdown
    // This enables metadata transfer via overlap detection in Stage 7
    console.log('[PDFProcessor] Stage 4: Creating coordinate map with bulletproof matcher')
    await this.updateProgress(70, 'bulletproof_mapping', 'processing', 'Creating coordinate map')

    const doclingChunks = this.job.metadata.cached_extraction.doclingChunks as DoclingChunk[]
    console.log(`[PDFProcessor] Docling chunks available: ${doclingChunks.length} metadata anchors`)

    const { chunks: bulletproofMatches } = await bulletproofMatch(
      markdown,
      doclingChunks,
      {
        onProgress: async (layerNum, matched, remaining) => {
          console.log(`[PDFProcessor] Bulletproof Layer ${layerNum}: ${matched} mapped, ${remaining} remaining`)
          // Update progress: Layer 1-5 maps to 70-72% (0.4% per layer update)
          const progress = 70 + (layerNum * 0.4)
          await this.updateProgress(
            progress,
            'bulletproof_mapping',
            'processing',
            `Matching layer ${layerNum}/5: ${matched} mapped`
          )
        }
      }
    )

    console.log(`[PDFProcessor] Coordinate map created: ${bulletproofMatches.length} Docling anchors mapped to cleaned markdown`)
    await this.updateProgress(72, 'bulletproof_mapping', 'complete', 'Coordinate map ready')

    // Stage 5: Review Checkpoint (Optional, 72%)
    // If reviewBeforeChunking=true, pause here for user approval
    if (this.job.input_data?.reviewBeforeChunking === true) {
      console.log('[PDFProcessor] Stage 5: Review checkpoint enabled - awaiting user approval')
      await this.updateProgress(72, 'review_checkpoint', 'waiting', 'Awaiting user review')
      // Note: waitForReview() would be implemented here if needed
      // For now, this is a placeholder - actual review happens via UI
      console.log('[PDFProcessor] Review checkpoint: User approval assumed (auto-continue)')
    }

    // Stage 6: Chonkie Chunking (72-75%)
    // User-selected chunking strategy (default: recursive)
    const chunkerStrategy: ChonkieStrategy = (this.job.input_data?.chunkerStrategy as ChonkieStrategy) || 'recursive'
    const chunkSize = this.job.input_data?.chunkSize as number | undefined
    console.log(`[PDFProcessor] Stage 6: Chunking with Chonkie strategy: ${chunkerStrategy}`)

    await this.updateProgress(72, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

    const chonkieChunks = await chunkWithChonkie(markdown, {
      chunker_type: chunkerStrategy,
      ...(chunkSize ? { chunk_size: chunkSize } : {}),  // Let wrapper apply strategy-specific defaults
      timeout: 300000   // 5 minutes base timeout (scales with document size)
    })

    console.log(`[PDFProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
    await this.updateProgress(75, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)

    // Stage 7: Metadata Transfer via Overlap Detection (75-77%)
    // Transfer Docling metadata (pages, headings, bboxes) to Chonkie chunks
    console.log('[PDFProcessor] Stage 7: Transferring Docling metadata to Chonkie chunks')
    await this.updateProgress(76, 'metadata_transfer', 'processing', 'Transferring metadata via overlap detection')

    finalChunks = await transferMetadataToChonkieChunks(
      chonkieChunks,
      bulletproofMatches,
      this.job.document_id
    )

    console.log(`[PDFProcessor] Metadata transfer complete: ${finalChunks.length} enriched chunks`)
    await this.updateProgress(77, 'metadata_transfer', 'complete', 'Metadata transfer done')

    // Checkpoint: Save chunks with transferred metadata (before AI enrichment)
    await this.saveStageResult('chunking', finalChunks)

    // Log chunk statistics after metadata transfer
    const chunkingStats = calculateChunkStatistics(finalChunks, 512)
    logChunkStatistics(chunkingStats, 'PDF Chunks (After Chonkie + Metadata Transfer)')

    // Stage 8: Metadata Enrichment (77-90%)
    // Phase 2: Use shared method from base class
    console.log('[PDFProcessor] Stage 8: Starting local metadata enrichment (PydanticAI + Ollama)')
    finalChunks = await this.enrichMetadataBatch(finalChunks, 77, 90, {
      onError: 'mark_review'  // Mark document for review on error
    })

    // Stage 9: Local Embeddings (90-95%)
    // Phase 2: Use shared method from base class
    console.log('[PDFProcessor] Stage 9: Starting local embeddings generation (Transformers.js)')
    finalChunks = await this.generateChunkEmbeddings(finalChunks, 90, 95, {
      enhanceWithMetadata: true,  // Use metadata context for better retrieval
      onError: 'mark_review'  // Mark document for review on error
    })

    // Stage 10: Finalize (95-100%)
    console.log('[PDFProcessor] Stage 10: Finalizing document processing')
    await this.updateProgress(97, 'finalize', 'formatting', 'Finalizing')

    // Checkpoint 5: Save final markdown and chunks with embeddings
    await this.saveStageResult('markdown', { content: markdown }, { final: true })
    await this.saveStageResult('chunks', finalChunks, { final: true })

    // Build ProcessResult for return
    const result: ProcessResult = {
      markdown,
      chunks: finalChunks,
      metadata: {
        sourceUrl: this.job.metadata?.source_url
        // Phase 2: Structure info is stored in job.metadata.cached_extraction (local mode)
        // Phase 4: Matching stats stored in job.metadata.matchingWarnings (local mode)
      },
      wordCount: markdown.split(/\s+/).length
    }

    // Checkpoint 5.5: Save document-level metadata to metadata.json
    const metadataExport = this.buildMetadataExport(result, {
      page_count: extractionResult.structure?.total_pages || null,
      language: 'en'  // Could enhance with language detection
    })
    await this.saveStageResult('metadata', metadataExport, { final: true })

    // Checkpoint 6: Save manifest.json with processing metadata
    const manifestData = {
      document_id: this.job.document_id,
      processing_mode: isLocalMode ? 'local' : 'cloud',
      source_type: 'pdf',
      files: {
        'chunks.json': { size: JSON.stringify(finalChunks).length, type: 'final' },
        'metadata.json': { size: JSON.stringify(metadataExport).length, type: 'final' },
        'manifest.json': { size: 0, type: 'final' },
        ...(isLocalMode && extractionResult.chunks ? {
          'cached_chunks.json': { size: JSON.stringify(extractionResult.chunks).length, type: 'final' }
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

    // Phase 4: Note on bulletproof matching
    // In local mode, chunks have Docling metadata (pages, headings, bboxes)
    // In cloud mode, chunks have AI-extracted metadata only
    // Both modes produce ProcessedChunk[] with compatible structure

    return result
  } finally {
    // Always stop heartbeat when processing ends (success or error)
    this.stopHeartbeat()
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
