/**
 * PydanticAI Metadata Extraction - TypeScript Bridge
 *
 * Integrates Python PydanticAI with Ollama (Qwen 32B) for structured metadata extraction.
 * Provides type-safe metadata with automatic retry on validation failure.
 *
 * Phase 6: Local LLM metadata enrichment for both PDF and EPUB formats
 */

import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Structured metadata extracted from a chunk.
 * Matches ChunkMetadata Pydantic model in Python script.
 */
export interface ChunkMetadata {
  /** Main themes or topics (1-5 items) */
  themes: string[]
  /** Key concepts with importance scores (1-10 items) */
  concepts: Array<{
    text: string
    importance: number
  }>
  /** Overall importance score (0.0 to 1.0) */
  importance: number
  /** Brief summary (20-200 characters) */
  summary: string
  /** Emotional metadata */
  emotional: {
    polarity: number       // -1.0 (negative) to 1.0 (positive)
    primaryEmotion: string // e.g., "curious", "confident", "neutral"
    intensity: number      // 0.0 (mild) to 1.0 (strong)
  }
  /** Primary domain or subject area */
  domain: string
}

/**
 * Input chunk for metadata extraction.
 */
export interface ChunkInput {
  /** Chunk ID (for tracking) */
  id: string
  /** Chunk text content */
  content: string
}

/**
 * Result from metadata extraction.
 * Includes status for error handling.
 */
export interface MetadataResult {
  /** Chunk ID (matches input) */
  chunk_id: string
  /** Extracted metadata */
  metadata: ChunkMetadata
  /** Extraction status */
  status: 'success' | 'fallback'
  /** Error message (if status='fallback') */
  error?: string
}

// ============================================================================
// Core Metadata Extraction Function
// ============================================================================

/**
 * Extract structured metadata from chunks using PydanticAI + Ollama.
 * Processes chunks in batches via Python subprocess.
 *
 * @param chunks - Array of chunks to process
 * @param options - Optional configuration
 * @returns Map of chunk_id → metadata
 * @throws Error if Python script fails to spawn
 *
 * @example
 * const chunks = [
 *   { id: 'chunk-1', content: 'Machine learning is transforming AI...' },
 *   { id: 'chunk-2', content: 'Quantum computing has enormous potential...' }
 * ]
 *
 * const metadata = await extractMetadataBatch(chunks)
 * console.log(metadata.get('chunk-1'))
 * // { themes: ['machine learning', 'AI'], concepts: [...], ... }
 */
