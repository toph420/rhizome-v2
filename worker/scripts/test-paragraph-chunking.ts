/**
 * Quick test to verify paragraph-aware chunking logic
 * Usage: npx tsx scripts/test-paragraph-chunking.ts
 */

// Simple test markdown with known structure
const testMarkdown = `
# Chapter 1

This is the first paragraph. It has multiple sentences. It should not be split.

This is the second paragraph. It also has multiple sentences.

## Section 1.1

This is a section with more content. Lorem ipsum dolor sit amet.

Another paragraph in this section.

# Chapter 2

More content here. This should be in its own chunk if we exceed target size.

Final paragraph.
`.trim()

/**
 * Split markdown into chunks by character count with paragraph awareness.
 */
function splitMarkdownByParagraphs(
  markdown: string,
  targetCharsPerChunk: number = 40000
): string[] {
  const chunks: string[] = []
  const paragraphs = markdown.split(/\n\n+/)  // Split on blank lines (paragraph boundaries)

  let currentChunk = ''

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i]
    const potentialLength = currentChunk.length + paragraph.length + 2  // +2 for \n\n

    // If adding this paragraph would exceed target, save current chunk and start new one
    if (currentChunk && potentialLength > targetCharsPerChunk) {
      chunks.push(currentChunk.trim())
      currentChunk = paragraph
    } else {
      // Add paragraph to current chunk
      if (currentChunk) {
        currentChunk += '\n\n' + paragraph
      } else {
        currentChunk = paragraph
      }
    }
  }

  // Don't forget last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

// Test with small target to force multiple chunks
console.log('Test 1: Small target size (150 chars) to force chunking')
console.log('=' .repeat(60))
const smallChunks = splitMarkdownByParagraphs(testMarkdown, 150)
console.log(`Split into ${smallChunks.length} chunks:`)
smallChunks.forEach((chunk, i) => {
  console.log(`\nChunk ${i + 1} (${chunk.length} chars):`)
  console.log('---')
  console.log(chunk)
  console.log('---')
})

// Test with realistic target
console.log('\n\nTest 2: Realistic target size (40K chars)')
console.log('=' .repeat(60))
const largeChunks = splitMarkdownByParagraphs(testMarkdown, 40000)
console.log(`Split into ${largeChunks.length} chunks`)
console.log(`Total length: ${testMarkdown.length} chars`)

// Test with 500K chars (simulating 500-page book)
const simulatedBook = testMarkdown.repeat(1600)  // ~500K chars
console.log('\n\nTest 3: Simulated 500-page book (~500K chars)')
console.log('=' .repeat(60))
const bookChunks = splitMarkdownByParagraphs(simulatedBook, 40000)
console.log(`Book size: ${simulatedBook.length} chars`)
console.log(`Split into ${bookChunks.length} chunks`)
console.log(`Average chunk size: ${Math.round(simulatedBook.length / bookChunks.length)} chars`)
console.log(`Estimated API calls: ${bookChunks.length}`)
console.log(`Estimated cost: $${(bookChunks.length * 0.002).toFixed(3)}`)

// Verify no paragraph splits
console.log('\n\nTest 4: Verify paragraph integrity')
console.log('=' .repeat(60))
let brokenParagraphs = 0
smallChunks.forEach((chunk, i) => {
  // Check if chunk starts mid-sentence (should not happen)
  if (chunk.match(/^[a-z]/)) {
    console.log(`⚠️  Chunk ${i + 1} starts with lowercase (possible mid-paragraph break)`)
    brokenParagraphs++
  }
})
console.log(brokenParagraphs === 0 ? '✅ All chunks respect paragraph boundaries' : '❌ Found broken paragraphs')
