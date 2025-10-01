/**
 * Centralized Gemini model configuration.
 *
 * This file provides a single source of truth for all Gemini model names
 * used throughout the worker module. Change the model in one place and
 * it affects the entire document processing pipeline.
 *
 * Usage:
 *   import { GEMINI_MODEL } from '../lib/model-config.js'
 *
 *   await ai.models.generateContent({
 *     model: GEMINI_MODEL,
 *     contents: [...]
 *   })
 */

/**
 * Primary Gemini model for all document processing operations.
 *
 * Current: gemini-2.5-flash-lite
 * - Fast, cost-effective model for production use
 * - 65K token output limit
 * - Supports multimodal inputs (text, images, PDFs)
 *
 * Override via environment variable:
 *   GEMINI_MODEL=gemini-2.0-flash-exp npm run dev
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'

/**
 * Maximum output tokens for Gemini responses.
 *
 * gemini-2.5-flash-lite: 65536 tokens (~260K chars of markdown)
 * gemini-2.0-flash-exp: 65536 tokens
 * gemini-1.5-pro: 32768 tokens
 */
export const MAX_OUTPUT_TOKENS = 65536

/**
 * Model configuration object for batch operations.
 * Used by ai-chunking-batch and pdf-batch-utils.
 */
export const MODEL_CONFIG = {
  name: GEMINI_MODEL,
  maxOutputTokens: MAX_OUTPUT_TOKENS
} as const
