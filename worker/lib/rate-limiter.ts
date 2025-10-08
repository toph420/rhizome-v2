/**
 * Simple rate limiter to prevent hitting Gemini API limits
 *
 * Enforces minimum delay between API calls
 */

let lastApiCallTime = 0
const MIN_DELAY_MS = 2000 // 2 seconds between calls

/**
 * Wait if needed to enforce rate limit
 */
export async function enforceRateLimit(): Promise<void> {
  const now = Date.now()
  const timeSinceLastCall = now - lastApiCallTime

  if (timeSinceLastCall < MIN_DELAY_MS) {
    const waitTime = MIN_DELAY_MS - timeSinceLastCall
    console.log(`[rate-limiter] Waiting ${waitTime}ms to avoid rate limit...`)
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }

  lastApiCallTime = Date.now()
}
