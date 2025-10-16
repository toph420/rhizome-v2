/**
 * Text Processor with Chonkie Unified Chunking Pipeline
 *
 * CHONKIE INTEGRATION: Simplified 6-stage processing flow
 * 1. Download text from Storage (10%)
 * 2. Convert to markdown with AI (10-25%)
 * 3. Chonkie Chunking (25-35%) - User-selected strategy
 * 4. Metadata Enrichment (35-70%) - PydanticAI + Ollama
 * 5. Local Embeddings (70-90%) - Transformers.js
 * 6. Finalize (90-100%) - Save to Storage and Database
 *
 * Converts plain text to well-formatted markdown with AI structure generation.
 *
 * Cost: $0 (100% local processing, no API calls)
 * Time: 3-25 minutes (varies by chunker strategy)
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { textToMarkdownWithAI } from '../lib/ai-chunking.js'
// Chonkie Integration
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import type { ChonkieStrategy } from '../lib/chonkie/types.js'
// Local metadata enrichment
import { extractMetadataBatch, type ChunkInput } from '../lib/chunking/pydantic-metadata.js'
// Local embeddings
import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'
import { generateEmbeddings } from '../lib/embeddings.js'
// Storage integration
import { hashMarkdown } from '../lib/cached-chunks.js'
// Chunk statistics
import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'

/**
 * Processor for plain text files.
 * Converts unstructured text to well-formatted markdown with AI,
 * then uses Chonkie for semantic chunking.
 *
 * Processing stages:
 * 1. Download text file from storage (10%)
 * 2. Convert to markdown with AI (10-25%)
 * 3. Chonkie chunking (25-35%)
 * 4. Metadata enrichment (35-70%)
 * 5. Local embeddings (70-90%)
 * 6. Finalize (90-100%)
 *
 * Features:
 * - AI-powered structure generation (headings, lists, emphasis)
 * - Chonkie chunking with 9 strategies
 * - Local metadata extraction (PydanticAI + Ollama)
 * - Local embeddings (Transformers.js)
 *
 * @example
 * const processor = new TextProcessor(ai, supabase, job)
 * const result = await processor.process()
 * // Converts plain text to structured markdown with chunks
 */
