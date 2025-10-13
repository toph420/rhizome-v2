import { buildMetadataContext, createEnhancedEmbeddingText, validateEnhancedText } from '../metadata-context'

// Test PDF chunk
const pdfChunk = {
  content: 'Test content for PDF',
  heading_path: ['Chapter 1', 'Introduction'],
  page_start: 5
}

console.log('PDF Context:', buildMetadataContext(pdfChunk))
console.log('PDF Enhanced:', createEnhancedEmbeddingText(pdfChunk))

// Test EPUB chunk
const epubChunk = {
  content: 'Test content for EPUB',
  heading_path: ['Part II', 'Chapter 5'],
  section_marker: 'chapter_005'
}

console.log('\nEPUB Context:', buildMetadataContext(epubChunk))
console.log('EPUB Enhanced:', createEnhancedEmbeddingText(epubChunk))

// Test chunk without metadata
const plainChunk = {
  content: 'Plain content without metadata'
}

console.log('\nPlain Context:', buildMetadataContext(plainChunk))
console.log('Plain Enhanced:', createEnhancedEmbeddingText(plainChunk))

// Test validation
const validation = validateEnhancedText(pdfChunk.content, createEnhancedEmbeddingText(pdfChunk))
console.log('\nValidation:', validation)

// Test token overflow
const longContent = 'a'.repeat(4000)
const longChunk = {
  content: longContent,
  heading_path: ['Chapter 1'],
  page_start: 10
}
const longEnhanced = createEnhancedEmbeddingText(longChunk)
const longValidation = validateEnhancedText(longContent, longEnhanced)
console.log('\nLong validation:', longValidation)
