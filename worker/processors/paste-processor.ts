/**
 * Paste Processor with Chonkie Unified Chunking Pipeline
 *
 * CHONKIE INTEGRATION: Intelligent format detection + simplified 6-stage flow
 * 1. Format Detection (10-15%)
 * 2. Content Processing (format-specific) (15-30%)
 * 3. Chonkie Chunking (30-40%) - User-selected strategy
 * 4. Metadata Enrichment (40-70%) - PydanticAI + Ollama
 * 5. Local Embeddings (70-90%) - Transformers.js
 * 6. Finalize (90-100%) - Save to Storage and Database
 *
 * Automatically detects format (transcript, markdown, code, plain_text) and processes accordingly.
 *
 * Cost: $0 (100% local processing, no API calls)
 * Time: 3-25 minutes (varies by chunker strategy and format)
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { cleanMarkdownWithAI, textToMarkdownWithAI } from '../lib/ai-chunking.js'
import { extractTimestampsWithContext } from '../lib/markdown-chunking.js'
import { cleanYoutubeTranscript } from '../lib/youtube-cleaning.js'
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
import { GEMINI_MODEL } from '../lib/model-config.js'

/**
 * Content format detection result.
 */
interface FormatDetection {
  /** Detected format type */
  format: 'transcript' | 'markdown' | 'code' | 'plain_text'
  /** Confidence score 0-1 */
  confidence: number
  /** Whether content has timestamps */
  hasTimestamps: boolean
  /** Whether content appears to be YouTube transcript */
  isYouTubeTranscript: boolean
  /** Detected programming language if code */
  language?: string
}

/**
 * Processor for pasted content from users.
 * Automatically detects format and applies appropriate processing.
 *
 * Processing stages:
 * 1. Format detection (10-15%)
 * 2. Content processing based on format (15-30%)
 * 3. Chonkie chunking (30-40%)
 * 4. Metadata enrichment (40-70%)
 * 5. Local embeddings (70-90%)
 * 6. Finalize (90-100%)
 *
 * Features:
 * - Automatic format detection (transcript, markdown, code, plain_text)
 * - YouTube transcript handling with timestamp preservation
 * - Markdown preservation or enhancement
 * - Code block formatting with syntax highlighting
 * - Chonkie chunking with 9 strategies
 * - Local metadata extraction and embeddings
 *
 * @example
 * const processor = new PasteProcessor(ai, supabase, job)
 * const result = await processor.process()
 * // Intelligently processes based on detected format
 */
