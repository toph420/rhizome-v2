export function getUserFriendlyError(error: Error): string {
  const message = error.message.toLowerCase()
  
  if (message.includes('rate limit') || message.includes('429')) {
    return 'AI service rate limit reached. Will retry automatically in a few minutes.'
  }
  
  if (message.includes('invalid pdf') || message.includes('corrupted') || message.includes('password')) {
    return 'PDF file appears corrupted or password-protected. Please try a different file.'
  }
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'Request timed out. Will retry automatically.'
  }
  
  if (message.includes('quota') || message.includes('exceeded')) {
    return 'AI service quota exceeded. Please check your API limits or wait for quota reset.'
  }
  
  if (message.includes('unauthorized') || message.includes('403')) {
    return 'Authentication failed. Please check your API key configuration.'
  }
  
  if (message.includes('not found') || message.includes('404')) {
    return 'Resource not found. The document or file may have been deleted.'
  }
  
  if (message.includes('network') || message.includes('econnrefused') || message.includes('econnreset')) {
    return 'Network connection error. Will retry automatically.'
  }
  
  if (message.includes('503') || message.includes('unavailable')) {
    return 'Service temporarily unavailable. Will retry automatically.'
  }
  
  return `Processing error: ${error.message}`
}