export class TextProcessor extends SourceProcessor {
  /**
   * Processes plain text by converting to markdown and chunking.
   *
   * @returns Structured markdown and semantic chunks
   * @throws Error if download or AI processing fails
   */
  async process(): Promise<ProcessResult> {
    // Start heartbeat for UI pulse indicator
    this.startHeartbeat()

    try {
      const storagePath = this.getStoragePath()

      // Stage 1: Download text file (10%)
      await this.updateProgress(10, 'download', 'reading', 'Reading text file')

      const textContent = await this.withRetry(
        async () => this.downloadFromStorage(`${storagePath}/source.txt`),
        'Download text file'
      )

      const textKB = Math.round(textContent.length / 1024)
      console.log(`[TextProcessor] Downloaded ${textKB}KB plain text`)
      await this.updateProgress(15, 'download', 'complete', `Downloaded ${textKB}KB file`)

      // Stage 2: Convert to markdown with AI (15-25%)
      await this.updateProgress(18, 'conversion', 'processing', `Converting ${textKB}KB to markdown with AI`)

      const markdown = await this.withRetry(
        async () => textToMarkdownWithAI(this.ai, textContent),
        'Convert text to markdown'
      )

      console.log(`[TextProcessor] Converted to ${Math.round(markdown.length / 1024)}KB markdown`)
      await this.updateProgress(25, 'conversion', 'complete', 'Conversion to markdown complete')

      // Checkpoint 1: Save converted markdown
      await this.saveStageResult('conversion', { markdown })

      // Stage 3: Chonkie Chunking (25-35%)
      const chunkerStrategy: ChonkieStrategy = (this.job.input_data?.chunkerStrategy as ChonkieStrategy) || 'recursive'
      const chunkSize = this.job.input_data?.chunkSize as number | undefined
      console.log(`[TextProcessor] Stage 3: Chunking with Chonkie strategy: ${chunkerStrategy}`)

      await this.updateProgress(28, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

      const chonkieChunks = await chunkWithChonkie(markdown, {
        chunker_type: chunkerStrategy,
        ...(chunkSize ? { chunk_size: chunkSize } : {}),  // Let wrapper apply strategy-specific defaults
        timeout: 300000
      })

      console.log(`[TextProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
      await this.updateProgress(35, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)

      // Convert Chonkie chunks to ProcessedChunk format
      let finalChunks: ProcessedChunk[] = chonkieChunks.map((chunk, index) => ({
        document_id: this.job.document_id,
        chunk_index: index,
        content: chunk.text,
        start_offset: chunk.start_index,
        end_offset: chunk.end_index,
        token_count: chunk.token_count || 0,
        word_count: chunk.text.split(/\s+/).length,
        heading_path: null,
        heading_level: null,
        page_start: null,
        page_end: null,
        section_marker: null,
        bboxes: null,
        metadata_overlap_count: 0,
        metadata_confidence: 'none',
        metadata_interpolated: false,
        themes: [],
        importance_score: 0.5,
        summary: null,
        emotional_metadata: null,
        conceptual_metadata: null,
        domain_metadata: null,
        metadata_extracted_at: null
      }))

      // Checkpoint 2: Save chunks before enrichment
      await this.saveStageResult('chunking', finalChunks)

      // Log chunk statistics
      const chunkingStats = calculateChunkStatistics(finalChunks, 512)
      logChunkStatistics(chunkingStats, 'Text Chunks (After Chonkie)')

      // Stage 4: Metadata Enrichment (35-70%)
      console.log('[TextProcessor] Stage 4: Starting local metadata enrichment (PydanticAI + Ollama)')
      await this.updateProgress(40, 'metadata', 'processing', 'Extracting structured metadata')

      try {
        const BATCH_SIZE = 10
        const enrichedChunks: ProcessedChunk[] = []

        for (let i = 0; i < finalChunks.length; i += BATCH_SIZE) {
          const batch = finalChunks.slice(i, i + BATCH_SIZE)

          const batchInput: ChunkInput[] = batch.map(chunk => ({
            id: `${this.job.document_id}-${chunk.chunk_index}`,
            content: chunk.content
          }))

          console.log(`[TextProcessor] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalChunks.length / BATCH_SIZE)}`)

          const metadataMap = await extractMetadataBatch(batchInput, {
            onProgress: (processed, _total) => {
              const overallProgress = 40 + Math.floor(((i + processed) / finalChunks.length) * 30)
              this.updateProgress(overallProgress, 'metadata', 'processing', `Enriching chunk ${i + processed}/${finalChunks.length}`)
            }
          })

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
                  primaryEmotion: metadata.emotional.primaryEmotion as any,
                  intensity: metadata.emotional.intensity
                },
                conceptual_metadata: {
                  concepts: metadata.concepts as any
                },
                domain_metadata: {
                  primaryDomain: metadata.domain as any,
                  confidence: 0.8
                },
                metadata_extracted_at: new Date().toISOString()
              })
            } else {
              console.warn(`[TextProcessor] Metadata extraction failed for chunk ${chunk.chunk_index} - using defaults`)
              enrichedChunks.push(chunk)
            }
          }

          const progress = 40 + Math.floor(((i + batch.length) / finalChunks.length) * 30)
          await this.updateProgress(progress, 'metadata', 'processing', `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`)
        }

        finalChunks = enrichedChunks

        console.log(`[TextProcessor] Local metadata enrichment complete: ${finalChunks.length} chunks enriched`)
        await this.updateProgress(70, 'metadata', 'complete', 'Metadata enrichment done')

        // Checkpoint 3: Save enriched chunks
        await this.saveStageResult('metadata', finalChunks, { final: true })

      } catch (error: any) {
        console.error(`[TextProcessor] Metadata enrichment failed: ${error.message}`)
        console.warn('[TextProcessor] Continuing with default metadata')
        await this.updateProgress(70, 'metadata', 'fallback', 'Using default metadata')
      }

      // Stage 5: Local Embeddings (70-90%)
      console.log('[TextProcessor] Stage 5: Starting local embeddings generation (Transformers.js)')
      await this.updateProgress(75, 'embeddings', 'processing', 'Generating local embeddings')

      try {
        const chunkTexts = finalChunks.map(chunk => chunk.content)

        console.log(`[TextProcessor] Generating embeddings for ${chunkTexts.length} chunks (Xenova/all-mpnet-base-v2)`)

        const startTime = Date.now()
        const embeddings = await generateEmbeddingsLocal(chunkTexts)
        const embeddingTime = Date.now() - startTime

        console.log(`[TextProcessor] Local embeddings complete: ${embeddings.length} vectors (768d) in ${(embeddingTime / 1000).toFixed(1)}s`)

        if (embeddings.length !== finalChunks.length) {
          throw new Error(`Embedding count mismatch: expected ${finalChunks.length}, got ${embeddings.length}`)
        }

        finalChunks = finalChunks.map((chunk, idx) => ({
          ...chunk,
          embedding: embeddings[idx]
        }))

        console.log('[TextProcessor] Embeddings attached to all chunks')
        await this.updateProgress(90, 'embeddings', 'complete', 'Local embeddings generated')

      } catch (error: any) {
        console.error(`[TextProcessor] Local embeddings failed: ${error.message}`)
        console.warn('[TextProcessor] Falling back to Gemini embeddings')

        try {
          const chunkContents = finalChunks.map(chunk => chunk.content)
          const embeddings = await generateEmbeddings(chunkContents)

          finalChunks = finalChunks.map((chunk, idx) => ({
            ...chunk,
            embedding: embeddings[idx]
          }))

          console.log('[TextProcessor] Gemini embeddings fallback successful')
          await this.updateProgress(90, 'embeddings', 'fallback', 'Using Gemini embeddings')

        } catch (fallbackError: any) {
          console.error(`[TextProcessor] Gemini embeddings also failed: ${fallbackError.message}`)
          await this.updateProgress(90, 'embeddings', 'failed', 'Embeddings generation failed')
        }
      }

      // Stage 6: Finalize (90-100%)
      console.log('[TextProcessor] Stage 6: Finalizing document processing')
      await this.updateProgress(95, 'finalize', 'formatting', 'Finalizing')

      // Checkpoint 4: Save final chunks
      await this.saveStageResult('chunks', finalChunks, { final: true })

      // Checkpoint 5: Save manifest
      const manifestData = {
        document_id: this.job.document_id,
        processing_mode: 'local',
        source_type: 'txt',
        files: {
          'chunks.json': { size: JSON.stringify(finalChunks).length, type: 'final' },
          'metadata.json': { size: markdown.length, type: 'final' },
          'manifest.json': { size: 0, type: 'final' }
        },
        chunk_count: finalChunks.length,
        word_count: markdown.split(/\s+/).length,
        processing_time: Date.now() - (this.job.created_at ? new Date(this.job.created_at).getTime() : Date.now()),
        markdown_hash: hashMarkdown(markdown),
        chunker_strategy: chunkerStrategy,
        converted_from: 'plain_text',
        original_size_kb: textKB
      }
      await this.saveStageResult('manifest', manifestData, { final: true })

      await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')

      // Extract metadata
      const wordCount = markdown.split(/\s+/).length
      const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm) || []
      const outline = headingMatches.slice(0, 10).map(h => h.replace(/^#+\s+/, ''))

      // Calculate document themes
      const themeFrequency = new Map<string, number>()
      finalChunks.forEach(chunk => {
        if (chunk.themes) {
          chunk.themes.forEach(theme => {
            themeFrequency.set(theme, (themeFrequency.get(theme) || 0) + 1)
          })
        }
      })

      const documentThemes = Array.from(themeFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme]) => theme)

      return {
        markdown,
        chunks: finalChunks,
        wordCount,
        outline: outline.length > 0 ? outline.map((title, _i) => ({
          title,
          level: 1,
          offset: 0
        })) : undefined,
        metadata: {
          extra: {
            chunk_count: finalChunks.length,
            document_themes: documentThemes.length > 0 ? documentThemes : undefined,
            processing_mode: 'txt',
            chunker_strategy: chunkerStrategy,
            converted_from: 'plain_text',
            original_size_kb: textKB
          }
        }
      }
    } finally {
      // Always stop heartbeat
      this.stopHeartbeat()
    }
  }
}