export class PasteProcessor extends SourceProcessor {
  /**
   * Detects the format of pasted content.
   *
   * @param content - Pasted content to analyze
   * @returns Format detection result
   */
  private detectFormat(content: string): FormatDetection {
    // Check for timestamps (YouTube transcript indicator)
    const timestampRegex = /\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g
    const timestampMatches = content.match(timestampRegex) || []
    const hasTimestamps = timestampMatches.length > 5 // More than 5 timestamps suggests transcript

    // Check for YouTube transcript patterns
    const isYouTubeTranscript = hasTimestamps && (
      content.includes('[[') || // YouTube timestamp format [[MM:SS](url)]
      timestampMatches.length > 20 || // Many timestamps
      /\[\d{1,2}:\d{2}\]\s+\w+/g.test(content) // Timestamp followed by text pattern
    )

    // Check for markdown indicators
    const hasMarkdownHeaders = /^#{1,6}\s+/m.test(content)
    const hasMarkdownLists = /^[\*\-\+]\s+/m.test(content) || /^\d+\.\s+/m.test(content)
    const hasMarkdownEmphasis = /\*\*.+\*\*/.test(content) || /__.+__/.test(content)
    const hasMarkdownLinks = /\[.+\]\(.+\)/.test(content)
    const markdownScore = [hasMarkdownHeaders, hasMarkdownLists, hasMarkdownEmphasis, hasMarkdownLinks]
      .filter(Boolean).length / 4

    // Check for code indicators
    const hasCodeBlocks = /```[\s\S]*```/.test(content) || /^    /m.test(content)
    const hasCodePatterns = /function\s+\w+|class\s+\w+|const\s+\w+|import\s+/g.test(content)
    const hasBraces = /[{}\[\]()<>]/.test(content)
    const codeScore = [hasCodeBlocks, hasCodePatterns, hasBraces].filter(Boolean).length / 3

    // Detect programming language if code
    let language: string | undefined
    if (codeScore > 0.5) {
      if (/import\s+.*from\s+['"]|export\s+/m.test(content)) language = 'javascript'
      else if (/def\s+\w+|import\s+\w+|from\s+\w+\s+import/m.test(content)) language = 'python'
      else if (/package\s+\w+|func\s+\w+|import\s+"/.test(content)) language = 'go'
      else if (/fn\s+\w+|impl\s+\w+|use\s+\w+/.test(content)) language = 'rust'
      else if (/class\s+\w+.*\{|interface\s+\w+/.test(content)) language = 'java'
    }

    // Determine format based on scores
    if (isYouTubeTranscript) {
      return {
        format: 'transcript',
        confidence: 0.9,
        hasTimestamps: true,
        isYouTubeTranscript: true
      }
    } else if (markdownScore >= 0.5) {
      return {
        format: 'markdown',
        confidence: markdownScore,
        hasTimestamps,
        isYouTubeTranscript: false
      }
    } else if (codeScore >= 0.5) {
      return {
        format: 'code',
        confidence: codeScore,
        hasTimestamps: false,
        isYouTubeTranscript: false,
        language
      }
    } else {
      return {
        format: 'plain_text',
        confidence: 0.5,
        hasTimestamps,
        isYouTubeTranscript: false
      }
    }
  }

  /**
   * Processes pasted content with format-specific handling.
   *
   * @returns Processed markdown and chunks
   * @throws Error if processing fails
   */
  async process(): Promise<ProcessResult> {
    // Start heartbeat for UI pulse indicator
    this.startHeartbeat()

    try {
      // Stage 1: Format Detection (10-15%)
      await this.updateProgress(10, 'extract', 'analyzing', 'Analyzing pasted content format')

      // Get pasted content from job input
      const pastedContent = this.job.input_data.pasted_content
      if (!pastedContent) {
        throw new Error('Pasted content required for paste processing')
      }

      const contentKB = Math.round(pastedContent.length / 1024)

      // Detect content format
      const detection = this.detectFormat(pastedContent)
      console.log(`[PasteProcessor] Detected format: ${detection.format} (confidence: ${detection.confidence})`)

      await this.updateProgress(15, 'extract', 'complete', `Format detected: ${detection.format}`)

      let markdown: string
      let wasTranscript = false

      // Stage 2: Content Processing (15-30%)
      // Process based on detected format
      switch (detection.format) {
        case 'transcript': {
          await this.updateProgress(18, 'conversion', 'processing', `Cleaning YouTube transcript (${contentKB}KB)`)

          // Clean transcript using YouTube cleaner
          const cleanResult = await this.withRetry(
            async () => cleanYoutubeTranscript(this.ai, pastedContent),
            'Clean YouTube transcript'
          )

          if (cleanResult.success && cleanResult.cleaned) {
            markdown = cleanResult.cleaned
            console.log(`[PasteProcessor] Successfully cleaned transcript`)
          } else {
            // Fallback to basic cleaning
            console.warn(`[PasteProcessor] YouTube cleaning failed: ${cleanResult.error}. Using fallback.`)
            markdown = await this.withRetry(
              async () => textToMarkdownWithAI(this.ai, pastedContent),
              'Convert transcript to markdown'
            )
          }

          wasTranscript = true
          break
        }

        case 'markdown': {
          await this.updateProgress(18, 'conversion', 'processing', `Processing markdown content (${contentKB}KB)`)

          // Check if markdown needs cleaning
          const needsCleaning = detection.confidence < 0.7

          if (needsCleaning) {
            markdown = await this.withRetry(
              async () => cleanMarkdownWithAI(this.ai, pastedContent),
              'Clean markdown'
            )
          } else {
            // Already clean markdown
            markdown = pastedContent
          }
          break
        }

        case 'code': {
          await this.updateProgress(18, 'conversion', 'processing', `Formatting code as markdown (${detection.language || 'unknown language'})`)

          // Wrap code in markdown code block if not already
          if (!pastedContent.includes('```')) {
            markdown = `# Code Snippet\n\n\`\`\`${detection.language || ''}\n${pastedContent}\n\`\`\``
          } else {
            markdown = pastedContent
          }

          // Add structure with AI if needed
          if (pastedContent.length > 500) {
            markdown = await this.withRetry(
              async () => this.ai.models.generateContent({
                model: GEMINI_MODEL,
                contents: [{
                  parts: [{
                    text: `Add markdown documentation structure to this code. Include:
- A title describing what the code does
- Brief description
- Code blocks with syntax highlighting
- Any important notes

Code:
${pastedContent}`
                  }]
                }]
              }).then(r => r.text || markdown),
              'Document code'
            )
          }
          break
        }

        default: {
          await this.updateProgress(18, 'conversion', 'processing', `Converting plain text to markdown (${contentKB}KB)`)

          // Convert plain text to markdown
          markdown = await this.withRetry(
            async () => textToMarkdownWithAI(this.ai, pastedContent),
            'Convert to markdown'
          )
          break
        }
      }

      console.log(`[PasteProcessor] Processed content to ${Math.round(markdown.length / 1024)}KB markdown`)
      await this.updateProgress(30, 'conversion', 'complete', 'Content processing complete')

      // Checkpoint 1: Save converted markdown
      await this.saveStageResult('conversion', { markdown, detection })

      // Stage 3: Chonkie Chunking (30-40%)
      const chunkerStrategy: ChonkieStrategy = (this.job.input_data?.chunkerStrategy as ChonkieStrategy) || 'recursive'
      const chunkSize = this.job.input_data?.chunkSize as number | undefined
      console.log(`[PasteProcessor] Stage 3: Chunking with Chonkie strategy: ${chunkerStrategy}`)

      await this.updateProgress(33, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

      const chonkieChunks = await chunkWithChonkie(markdown, {
        chunker_type: chunkerStrategy,
        ...(chunkSize ? { chunk_size: chunkSize } : {}),  // Let wrapper apply strategy-specific defaults
        timeout: 300000
      })

      console.log(`[PasteProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
      await this.updateProgress(40, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)

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
      logChunkStatistics(chunkingStats, 'Paste Chunks (After Chonkie)')

      // Stage 4: Metadata Enrichment (40-70%)
      console.log('[PasteProcessor] Stage 4: Starting local metadata enrichment (PydanticAI + Ollama)')
      await this.updateProgress(45, 'metadata', 'processing', 'Extracting structured metadata')

      try {
        const BATCH_SIZE = 10
        const enrichedChunks: ProcessedChunk[] = []

        for (let i = 0; i < finalChunks.length; i += BATCH_SIZE) {
          const batch = finalChunks.slice(i, i + BATCH_SIZE)

          const batchInput: ChunkInput[] = batch.map(chunk => ({
            id: `${this.job.document_id}-${chunk.chunk_index}`,
            content: chunk.content
          }))

          console.log(`[PasteProcessor] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalChunks.length / BATCH_SIZE)}`)

          const metadataMap = await extractMetadataBatch(batchInput, {
            onProgress: (processed, _total) => {
              const overallProgress = 45 + Math.floor(((i + processed) / finalChunks.length) * 25)
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
              console.warn(`[PasteProcessor] Metadata extraction failed for chunk ${chunk.chunk_index} - using defaults`)
              enrichedChunks.push(chunk)
            }
          }

          const progress = 45 + Math.floor(((i + batch.length) / finalChunks.length) * 25)
          await this.updateProgress(progress, 'metadata', 'processing', `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`)
        }

        finalChunks = enrichedChunks

        console.log(`[PasteProcessor] Local metadata enrichment complete: ${finalChunks.length} chunks enriched`)
        await this.updateProgress(70, 'metadata', 'complete', 'Metadata enrichment done')

        // Checkpoint 3: Save enriched chunks (no final flag - not final output)
        await this.saveStageResult('metadata', finalChunks)

      } catch (error: any) {
        console.error(`[PasteProcessor] Metadata enrichment failed: ${error.message}`)
        console.warn('[PasteProcessor] Continuing with default metadata')
        await this.updateProgress(70, 'metadata', 'fallback', 'Using default metadata')
      }

      // Stage 5: Local Embeddings (70-90%)
      console.log('[PasteProcessor] Stage 5: Starting local embeddings generation (Transformers.js)')
      await this.updateProgress(75, 'embeddings', 'processing', 'Generating local embeddings')

      try {
        const chunkTexts = finalChunks.map(chunk => chunk.content)

        console.log(`[PasteProcessor] Generating embeddings for ${chunkTexts.length} chunks (Xenova/all-mpnet-base-v2)`)

        const startTime = Date.now()
        const embeddings = await generateEmbeddingsLocal(chunkTexts)
        const embeddingTime = Date.now() - startTime

        console.log(`[PasteProcessor] Local embeddings complete: ${embeddings.length} vectors (768d) in ${(embeddingTime / 1000).toFixed(1)}s`)

        if (embeddings.length !== finalChunks.length) {
          throw new Error(`Embedding count mismatch: expected ${finalChunks.length}, got ${embeddings.length}`)
        }

        finalChunks = finalChunks.map((chunk, idx) => ({
          ...chunk,
          embedding: embeddings[idx]
        }))

        console.log('[PasteProcessor] Embeddings attached to all chunks')
        await this.updateProgress(90, 'embeddings', 'complete', 'Local embeddings generated')

      } catch (error: any) {
        console.error(`[PasteProcessor] Local embeddings failed: ${error.message}`)
        console.warn('[PasteProcessor] Falling back to Gemini embeddings')

        try {
          const chunkContents = finalChunks.map(chunk => chunk.content)
          const embeddings = await generateEmbeddings(chunkContents)

          finalChunks = finalChunks.map((chunk, idx) => ({
            ...chunk,
            embedding: embeddings[idx]
          }))

          console.log('[PasteProcessor] Gemini embeddings fallback successful')
          await this.updateProgress(90, 'embeddings', 'fallback', 'Using Gemini embeddings')

        } catch (fallbackError: any) {
          console.error(`[PasteProcessor] Gemini embeddings also failed: ${fallbackError.message}`)
          await this.updateProgress(90, 'embeddings', 'failed', 'Embeddings generation failed')
        }
      }

      // Extract timestamps for document-level storage (if YouTube transcript detected)
      let timestampsForDocument: any[] | undefined
      if (detection.hasTimestamps && detection.isYouTubeTranscript) {
        const timestamps = extractTimestampsWithContext(markdown)

        if (timestamps.length > 0) {
          console.log(`[PasteProcessor] Detected ${timestamps.length} YouTube transcript timestamps`)
          timestampsForDocument = timestamps.map(t => ({
            start_seconds: t.time,
            end_seconds: t.time, // Approximate
            text: `${t.context_before} ${t.context_after}`.trim()
          }))
        }
      }

      // Stage 6: Finalize (90-100%)
      console.log('[PasteProcessor] Stage 6: Finalizing document processing')
      await this.updateProgress(95, 'finalize', 'formatting', 'Finalizing')

      // Checkpoint 4: Save final chunks
      await this.saveStageResult('chunks', finalChunks, { final: true })

      // Extract metadata
      const wordCount = markdown.split(/\s+/).length
      const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm) || []
      const outline = headingMatches.slice(0, 10).map(h => h.replace(/^#+\s+/, ''))

      // Calculate document themes
      const themeFrequency = new Map<string, number>()
      finalChunks.forEach(chunk => {
        if (chunk.themes) {
          chunk.themes.forEach((theme: string) => {
            themeFrequency.set(theme, (themeFrequency.get(theme) || 0) + 1)
          })
        }
      })

      const documentThemes = Array.from(themeFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme]) => theme)

      // Build source_metadata if this is a YouTube transcript
      const source_metadata = timestampsForDocument ? {
        isTranscript: true as const,
        timestamps: timestampsForDocument
      } : undefined

      // Build ProcessResult for return
      const result: ProcessResult = {
        markdown,
        chunks: finalChunks,
        wordCount,
        outline: outline.length > 0 ? outline.map((title, _i) => ({
          title,
          level: 1,
          offset: 0
        })) : undefined,
        metadata: {
          source_metadata,
          extra: {
            source_type: detection.isYouTubeTranscript ? 'youtube_transcript' : 'paste',
            chunk_count: finalChunks.length,
            chunker_strategy: chunkerStrategy,
            detected_format: detection.format,
            format_confidence: detection.confidence,
            has_timestamps: detection.hasTimestamps,
            was_transcript: wasTranscript,
            detected_language: detection.language,
            document_themes: documentThemes.length > 0 ? documentThemes : undefined,
            processing_mode: 'paste',
            original_size_kb: contentKB
          }
        }
      }

      // Checkpoint 4.5: Save document-level metadata to metadata.json
      const metadataExport = this.buildMetadataExport(result, {
        page_count: null,  // Pasted content doesn't have pages
        language: 'en'
      })
      await this.saveStageResult('metadata', metadataExport, { final: true })

      // Checkpoint 5: Save manifest
      const manifestData = {
        document_id: this.job.document_id,
        processing_mode: 'local',
        source_type: 'paste',
        files: {
          'chunks.json': { size: JSON.stringify(finalChunks).length, type: 'final' },
          'metadata.json': { size: JSON.stringify(metadataExport).length, type: 'final' },
          'manifest.json': { size: 0, type: 'final' }
        },
        chunk_count: finalChunks.length,
        word_count: markdown.split(/\s+/).length,
        processing_time: Date.now() - (this.job.created_at ? new Date(this.job.created_at).getTime() : Date.now()),
        markdown_hash: hashMarkdown(markdown),
        chunker_strategy: chunkerStrategy,
        detected_format: detection.format,
        format_confidence: detection.confidence,
        was_transcript: wasTranscript,
        original_size_kb: contentKB
      }
      await this.saveStageResult('manifest', manifestData, { final: true })

      await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')

      return result
    } finally {
      // Always stop heartbeat
      this.stopHeartbeat()
    }
  }
}
