/**
 * Client-safe extraction utilities for sparks.
 * These functions can be used in both client and server components.
 */

/**
 * Extract explicit chunk references from spark content
 * Format: /chunk_abc123 or /chunk-abc-123
 *
 * Pattern: Use explicit IDs only, no fuzzy matching.
 */
export function extractChunkIds(content: string): string[] {
  const matches = content.matchAll(/\/chunk[_-]([a-z0-9_-]+)/gi)
  return Array.from(matches, m => `chunk_${m[1]}`)
}

/**
 * Extract hashtags from content
 * Format: #tagname or #tag-name
 */
export function extractTags(content: string): string[] {
  const matches = content.matchAll(/#([a-z0-9_-]+)/gi)
  return Array.from(matches, m => m[1].toLowerCase())
}
