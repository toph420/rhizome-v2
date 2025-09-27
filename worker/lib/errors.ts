import type { ErrorType } from '../types/multi-format.js'

/**
 * Classifies error type based on message prefix or content.
 * Enables format-specific error handling and recovery guidance.
 * 
 * @param error - Error object from processing
 * @returns Error type classification for routing recovery actions
 * 
 * @example
 * const error = new Error('YOUTUBE_TRANSCRIPT_DISABLED: ...')
 * const type = classifyError(error) // Returns 'permanent'
 */
export function classifyError(error: Error): ErrorType {
  const message = error.message
  
  // Transient errors - retry possible
  if (message.startsWith('YOUTUBE_RATE_LIMIT') || 
      message.startsWith('WEB_TIMEOUT') ||
      message.startsWith('WEB_NETWORK_ERROR') ||
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('503') ||
      message.includes('unavailable')) {
    return 'transient'
  }
  
  // Permanent errors - fail gracefully
  if (message.startsWith('YOUTUBE_TRANSCRIPT_DISABLED') ||
      message.startsWith('YOUTUBE_VIDEO_UNAVAILABLE') ||
      message.startsWith('WEB_NOT_FOUND') ||
      message.startsWith('WEB_NOT_ARTICLE') ||
      message.includes('not found') ||
      message.includes('404')) {
    return 'permanent'
  }
  
  // Paywall errors - suggest alternative
  if (message.startsWith('WEB_PAYWALL') ||
      message.includes('paywall') ||
      message.includes('403')) {
    return 'paywall'
  }
  
  // Invalid input errors
  if (message.startsWith('YOUTUBE_INVALID_ID') ||
      message.startsWith('WEB_INVALID_URL') ||
      message.startsWith('INVALID_URL') ||
      message.includes('invalid') ||
      message.includes('validation')) {
    return 'invalid'
  }
  
  // Default to invalid for unknown errors
  return 'invalid'
}

/**
 * Gets user-friendly error message with format-specific recovery guidance.
 * Provides actionable suggestions based on error type and source format.
 * 
 * @param error - Error object from processing
 * @returns Friendly message with recovery actions
 * 
 * @example
 * const error = new Error('YOUTUBE_TRANSCRIPT_DISABLED: Subtitles are disabled')
 * const message = getUserFriendlyError(error)
 * // Returns: "YOUTUBE_TRANSCRIPT_DISABLED: Subtitles are disabled. Try pasting the transcript manually..."
 */
export function getUserFriendlyError(error: Error): string {
  const type = classifyError(error)
  const message = error.message
  
  switch (type) {
    case 'transient':
      return `${message}. This is a temporary issue. Please try again in a few minutes.`
    
    case 'permanent':
      if (message.startsWith('YOUTUBE_TRANSCRIPT_DISABLED')) {
        return `${message}. Try pasting the transcript manually from YouTube's transcript feature.`
      }
      if (message.startsWith('YOUTUBE_VIDEO_UNAVAILABLE')) {
        return `${message}. The video may be private, deleted, or region-restricted.`
      }
      if (message.startsWith('WEB_NOT_FOUND')) {
        return `${message}. The page may have been moved or deleted.`
      }
      if (message.startsWith('WEB_NOT_ARTICLE')) {
        return `${message}. This page doesn't appear to be an article. Try a different URL or paste the content manually.`
      }
      return message
    
    case 'paywall':
      if (message.startsWith('WEB_PAYWALL')) {
        return `${message}. Try using https://archive.ph/ to find an archived version of this article.`
      }
      return `${message}. This content may be behind a paywall. Try using https://archive.ph/ for an archived version.`
    
    case 'invalid':
      return message
    
    default:
      return `Processing error: ${message}`
  }
}