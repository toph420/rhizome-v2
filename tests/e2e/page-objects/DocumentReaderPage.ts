import { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

/**
 * Page object for the document reader interface.
 * Handles markdown content, text selection, annotation creation, and reader interactions.
 */
export class DocumentReaderPage extends BasePage {
  readonly selectors = {
    // Document content
    title: '[data-testid="document-title"]',
    content: '[data-testid="markdown-content"]',
    markdownContainer: '.prose',
    
    // Text selection and annotation
    selectedText: '[data-testid="selected-text"]',
    quickCapturePanel: '[data-testid="quick-capture-panel"]',
    createAnnotationBtn: '[data-testid="create-annotation"]',
    
    // Annotation colors
    colorGreen: '[data-testid="color-green"]',
    colorYellow: '[data-testid="color-yellow"]',
    colorRed: '[data-testid="color-red"]',
    colorBlue: '[data-testid="color-blue"]',
    colorPurple: '[data-testid="color-purple"]',
    
    // Annotation note
    annotationNote: '[data-testid="annotation-note"]',
    saveAnnotation: '[data-testid="save-annotation"]',
    cancelAnnotation: '[data-testid="cancel-annotation"]',
    saveWithNote: '[data-testid="save-with-note"]',
    
    // Existing annotations
    highlightedText: '[data-testid="highlighted-text"]',
    annotationMarker: '[data-testid="annotation-marker"]',
    
    // Navigation
    backToLibrary: '[data-testid="back-to-library"]',
    
    // Loading and error states
    loadingDocument: '[data-testid="document-loading"]',
    documentError: '[data-testid="document-error"]',
    retryButton: '[data-testid="retry-button"]',
    
    // Keyboard help
    keyboardHelp: '[data-testid="keyboard-help"]',
    helpToggle: '[data-testid="help-toggle"]',
    
    // Chunk wrappers (for annotation context)
    chunkWrapper: '[data-testid="chunk-wrapper"]'
  }

  constructor(page: Page) {
    super(page)
  }

  /**
   * Navigate to document reader by ID
   */
  async navigateToDocument(documentId: string): Promise<void> {
    await this.goto(`/read/${documentId}`)
    await this.waitForDocumentLoaded()
  }

  /**
   * Wait for document content to load
   */
  async waitForDocumentLoaded(): Promise<void> {
    // Wait for either content to appear or error state
    await Promise.race([
      this.waitForVisible(this.selectors.markdownContainer),
      this.waitForVisible(this.selectors.documentError)
    ])
  }

  /**
   * Get document title
   */
  async getDocumentTitle(): Promise<string> {
    return await this.getText(this.selectors.title)
  }

  /**
   * Check if document loaded successfully
   */
  async isDocumentLoaded(): Promise<boolean> {
    return await this.exists(this.selectors.markdownContainer)
  }

  /**
   * Check if document has error
   */
  async hasDocumentError(): Promise<boolean> {
    return await this.exists(this.selectors.documentError)
  }

  /**
   * Retry loading document if error occurred
   */
  async retryLoadDocument(): Promise<void> {
    if (await this.hasDocumentError()) {
      await this.clickElement(this.selectors.retryButton)
      await this.waitForDocumentLoaded()
    }
  }

  /**
   * Select text by double-clicking on it
   */
  async selectTextByDoubleClick(text: string): Promise<void> {
    const textElement = this.page.locator(`text=${text}`).first()
    await textElement.dblclick()
    
    // Wait for selection to be captured
    await this.page.waitForTimeout(500)
  }

  /**
   * Select text by coordinates (for more precise selection)
   */
  async selectTextByDrag(startText: string, endText: string): Promise<void> {
    const startElement = this.page.locator(`text=${startText}`).first()
    const endElement = this.page.locator(`text=${endText}`).first()
    
    // Get bounding boxes
    const startBox = await startElement.boundingBox()
    const endBox = await endElement.boundingBox()
    
    if (!startBox || !endBox) {
      throw new Error('Could not find text elements for selection')
    }
    
    // Perform drag selection
    await this.page.mouse.move(startBox.x, startBox.y)
    await this.page.mouse.down()
    await this.page.mouse.move(endBox.x + endBox.width, endBox.y)
    await this.page.mouse.up()
    
    // Wait for selection to be captured
    await this.page.waitForTimeout(500)
  }

  /**
   * Check if quick capture panel is visible
   */
  async isQuickCapturePanelVisible(): Promise<boolean> {
    return await this.exists(this.selectors.quickCapturePanel)
  }

  /**
   * Create annotation with specified color
   */
  async createAnnotationWithColor(color: 'green' | 'yellow' | 'red' | 'blue' | 'purple'): Promise<void> {
    const colorSelector = this.selectors[`color${color.charAt(0).toUpperCase() + color.slice(1)}` as keyof typeof this.selectors] as string
    await this.clickElement(colorSelector)
    
    // Wait for annotation to be saved
    await this.waitForNetworkIdle()
  }

  /**
   * Create annotation with note
   */
  async createAnnotationWithNote(
    color: 'green' | 'yellow' | 'red' | 'blue' | 'purple',
    note: string
  ): Promise<void> {
    // Fill the note first
    await this.fillText(this.selectors.annotationNote, note)
    
    // Then save with note button
    await this.clickElement(this.selectors.saveWithNote)
    
    // Wait for annotation to be saved
    await this.waitForNetworkIdle()
  }

  /**
   * Cancel annotation creation
   */
  async cancelAnnotation(): Promise<void> {
    await this.clickElement(this.selectors.cancelAnnotation)
  }

  /**
   * Create annotation workflow (select text + create)
   */
  async createAnnotation(
    text: string,
    color: 'green' | 'yellow' | 'red' | 'blue' | 'purple',
    note?: string
  ): Promise<void> {
    // Select text
    await this.selectTextByDoubleClick(text)
    
    // Wait for quick capture panel
    await this.waitForVisible(this.selectors.quickCapturePanel)
    
    // Create annotation
    if (note) {
      await this.createAnnotationWithNote(color, note)
    } else {
      await this.createAnnotationWithColor(color)
    }
    
    // Wait for panel to close
    await this.waitForHidden(this.selectors.quickCapturePanel)
  }

  /**
   * Get all highlighted text elements
   */
  async getHighlightedElements(): Promise<Locator[]> {
    const highlights = this.page.locator(this.selectors.highlightedText)
    return await highlights.all()
  }

  /**
   * Get annotation markers count
   */
  async getAnnotationMarkersCount(): Promise<number> {
    const markers = this.page.locator(this.selectors.annotationMarker)
    return await markers.count()
  }

  /**
   * Click on an existing annotation
   */
  async clickAnnotation(annotationText: string): Promise<void> {
    const annotation = this.page.locator(this.selectors.highlightedText)
      .filter({ hasText: annotationText })
      .first()
    
    await annotation.click()
  }

  /**
   * Scroll to a specific section/heading
   */
  async scrollToHeading(headingText: string): Promise<void> {
    const heading = this.page.locator(`h1, h2, h3, h4, h5, h6`)
      .filter({ hasText: headingText })
      .first()
    
    await this.scrollToElement(await heading.locator('xpath=.').first().getAttribute('data-testid') || 'unknown')
  }

  /**
   * Navigate back to library
   */
  async backToLibrary(): Promise<void> {
    await this.clickElement(this.selectors.backToLibrary)
    await this.waitForUrl('/')
  }

  /**
   * Open keyboard help
   */
  async openKeyboardHelp(): Promise<void> {
    await this.clickElement(this.selectors.helpToggle)
    await this.waitForVisible(this.selectors.keyboardHelp)
  }

  /**
   * Close keyboard help
   */
  async closeKeyboardHelp(): Promise<void> {
    await this.page.keyboard.press('Escape')
    await this.waitForHidden(this.selectors.keyboardHelp)
  }

  /**
   * Use keyboard shortcut for annotation color
   */
  async useKeyboardShortcutForColor(key: 'g' | 'y' | 'r' | 'b' | 'p'): Promise<void> {
    await this.page.keyboard.press(key)
    
    // Wait for annotation to be saved
    await this.waitForNetworkIdle()
  }

  /**
   * Clear text selection by pressing Escape
   */
  async clearSelection(): Promise<void> {
    await this.page.keyboard.press('Escape')
    await this.waitForHidden(this.selectors.quickCapturePanel)
  }

  /**
   * Verify annotation was created
   */
  async verifyAnnotationExists(text: string, color?: string): Promise<boolean> {
    const annotation = this.page.locator(this.selectors.highlightedText)
      .filter({ hasText: text })
    
    const exists = await annotation.count() > 0
    
    if (exists && color) {
      // Check if color class is present (implementation depends on how colors are applied)
      const hasColor = await annotation.first().evaluate(
        (el, colorClass) => el.classList.contains(`highlight-${colorClass}`),
        color
      )
      return hasColor
    }
    
    return exists
  }

  /**
   * Get all text content (useful for content verification)
   */
  async getAllTextContent(): Promise<string> {
    const content = this.page.locator(this.selectors.markdownContainer)
    return await content.textContent() || ''
  }

  /**
   * Check if document contains specific text
   */
  async containsText(text: string): Promise<boolean> {
    const content = await this.getAllTextContent()
    return content.includes(text)
  }
}