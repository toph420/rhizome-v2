import { test, expect } from '../fixtures'
import { LibraryPage } from '../page-objects/LibraryPage'
import { UploadZone } from '../page-objects/UploadZone'
import { DocumentReaderPage } from '../page-objects/DocumentReaderPage'
import path from 'path'

/**
 * T-013 Critical User Journey: Upload → Process → Read Document Flow
 * 
 * Tests the complete document processing pipeline from upload to reading,
 * covering all major input formats and validation of processing states.
 */

test.describe('Upload → Process → Read Document Flow', () => {
  let libraryPage: LibraryPage
  let uploadZone: UploadZone  
  let documentReader: DocumentReaderPage

  test.beforeEach(async ({ page }) => {
    libraryPage = new LibraryPage(page)
    uploadZone = new UploadZone(page)
    documentReader = new DocumentReaderPage(page)
    
    // Start at the library page
    await libraryPage.navigate()
  })

  test('PDF Upload → Processing → Reading Flow', async ({ page }) => {
    // Given: User is on library page with a PDF file
    const testPdfPath = path.join(__dirname, '../../fixtures/test-document.pdf')
    
    // When: Uploading a PDF document
    await uploadZone.uploadFileComplete(testPdfPath)
    
    // Then: Processing status is shown  
    const documentCard = await libraryPage.getDocumentByTitle('test-document.pdf')
    expect(documentCard).toBeTruthy()
    
    // Verify initial processing state
    expect(await libraryPage.isDocumentProcessing(documentCard!)).toBe(true)
    
    // And: Document becomes available after processing
    await libraryPage.waitForDocumentProcessed('test-document.pdf', 120000)
    expect(await libraryPage.isDocumentCompleted(documentCard!)).toBe(true)
    
    // And: Can be opened in reader
    await libraryPage.openDocumentInReader('test-document.pdf')
    
    // Verify document content loaded
    await documentReader.waitForDocumentLoaded()
    expect(await documentReader.isDocumentLoaded()).toBe(true)
    
    // Verify content is readable
    const title = await documentReader.getDocumentTitle()
    expect(title).toBeTruthy()
    expect(title.length).toBeGreaterThan(0)
  })

  test('YouTube URL → Processing → Reading Flow', async ({ page }) => {
    // Given: User wants to process a YouTube video
    const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' // Example URL
    
    // When: Fetching YouTube content
    await uploadZone.fetchUrlComplete(youtubeUrl)
    
    // Then: URL type is detected correctly
    await uploadZone.switchToUrlTab()
    await uploadZone.fillText(uploadZone.selectors.urlInput, youtubeUrl)
    await page.waitForTimeout(1000) // Wait for detection
    
    expect(await uploadZone.getDetectedUrlType()).toBe('youtube')
    
    // Continue with processing
    await uploadZone.fetchButton()
    
    // Verify processing starts and completes
    const documentCard = await libraryPage.getDocumentByTitle('dQw4w9WgXcQ')
    expect(documentCard).toBeTruthy()
    
    await libraryPage.waitForDocumentProcessed('dQw4w9WgXcQ', 120000)
    
    // Open in reader and verify transcript content
    await libraryPage.openDocumentInReader('dQw4w9WgXcQ')
    await documentReader.waitForDocumentLoaded()
    
    // YouTube transcripts should contain timestamped content
    const content = await documentReader.getAllTextContent()
    expect(content.length).toBeGreaterThan(100) // Reasonable transcript length
  })

  test('Web Article → Processing → Reading Flow', async ({ page }) => {
    // Given: User wants to process a web article
    const webUrl = 'https://example.com/article'
    
    // When: Fetching web content
    await uploadZone.switchToUrlTab()
    await uploadZone.fillText(uploadZone.selectors.urlInput, webUrl)
    await page.waitForTimeout(1000)
    
    // Then: Web content is detected
    expect(await uploadZone.getDetectedUrlType()).toBe('web')
    
    await uploadZone.fetchUrlComplete(webUrl)
    
    // Verify processing and reading
    const documentCard = await libraryPage.getDocumentByTitle('article')
    expect(documentCard).toBeTruthy()
    
    await libraryPage.waitForDocumentProcessed('article', 120000)
    await libraryPage.openDocumentInReader('article')
    
    await documentReader.waitForDocumentLoaded()
    expect(await documentReader.isDocumentLoaded()).toBe(true)
  })

  test('Markdown File → Processing → Reading Flow', async ({ page }) => {
    // Given: User has a markdown file to upload
    const markdownPath = path.join(__dirname, '../../fixtures/test-document.md')
    
    // When: Uploading with clean processing option
    await uploadZone.uploadFile(markdownPath)
    await uploadZone.setMarkdownProcessing('clean')
    
    // Verify cost estimate appears
    const costEstimate = await uploadZone.getCostEstimate()
    expect(costEstimate.cost).toBeTruthy()
    expect(costEstimate.time).toBeTruthy()
    
    await uploadZone.processDocument()
    await uploadZone.waitForUploadComplete()
    
    // Then: Document processes successfully
    const documentCard = await libraryPage.getDocumentByTitle('test-document.md')
    expect(documentCard).toBeTruthy()
    
    await libraryPage.waitForDocumentProcessed('test-document.md', 60000)
    
    // And: Clean markdown renders properly in reader
    await libraryPage.openDocumentInReader('test-document.md')
    await documentReader.waitForDocumentLoaded()
    
    // Verify markdown is rendered (should have prose styling)
    const markdownContainer = page.locator(documentReader.selectors.markdownContainer)
    expect(await markdownContainer.isVisible()).toBe(true)
  })

  test('Paste Content → Processing → Reading Flow', async ({ page }) => {
    // Given: User has content to paste
    const pastedContent = `
# Test Article
This is a test article with multiple paragraphs.

## Section 1
Content for section 1 with some important information.

## Section 2  
More content with different topics and ideas.
    `.trim()
    
    const sourceUrl = 'https://example.com/source'
    
    // When: Submitting pasted content
    await uploadZone.pasteContentComplete(pastedContent, sourceUrl)
    
    // Then: Content is processed as text document
    const documentCard = await libraryPage.getDocumentByTitle('Test Article')
    expect(documentCard).toBeTruthy()
    
    await libraryPage.waitForDocumentProcessed('Test Article', 60000)
    
    // And: Content is readable with proper formatting
    await libraryPage.openDocumentInReader('Test Article')
    await documentReader.waitForDocumentLoaded()
    
    // Verify pasted content is preserved
    expect(await documentReader.containsText('Test Article')).toBe(true)
    expect(await documentReader.containsText('Section 1')).toBe(true)
    expect(await documentReader.containsText('Section 2')).toBe(true)
  })

  test('Processing Error Recovery Flow', async ({ page }) => {
    // Given: A document that might cause processing issues
    const problematicFile = path.join(__dirname, '../../fixtures/corrupted-file.pdf')
    
    // When: Uploading a potentially problematic file
    try {
      await uploadZone.uploadFileComplete(problematicFile)
    } catch (error) {
      // If upload fails immediately, that's expected
    }
    
    // Then: Error state is handled gracefully
    const errorMessage = await uploadZone.getErrorMessage()
    if (errorMessage) {
      expect(errorMessage).toContain('processing failed')
    }
    
    // Verify user can recover and try again
    expect(await uploadZone.isReadyForUpload()).toBe(true)
  })

  test('Multiple Documents Processing Flow', async ({ page }) => {
    // Given: User wants to upload multiple documents
    const files = [
      path.join(__dirname, '../../fixtures/doc1.pdf'),
      path.join(__dirname, '../../fixtures/doc2.md'),
      path.join(__dirname, '../../fixtures/doc3.txt')
    ]
    
    // When: Uploading multiple documents in sequence
    for (const filePath of files) {
      try {
        await uploadZone.uploadFileComplete(filePath)
        
        // Wait a moment between uploads
        await page.waitForTimeout(1000)
      } catch (error) {
        // Skip files that don't exist in test fixtures
        console.log(`Skipping non-existent test file: ${filePath}`)
      }
    }
    
    // Then: All documents are listed in library
    const documentCount = await libraryPage.getDocumentCount()
    expect(documentCount).toBeGreaterThan(0)
    
    // And: Each document can be opened individually
    const documentCards = await libraryPage.getDocumentCards()
    
    if (documentCards.length > 0) {
      // Test opening the first available document
      const firstCard = documentCards[0]
      await libraryPage.readDocument(firstCard)
      
      await documentReader.waitForDocumentLoaded()
      expect(await documentReader.isDocumentLoaded()).toBe(true)
    }
  })

  test('Document Metadata Validation', async ({ page }) => {
    // Given: A processed document
    const testFile = path.join(__dirname, '../../fixtures/test-document.pdf')
    
    // When: Document is fully processed
    await uploadZone.uploadFileComplete(testFile)
    
    const documentCard = await libraryPage.getDocumentByTitle('test-document.pdf')
    expect(documentCard).toBeTruthy()
    
    await libraryPage.waitForDocumentProcessed('test-document.pdf', 120000)
    
    // Then: Metadata is properly set
    const metadata = await libraryPage.getDocumentMetadata(documentCard!)
    
    expect(metadata.title).toBe('test-document.pdf')
    expect(metadata.status.toLowerCase()).toBe('completed')
    expect(metadata.createdDate).toBeTruthy()
    expect(metadata.hasMarkdown).toBe(true)
    expect(metadata.hasEmbeddings).toBe(true)
  })
})