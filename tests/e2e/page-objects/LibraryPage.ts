import { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

/**
 * Page object for the document library interface.
 * Handles document listing, status checking, and navigation to reader/preview.
 */
export class LibraryPage extends BasePage {
  readonly selectors = {
    // Document list
    documentCard: '[data-testid="document-card"]',
    documentTitle: '[data-testid="document-title"]',
    documentStatus: '[data-testid="document-status"]',
    documentBadge: '[data-testid="status-badge"]',
    
    // Actions
    previewButton: '[data-testid="preview-button"]',
    readButton: '[data-testid="read-button"]',
    processingButton: '[data-testid="processing-button"]',
    
    // Upload area (will be handled by UploadZone page object)
    uploadZone: '[data-testid="upload-zone"]',
    
    // Loading states
    loading: '[data-testid="library-loading"]',
    emptyState: '[data-testid="library-empty"]',
    
    // Document metadata
    createdDate: '[data-testid="document-created"]',
    markdownStatus: '[data-testid="markdown-available"]',
    embeddingsStatus: '[data-testid="embeddings-available"]'
  }

  constructor(page: Page) {
    super(page)
  }

  /**
   * Navigate to the library page
   */
  async navigate(): Promise<void> {
    await this.goto('/')
    await this.waitForLibraryLoaded()
  }

  /**
   * Wait for library to finish loading
   */
  async waitForLibraryLoaded(): Promise<void> {
    // Wait for either documents to appear or empty state
    await Promise.race([
      this.waitForVisible(this.selectors.documentCard),
      this.waitForVisible(this.selectors.emptyState)
    ])
  }

  /**
   * Get all document cards
   */
  async getDocumentCards(): Promise<Locator[]> {
    const cards = this.page.locator(this.selectors.documentCard)
    await cards.first().waitFor({ state: 'attached', timeout: 10000 })
    return await cards.all()
  }

  /**
   * Get document by title
   */
  async getDocumentByTitle(title: string): Promise<Locator | null> {
    const cards = await this.getDocumentCards()
    
    for (const card of cards) {
      const titleElement = card.locator(this.selectors.documentTitle)
      const cardTitle = await titleElement.textContent()
      if (cardTitle?.includes(title)) {
        return card
      }
    }
    return null
  }

  /**
   * Get document status
   */
  async getDocumentStatus(documentCard: Locator): Promise<string> {
    const badge = documentCard.locator(this.selectors.documentBadge)
    return await badge.textContent() || 'unknown'
  }

  /**
   * Check if document is completed processing
   */
  async isDocumentCompleted(documentCard: Locator): Promise<boolean> {
    const status = await this.getDocumentStatus(documentCard)
    return status.toLowerCase() === 'completed'
  }

  /**
   * Check if document is still processing
   */
  async isDocumentProcessing(documentCard: Locator): Promise<boolean> {
    const status = await this.getDocumentStatus(documentCard)
    return status.toLowerCase() === 'processing'
  }

  /**
   * Check if document processing failed
   */
  async isDocumentFailed(documentCard: Locator): Promise<boolean> {
    const status = await this.getDocumentStatus(documentCard)
    return status.toLowerCase() === 'failed'
  }

  /**
   * Wait for document to complete processing
   */
  async waitForDocumentProcessed(title: string, timeout = 120000): Promise<void> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      const card = await this.getDocumentByTitle(title)
      if (card && await this.isDocumentCompleted(card)) {
        return
      }
      
      // Check if processing failed
      if (card && await this.isDocumentFailed(card)) {
        throw new Error(`Document processing failed for: ${title}`)
      }
      
      // Wait a bit before checking again
      await this.page.waitForTimeout(2000)
    }
    
    throw new Error(`Document processing timeout for: ${title}`)
  }

  /**
   * Click preview button for a document
   */
  async previewDocument(documentCard: Locator): Promise<void> {
    const previewBtn = documentCard.locator(this.selectors.previewButton)
    await previewBtn.click()
  }

  /**
   * Click read button for a document
   */
  async readDocument(documentCard: Locator): Promise<void> {
    const readBtn = documentCard.locator(this.selectors.readButton)
    await readBtn.click()
  }

  /**
   * Open document by title in reader
   */
  async openDocumentInReader(title: string): Promise<void> {
    const card = await this.getDocumentByTitle(title)
    if (!card) {
      throw new Error(`Document not found: ${title}`)
    }
    
    if (!await this.isDocumentCompleted(card)) {
      throw new Error(`Document not ready: ${title}`)
    }
    
    await this.readDocument(card)
    await this.waitForUrl(/\/read\//)
  }

  /**
   * Open document by title in preview
   */
  async openDocumentInPreview(title: string): Promise<void> {
    const card = await this.getDocumentByTitle(title)
    if (!card) {
      throw new Error(`Document not found: ${title}`)
    }
    
    if (!await this.isDocumentCompleted(card)) {
      throw new Error(`Document not ready: ${title}`)
    }
    
    await this.previewDocument(card)
    await this.waitForUrl(/\/documents\/.*\/preview/)
  }

  /**
   * Get document metadata
   */
  async getDocumentMetadata(documentCard: Locator): Promise<{
    title: string
    status: string
    createdDate: string
    hasMarkdown: boolean
    hasEmbeddings: boolean
  }> {
    const title = await documentCard.locator(this.selectors.documentTitle).textContent() || ''
    const status = await this.getDocumentStatus(documentCard)
    const createdDate = await documentCard.locator(this.selectors.createdDate).textContent() || ''
    
    // Check for markdown and embeddings indicators
    const markdownIndicator = documentCard.locator(this.selectors.markdownStatus)
    const embeddingsIndicator = documentCard.locator(this.selectors.embeddingsStatus)
    
    const hasMarkdown = await markdownIndicator.count() > 0
    const hasEmbeddings = await embeddingsIndicator.count() > 0
    
    return {
      title,
      status,
      createdDate,
      hasMarkdown,
      hasEmbeddings
    }
  }

  /**
   * Check if library is empty
   */
  async isEmpty(): Promise<boolean> {
    return await this.exists(this.selectors.emptyState)
  }

  /**
   * Get total number of documents
   */
  async getDocumentCount(): Promise<number> {
    if (await this.isEmpty()) {
      return 0
    }
    
    const cards = this.page.locator(this.selectors.documentCard)
    return await cards.count()
  }

  /**
   * Refresh the library (useful for testing real-time updates)
   */
  async refresh(): Promise<void> {
    await this.page.reload()
    await this.waitForLibraryLoaded()
  }
}