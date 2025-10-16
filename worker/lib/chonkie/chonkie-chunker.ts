/**
 * Chonkie Multi-Strategy Chunker - TypeScript IPC Wrapper
 *
 * Provides type-safe interface to Python Chonkie library via subprocess.
 * Supports 9 chunker strategies with character offset validation.
 *
 * Architecture:
 * - Python subprocess spawned for each chunking operation
 * - Dynamic timeout based on chunker type and document size
 * - CRITICAL: Character offset validation to guarantee metadata transfer
 *
 * Pattern: Based on worker/lib/docling-extractor.ts (subprocess IPC)
 * Inspired by: worker/lib/local/ollama-cleanup.ts (timeout handling)
 */

import { spawn } from 'child_process'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { ChonkieConfig, ChonkieChunk, ChonkieStrategy } from './types.js'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Dynamic Timeout Configuration
// ============================================================================

/**
 * Base timeout per chunker type (in milliseconds).
 * Scaled dynamically by document size (1 minute per 100k characters).
 *
 * Ranking (fastest to slowest):
 * - token/sentence: 1 minute
 * - recursive/table: 1.5 minutes
 * - code: 3 minutes
 * - semantic: 5 minutes
 * - late: 10 minutes
 * - neural: 15 minutes
 * - slumber: 30 minutes
 */
const BASE_TIMEOUT_MS: Record<ChonkieStrategy, number> = {
  token: 60000,      // 1 minute
  sentence: 60000,   // 1 minute
  recursive: 90000,  // 1.5 minutes
  semantic: 300000,  // 5 minutes
  late: 600000,      // 10 minutes
  code: 180000,      // 3 minutes
  neural: 900000,    // 15 minutes
  slumber: 1800000,  // 30 minutes
  table: 90000       // 1.5 minutes
}

// ============================================================================
// Main Chunking Function
// ============================================================================

/**
 * Chunk markdown using Chonkie via Python subprocess IPC.
 *
 * PATTERN: Based on worker/lib/docling-extractor.ts:157-195
 *
 * Key Features:
 * - Dynamic timeout based on chunker type + document size
 * - Character offset validation (CRITICAL for metadata transfer)
 * - Proper error handling with descriptive messages
 * - No stdout/stderr mixing (clean JSON output)
 *
 * @param cleanedMarkdown - Markdown text to chunk
 * @param config - Chunker configuration
 * @returns Array of chunks with guaranteed character offsets
 * @throws Error if chunking fails or offsets mismatch
 *
 * @example
 * const chunks = await chunkWithChonkie(markdown, {
 *   chunker_type: 'recursive',
 *   chunk_size: 512
 * })
 *
 * @example
 * // With semantic chunker (matches final embedding model)
 * const chunks = await chunkWithChonkie(markdown, {
 *   chunker_type: 'semantic',
 *   chunk_size: 512
 *   // embedding_model defaults to 'all-mpnet-base-v2' (matches final embeddings)
 *   // threshold defaults to 0.7 (balanced sensitivity)
 * })
 */