export async function extractMetadataBatch(
  chunks: ChunkInput[],
  options: {
    /** Python executable path (default: python3) */
    pythonPath?: string
    /** Timeout in milliseconds (default: 10 minutes) */
    timeout?: number
    /** Progress callback (optional) */
    onProgress?: (processed: number, total: number) => void
  } = {}
): Promise<Map<string, ChunkMetadata>> {
  const scriptPath = path.join(__dirname, '../../scripts/extract_metadata_pydantic.py')
  const pythonPath = options.pythonPath || 'python3'
  const timeout = options.timeout || 10 * 60 * 1000 // 10 minutes default

  console.log('[PydanticAI] Starting metadata extraction...')
  console.log(`  Chunks: ${chunks.length}`)
  console.log(`  Script: ${scriptPath}`)

  return new Promise((resolve, reject) => {
    // Spawn Python process with unbuffered output
    // -u flag is CRITICAL for real-time IPC
    const python = spawn(pythonPath, [
      '-u',  // Unbuffered output
      scriptPath
    ], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const results = new Map<string, ChunkMetadata>()
    let stderrData = ''
    let processedCount = 0

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      python.kill('SIGTERM')
      reject(new Error(`Metadata extraction timeout after ${timeout}ms`))
    }, timeout)

    // Write chunks to stdin (one JSON per line)
    for (const chunk of chunks) {
      python.stdin.write(JSON.stringify(chunk) + '\n')
    }
    python.stdin.end() // Signal end of input

    // Handle stdout (results)
    python.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const result: MetadataResult = JSON.parse(line)

          // Store metadata (even if fallback)
          results.set(result.chunk_id, result.metadata)
          processedCount++

          // Call progress callback
          if (options.onProgress) {
            options.onProgress(processedCount, chunks.length)
          }

          // Log fallback errors
          if (result.status === 'fallback') {
            console.warn(`[PydanticAI] Fallback for chunk ${result.chunk_id}: ${result.error}`)
          }
        } catch (e) {
          // Not JSON, might be debug output - ignore
          console.debug(`[PydanticAI] Non-JSON output: ${line}`)
        }
      }
    })

    // Handle stderr (Python errors)
    python.stderr.on('data', (data: Buffer) => {
      stderrData += data.toString()
    })

    // Handle process exit
    python.on('close', (code) => {
      clearTimeout(timeoutHandle)

      if (code === 0) {
        // Success
        console.log('[PydanticAI] Extraction complete')
        console.log(`  Processed: ${results.size}/${chunks.length} chunks`)

        // Check if we got all results
        if (results.size < chunks.length) {
          console.warn(`[PydanticAI] Warning: Only ${results.size}/${chunks.length} chunks processed`)
        }

        resolve(results)
      } else {
        // Non-zero exit code
        let errorMessage = `PydanticAI script failed (exit code ${code})`

        if (stderrData) {
          errorMessage += `\nstderr: ${stderrData.slice(0, 1000)}`
        }

        reject(new Error(errorMessage))
      }
    })

    // Handle process errors (e.g., Python not found)
    python.on('error', (error) => {
      clearTimeout(timeoutHandle)

      if (error.message.includes('ENOENT')) {
        reject(new Error(
          'Python not found. Install Python 3.10+ and ensure it is in PATH.\n' +
          `Tried to execute: ${pythonPath}\n` +
          'Required packages: pydantic-ai[ollama]>=1.0.17'
        ))
      } else {
        reject(new Error(`Failed to spawn Python process: ${error.message}`))
      }
    })
  })
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate metadata structure.
 * Useful for debugging and ensuring data quality.
 *
 * @param metadata - Metadata to validate
 * @returns Validation result with errors
 *
 * @example
 * const validation = validateMetadata(metadata)
 * if (!validation.valid) {
 *   console.warn('Metadata validation failed:', validation.errors)
 * }
 */
export function validateMetadata(metadata: ChunkMetadata): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Check themes
  if (!Array.isArray(metadata.themes) || metadata.themes.length === 0) {
    errors.push('Themes missing or empty')
  }
  if (metadata.themes.length > 5) {
    errors.push('Too many themes (max 5)')
  }

  // Check concepts
  if (!Array.isArray(metadata.concepts) || metadata.concepts.length === 0) {
    errors.push('Concepts missing or empty')
  }
  if (metadata.concepts.length > 10) {
    errors.push('Too many concepts (max 10)')
  }

  // Check importance score
  if (typeof metadata.importance !== 'number' ||
      metadata.importance < 0 ||
      metadata.importance > 1) {
    errors.push('Importance score invalid (must be 0.0-1.0)')
  }

  // Check summary
  if (!metadata.summary ||
      metadata.summary.length < 20 ||
      metadata.summary.length > 200) {
    errors.push('Summary invalid (must be 20-200 characters)')
  }

  // Check emotional metadata
  if (!metadata.emotional) {
    errors.push('Emotional metadata missing')
  } else {
    if (typeof metadata.emotional.polarity !== 'number' ||
        metadata.emotional.polarity < -1 ||
        metadata.emotional.polarity > 1) {
      errors.push('Emotional polarity invalid (must be -1.0 to 1.0)')
    }
    if (!metadata.emotional.primaryEmotion) {
      errors.push('Primary emotion missing')
    }
    if (typeof metadata.emotional.intensity !== 'number' ||
        metadata.emotional.intensity < 0 ||
        metadata.emotional.intensity > 1) {
      errors.push('Emotional intensity invalid (must be 0.0-1.0)')
    }
  }

  // Check domain
  if (!metadata.domain) {
    errors.push('Domain missing')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Get fallback metadata (matches Python script's fallback).
 * Used when extraction fails or for testing.
 */
export function getFallbackMetadata(): ChunkMetadata {
  return {
    themes: ['unknown'],
    concepts: [{ text: 'general content', importance: 0.5 }],
    importance: 0.5,
    summary: 'Content requires manual review',
    emotional: {
      polarity: 0.0,
      primaryEmotion: 'neutral',
      intensity: 0.0
    },
    domain: 'general'
  }
}
