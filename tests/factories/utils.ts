/**
 * Test Factory Utilities
 *
 * Helper functions for working with test data
 */

/**
 * Generate a deterministic UUID-like string for testing
 */
export function generateTestId(prefix: string = 'test'): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 9)
  return `${prefix}-${timestamp}-${random}`
}

/**
 * Create a delay promise for async testing
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate deterministic random data based on a seed
 */
export function seededRandom(seed: number) {
  let x = Math.sin(seed++) * 10000
  return x - Math.floor(x)
}

/**
 * Generate a mock file for testing uploads
 */
export function createMockFile(
  content: string | Buffer,
  filename: string = 'test.pdf',
  mimeType: string = 'application/pdf'
): File {
  const blob = new Blob([content], { type: mimeType })
  return new File([blob], filename, { type: mimeType })
}

/**
 * Generate mock markdown content
 */
export function generateMarkdown(options: {
  headings?: number
  paragraphs?: number
  codeBlocks?: number
  lists?: number
} = {}): string {
  const {
    headings = 2,
    paragraphs = 3,
    codeBlocks = 1,
    lists = 1
  } = options

  const parts: string[] = []

  // Add headings and paragraphs
  for (let i = 0; i < headings; i++) {
    parts.push(`## Heading ${i + 1}\n`)
    for (let j = 0; j < Math.ceil(paragraphs / headings); j++) {
      parts.push(`This is paragraph ${j + 1} under heading ${i + 1}. It contains some test content that should be chunked appropriately.\n`)
    }
  }

  // Add code blocks
  for (let i = 0; i < codeBlocks; i++) {
    parts.push('```javascript\n')
    parts.push('function example() {\n')
    parts.push('  return "Test code";\n')
    parts.push('}\n')
    parts.push('```\n')
  }

  // Add lists
  for (let i = 0; i < lists; i++) {
    parts.push('\n### List Section\n')
    parts.push('- Item 1\n')
    parts.push('- Item 2\n')
    parts.push('- Item 3\n')
  }

  return parts.join('\n')
}

/**
 * Create a mock embedding vector
 */
export function createMockEmbedding(dimension: number = 768, seed: number = 1): number[] {
  const embedding: number[] = []
  for (let i = 0; i < dimension; i++) {
    embedding.push(seededRandom(seed + i))
  }
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  return embedding.map(val => val / magnitude)
}

/**
 * Compare two objects for deep equality (useful for testing)
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true
  if (obj1 == null || obj2 == null) return false
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false

  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)

  if (keys1.length !== keys2.length) return false

  for (const key of keys1) {
    if (!keys2.includes(key)) return false
    if (!deepEqual(obj1[key], obj2[key])) return false
  }

  return true
}

/**
 * Clean up test data (useful for afterEach hooks)
 */
export function resetAllFactories() {
  // Import and reset all factories
  // This would be called in test setup/teardown
  console.log('Resetting all test factories...')
}