export async function chunkWithChonkie(
  cleanedMarkdown: string,
  config: ChonkieConfig
): Promise<ChonkieChunk[]> {
  const startTime = Date.now()

  // Validate inputs
  if (!cleanedMarkdown || cleanedMarkdown.length === 0) {
    throw new Error('cleanedMarkdown cannot be empty')
  }

  if (!config.chunker_type) {
    throw new Error('config.chunker_type is required')
  }

  // Apply strategy-specific defaults
  const enhancedConfig = { ...config }

  // Semantic and Late chunkers: Use same embedding model as final embeddings for consistency
  if (config.chunker_type === 'semantic' || config.chunker_type === 'late') {
    enhancedConfig.embedding_model = config.embedding_model || 'all-mpnet-base-v2'

    // Semantic chunker: Increase chunk_size to allow larger chunks
    // Per official example: https://docs.chonkie.ai/oss/chunkers/semantic-chunker
    if (config.chunker_type === 'semantic') {
      enhancedConfig.chunk_size = config.chunk_size ?? 1024  // Double the default
      enhancedConfig.threshold = config.threshold ?? 0.6    // Match official example
    }
  }

  // Calculate dynamic timeout
  const baseTimeout = BASE_TIMEOUT_MS[config.chunker_type] || 300000
  const docSizeMultiplier = Math.max(1, Math.ceil(cleanedMarkdown.length / 100000))
  const timeout = enhancedConfig.timeout || (baseTimeout * docSizeMultiplier)

  // Script path (relative to this file)
  const scriptPath = path.join(__dirname, '../../scripts/chonkie_chunk.py')

  console.log('[Chonkie] Starting chunking...')
  console.log(`  Strategy: ${enhancedConfig.chunker_type}`)
  console.log(`  Document size: ${Math.round(cleanedMarkdown.length / 1024)}KB`)
  console.log(`  Timeout: ${Math.round(timeout / 1000)}s`)
  console.log(`  Config: ${JSON.stringify({ ...enhancedConfig, timeout })}`)

  return runChonkieScript(
    scriptPath,
    cleanedMarkdown,
    enhancedConfig,
    timeout,
    startTime
  )
}

// ============================================================================
// Subprocess Execution
// ============================================================================

/**
 * Run Chonkie Python script via subprocess.
 * Handles stdin/stdout JSON IPC and validates character offsets.
 *
 * PATTERN: Based on worker/lib/docling-extractor.ts:204-329
 *
 * CRITICAL:
 * - Python must flush stdout after JSON write (prevents IPC hangs)
 * - Character offsets MUST match content (verified after parsing)
 * - Timeout kills process if chunking takes too long
 *
 * @param scriptPath - Path to chonkie_chunk.py
 * @param markdown - Markdown to chunk
 * @param config - Chunker configuration
 * @param timeout - Timeout in milliseconds
 * @param startTime - Timestamp when chunking started (for elapsed time calculation)
 * @returns Validated chunks with character offsets
 */
async function runChonkieScript(
  scriptPath: string,
  markdown: string,
  config: ChonkieConfig,
  timeout: number,
  startTime: number
): Promise<ChonkieChunk[]> {
  return new Promise((resolve, reject) => {
    // Spawn Python process
    const python = spawn('python3', [scriptPath])

    let stdout = ''
    let stderr = ''

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      python.kill('SIGTERM')
      reject(new Error(
        `Chonkie ${config.chunker_type} timed out after ${timeout}ms. ` +
        `Document size: ${markdown.length} chars. ` +
        `Try reducing chunk_size or using a faster chunker (recursive, token).`
      ))
    }, timeout)

    // Collect stdout (JSON output)
    python.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    // Collect stderr (error messages, warnings)
    python.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
      // Log warnings in real-time
      console.warn(`[Chonkie ${config.chunker_type}] ${data}`)
    })

    // Handle process exit
    python.on('close', (code) => {
      clearTimeout(timeoutHandle)

      if (code !== 0) {
        // Non-zero exit = error
        reject(new Error(
          `Chonkie ${config.chunker_type} failed (exit ${code}): ${stderr}\n` +
          `Stdout: ${stdout.slice(0, 500)}`
        ))
        return
      }

      // Parse JSON output
      try {
        const chunks: ChonkieChunk[] = JSON.parse(stdout)

        // CRITICAL: Validate character offsets match content
        validateChunkOffsets(chunks, markdown, config.chunker_type)

        const elapsedMs = Date.now() - startTime
        console.log(
          `[Chonkie] ✅ ${config.chunker_type} created ${chunks.length} chunks ` +
          `(${Math.round(elapsedMs / 1000)}s)`
        )

        resolve(chunks)
      } catch (err) {
        reject(new Error(
          `Failed to parse Chonkie output: ${err}\n` +
          `Output: ${stdout.slice(0, 1000)}`
        ))
      }
    })

    // Handle process spawn errors (e.g., Python not found)
    python.on('error', (error) => {
      clearTimeout(timeoutHandle)

      if (error.message.includes('ENOENT')) {
        reject(new Error(
          'Python not found. Install Python 3.10+ and ensure it is in PATH.\n' +
          'Tried to execute: python3'
        ))
      } else {
        reject(new Error(`Failed to spawn Python process: ${error.message}`))
      }
    })

    // Send input via stdin
    const input = JSON.stringify({ markdown, config })
    python.stdin.write(input)
    python.stdin.end()
  })
}

// ============================================================================
// Character Offset Validation
// ============================================================================

/**
 * Validate that chunk character offsets match actual content.
 *
 * CRITICAL: If offsets don't match, metadata transfer will fail silently.
 * This validation catches mismatches immediately during chunking.
 *
 * @param chunks - Chunks to validate
 * @param markdown - Original markdown
 * @param chunkerType - Chunker type (for error messages)
 * @throws Error if any chunk has mismatched offsets
 */
function validateChunkOffsets(
  chunks: ChonkieChunk[],
  markdown: string,
  chunkerType: string
): void {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    // Extract content using offsets
    const extracted = markdown.slice(chunk.start_index, chunk.end_index)

    // Compare with chunk text
    if (extracted !== chunk.text) {
      // Log detailed mismatch info
      console.error(
        `[Chonkie] ❌ Offset mismatch detected in chunk ${i}:\n` +
        `  Chunker: ${chunkerType}\n` +
        `  Expected text: "${chunk.text.slice(0, 50)}..."\n` +
        `  Extracted text: "${extracted.slice(0, 50)}..."\n` +
        `  Offsets: [${chunk.start_index}, ${chunk.end_index})\n` +
        `  Expected length: ${chunk.text.length}\n` +
        `  Extracted length: ${extracted.length}`
      )

      throw new Error(
        `Character offset mismatch in chunk ${i} - metadata transfer will fail. ` +
        `Expected text length ${chunk.text.length}, got ${extracted.length}. ` +
        `This is a critical bug in Chonkie or the Python wrapper.`
      )
    }
  }

  console.log(`[Chonkie] ✅ Character offset validation passed (${chunks.length} chunks)`)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get estimated processing time for a chunker type and document size.
 * Useful for UI progress indicators.
 *
 * @param chunkerType - Chunker strategy
 * @param documentSizeChars - Document size in characters
 * @returns Estimated time in milliseconds
 *
 * @example
 * const estimate = getEstimatedProcessingTime('semantic', 500000)
 * console.log(`Estimated time: ${Math.round(estimate / 1000)}s`)
 */
export function getEstimatedProcessingTime(
  chunkerType: ChonkieStrategy,
  documentSizeChars: number
): number {
  const baseTime = BASE_TIMEOUT_MS[chunkerType] || 300000
  const sizeMultiplier = Math.max(1, Math.ceil(documentSizeChars / 100000))
  return baseTime * sizeMultiplier
}

/**
 * Get human-readable time estimate string.
 *
 * @param chunkerType - Chunker strategy
 * @param documentSizeChars - Document size in characters
 * @returns Formatted string (e.g., "5-10 min")
 *
 * @example
 * const estimate = getFormattedTimeEstimate('neural', 500000)
 * // Returns: "20-30 min"
 */
export function getFormattedTimeEstimate(
  chunkerType: ChonkieStrategy,
  documentSizeChars: number
): string {
  const estimateMs = getEstimatedProcessingTime(chunkerType, documentSizeChars)
  const estimateMin = Math.ceil(estimateMs / 60000)

  // Add buffer range (±20%)
  const minTime = Math.max(1, Math.floor(estimateMin * 0.8))
  const maxTime = Math.ceil(estimateMin * 1.2)

  return `${minTime}-${maxTime} min`
}
